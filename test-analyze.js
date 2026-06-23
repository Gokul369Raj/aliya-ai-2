const { analyzeRepository } = require('./server/repo-analyzer');
analyzeRepository('https://github.com/expressjs/express', (phase, progress, msg) => {
  console.log(`[reportProgress] phase=${phase} progress=${progress} msg=${msg}`);
}).then(() => console.log('Done')).catch(console.error);
