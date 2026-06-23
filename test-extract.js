const fs = require('fs');
const { getRunFlow } = require('./server/repo-analyzer');

async function test() {
  const result = await getRunFlow(process.cwd());
  console.log(JSON.stringify(result, null, 2));
}

test();
