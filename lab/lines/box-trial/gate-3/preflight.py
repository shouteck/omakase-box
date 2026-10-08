"""No benchmark code: check subscribed inference, dynamic tools and token receipts."""
import json, pathlib, queue, subprocess, threading, time
HERE=pathlib.Path(__file__).resolve().parent
MODEL='gpt-5.6-luna'
class RPC:
    def __init__(self):
        argv=['codex','app-server','--listen','stdio://']
        for name in ['shell_tool','apps','plugins','hooks','computer_use','browser_use','in_app_browser','skill_search','image_generation','workspace_dependencies']:
            argv += ['--disable',name]
        argv += ['--enable','skip_host_skill_discovery','-c','project_doc_max_bytes=0','-c','web_search="disabled"']
        self.argv=argv;self.q=queue.Queue();self.events=[];self.seq=0
        self.p=subprocess.Popen(argv,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8')
        def reader():
            for line in self.p.stdout:
                try:self.q.put(json.loads(line))
                except ValueError:pass
            self.q.put({'_eof':True})
        threading.Thread(target=reader,daemon=True).start()
    def send(self,value):
        self.p.stdin.write(json.dumps(value)+'\n');self.p.stdin.flush()
    def receive(self,timeout=30):
        value=self.q.get(timeout=timeout);self.events.append(value);return value
    def ask(self,method,params):
        self.seq+=1;ident=self.seq;self.send({'id':ident,'method':method,'params':params})
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            value=self.receive(max(.1,deadline-time.monotonic()))
            if value.get('_eof'):raise RuntimeError('app-server exited')
            if value.get('id')==ident:
                if 'error' in value:raise RuntimeError(json.dumps(value['error']))
                return value['result']
        raise TimeoutError(method)
    def close(self):
        if self.p.poll() is None:self.p.terminate()
        self.p.wait(timeout=10)

def main():
    started=time.monotonic();rpc=None;record={'model':MODEL,'repair_agent_runs':0,'purpose':'capability smoke, no benchmark task','status':'unknown'}
    scratch=HERE/'preflight-scratch';scratch.mkdir(exist_ok=True)
    try:
        auth=subprocess.run(['codex','login','status'],capture_output=True,text=True,timeout=15)
        text=auth.stdout+auth.stderr
        if auth.returncode or 'Logged in using ChatGPT' not in text:raise RuntimeError('Existing ChatGPT login not established; no API fallback')
        record['auth_mode']='ChatGPT login; no credential read'
        rpc=RPC();record['argv']=rpc.argv
        rpc.ask('initialize',{'clientInfo':{'name':'lab_gate_3','title':'Lab Gate 3','version':'1.0'},'capabilities':{'experimentalApi':True}})
        rpc.send({'method':'initialized'})
        catalog=rpc.ask('model/list',{'limit':100,'includeHidden':True})
        record['catalog_models']=[{'model':m['model'],'hidden':m.get('hidden'),'efforts':m.get('supportedReasoningEfforts')} for m in catalog['data']]
        tool={'name':'lab_probe','description':'Return the supplied marker unchanged; capability test only.','inputSchema':{'type':'object','properties':{'marker':{'type':'string'}},'required':['marker'],'additionalProperties':False}}
        result=rpc.ask('thread/start',{'model':MODEL,'cwd':str(scratch.resolve()),'approvalPolicy':'never','sandbox':'read-only','ephemeral':True,'baseInstructions':'Use only the supplied lab_probe tool if asked. Do not read files or use other tools.','dynamicTools':[tool]})
        tid=result['thread']['id'];record['thread_id']=tid;record['reported_model']=result.get('model');record['thread_ephemeral']=result['thread'].get('ephemeral')
        result=rpc.ask('turn/start',{'threadId':tid,'effort':'high','input':[{'type':'text','text':'Call lab_probe once with marker LAB_GATE_3_OK. Then reply with that marker only.'}]})
        turn=result['turn']['id'];deadline=time.monotonic()+120;calls=0;usage=None;completion=None;messages=[]
        while time.monotonic()<deadline:
            value=rpc.receive(min(10,max(.1,deadline-time.monotonic())))
            method=value.get('method');params=value.get('params',{})
            if method=='item/tool/call':
                args=params.get('arguments',{});args=json.loads(args) if isinstance(args,str) else args
                success=params.get('tool')=='lab_probe' and args.get('marker')=='LAB_GATE_3_OK'
                calls+=1
                rpc.send({'id':value['id'],'result':{'contentItems':[{'type':'inputText','text':args.get('marker','INVALID')}],'success':success}})
                if not success:raise RuntimeError('unexpected dynamic tool')
            elif 'id' in value and method:
                rpc.send({'id':value['id'],'error':{'code':-32000,'message':'Unsupported request in capability smoke; no host execution authorized'}})
            elif method=='thread/tokenUsage/updated':usage=params
            elif method=='item/completed' and params.get('item',{}).get('type')=='agentMessage':messages.append(params['item'].get('text',''))
            elif method=='model/rerouted':raise RuntimeError('Model was rerouted; not selected model')
            elif method=='turn/completed':completion=params.get('turn');break
            elif value.get('_eof'):raise RuntimeError('server exited before turn completion')
        record.update(tool_calls=calls,token_usage=usage,completion=completion,messages=messages)
        if not completion or completion.get('status')!='completed' or calls!=1 or usage is None:raise RuntimeError('No completed selected-model/tool/usage chain')
        record['status']='ready'
    except Exception as error:
        record['error']=str(error);record['status']='blocked'
    finally:
        if rpc:
            record['events']=rpc.events
            rpc.close()
        scratch.rmdir()
        record['seconds']=round(time.monotonic()-started,3)
        (HERE/'preflight.json').write_bytes(json.dumps(record,indent=2,ensure_ascii=False).encode('utf-8'))
    print(json.dumps({k:v for k,v in record.items() if k in ['status','error','seconds','tool_calls','reported_model','completion']}),flush=True)
    return 0 if record['status']=='ready' else 1
if __name__=='__main__':raise SystemExit(main())
