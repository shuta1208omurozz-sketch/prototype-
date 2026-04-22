import { state } from './state.js';
import { $, showToast, fmtTime, dataUrlToBlob, isIOS } from './utils.js';

/* ════ File System Access API (フォルダ保存) ════ */
let folderHandle = null, _pendingFH = null, _folderDB = null;

function openFolderDB() {
  if (_folderDB) return Promise.resolve(_folderDB);
  return new Promise((res, rej) => {
    const r = indexedDB.open('scanner-folder-v1', 1);
    r.onupgradeneeded = e => e.target.result.createObjectStore('handles', { keyPath: 'id' });
    r.onsuccess = e => { _folderDB = e.target.result; res(_folderDB); };
    r.onerror   = e => rej(e.target.error);
  });
}

async function saveFHtoIDB(h) {
  try {
    const db = await openFolderDB();
    await new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').put({ id: 'folder', handle: h });
      tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
    });
  } catch(_) {}
  localStorage.setItem('sc-folder-name', h.name);
}

export async function restoreFolderHandle() {
  try {
    const db  = await openFolderDB();
    const rec = await new Promise((res, rej) => {
      const tx = db.transaction('handles', 'readonly');
      const r  = tx.objectStore('handles').get('folder');
      r.onsuccess = e => res(e.target.result);
      tx.onerror  = e => rej(e.target.error);
    });
    if (rec?.handle) {
      const h = rec.handle;
      const p = await h.queryPermission({ mode: 'readwrite' });
      if (p === 'granted') { folderHandle = h; updateFolderUI(h, h.name, false); updateSetFolderUI(); return; }
      _pendingFH = h; updateFolderUI(null, h.name, true); updateSetFolderUI(); return;
    }
  } catch(_) {}
  const name = localStorage.getItem('sc-folder-name');
  if (name) { updateFolderUI(null, name, true); updateSetFolderUI(); }
}

export async function pickSaveFolder() {
  if (!window.showDirectoryPicker) {
    showToast('[E003] フォルダ選択非対応（Android Chrome等をお使いください）', 'err', 4000); return;
  }
  if (_pendingFH) {
    try {
      if (await _pendingFH.requestPermission({ mode: 'readwrite' }) === 'granted') {
        folderHandle = _pendingFH; _pendingFH = null;
        updateFolderUI(folderHandle, folderHandle.name, false); updateSetFolderUI();
        showToast('✓ 保存先を復元: ' + folderHandle.name, 'ok'); return;
      }
    } catch(_) {}
    _pendingFH = null;
  }
  try {
    const h = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
    folderHandle = h;
    await saveFHtoIDB(h);
    updateFolderUI(h, h.name, false); updateSetFolderUI();
    showToast('✓ 保存先を固定: ' + h.name, 'ok');
  } catch (e) {
    if (e.name !== 'AbortError') showToast('[E004] フォルダ選択エラー: ' + e.message, 'err');
  }
}

function updateFolderUI(h, name, needReselect) {
  const pe = $('folder-path-txt'), ce = $('btn-folder-clear'), pk = $('btn-folder-pick');
  if (!name) {
    pe.textContent = '未設定（Downloadsフォルダに保存）'; pe.className = 'save-folder-path none';
    if (ce) ce.style.display = 'none';
    if (pk) pk.textContent   = '📂 フォルダを選択';
  } else if (needReselect) {
    pe.innerHTML  = `📂 ${name} <span style="color:#ffaa00;font-size:8px;">※ 再起動後は再選択が必要</span>`;
    pe.className  = 'save-folder-path';
    if (ce) ce.style.display = '';
    if (pk) pk.textContent   = '🔄 再選択（固定済み）';
  } else {
    pe.textContent = `📂 ${name} ✓ 固定済み`; pe.className = 'save-folder-path';
    if (ce) ce.style.display = '';
    if (pk) pk.textContent   = '📂 変更する';
  }
}

