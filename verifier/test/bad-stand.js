// A kit that is wrong on purpose: the JavaScript kit's stand program, with what it says to the verifier
// altered on the way out. `node bad-stand.js <short|stray> <stand program>`, run from the kit's folder.
//   short: the reply a door gives a stranger, 128 bytes, is one byte shorter.
//   stray: a line that is no answer is written on stdout before the first answer.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const [mode, program] = process.argv.slice(2);
const kit = spawn(program, [], { stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.pipe(kit.stdin);
let first = true;
createInterface({ input: kit.stdout }).on('line', (line) => {
  if (first && mode === 'stray') process.stdout.write('this is no answer\n');
  first = false;
  const answer = JSON.parse(line);
  if (mode === 'short' && typeof answer.reply === 'string' && answer.reply.length === 256)
    answer.reply = answer.reply.slice(0, -2);
  process.stdout.write(`${JSON.stringify(answer)}\n`);
});
kit.on('exit', (code) => process.exit(code ?? 1));
