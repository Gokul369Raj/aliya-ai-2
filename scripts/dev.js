const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const clientDir = path.join(rootDir, 'client');
const serverRuntimeNodePath = path.join(__dirname, 'server-runtime', 'node_modules');
const isWindows = process.platform === 'win32';
const backendPort = process.env.ALIYA_BACKEND_PORT || '3001';

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ALIYA_SKIP_OPEN: '1',
    NODE_ENV: 'development',
    NODE_PATH: process.env.NODE_PATH
      ? `${serverRuntimeNodePath}${path.delimiter}${process.env.NODE_PATH}`
      : serverRuntimeNodePath,
    PORT: backendPort,
  },
});

const client = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev'], {
  cwd: clientDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    BACKEND_PORT: backendPort,
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
console.log('Frontend URL: http://localhost:4173/');
console.log(`Backend URL: http://localhost:${backendPort}/api/health`);
