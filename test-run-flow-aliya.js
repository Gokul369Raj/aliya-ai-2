const http = require('http');

const postData = JSON.stringify({ repoUrl: 'https://github.com/gokulraj/aliya-ai' }); // Wait, maybe they are analyzing their local repo?
// Local repos are not supported by the tool via URL, wait, the tool accepts local paths?
