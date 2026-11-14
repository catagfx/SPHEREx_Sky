// `npm run dev`: Python backend (API, :8080) + Vite dev server (HMR for ui/src, proxies /api -> :8080).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const apiPort = process.env.PORT || '8080';

// Windows runs .cmd shims (npm) through the shell; the shell gets one command line (the arguments are fixed
// strings here), never separate args, which Node deprecates together with shell: true.
const command = (cmd, args) => (isWin ? [[cmd, ...args].join(' '), []] : [cmd, args]);

if (!existsSync(path.join(root, 'node_modules'))) {
  console.log('[dev] installing dependencies...');
  const r = spawnSync(...command(npm, ['install']), { cwd: root, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const procs = [];
const run = (name, cmd, args, cwd) => {
  const p = spawn(...command(cmd, args), { cwd, stdio: 'inherit', shell: isWin, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
  p.on('exit', (code) => {
    console.log(`[dev] ${name} exited (${code})`);
    stop(code ?? 0);
  });
  procs.push(p);
};

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (isWin) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill('SIGTERM');
  }
  process.exit(code);
};
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

console.log(`[dev] open http://localhost:5173/   (backend API on :${apiPort}, Ctrl+C stops both)`);
run('server', isWin ? 'python' : 'python3', ['server.py', apiPort], root);
run('vite', npm, ['exec', '--', 'vite', '--host', '127.0.0.1'], root);
