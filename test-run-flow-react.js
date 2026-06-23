const http = require('http');

const postData = JSON.stringify({ repoUrl: 'https://github.com/facebook/react' });
const req = http.request('http://localhost:3001/api/repos/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const { jobId } = JSON.parse(body);
    const interval = setInterval(() => {
      http.get('http://localhost:3001/api/jobs/' + jobId, (res2) => {
        let b = '';
        res2.on('data', d => b += d);
        res2.on('end', () => {
          const job = JSON.parse(b);
          if (job.status === 'completed') {
            clearInterval(interval);
            const repoId = job.result.repoId;
            http.get('http://localhost:3001/api/repos/' + repoId + '/run-flow', (res3) => {
              let rb = '';
              res3.on('data', d => rb += d);
              res3.on('end', () => {
                console.log('Run Flow Response:', rb);
              });
            });
          }
        });
      });
    }, 500);
  });
});
req.write(postData);
req.end();
