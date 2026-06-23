const fs = require('fs');
const content = fs.readFileSync('client/src/App.jsx', 'utf8');
if (content.includes('fetchRunFlow')) {
  console.log('fetchRunFlow still present - is it used?');
}
if (!content.includes('analysis.runFlow')) {
  console.log('analysis.runFlow missing!');
}
