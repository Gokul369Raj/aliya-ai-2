import { fetchRepositoryFile } from '../api';
import { analyzeFileStatic } from './staticAnalyzer';
import { setSummary, getSummary } from './summaryDb';

// A simple queue to process files incrementally
let indexingQueue = [];
let isIndexing = false;

export async function startIndexing(analysis) {
  if (!analysis || !analysis.repoId || !analysis.files) return;

  const repoId = analysis.repoId;
  const nodes = analysis.graph?.nodes || [];

  // Filter out non-code files or very large files (e.g. > 100KB) to save time
  const filesToIndex = analysis.files.filter(f => f.type !== 'folder' && f.size < 100000);

  // Add to queue
  indexingQueue = filesToIndex.map(f => ({ repoId, path: f.path, nodes }));
  
  if (!isIndexing) {
    processQueue();
  }
}

export function stopIndexing() {
    indexingQueue = [];
    isIndexing = false;
}

async function processQueue() {
  if (indexingQueue.length === 0) {
    isIndexing = false;
    return;
  }
  
  isIndexing = true;
  const item = indexingQueue.shift();

  try {
    // Check if we already have it in DB
    const cached = await getSummary(item.repoId, item.path);
    if (!cached) {
      // Fetch file content
      const fileData = await fetchRepositoryFile(item.repoId, item.path);
      if (fileData && fileData.content) {
        const contentHash = `${fileData.content.length}-${fileData.content.substring(0, 100)}`;
        const staticMeta = analyzeFileStatic(item.path, fileData.content, item.nodes);
        
        const newSummary = {
          contentHash,
          purpose: `Implementation of ${item.path.split('/').pop()}`,
          ...staticMeta
        };
        
        await setSummary(item.repoId, item.path, newSummary);
      }
    }
  } catch {
    // Silently handle errors for background tasks
    console.debug(`Background indexing skipped for ${item.path}`);
  }

  // Use requestIdleCallback or setTimeout to yield to the main thread
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => processQueue());
  } else {
    setTimeout(processQueue, 50);
  }
}
