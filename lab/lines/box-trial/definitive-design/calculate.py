"""No model calls: reproduce empirical costs and conservative sizing from saved records."""
import pathlib,json,math,statistics,hashlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=pathlib.Path(__file__).resolve().parent
requests=[]; windows=[]; runs=[]; hashes={}
for task in ['live-pilot','live-three-sympy__sympy-16597','live-three-matplotlib__matplotlib-21568']:
 for arm in ['control','box']:
  path=ROOT/task/'raw/runs'/arm/'steps.json'
  steps=json.loads(path.read_bytes()); attempt=json.loads((path.parent/'attempt.json').read_bytes())
  end=attempt['token_usage']['total']['totalTokens']
  totals=[(s.get('usage_before') or {}).get('total',{}).get('totalTokens',0) for s in steps]+[end]
  diff=[b-a for a,b in zip(totals,totals[1:])];requests.extend(diff)
  windows.extend(sum(diff[i:i+3]) for i,s in enumerate(steps) if s['result'].get('queries') and len(diff[i:i+3])==3)
  runs.append(dict(task=task,arm=arm,tokens=end,commands=len(steps)))
  hashes[str(path.relative_to(ROOT))]=hashlib.sha256(path.read_bytes()).hexdigest()
def quantile(v,p):return sorted(v)[round((len(v)-1)*p)]
sd=statistics.stdev(math.log(runs[i+1]['tokens']/runs[i]['tokens']) for i in range(0,6,2))
repeat=[]
for loc in ['gate-3/passive','gate-3']:
 d=ROOT/loc/'records/astropy__astropy-13033/control-0'
 repeat.append(json.loads((d/'attempt.json').read_bytes())['token_usage']['total']['totalTokens'])
repeat_sd=abs(math.log(repeat[0]/repeat[1]))/math.sqrt(2)
result=dict(hashes=hashes,runs=runs,boundary_intervals=dict(n=len(requests),min=min(requests),p10=quantile(requests,.1),median=statistics.median(requests),p90=quantile(requests,.9),max=max(requests)),three_boundary_windows=dict(n=len(windows),min=min(windows),median=statistics.median(windows),max=max(windows)),repeat_tokens=repeat,log_sd_scenarios=[sd,repeat_sd],looks=[],whole_32_mde=[math.expm1(2.8*s/math.sqrt(32)) for s in [sd,repeat_sd]],whole_5percent_pairs=[math.ceil((2.8*s/math.log(1.05))**2) for s in [sd,repeat_sd]],navigation_5point_pairs=math.ceil((math.sqrt(2*math.log(120))+math.sqrt(2*math.log(5)))**2/.05**2))
for n in [64,128,256]:
 calls=2*n+32
 result['looks'].append(dict(pairs=n,calls=calls,radius=math.sqrt(2*math.log(120)/n),guaranteed_80pct_effect=math.sqrt(2*math.log(120)/n)+math.sqrt(2*math.log(5)/n),cost_p10_p90=[calls*quantile(requests,p) for p in [.1,.9]],cost_median=calls*statistics.median(requests),cost_max_envelope=calls*max(requests)))
(OUT/'reproduced-calculations.json').write_bytes(json.dumps(result,indent=2).encode())
print(json.dumps(result,indent=2))
