"""Public-data acquisition/selection; no benchmark imports or execution."""
import hashlib, json, pathlib, urllib.request
here = pathlib.Path(__file__).resolve().parent
metadata = json.load(urllib.request.urlopen('https://huggingface.co/api/datasets/princeton-nlp/SWE-bench_Verified'))
rows = []
for offset in range(0, 500, 100):
    url = 'https://datasets-server.huggingface.co/rows?dataset=princeton-nlp%2FSWE-bench_Verified&config=default&split=test&offset=' + str(offset) + '&length=100'
    page = json.load(urllib.request.urlopen(url))
    if any(row.get('truncated_cells') for row in page['rows']):
        raise RuntimeError('Truncated dataset cells')
    rows += [row['row'] for row in page['rows']]
assert len(rows) == 500
repos = ['astropy/astropy', 'django/django', 'matplotlib/matplotlib', 'scikit-learn/scikit-learn', 'sphinx-doc/sphinx', 'sympy/sympy']
selected = []
for repo in repos:
    candidates = [r for r in rows if r['repo'] == repo]
    candidates.sort(key=lambda r: hashlib.sha256(('box-gate-1-20261008\n' + r['instance_id']).encode()).hexdigest())
    selected += candidates[:5]
blob = json.dumps(selected, ensure_ascii=False, indent=2).encode()
receipt = {'dataset_revision': metadata['sha'], 'tasks_sha256': hashlib.sha256(blob).hexdigest(),
           'count': len(selected), 'dataset_rows': len(rows), 'instance_ids': [r['instance_id'] for r in selected]}
if (here / 'tasks.json').exists():
    if (here / 'tasks.json').read_bytes() != blob or json.loads((here / 'sample.json').read_text()) != receipt:
        raise RuntimeError('Public dataset no longer matches frozen sample; do not overwrite')
else:
    (here / 'tasks.json').write_bytes(blob)
    (here / 'sample.json').write_bytes(json.dumps(receipt, indent=2).encode())
population = [{'repo': r['repo'], 'instance_id': r['instance_id']} for r in rows]
(here / 'population.json').write_bytes(json.dumps(population, indent=2).encode())
print('PASS: public 500-task population reproduces the frozen 30 IDs and task byte hash')
