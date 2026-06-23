const fs = require('fs');
const http = require('http');

const postData = JSON.stringify({ repoUrl: 'https://github.com/expressjs/express' });
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
            console.log("Keys:", Object.keys(job.result));
            console.log("Run flow:", job.result.runFlow);
          } else if (job.status === 'failed') {
             clearInterval(interval);
             console.log("FAILED!", job);
          }
        });
      });
    }, 500);
  });
});
req.write(postData);
req.end();
