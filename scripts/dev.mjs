// `npm run dev`: Python backend (API, :8080) + Vite dev server (HMR for ui/src, proxies /api -> :8080).
// `npm run dev:vr`: Automatically detects current LAN IPs, generates an X.509 SSL certificate with
//                   Subject Alternative Names (SAN) for every active IP, and starts Vite on HTTPS.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const apiPort = process.env.PORT || '8080';

const command = (cmd, args) => (isWin ? [[cmd, ...args].join(' '), []] : [cmd, args]);

if (!existsSync(path.join(root, 'node_modules'))) {
  console.log('[dev] installing dependencies...');
  const r = spawnSync(...command(npm, ['install']), { cwd: root, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

/**
 * Automatically generates a local Root CA (once) and a dynamic server SSL certificate
 * containing all current LAN IPv4 addresses in Subject Alternative Name (SAN) on every startup.
 */
function ensureDynamicIpCertificate(ips) {
  const certDir = path.join(root, '.certs');
  mkdirSync(certDir, { recursive: true });

  const rootKey = path.join(certDir, 'rootCA-key.pem');
  const rootCert = path.join(certDir, 'rootCA.crt');
  const serverKey = path.join(certDir, 'dev-key.pem');
  const serverCsr = path.join(certDir, 'dev.csr');
  const serverCert = path.join(certDir, 'dev-cert.pem');
  const extFile = path.join(certDir, 'dev-ext.cnf');

  const allIps = Array.from(new Set(['127.0.0.1', ...ips]));

  // 1. Prefer mkcert if installed on the system
  const mkcertCheck = spawnSync(isWin ? 'where' : 'which', ['mkcert'], { stdio: 'ignore' });
  if (mkcertCheck.status === 0) {
    spawnSync('mkcert', ['-install'], { cwd: root, stdio: 'ignore' });
    const mk = spawnSync(
      'mkcert',
      ['-cert-file', serverCert, '-key-file', serverKey, 'localhost', ...allIps],
      { cwd: root, stdio: 'ignore' }
    );
    if (mk.status === 0 && existsSync(serverCert) && existsSync(serverKey)) {
      return { certPath: serverCert, keyPath: serverKey, rootCertPath: null, method: 'mkcert' };
    }
  }

  // 2. Fallback to OpenSSL with a persistent Local Root CA + dynamic SAN for all current IPs
  const opensslCheck = spawnSync(isWin ? 'where' : 'which', ['openssl'], { stdio: 'ignore' });
  if (opensslCheck.status === 0) {
    if (!existsSync(rootCert) || !existsSync(rootKey)) {
      spawnSync(
        'openssl',
        [
          'req', '-x509', '-new', '-nodes',
          '-newkey', 'rsa:2048',
          '-keyout', rootKey,
          '-sha256', '-days', '3650',
          '-out', rootCert,
          '-subj', '/C=US/O=SPHEREx Sky Local CA/CN=SPHEREx Sky Local Root CA'
        ],
        { stdio: 'ignore' }
      );
    }

    const sanEntries = [
      'DNS.1 = localhost',
      ...allIps.map((ip, idx) => `IP.${idx + 1} = ${ip}`)
    ].join('\n');

    const extConfig = [
      'authorityKeyIdentifier=keyid,issuer',
      'basicConstraints=CA:FALSE',
      'keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment',
      'extendedKeyUsage = serverAuth',
      'subjectAltName = @alt_names',
      '[alt_names]',
      sanEntries
    ].join('\n');

    writeFileSync(extFile, extConfig, 'utf8');

    if (!existsSync(serverKey)) {
      spawnSync('openssl', ['genrsa', '-out', serverKey, '2048'], { stdio: 'ignore' });
    }

    const primaryCn = ips[0] || 'localhost';
    spawnSync(
      'openssl',
      ['req', '-new', '-key', serverKey, '-out', serverCsr, '-subj', `/C=US/O=SPHEREx Sky/CN=${primaryCn}`],
      { stdio: 'ignore' }
    );

    const signRes = spawnSync(
      'openssl',
      [
        'x509', '-req',
        '-in', serverCsr,
        '-CA', rootCert,
        '-CAkey', rootKey,
        '-CAcreateserial',
        '-out', serverCert,
        '-days', '825',
        '-sha256',
        '-extfile', extFile
      ],
      { stdio: 'ignore' }
    );

    if (signRes.status === 0 && existsSync(serverCert) && existsSync(serverKey)) {
      return { certPath: serverCert, keyPath: serverKey, rootCertPath: rootCert, method: 'openssl' };
    }
  }

  return null;
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

// --vr (`npm run dev:vr`): https on every network interface, auto-generating IP certificate on startup
const vr = process.argv.includes('--vr');
if (vr) {
  process.env.SPX_HTTPS = '1';
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);

  process.env.SPX_LAN_IPS = ips.join(',');
  const certInfo = ensureDynamicIpCertificate(ips);
  if (certInfo) {
    process.env.SPX_CERT_FILE = certInfo.certPath;
    process.env.SPX_KEY_FILE = certInfo.keyPath;
    console.log(`[dev] Auto-generated SSL certificate (${certInfo.method}) for IPs: localhost, 127.0.0.1, ${ips.join(', ')}`);
    if (certInfo.rootCertPath) {
      console.log(`[dev] Root CA available at: ${certInfo.rootCertPath} (or download https://${ips[0] || 'localhost'}:5173/rootCA.crt once to trust all future IPs)`);
    }
  }
  console.log('[dev] VR: in the headset browser open ' + ips.map((ip) => `https://${ip}:5173/`).join('  or  '));
} else {
  console.log(`[dev] open http://localhost:5173/   (backend API on :${apiPort}, Ctrl+C stops both)`);
}
run('server', isWin ? 'python' : 'python3', ['server.py', apiPort], root);
run('vite', npm, ['exec', '--', 'vite', '--host', vr ? '0.0.0.0' : '127.0.0.1'], root);
