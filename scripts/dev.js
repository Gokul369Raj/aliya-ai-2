const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const clientDir = path.join(rootDir, 'client');
const rootModules = path.join(rootDir, 'node_modules');
const serverRuntimeNodePath = path.join(__dirname, 'server-runtime', 'node_modules');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const backendPort = process.env.ALIYA_BACKEND_PORT || '3001';
const frontendPort = process.env.VITE_PORT || '4173';
const npmCacheDir = path.join(rootDir, '.npm-cache');

const frontendUrl = `http://127.0.0.1:${frontendPort}/`;
const backendHealthUrl = `http://127.0.0.1:${backendPort}/api/health`;

function stamp() {
  return new Date().toLocaleTimeString('en-IN', { hour12: false });
}

function log(message) {
  console.log(`[${stamp()}] ${message}`);
}

// URL sabse pehle print karo taaki user ko turant pata chale kya khulne wala hai.
console.log('==============================================');
console.log(' Aliya AI — dev server start ho raha hai...');
console.log(` Frontend: ${frontendUrl}`);
console.log(` Backend:  ${backendHealthUrl}`);
console.log(' Terminal band mat karna. Browser apne aap khulega.');
console.log('==============================================');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openBrowser(url, source) {
  if (process.env.ALIYA_SKIP_OPEN || process.env.NO_BROWSER) {
    log(`Browser auto-open skip hai. Khud kholo: ${url}`);
    return false;
  }

  try {
    const { default: open } = await import('open');
    await open(url);
    log(`Browser khol diya (${source}): ${url}`);
    return true;
  } catch {
    // Neeche OS-level fallback hai.
  }

  try {
    await new Promise((resolve, reject) => {
      const opener = process.platform === 'darwin' ? 'open' : isWindows ? 'cmd' : 'xdg-open';
      const args = process.platform === 'darwin' ? [url] : isWindows ? ['/c', 'start', '', url] : [url];
      const child = spawn(opener, args, { detached: true, stdio: 'ignore' });
      const done = () => {
        child.unref();
        resolve();
      };
      child.on('error', reject);
      child.on('spawn', done);
      setTimeout(done, 3000);
    });
    log(`Browser khol diya (OS fallback, ${source}): ${url}`);
    return true;
  } catch {
    log(`Browser apne aap nahi khula. Khud kholo: ${url}`);
    return false;
  }
}

function ensureDependencies() {
  log('Dependencies check ho rahi hain...');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'ensure-deps.js')], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || npmCacheDir,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

/**
 * Sirf LISTEN karne wali process ko maaro — browser ke normal connection
 * (khula Chrome tab) ko nahi.
 *
 * `lsof` sirf macOS/Linux par hota hai, isliye Windows par `netstat` se padhte
 * hain. Pehle sirf lsof chalta tha, jisse Windows par port busy hone par bhi
 * pata nahi chalta tha aur dev server bind hi nahi kar paata.
 */
function listeningPids(port) {
  return isWindows ? windowsListeningPids(port) : unixListeningPids(port);
}

function unixListeningPids(port) {
  const result = spawnSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return [];
  return (result.stdout || '')
    .trim()
    .split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isFinite(pid) && pid !== process.pid);
}

function windowsListeningPids(port) {
  // netstat -ano -p tcp →
  //   TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    12345
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return [];

  const pids = new Set();
  for (const line of (result.stdout || '').split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const localAddress = parts[1] || '';
    const pid = Number(parts[parts.length - 1]);
    const localPort = Number(localAddress.slice(localAddress.lastIndexOf(':') + 1));
    if (localPort === port && Number.isFinite(pid) && pid !== process.pid) pids.add(pid);
  }
  return [...pids];
}

async function freePort(port, label) {
  let pids = listeningPids(port);
  if (pids.length === 0) return;

  log(`${label} port ${port} busy hai (PID ${pids.join(', ')}) — purani process band kar raha hoon...`);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process pehle se band ho sakti hai.
    }
  }

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await sleep(300);
    pids = listeningPids(port);
    if (pids.length === 0) return;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ignore.
    }
  }
  await sleep(1000);

  pids = listeningPids(port);
  if (pids.length > 0) {
    console.error(`Port ${port} abhi bhi busy hai (PID ${pids.join(', ')}).`);
    console.error('Us process ko band karke dobara chalao:');
    console.error(
      isWindows
        ? `  taskkill /PID ${pids[0]} /F`
        : `  lsof -tiTCP:${port} -sTCP:LISTEN | xargs kill -9`,
    );
    process.exit(1);
  }
}

function waitForHealth(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode === 200) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(attempt, 250);
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(attempt, 250);
      });

      request.setTimeout(1500, () => {
        request.destroy();
      });
    };

    attempt();
  });
}

function clientViteEntry() {
  return {
    jsEntry: path.join(clientDir, 'node_modules', 'vite', 'bin', 'vite.js'),
    shim: path.join(clientDir, 'node_modules', '.bin', isWindows ? 'vite.cmd' : 'vite'),
  };
}

function ensureClientBinary() {
  const entry = clientViteEntry();
  if (fs.existsSync(entry.jsEntry) || fs.existsSync(entry.shim)) return entry;

  log('Client ka vite binary nahi mila — client dependencies dobara install ho rahi hain...');
  const result = spawnSync(npmCmd, ['install', '--no-audit', '--no-fund'], {
    cwd: clientDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || npmCacheDir,
    },
  });

  if (result.status !== 0 || (!fs.existsSync(entry.jsEntry) && !fs.existsSync(entry.shim))) {
    console.error('Client dependencies install nahi ho payi. `npm install` client folder me chala kar dobara try karo.');
    process.exit(result.status || 1);
  }

  return entry;
}

