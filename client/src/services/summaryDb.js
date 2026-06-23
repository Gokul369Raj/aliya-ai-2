import { openDB } from 'idb';

const DB_NAME = 'aliya-ai-summaries';
const DB_VERSION = 1;

let dbPromise;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('fileSummaries')) {
          db.createObjectStore('fileSummaries', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getSummary(repoId, path) {
  const db = await getDb();
  const id = `${repoId}::${path}`;
  return db.get('fileSummaries', id);
}

export async function setSummary(repoId, path, data) {
  const db = await getDb();
  const id = `${repoId}::${path}`;
  return db.put('fileSummaries', { id, repoId, path, ...data });
}

export async function clearRepoSummaries(repoId) {
  const db = await getDb();
  const tx = db.transaction('fileSummaries', 'readwrite');
  const store = tx.objectStore('fileSummaries');
  
  // A simple iteration to clear for a specific repo
  let cursor = await store.openCursor();
  while (cursor) {
    if (cursor.value.repoId === repoId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}
