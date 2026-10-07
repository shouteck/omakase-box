"""Read regular bounded tmpfs artifacts while the supervised container is alive."""
import pathlib, json, base64, sys
root=pathlib.Path('/record')
rows=[]
total=0
for path in sorted(root.rglob('*')):
    if path.is_symlink():
        raise RuntimeError('Artifact symlink refused')
    if path.is_dir():
        continue
    if not path.is_file():
        raise RuntimeError('Nonregular artifact refused')
    total += path.stat().st_size
    if total > 64*1024*1024 or len(rows) >= 10000:
        raise RuntimeError('Artifact capture limit exceeded')
    rows.append({'path':path.relative_to(root).as_posix(), 'content':base64.b64encode(path.read_bytes()).decode('ascii')})
json.dump(rows,sys.stdout)
