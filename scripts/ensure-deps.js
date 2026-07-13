const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npmCacheDir = path.join(rootDir, '.npm-cache');

const checks = [
  { dir: rootDir, marker: path.join('node_modules', 'express', 'package.json'), label: 'server' },
  { dir: path.join(rootDir, 'client'), marker: path.join('node_modules', 'vite', 'package.json'), label: 'client' },
  {
    dir: path.join(rootDir, 'scripts', 'server-runtime'),
    marker: path.join('node_modules', 'express', 'package.json'),
    label: 'server-runtime',
  },
];

function hasMarker(baseDir, marker) {
  try {
    fs.accessSync(path.join(baseDir, marker));
    return true;
  } catch {
    return false;
  }
}

function install(label, cwd) {
  console.log(`Installing ${label} dependencies...`);
  const result = spawnSync(npmCmd, ['install', '--no-audit', '--no-fund'], {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || npmCacheDir,
    },
  });

  if (result.status !== 0) {
    console.error(`Failed to install ${label} dependencies.`);
    process.exit(result.status || 1);
  }
}

let missing = false;

for (const check of checks) {
  if (!hasMarker(check.dir, check.marker)) {
    missing = true;
    install(check.label, check.dir);
  }
}

if (missing) {
  console.log('Dependencies installed. You can start the app now.');
}
