import fs from 'node:fs';
import path from 'node:path';

export function fixtureCase(destination) {
  if(fs.existsSync(destination)) throw new Error('Fixture destination exists');
  const files={
    'pkg/__init__.py':'from . import hot\n',
    'pkg/hot.py':'from . import helper\ndef used():\n    return helper.value()\ndef dead():\n    return 99\n',
    'pkg/helper.py':'def value():\n    return 7\n',
    'pkg/cold.py':'raise RuntimeError("cold must stay unloaded")\n',
    'pkg/empty.py':'# comment only\n',
    'tests/example.py':'import os, socket\nfrom pkg import hot, empty\nassert hot.used() == 7\nassert not os.path.exists("data/absent.txt")\nassert os.listdir("data") == ["value.txt"]\nassert open("data/value.txt").read() == "seven"\nassert not os.path.exists("/hostrepo/.git")\ns = socket.socket()\ns.settimeout(.1)\ntry:\n    s.connect(("1.1.1.1", 443))\n    raise AssertionError("network escaped")\nexcept OSError:\n    pass\nprint("fixture-ok")\n',
    'data/value.txt':'seven',
    'src/hot.ts':'import { value } from "./helper";\nexport function used() { return value(); }\nexport function dead() { return 99; }\n',
    'src/helper.ts':'export function value() { return 7; }\n',
    'src/importonly.ts':'import "./helper";\n',
    'src/cold.ts':'throw new Error("cold must stay unloaded");\n',
    'src/typeonly.ts':'export interface OnlyType { x: number }\n',
    'src/empty.ts':'// comment only\n',
    'tests/example.ts':'import { used } from "../src/hot";\nimport "../src/typeonly";\nimport "../src/empty";\nimport "../src/importonly";\nif (used() !== 7) throw new Error("wrong value");\nconsole.log("fixture-ok");\n'
  };
  for(const [p,content] of Object.entries(files)) {const target=path.join(destination,'tree',p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
  return {caseDirectory:destination,argv:['python','/opt/instrument/fixture_driver.py'],label:'known-answer-runtime'};
}
if(process.argv[2])console.log(JSON.stringify(fixtureCase(path.resolve(process.argv[2]))));
