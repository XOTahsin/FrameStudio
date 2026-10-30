const DB_NAME = 'framestudio-local';
const DB_VERSION = 2;
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


function restoreAsset(value, fieldName) {
  if (!value) return null;
  if (value instanceof Blob) return value; // migrate records saved by v1
  if (value.__frameStudioBinary === true && value.bytes instanceof ArrayBuffer) {
    const blob = new Blob([value.bytes], { type: value.type || "application/octet-stream" });
    if (value.name) Object.defineProperty(blob, "name", { value: value.name, configurable: true });
    return blob;
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return new Blob([value], { type: fieldName === "sceneBlob" ? "image/jpeg" : "image/png" });
  }
  throw new Error("Stored " + fieldName + " data is not a valid image asset. Re-import its .framekit backup if available.");
}
function normalizeTemplate(record) {
  if (!record) return null;
  const copy = { ...record };
  for (const field of ["sceneBlob", "reflectionBlob", "frameOverlayBlob"]) copy[field] = restoreAsset(copy[field], field);
  return copy;
}
async function encodeAsset(blob, fieldName) {
  if (!blob) return null;
  if (!(blob instanceof Blob)) throw new Error(fieldName + " is not a valid image file. Please upload it again.");
  if (!blob.size) throw new Error(fieldName + " is empty. Please choose another image file.");
  let bytes;
  try { bytes = await blob.arrayBuffer(); }
  catch { throw new Error("Could not read " + fieldName + ". Please upload the image again."); }
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== blob.size) {
    throw new Error("Could not prepare " + fieldName + " for local storage. Please upload it again.");
  }
  return { __frameStudioBinary: true, type: blob.type || "application/octet-stream", name: typeof blob.name === "string" ? blob.name : "", bytes };
}

export async function getAllTemplates() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result || []).map(normalizeTemplate).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
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
    request.onsuccess = () => resolve(normalizeTemplate(request.result || null));
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveTemplate(template) {
  const record = { ...template };
  for (const field of ["sceneBlob", "reflectionBlob", "frameOverlayBlob"]) {
    record[field] = await encodeAsset(template[field], field);
  }
  if (!record.sceneBlob) throw new Error("Scenario background is missing. Upload the scenario image again.");
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      db.close();
      if (error?.name === "QuotaExceededError") {
        reject(new Error("This device is low on browser storage. Free up space or use a smaller scenario image, then try again."));
      } else reject(error || new Error("Could not save the template to local storage."));
    };
    let tx;
    try {
      tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
    } catch (error) { fail(error); return; }
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      db.close();
      resolve(normalizeTemplate(record));
    };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error || new Error("Saving the template was aborted."));
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
