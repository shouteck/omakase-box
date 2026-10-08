"""Offline sensitivity simulation; no inference, independent trials, no borrowed noise claim."""
import math,random,json,pathlib,functools
OUT=pathlib.Path(__file__).resolve().parent
TAIL=.025/12
@functools.lru_cache(None)
def bounds(n,k):
 logs=[math.lgamma(n+1)-math.lgamma(j+1)-math.lgamma(n-j+1) for j in range(n+1)]
 def cdf(stop,p):
  if p<=0:return 1.
  if p>=1:return float(stop>=n)
  a=math.log(p);b=math.log1p(-p)
  return sum(math.exp(logs[j]+j*a+(n-j)*b) for j in range(stop+1))
 def solve(stop,target):
  lo=0.;hi=1.
  for _ in range(45):
   mid=(lo+hi)/2
   if cdf(stop,mid)>target:lo=mid
   else:hi=mid
  return (lo+hi)/2
 return (0. if k==0 else solve(k-1,1-TAIL),1. if k==n else solve(k,TAIL))
def interval(n,w,l):
 lw,uw=bounds(n,w);ll,ul=bounds(n,l)
 mean=(w-l)/n;r=math.sqrt(2*math.log(240)/n)
 return max(lw-ul,mean-r,-1),min(uw-ll,mean+r,1)
scenarios=[(q,0.) for q in [0.,.005,.02,.05,.2,.5]]+[(q,d) for q,d in [(.05,.05),(.1,.05),(.5,.05),(.1,.1),(.2,.1),(.2,.12),(.2,.14),(.2,.16),(.5,.1),(.5,.16),(.5,.18),(.2,.2),(.5,.2),(.5,.33)]]
rows=[];reps=4000
for index,(q,d) in enumerate(scenarios):
 rng=random.Random(9102026+index);counts=dict(helps=0,harms=0,equivalent=0,undecided=0);used=[]
 for _ in range(reps):
  draws=rng.choices([-1,0,1],weights=[(q-d)/2,1-q,(q+d)/2],k=256)
  for n in [64,128,256]:
   w=draws[:n].count(1);l=draws[:n].count(-1);lo,hi=interval(n,w,l)
   outcome='equivalent' if lo>=-.05 and hi<=.05 else 'helps' if lo>0 else 'harms' if hi<0 else 'undecided'
   if outcome!='undecided' or n==256:break
  counts[outcome]+=1;used.append(n)
 rows.append(dict(discordance=q,delta=d,outcome_rates={k:v/reps for k,v in counts.items()},mean_pairs=sum(used)/reps,median_cost_scenario=(2*sum(used)/reps+32)*12305))
result=dict(trials_per_scenario=reps,seed_rule='9102026 + scenario index',tail=TAIL,looks=[64,128,256],equivalence_margin=.05,noise_is_assumed_not_estimated=True,rows=rows,zero_discordance_limits={str(n):1-TAIL**(1/n) for n in [64,128,256]},worst_case_80pct_terminal_effect={str(n):math.sqrt(2*math.log(240)/n)+math.sqrt(2*math.log(1/.15)/n) for n in [64,128,256]})
(OUT/'power.json').write_bytes(json.dumps(result,indent=2).encode())
print(json.dumps(result,indent=2))
