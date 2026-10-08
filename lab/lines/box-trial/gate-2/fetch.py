"""Downloads the published run records for the thirty tasks. Public, free, no credentials.

python lab/lines/box-trial/gate-2/fetch.py
Writes records/<agent>/<task>.traj.json (ignored by Git) and receipts.json (tracked:
URL, size, SHA-256, resolved flag). Refuses to overwrite a record already saved.
"""
import hashlib, json, pathlib, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent
GATE1 = HERE.parent / 'gate-1'
AGENTS = {
    'gemini-3-5-flash': {
        'submission': '20260901_mini-v2.4.2_gemini-3-5-flash',
        'traj': 'https://raw.githubusercontent.com/john-b-yang/20260901_mini-v2.4.2_gemini-3-5-flash/main/trajs/{id}.traj.json',
        'resolved': 'https://raw.githubusercontent.com/SWE-bench/experiments/main/evaluation/verified/20260901_mini-v2.4.2_gemini-3-5-flash/per_instance_details.json',
    },
    'gpt-5-2-codex': {
        'submission': '20260219_mini-v2.0.0_gpt-5-2-codex',
        'traj': 'https://swe-bench-submissions.s3.amazonaws.com/bash-only/20260219_mini-v2.0.0_gpt-5-2-codex/trajs/{id}/{id}.traj.json',
        'report': 'https://swe-bench-submissions.s3.amazonaws.com/bash-only/20260219_mini-v2.0.0_gpt-5-2-codex/logs/{id}/report.json',
    },
}


def get(url):
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        return None if error.code in (403, 404) else (_ for _ in ()).throw(error)


if __name__ == '__main__':
    ids = [t['instance_id'] for t in json.loads((GATE1 / 'tasks.json').read_text(encoding='utf8'))]
    receipts = {}
    for agent, spec in AGENTS.items():
        directory = HERE / 'records' / agent
        directory.mkdir(parents=True, exist_ok=True)
        details = json.loads(get(spec['resolved'])) if 'resolved' in spec else None
        for ident in ids:
            target = directory / (ident + '.traj.json')
            url = spec['traj'].format(id=ident)
            data = target.read_bytes() if target.exists() else get(url)
            row = {'url': url, 'present': data is not None}
            if data is not None:
                if not target.exists():
                    target.write_bytes(data)
                row.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
            if details is not None:
                row['resolved'] = details.get(ident, {}).get('resolved')
            else:
                report = get(spec['report'].format(id=ident))
                parsed = json.loads(report) if report else {}
                row['resolved'] = parsed.get('resolved', (parsed.get(ident) or {}).get('resolved')) if report else None
            receipts.setdefault(agent, {})[ident] = row
            print(agent, ident, row['present'], row.get('resolved'), flush=True)
    (HERE / 'receipts.json').write_text(json.dumps({'agents': {a: s['submission'] for a, s in AGENTS.items()}, 'records': receipts}, indent=1))
