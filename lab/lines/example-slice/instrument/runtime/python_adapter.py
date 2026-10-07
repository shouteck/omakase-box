"""Pure AST graph / coverage JSON adapter; never imports target modules."""
import ast
import json
import sys
import platform
import pathlib


def graph(contents, roots):
    modules = {}
    for name in contents:
        if not name.endswith(('.py', '.pyi')):
            continue
        for root in roots:
            prefix = root.rstrip('/') + '/' if root else ''
            if name.startswith(prefix):
                stem = name[len(prefix):].rsplit('.', 1)[0].replace('/', '.')
                module = stem[:-9] if stem.endswith('.__init__') else stem
                modules.setdefault(module, []).append(name)
    result = {}
    for name, text in contents.items():
        if not name.endswith(('.py', '.pyi')):
            continue
        tree = ast.parse(text, filename=name)
        names = [m for m, paths in modules.items() if name in paths]
        edges = []

        def add(module, relative=False):
            targets = modules.get(module, [])
            if len(targets) == 1:
                # Importing a child executes its package initializers too.
                for i in range(1, len(module.split('.'))):
                    parent = '.'.join(module.split('.')[:i])
                    for p in modules.get(parent, []):
                        if p.endswith('/__init__.py'):
                            edges.append({'kind': 'local', 'to': p, 'specifier': parent})
                edges.append({'kind': 'local', 'to': targets[0], 'specifier': module})
            else:
                edges.append({'kind': 'ambiguous' if targets else 'missing' if relative else 'external', 'specifier': module})

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    add(alias.name)
            elif isinstance(node, ast.ImportFrom):
                base = node.module or ''
                if node.level:
                    if len(names) != 1:
                        edges.append({'kind': 'ambiguous', 'specifier': base})
                        continue
                    package = names[0].split('.') if name.endswith('/__init__.py') else names[0].split('.')[:-1]
                    if node.level > len(package):
                        edges.append({'kind': 'missing', 'specifier': '.' * node.level + base})
                        continue
                    base = '.'.join(package[:len(package) - node.level + 1] + ([base] if base else []))
                add(base, bool(node.level))
                for alias in node.names:
                    child = base + '.' + alias.name
                    if child in modules:
                        add(child, bool(node.level))
            elif isinstance(node, ast.Call):
                function = node.func
                if (isinstance(function, ast.Name) and function.id in ('__import__', 'eval', 'exec')) or (isinstance(function, ast.Attribute) and function.attr == 'import_module'):
                    edges.append({'kind': 'dynamic'})
        result[name] = list({json.dumps(e, sort_keys=True): e for e in edges}.values())
    return {'version': platform.python_version(), 'graph': result}


def coverage(data, prefix='/case/tree/'):
    if data.get('meta', {}).get('version') != '7.10.7':
        raise ValueError('coverage 7.10.7 required')
    statements = {}
    for name, row in data['files'].items():
        if name.startswith(prefix):
            relative = name[len(prefix):]
        elif not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts and '\\' not in name:
            # coverage JSON relativizes paths against its declared /case/tree cwd.
            relative = name
        else:
            continue
        # coverage.py JSON provides measured executable lines, not loaded modules.
        # CPython can report a line-zero module-entry event for an empty file.
        # It is a load event, not an executed source statement.
        lines = sorted({line for line in row['executed_lines'] if line > 0})
        if lines:
            statements[relative] = lines
    return {'executed': sorted(statements), 'statements': statements, 'version': data['meta']['version']}


if __name__ == '__main__':
    data = json.load(sys.stdin)
    result = graph(data['contents'], data['roots']) if sys.argv[1] == 'graph' else coverage(data)
    print(json.dumps(result, sort_keys=True))
