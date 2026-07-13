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

async function openBrowser(url) {
  if (process.env.ALIYA_SKIP_OPEN) return;

  try {
    const { default: open } = await import('open');
    await open(url);
  } catch {
    console.log(`Unable to open the browser automatically. Open ${url} manually.`);
  }
}

function ensureDependencies() {
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

function freePort(port) {
  const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
  const pids = (result.stdout || '').trim().split('\n').filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // Process may already be gone.
    }
  }
}

function waitForHealth(url, timeoutMs = 45000) {
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

        setTimeout(attempt, 500);
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(attempt, 500);
      });

      request.setTimeout(1500, () => {
        request.destroy();
      });
    };

    attempt();
  });
}

ensureDependencies();
freePort(backendPort);
freePort(frontendPort);

if (!fs.existsSync(path.join(rootModules, 'express', 'package.json'))) {
  console.error('Server dependencies are missing. Run `npm install` in the project root.');
  process.exit(1);
}

const nodePathParts = [rootModules, serverRuntimeNodePath];
if (process.env.NODE_PATH) {
  nodePathParts.push(process.env.NODE_PATH);
}

const server = spawn(process.execPath, ['server/index.js'], {
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

const client = spawn(npmCmd, ['run', 'dev'], {
  cwd: clientDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    BACKEND_PORT: backendPort,
    VITE_PORT: frontendPort,
    npm_config_cache: process.env.npm_config_cache || npmCacheDir,
  },
});

let shuttingDown = false;

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!server.killed) server.kill(signal);
  if (!client.killed) client.kill(signal);
}

function handleExit(name, code, signal) {
  if (shuttingDown) return;

  const failureCode = typeof code === 'number' ? code : 1;
  if (signal) {
    console.error(`${name} exited due to ${signal}`);
  } else if (failureCode !== 0) {
    console.error(`${name} exited with code ${failureCode}`);
  }

  shutdown();
  process.exitCode = failureCode;
}

server.on('exit', (code, signal) => handleExit('server', code, signal));
client.on('exit', (code, signal) => handleExit('client', code, signal));

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

console.log('Starting Aliya AI dev environment...');

void (async () => {
  try {
    await waitForHealth(`http://127.0.0.1:${backendPort}/api/health`);
    console.log(`Backend ready: http://127.0.0.1:${backendPort}/api/health`);
    await waitForHealth(`http://127.0.0.1:${frontendPort}/`, 120000);
    const frontendUrl = `http://127.0.0.1:${frontendPort}/`;
    console.log(`Frontend ready: ${frontendUrl}`);
    await openBrowser(frontendUrl);
    console.log(`Dev environment is ready: ${frontendUrl}`);
  } catch (error) {
    console.error(error.message);
    shutdown();
    process.exitCode = 1;
  }
})();
