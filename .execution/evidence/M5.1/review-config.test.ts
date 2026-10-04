import {generateKeyPairSync} from 'node:crypto';
import {it,expect} from 'vitest';
import {RunnerConfigSchema,runnerCapability} from '../../../services/runner-controller/config.js';
const key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
const config={profile:'dedicated-linux-kvm-fresh-vm',host:'runner.synthetic.invalid',user:'runner',identityFile:'/operator/key',knownHostsFile:'/operator/known_hosts',resultPublicKey:key,baselineDigest:'a'.repeat(64),brokerVersion:1,operatorDedicatedHostAttested:true};
it.each(['localhost','127','2130706433','0177.0.0.1','0x7f000001','0x7f.0.0.1','127.0.0x0.1','169.254.169.254','http://runner.synthetic.invalid','runner.synthetic.invalid;command'])('rejects local/noncanonical/command alias %s',host=>expect(RunnerConfigSchema.safeParse({...config,host}).success).toBe(false));
it('keeps valid config unvalidated and rejects malformed cryptographic/path controls',()=>{expect(runnerCapability(config)).toMatchObject({status:'configured_not_validated',realValidation:'unverified',hostExecutionAllowed:false});for(const bad of [{knownHostsFile:'safe\nProxyCommand=evil'},{identityFile:'unsafe\rpath'},{resultPublicKey:'invalid-public-key-value-aaaaaaaaaaaaaa'},{operatorDedicatedHostAttested:false}])expect(RunnerConfigSchema.safeParse({...config,...bad}).success).toBe(false);});
