# copyInheritedSettings and configureOutput have side-effects

URL: https://github.com/tj/commander.js/issues/2342
Opened: 2025-03-19T14:31:53Z
Closed: 2025-05-18T06:48:42Z
State: closed

---

Hi - noticed something that maybe isn't desired behaviour with the above two methods. Since `copyInheritedSettings` sets `this._outputConfiguration = sourceCommand._outputConfiguration` and `configureOutput` does `Object.assign(...)` - this means that one command can change another command's settings unexpectedly:

```ts
import {program, Command} from 'commander'

const one = new Command('one')
  .description('A very very very very very very very very very very very very very very very very very very very very very very very very long description')
  .action(() => console.log('hi i am one'))
  .configureOutput({
    writeOut: str => console.log(str + '🚀🚀🚀🚀'),
    getOutHelpWidth: () => 70,
  })

const two = new Command('two')
  .copyInheritedSettings(one)
  .description('Another very very very very very very very very very very very very very very very very very very very very very very very very long description')
  .action(() => console.log('hi i am two'))
  .configureOutput({
    getOutHelpWidth: () => 200,
  })

program
  .addCommand(one)
  .addCommand(two)

program.parse()
```

When you do `mycommand one --help` it uses 200 for the help width, not 70 as I'd expect. (Note: `mycommand two --help` prints the `🚀🚀🚀🚀` at the bottom, which _is_ correct/expected, IMO).

Suggested solution: use a spread operator in either/both of the methods.
