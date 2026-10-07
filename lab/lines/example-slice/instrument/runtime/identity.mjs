import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';
// Development-frozen pytest schema. Normalize only the terminal runner summary's
// elapsed duration; assertion payloads and all other output stay byte-significant.
export function pytestIdentity(exit,stdout,stderr) {
  if(!Number.isInteger(exit))throw new Error('Missing behavioural exit status');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(stdout);
  const lines=text.split('\n');
  let i=lines.length-1; while(i>=0&&!lines[i].trim())i--;
  if(i>=0)lines[i]=lines[i].replace(/^(\d+ (?:failed|passed|skipped|deselected|xfailed|xpassed|errors?)(?:, \d+ (?:failed|passed|skipped|deselected|xfailed|xpassed|errors?))* in )\d+(?:\.\d+)?s$/, '$1<duration>s');
  const hash=b=>createHash('sha256').update(b).digest('hex');
  return {schema:'pytest-terminal-duration-v1',exit,stdout:hash(lines.join('\n')),stderr:hash(stderr)};
}
