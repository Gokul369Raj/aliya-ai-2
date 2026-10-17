const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..');
const CLIENT_DIST = path.join(APP_ROOT, 'client', 'dist');
// ALIYA_STORAGE_ROOT lets the workspace live outside the checkout — useful for
// a mounted volume in a deployed instance, and for tests that must not touch the
// developer's real projects.json.
const STORAGE_ROOT = process.env.ALIYA_STORAGE_ROOT
  ? path.resolve(process.env.ALIYA_STORAGE_ROOT)
  : path.join(APP_ROOT, '.aliya-ai');
const REPOS_ROOT = path.join(STORAGE_ROOT, 'repos');

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
]);

const IGNORED_FILE_NAMES = new Set([
  '.DS_Store',
]);

const TEXT_FILE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.env',
  '.go',
  '.graphql',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.kts',
  '.less',
  '.lua',
  '.m',
  '.md',
  '.php',
  '.pl',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
]);

const IMPORTABLE_EXTENSIONS = [
  '',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.vue',
  '.svelte',
  '.py',
];

const MAX_SCANNED_FILES = 2200;
const MAX_TEXT_FILE_BYTES = 300_000;
const MAX_FILE_RESPONSE_BYTES = 180_000;
const DEFAULT_VISIBLE_NODE_LIMIT = 600;
const HARD_VISIBLE_NODE_LIMIT = 1000;

module.exports = {
  APP_ROOT,
  CLIENT_DIST,
  DEFAULT_VISIBLE_NODE_LIMIT,
  HARD_VISIBLE_NODE_LIMIT,
  IGNORED_DIRECTORY_NAMES,
  IGNORED_FILE_NAMES,
  IMPORTABLE_EXTENSIONS,
  MAX_FILE_RESPONSE_BYTES,
  MAX_SCANNED_FILES,
  MAX_TEXT_FILE_BYTES,
  REPOS_ROOT,
  STORAGE_ROOT,
  TEXT_FILE_EXTENSIONS,
};
