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
    console.log('Started job:', jobId);
    const interval = setInterval(() => {
      http.get('http://localhost:3001/api/jobs/' + jobId, (res2) => {
        let b = '';
        res2.on('data', d => b += d);
        res2.on('end', () => {
          const job = JSON.parse(b);
          console.log(`[poll] status=${job.status} progress=${job.progress} message=${job.message}`);
          if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(interval);
          }
        });
      });
    }, 200);
  });
});
req.write(postData);
req.end();
