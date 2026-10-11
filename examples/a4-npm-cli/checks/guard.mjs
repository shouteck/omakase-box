import { paint } from '../src/paint.js';

// Guard: preexisting behavior that must stay green. paint is exported as a
// function, passes uncolored text through unchanged and accepts empty input.
const problems = [];
if (typeof paint !== 'function') {
  problems.push('paint is not exported as a function');
} else {
  if (paint('keep me') !== 'keep me') problems.push('uncolored text must pass through unchanged');
  if (paint('') !== '') problems.push('empty text must stay empty');
  if (paint.length < 1) problems.push('paint must take at least one argument');
}
if (problems.length > 0) {
  console.log('GUARD FAIL ' + problems.join('; '));
  process.exit(1);
}
console.log('a4-npm-cli guard: base behavior intact');
