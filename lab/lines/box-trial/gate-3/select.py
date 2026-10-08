"""Pure selection from saved published outcomes; no gold patch or live result read."""
import hashlib, json, pathlib
HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE.parent / 'gate-2' / 'summary.json'
def select():
    data = SOURCE.read_bytes()
    rows = [r for r in json.loads(data)['rows'] if r['agent'] == 'gpt-5-2-codex' and r.get('status') == 'measured']
    excluded = [{'instance_id':r['instance_id'],'reason':'no admitted Gate 1b narrow Box'} for r in rows if not r['has_box']]
    eligible = [r for r in rows if r['has_box']]
    hard = sorted([r for r in eligible if r['resolved'] is False], key=lambda r:(-r['steps'],r['instance_id']))[:8]
    selected = []
    for row in hard: selected.append({**row, 'stratum':'published failure'})
    for row in sorted([r for r in eligible if r['resolved'] is True], key=lambda r:(-r['steps'],r['instance_id'])):
        if len(selected) == 8: break
        selected.append({**row,'stratum':'long published run'})
    used = {r['instance_id'] for r in selected}
    easy = sorted([r for r in eligible if r['resolved'] is True and r['instance_id'] not in used], key=lambda r:(r['steps'],r['instance_id']))[:4]
    selected += [{**r,'stratum':'quick published solve'} for r in easy]
    repeats = [min(hard,key=lambda r:r['instance_id'])['instance_id'],next(r['instance_id'] for r in selected if r['stratum']=='long published run'),min(easy,key=lambda r:r['instance_id'])['instance_id']]
    tasks=[]
    for row in sorted(selected,key=lambda r:r['instance_id']):
        ident=row['instance_id']
        first='box' if hashlib.sha256(('lab-gate-3-20261008\n'+ident).encode()).digest()[-1] & 1 else 'control'
        tasks.append({'instance_id':ident,'stratum':row['stratum'],'published_resolved':row['resolved'],'published_steps':row['steps'],'first_arm':first,'repeat':ident in repeats})
    assert len(tasks)==12 and len(set(r['instance_id'] for r in tasks))==12
    return {'source':'gate-2/summary.json','source_sha256':hashlib.sha256(data).hexdigest(),'excluded':excluded,'tasks':tasks,'repeat_ids':repeats}
if __name__=='__main__':
    result=select()
    (HERE/'selection.json').write_bytes(json.dumps(result,indent=2).encode())
    for row in result['tasks']:print(row['instance_id'],row['stratum'],row['first_arm'])
