const DB_NAME = 'framestudio-local';
const DB_VERSION = 1;
const STORE = 'templates';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support local IndexedDB storage.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local database.'));
  });
}

async function runTransaction(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = action(store); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Local storage transaction failed.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Local storage transaction aborted.')); };
  });
}

export async function getAllTemplates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getTemplate(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveTemplate(template) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(template);
    tx.oncomplete = () => { db.close(); resolve(template); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save template.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Saving template was aborted.')); };
  });
}

export async function deleteTemplate(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function clearTemplates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function estimateStorage() {
  const templates = await getAllTemplates();
  let bytes = 0;
  for (const item of templates) {
    bytes += item.sceneBlob?.size || 0;
    bytes += item.reflectionBlob?.size || 0;
    bytes += item.frameOverlayBlob?.size || 0;
  }
  return { bytes, count: templates.length };
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not encode image asset.'));
    reader.readAsDataURL(blob);
  });
}

export async function exportTemplateData(template) {
  return {
    format: 'framestudio-template',
    version: 1,
    template: {
      ...template,
      sceneBlob: await blobToDataURL(template.sceneBlob),
      reflectionBlob: await blobToDataURL(template.reflectionBlob),
      frameOverlayBlob: await blobToDataURL(template.frameOverlayBlob),
    }
  };
}

function dataURLToBlob(dataURL) {
  if (!dataURL) return null;
  const [header, body] = dataURL.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function importTemplateData(data) {
  if (!data || data.format !== 'framestudio-template' || !data.template) throw new Error('This file is not a valid FrameStudio template.');
  const t = data.template;
  if (!t.name || !t.width || !t.height || !Array.isArray(t.corners) || t.corners.length !== 4 || !t.sceneBlob) throw new Error('The template file is missing required scene data.');
  return {
    ...t,
    id: crypto.randomUUID ? crypto.randomUUID() : `tpl_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    sceneBlob: dataURLToBlob(t.sceneBlob),
    reflectionBlob: dataURLToBlob(t.reflectionBlob),
    frameOverlayBlob: dataURLToBlob(t.frameOverlayBlob),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
