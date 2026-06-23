const simpleGit = require('simple-git');
const fs = require('fs');
fs.rmSync('test-repo', { recursive: true, force: true });
const git = simpleGit({
  progress({ method, stage, progress }) {
    try {
      let overallProgress = 0;
      if (stage === 'receiving') overallProgress = 10 + (progress * 0.7);
      else if (stage === 'resolving') overallProgress = 80 + (progress * 0.2);
      else overallProgress = progress * 0.1;
      
      const mappedProgress = 18 + (overallProgress * 26) / 100;
      
      let stageLabel = 'Cloning repository';
      if (stage === 'receiving') stageLabel = 'Receiving objects';
      else if (stage === 'resolving') stageLabel = 'Resolving deltas';
      else if (stage && stage.startsWith('remote:')) stageLabel = 'Compressing objects';
      
      console.log(`[progress] mapped=${mappedProgress.toFixed(2)} label=${stageLabel}`);
    } catch (e) {
      console.error('Error in progress:', e);
    }
  }
});
git.clone('https://github.com/expressjs/express.git', 'test-repo', ['--depth', '1', '--progress'])
  .then(() => console.log('Done'))
  .catch(err => console.error(err));
