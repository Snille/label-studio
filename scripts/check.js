// npm run check: syntax of the plain modules, unit tests, a production build and git whitespace.
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
};
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${path}/${entry.name}`) : [`${path}/${entry.name}`]);
}
for (const file of ['server', 'scripts', 'test', 'src/lib'].flatMap(files).filter(f => f.endsWith('.js'))) run(process.execPath, ['--check', file]);
run(process.execPath, ['--test', '--test-timeout=20000']);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--logLevel', 'warn']);
if (existsSync('.git')) run('git', ['diff', '--check']);
