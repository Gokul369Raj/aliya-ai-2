const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'client', 'src', 'App.jsx');
const src = fs.readFileSync(appPath, 'utf8');

const start = src.indexOf('function parseChatBlocks');
const end = src.indexOf('function ChatCodeBlock');
if (start < 0 || end < 0) {
  console.error('Could not locate parseChatBlocks in App.jsx');
  process.exit(1);
}

// parseChatBlocks is pure JS (no JSX), so it can be evaluated directly.
const parseChatBlocks = new Function(`${src.slice(start, end)}; return parseChatBlocks;`)();

const BT = '`';
const FENCE = '```';

const sample = [
  `**Direct answer** — ${BT}server/index.js${BT} owns the HTTP surface; routes are registered in ${BT}app.get()${BT} calls.`,
  '',
  '**Evidence**',
  `- ${BT}server/index.js${BT} — boots Express and mounts the commits route`,
  `- ${BT}server/repo-analyzer.js${BT} — ${BT}getCommitHistory()${BT} runs git log`,
  '',
  '1. Parse the request',
  '2. Resolve the repo record',
  '3. Return JSON',
  '',
  '> Note: commits are fetched lazily.',
  '',
  `${FENCE}js`,
  'const history = await getCommitHistory(repoRecord.repoPath, 150)',
  FENCE,
  '',
  '---',
  '',
  'See [the docs](https://example.com) for more.',
].join('\n');

const blocks = parseChatBlocks(sample);
console.log(`BLOCKS: ${blocks.length}`);
for (const block of blocks) {
  if (block.type === 'code') {
    console.log(` - code[${block.language}] lines=${block.code.split('\n').length}`);
  } else if (block.type === 'ul' || block.type === 'ol') {
    console.log(` - ${block.type} items=${block.items.length} first=${JSON.stringify(block.items[0].slice(0, 48))}`);
  } else if (block.type === 'heading') {
    console.log(` - heading L${block.level} ${JSON.stringify(block.text.slice(0, 40))}`);
  } else if (block.type === 'hr') {
    console.log(' - hr');
  } else if (block.type === 'quote') {
    console.log(` - quote ${JSON.stringify(block.text.slice(0, 40))}`);
  } else {
    console.log(` - p ${JSON.stringify(block.text.slice(0, 64))}`);
  }
}

// Assertions
const types = blocks.map((b) => b.type);
const checks = [
  ['paragraph parsed', types.includes('p')],
  ['unordered list parsed', types.includes('ul')],
  ['ordered list parsed', types.includes('ol')],
  ['blockquote parsed', types.includes('quote')],
  ['code fence parsed', types.includes('code')],
  ['horizontal rule parsed', types.includes('hr')],
  ['code language captured', blocks.some((b) => b.type === 'code' && b.language === 'js')],
  ['bold + inline code kept in paragraph', blocks.some((b) => b.type === 'p' && b.text.includes('**Direct answer**'))],
  ['no raw fence leaked', !blocks.some((b) => b.type === 'p' && b.text.includes(FENCE))],
];

console.log('\nASSERTIONS');
let failed = 0;
for (const [label, ok] of checks) {
  console.log(` ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}
console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