function updateSetFolderUI() {
  const n    = $('set-folder-name');
  const note = $('set-folder-note');
  const cb   = $('set-folder-clear-btn');
  const name = folderHandle?.name || localStorage.getItem('sc-folder-name') || '';
  if (name) {
    n.textContent    = '📂 ' + name;
    note.textContent = folderHandle ? '✓ 固定済み' : '※ 再選択が必要';
    if (cb) cb.style.display = '';
  } else {
    n.textContent    = '未設定';
    note.textContent = 'Downloadsフォルダに保存';
    if (cb) cb.style.display = 'none';
  }
}

export function clearSaveFolder() {
  folderHandle = null; _pendingFH = null;
  localStorage.removeItem('sc-folder-name');
  openFolderDB().then(db => {
    db.transaction('handles', 'readwrite').objectStore('handles').delete('folder');
  }).catch(() => {});
  updateFolderUI(null, '', false); updateSetFolderUI();
  showToast('保存先をリセットしました');
}

async function saveToFolderHandle(blob, filename) {
  if (!blob || blob.size === 0) return { ok: false, code: 'E011', msg: 'Blobが空です' };
  try {
    const perm = await folderHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      if (await folderHandle.requestPermission({ mode: 'readwrite' }) !== 'granted')
        return { ok: false, code: 'E006', msg: 'フォルダへのアクセス権限がありません' };
    }
    const fh       = await folderHandle.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(blob); await writable.close();
    const verFile  = await (await folderHandle.getFileHandle(filename)).getFile();
    if (verFile.size === 0) return { ok: false, code: 'E012', msg: 'ファイルが0Bです' };
    return { ok: true };
  } catch (e) { return { ok: false, code: 'E007', msg: e.message }; }
}

export async function autoSaveToDevice(photo, originalBlob = null) {
  if (isIOS) {
    if (!state.iosPopupShown) { state.iosPopupShown = true; $('ios-popup').style.display = ''; }
    return;
  }
  const ts     = fmtTime(photo.timestamp).replace(/[/:\s]/g, '-');
  const prefix = photo.scannedCode ? photo.scannedCode.slice(-5) : 'photo';
  const name   = `${prefix}_${ts}.jpg`;
  if (folderHandle) {
    let blob = originalBlob;
    if (!blob || blob.size === 0) blob = await dataUrlToBlob(photo.dataUrl);
    if (!blob || blob.size === 0) { showToast('[E010] 画像データ変換失敗', 'err', 4000); fallbackDownload(photo.dataUrl, name); return; }
    const r = await saveToFolderHandle(blob, name);
    if (r.ok) showToast('✓ ' + folderHandle.name + ' に保存しました', 'ok');
    else { showToast(`[${r.code}] 保存失敗→Downloads: ${r.msg}`, 'err', 5000); fallbackDownload(photo.dataUrl, name); }
  } else {
    fallbackDownload(photo.dataUrl, name);
    showToast('✓ Downloadsに保存しました', 'ok');
  }
}

export function fallbackDownload(dataUrl, name) {
  const a = Object.assign(document.createElement('a'), { href: dataUrl, download: name });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

/* ════ IndexedDB (写真保存) ════ */
let _db = null;
export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open('scanner-v1', 1);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('ts', 'timestamp');
      }
    };
    r.onsuccess = e => { _db = e.target.result; res(_db); };
    r.onerror   = e => rej(e.target.error);
  });
}

async function dbTx(mode, fn) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction('photos', mode);
    const st  = tx.objectStore('photos');
    const req = fn(st);
    if (req) req.onsuccess = e => res(e.target.result);
    tx.oncomplete = () => { if (!req) res(); };
    tx.onerror    = e => rej(e.target.error);
  });
}

export const dbPut   = p  => dbTx('readwrite', s => s.put(p));
export const dbDel   = id => dbTx('readwrite', s => s.delete(id));
export const dbClear = () => dbTx('readwrite', s => s.clear());
export const dbAll   = () => dbTx('readonly',  s => s.index('ts').getAll());

export async function dbPrune(max) {
  const all = await dbAll();
  if (all.length <= max) return;
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction('photos', 'readwrite');
    const st = tx.objectStore('photos');
    all.slice(0, all.length - max).forEach(p => st.delete(p.id));
    tx.oncomplete = res; tx.onerror = e => rej(e.target.error);
  });
}