/**
 * Vite ko seedha `node <entry>` se chalao.
 *
 * `node_modules/.bin/vite` ek shebang script hai jo PATH par depend karti hai.
 * Kuch environments me wo chup-chaap mar jati hai (na output, na port bind).
 * JS entry ko khud node se chalane par har platform par ek hi behaviour milta hai.
 */
function spawnClient(entry) {
  if (fs.existsSync(entry.jsEntry)) {
    return spawn(process.execPath, [entry.jsEntry], { cwd: clientDir, stdio: 'inherit', env: clientEnv() });
  }

  return spawn(entry.shim, [], { cwd: clientDir, stdio: 'inherit', env: clientEnv() });
}

function clientEnv() {
  return {
    ...process.env,
    BACKEND_PORT: backendPort,
    VITE_PORT: frontendPort,
    npm_config_cache: process.env.npm_config_cache || npmCacheDir,
  };
}

/**
 * Vite apni optimized dependencies `node_modules/.vite/deps` me rakhta hai.
 * Agar optimize beech me ruk jaye (Ctrl+C, crash, ya purani `vite optimize`
 * command) to `deps_temp_*` folders reh jate hain aur agla start slow ho jata
 * hai. Start se pehle inhe saaf kar dete hain.
 */
function cleanStaleOptimizerDirs() {
  const viteCacheDir = path.join(clientDir, 'node_modules', '.vite');

  let entries;
  try {
    entries = fs.readdirSync(viteCacheDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('deps_temp_')) continue;
    try {
      fs.rmSync(path.join(viteCacheDir, entry.name), { recursive: true, force: true });
      removed += 1;
    } catch {
      // Koi chal rahi process folder hold kar rahi ho sakti hai — chhod do.
    }
  }

  return removed;
}

let server = null;
let client = null;
let shuttingDown = false;
let ready = false;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;

  if (server && !server.killed) server.kill(signal);
  if (client && !client.killed) client.kill(signal);
}

function handleExit(name, code, signal) {
  if (shuttingDown) return;

  const failureCode = typeof code === 'number' ? code : 1;
  if (signal) {
    log(`${name} exited due to ${signal}`);
  } else if (failureCode !== 0) {
    log(`${name} exited with code ${failureCode}`);
  }

  if (!ready) {
    console.error('Server poori tarah start hone se pehle band ho gaya. `npm install` chala kar dobara `npm run dev` try karo.');
  }

  shutdown();
  process.exitCode = failureCode;
}

async function main() {
  ensureDependencies();
  await freePort(backendPort, 'Backend');
  await freePort(frontendPort, 'Frontend');

  if (!fs.existsSync(path.join(rootModules, 'express', 'package.json'))) {
    console.error('Server dependencies are missing. Run `npm install` in the project root.');
    process.exit(1);
  }

  const viteEntry = ensureClientBinary();

  // Adhoore optimize folders hata do taaki Vite ka dependency cache saaf state
  // se shuru ho — warna dev server dobara (blocking) optimize karta hai.
  const staleCaches = cleanStaleOptimizerDirs();
  if (staleCaches > 0) {
    log(`${staleCaches} adhoora dependency-cache folder saaf kiya.`);
  }

  const nodePathParts = [rootModules, serverRuntimeNodePath];
  if (process.env.NODE_PATH) {
    nodePathParts.push(process.env.NODE_PATH);
  }

  log('Backend start ho raha hai...');
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ALIYA_SKIP_OPEN: '1',
      NODE_ENV: 'development',
      NODE_PATH: nodePathParts.join(path.delimiter),
      PORT: backendPort,
    },
  });

  log('Frontend start ho raha hai...');
  client = spawnClient(viteEntry);

  server.on('exit', (code, signal) => handleExit('server', code, signal));
  client.on('exit', (code, signal) => handleExit('client', code, signal));

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });

  // Browser frontend ke up hote hi kholo — backend ka wait mat karo.
  // Page backend ke bina bhi load hota hai, API thodi der me jud jati hai.
  try {
    await waitForHealth(frontendUrl, 300000);
    log(`Frontend ready: ${frontendUrl}`);
  } catch (error) {
    console.error(`Frontend 5 minute me ready nahi hua: ${error.message}`);
    console.error(`Phir bhi browser me khud try karo: ${frontendUrl}`);
  }
  ready = true;
  await openBrowser(frontendUrl, 'frontend-ready');

  // Backend background me ready hone do — iske liye server KILL nahi hoga.
  try {
    await waitForHealth(backendHealthUrl, 300000);
    log(`Backend ready: ${backendHealthUrl}`);
  } catch (error) {
    console.error(`Backend 5 minute me ready nahi hua: ${error.message}`);
    console.error('Server terminal me error dekho. Phir bhi page khula rahega, backend judte hi API chalegi.');
  }

  log(`Dev environment ready: ${frontendUrl}`);
  log('Terminal band mat karna — band karte hi site ruk jayegi.');
}

main().catch((error) => {
  console.error(error.message || error);
  console.log(`Phir bhi browser me khud kholo: ${frontendUrl}`);
  shutdown();
  process.exitCode = 1;
});
