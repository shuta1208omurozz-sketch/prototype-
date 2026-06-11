'use strict';

let lastSaveResult = null;

function getPhotoSaveState(photo) {
  if (!photo || typeof photo.savedToDevice === 'undefined') return null;
  return photo.savedToDevice ? 'saved' : 'unsaved';
}

function createSaveBadge(photo) {
  const state = getPhotoSaveState(photo);
  if (!state) return null;
  const badge = document.createElement('div');
  badge.className = 'photo-save-badge ' + state;
  badge.textContent = state === 'saved' ? '保存済' : '未保存';
  return badge;
}

function setSaveResultLog(ok = 0, fail = 0, total = 0, message = '') {
  lastSaveResult = { ok, fail, total, message, timestamp: Date.now() };
  updateSaveResultLogUI();
}

function updateSaveResultLogUI() {
  const text = lastSaveResult
    ? (lastSaveResult.message || `保存結果: ${lastSaveResult.ok}/${lastSaveResult.total} 成功${lastSaveResult.fail ? ' / 失敗 ' + lastSaveResult.fail : ''}`)
    : '保存結果: なし';
  const cls = lastSaveResult?.fail ? (lastSaveResult.ok ? 'warn' : 'err') : (lastSaveResult ? 'ok' : '');
  ['save-log-text', 'save-result-mini'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('ok','warn','err');
    if (cls) el.classList.add(cls);
  });
}


function getPhotoSerialMap() {
  const map = new Map();
  photos
    .slice()
    .filter(p => p && p.id)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .forEach((p, i) => map.set(p.id, i + 1));
  return map;
}

function getPhotoSerial(photo) {
  if (!photo) return 0;
  return getPhotoSerialMap().get(photo.id) || 0;
}

function getPhotoDisplayNumber(photo, fallbackSerial = 0) {
  const code = String(photo?.scannedCode || '').replace(/\D/g, '');
  if (code) return code.slice(-5).padStart(Math.min(5, code.length), '0');
  return String(fallbackSerial || 0).padStart(3, '0');
}

function createPhotoOrderBadge(photo, fallbackSerial = 0) {
  const badge = document.createElement('div');
  badge.className = 'photo-order-badge';
  badge.textContent = '#' + getPhotoDisplayNumber(photo, fallbackSerial);
  return badge;
}

/* ════ フィルタ・ソート ════ */
function getFilteredPh() {
  let f = photos.slice();
  if (cfg.useGroup) {
    const g = $('hist-ph-group-select').value;
    if (g !== 'all') f = f.filter(x => x.group === g);
  }
  if (sortOrderPh === 'asc') f.reverse();
  return f;
}

/* ════ フォトグリッド ════ */
function renderPhotoGrid() {
  const grid  = $('photo-grid');
  const empty = $('photo-empty');
  if (!photos.length) { grid.style.display = 'none'; empty.style.display = ''; return; }
  empty.style.display = 'none';
  grid.style.display  = '';
  grid.className = 'photo-list' + (mergeMode ? ' merge-mode' : multiSelModePh ? ' multi-mode-ph' : '');
  grid.innerHTML = '';

  let lastDay = '';
  const serialMap = getPhotoSerialMap();
  getFilteredPh().forEach(p => {
    const serial = serialMap.get(p.id) || 0;
    const day = getDayString(p.timestamp);
    if (day !== lastDay) {
      const hdr = document.createElement('div');
      hdr.className = 'photo-section-header'; hdr.textContent = day;
      grid.appendChild(hdr); lastDay = day;
    }
    const isSel = (mergeMode && mergeSelected.includes(p.id)) || (multiSelModePh && multiSelectedPh.includes(p.id));
    const item  = document.createElement('div');
    item.className = 'photo-card photo-item' + (isSel ? ' selected' : '');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'photo-card-img';

    imgWrap.appendChild(createPhotoOrderBadge(p, serial));
    if (cfg.useGroup && p.group) {
      const gb = document.createElement('div');
      gb.className = 'card-group-badge'; gb.textContent = p.group;
      imgWrap.appendChild(gb);
    }
    const img = document.createElement('img');
    img.src = p.thumbDataUrl || p.dataUrl; img.loading = 'lazy'; img.decoding = 'async'; img.fetchPriority = 'low';
    imgWrap.appendChild(img);
    const saveBadge = createSaveBadge(p);
    if (saveBadge) imgWrap.appendChild(saveBadge);

    const selOv = document.createElement('div'); selOv.className = 'photo-select-overlay';
    const chk   = document.createElement('div'); chk.className   = 'photo-select-check'; chk.textContent = '✓';
    selOv.appendChild(chk); imgWrap.appendChild(selOv);
    item.appendChild(imgWrap);

    item.addEventListener('click', () => {
      if (mergeMode)       toggleMergeSelect(p.id, item);
      else if (multiSelModePh) toggleMultiSelectPh(p.id, item);
      else                 openLightbox(p);
    });
    grid.appendChild(item);
  });
}

/* ════ サムネストリップ ════ */
function updateThumbStrip() {
  const wrap = $('thumb-strip-wrap');
  if (!thumbStripVisible || !photos.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const strip = $('thumb-strip');
  strip.innerHTML = '';
  const isIOS = (typeof IS_IOS_LIKE !== 'undefined' && IS_IOS_LIKE);
  const maxThumbs = isIOS ? 6 : 10;
  const serialMap = getPhotoSerialMap();
  photos.slice(0, maxThumbs).forEach(p => {
    const d   = document.createElement('div'); d.className = 'mini-thumb';
    d.appendChild(createPhotoOrderBadge(p, serialMap.get(p.id) || 0));
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.fetchPriority = 'low';
    img.src = p.thumbDataUrl || p.dataUrl;
    d.appendChild(img);
    const saveBadgeMini = createSaveBadge(p);
    if (saveBadgeMini) d.appendChild(saveBadgeMini);
    d.onclick = () => openLightbox(p);
    strip.appendChild(d);
  });
  if (photos.length > maxThumbs) {
    const m = document.createElement('button');
    m.className = 'more-btn'; m.textContent = '+' + (photos.length - maxThumbs);
    m.onclick = () => document.querySelector('[data-tab="photos"]').click();
    strip.appendChild(m);
  }
}

function setThumbVisible(v) {
  thumbStripVisible = v;
  localStorage.setItem('sc-thumb-vis', v ? '1' : '0');
  $('btn-thumb-toggle').classList.toggle('on', v);
  $('btn-thumb-toggle').textContent  = v ? '🖼 ON' : '🖼 OFF';
  $('btn-thumb-toggle2').textContent = v ? '非表示' : '表示';
  $('btn-thumb-toggle2').classList.toggle('on', v);
  updateThumbStrip();
}

/* ════ 写真削除 ════ */
function deletePhoto(id) {
  if (!confirm('この写真を削除しますか？')) return;
  dbDel(id).then(async () => {
    photos = photos.filter(p => p.id !== id);
    updateCounts(); renderPhotoGrid(); updateThumbStrip();
    if (currentLightbox?.id === id) closeLightbox();
  });
}

/* ════ 複数選択 ════ */
function enterMultiSelModePh(initialId = null) {
  multiSelModePh = true; multiSelectedPh = initialId ? [initialId] : [];
  $('btn-ph-select-mode').classList.add('on');
  $('multi-sel-bar').classList.add('on');
  updateMultiSelTxtPh(); renderPhotoGrid();
}

function exitMultiSelModePh() {
  multiSelModePh = false; multiSelectedPh = [];
  $('btn-ph-select-mode').classList.remove('on');
  $('multi-sel-bar').classList.remove('on');
  renderPhotoGrid();
}

function toggleMultiSelectPh(id, itemEl) {
  const idx = multiSelectedPh.indexOf(id);
  if (idx >= 0) { multiSelectedPh.splice(idx, 1); itemEl.classList.remove('selected'); }
  else          { multiSelectedPh.push(id);        itemEl.classList.add('selected'); }
  updateMultiSelTxtPh();
}

function updateMultiSelTxtPh() {
  $('multi-sel-txt').textContent = multiSelectedPh.length + '枚 選択中';
}

/* ════ ライトボックス ════ */
function openLightbox(p) {
  currentLightbox = p;
  $('lb-img').src       = p.dataUrl;
  $('lb-img').style.transform = `rotate(${p.rotation || 0}deg)`;
  const serial = getPhotoSerial(p);
  const displayNo = getPhotoDisplayNumber(p, serial);
  const codePart = p.scannedCode ? ' · BC ' + p.scannedCode : '';
  $('lb-ttl').textContent = '#' + displayNo + codePart + ' · ' + fmtTime(p.timestamp) + ' · ' +
    (p.facingMode === 'user' ? 'フロント' : p.facingMode === 'merged' ? '結合' : 'リア');
  $('lightbox').style.display = '';
}

function closeLightbox() {
  $('lightbox').style.display = 'none';
  currentLightbox = null;
}

/* ライトボックス スワイプ（統合：lbTouch と initSwipe を一本化） */
function initLightboxTouch() {
  const lb = $('lightbox');
  if (!lb) return;
  let sx = 0, sy = 0;
  lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend',   e => {
    if (!currentLightbox) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { closeLightbox(); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      const f   = getFilteredPh();
      const idx = f.findIndex(p => p.id === currentLightbox.id);
      if (idx === -1) return;
      if (dx < 0 && idx < f.length - 1) openLightbox(f[idx + 1]);
      if (dx > 0 && idx > 0)            openLightbox(f[idx - 1]);
    }
  });
}

/* ════ 写真回転 ════ */
async function rotateLightboxPhoto() {
  if (!currentLightbox) return;
  const img = new Image();
  img.src   = currentLightbox.dataUrl;
  await new Promise(r => { img.onload = r; });

  const c   = document.createElement('canvas');
  c.width   = img.height; c.height = img.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(90 * Math.PI / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  const newUrl      = c.toDataURL('image/jpeg', 0.9);
  const newThumbUrl = await createThumbnail(newUrl, 400);
  currentLightbox   = { ...currentLightbox, dataUrl: newUrl, thumbDataUrl: newThumbUrl, rotation: 0 };
  await dbPut(currentLightbox);
  photos         = (await dbAll()).reverse();
  $('lb-img').src = newUrl;
  $('lb-img').style.transform = '';
  renderPhotoGrid(); updateThumbStrip();
  showToast('↻ 回転しました', 'ok');
}

/* ════ 保存 ════ */

function getUnsavedPhotos() {
  // 既存の過去写真は undefined のため「保存対象外」にする。
  // このFIX以降に撮った写真だけ savedToDevice:false が付き、未保存として扱う。
  return photos.filter(p => p && p.savedToDevice === false && !p.merged);
}

function updateUnsavedSaveButton() {
  const n = getUnsavedPhotos().length;
  const btn = $('btn-save-unsaved');
  if (btn) {
    btn.disabled = n === 0;
    btn.textContent = (typeof IS_IOS_LIKE !== 'undefined' && IS_IOS_LIKE) ? (n ? `PCへ送る ${n}` : 'PCへ送る') : (n ? `保存 ${n}` : '保存');
    btn.title = n ? ((typeof IS_IOS_LIKE !== 'undefined' && IS_IOS_LIKE) ? `未保存の写真 ${n}枚をZIPでPCへ送る` : `未保存の写真 ${n}枚を保存`) : '未保存の写真はありません';
  }
  ['unsaved-indicator', 'unsaved-count-inline', 'photo-unsaved-count'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = `未保存 ${n}`;
  });
}

async function markPhotosSavedToDevice(list) {
  if (!list || !list.length) return;
  await Promise.all(list.map(p => {
    p.savedToDevice = true;
    return (typeof dbPut === 'function') ? dbPut(p) : Promise.resolve();
  }));
  if (typeof updateUnsavedSaveButton === 'function') updateUnsavedSaveButton();
  if (typeof renderPhotoGrid === 'function' && activeTab === 'photos') renderPhotoGrid();
  if (typeof updateThumbStrip === 'function') updateThumbStrip();
}

async function downloadOnePhotoDirect(photo) {
  if (!photo) return false;
  const ts     = fmtTime(photo.timestamp).replace(/[/\:\s]/g, '-');
  const prefix = photo.scannedCode ? photo.scannedCode.slice(-5) : 'photo';
  const name   = `${prefix}_${ts}.jpg`;

  try {
    // dataURLをそのまま使うより、Blob URLにした方がiPhone/Safariで軽くなりやすい
    const blob = await dataUrlToBlob(photo.dataUrl);
    if (blob) {
      const url = URL.createObjectURL(blob);
      fallbackDownload(url, name);
      // click直後に revoke するとSafariで失敗する場合があるので遅延解放
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return true;
    }

    // Blob化できない場合の予備
    fallbackDownload(photo.dataUrl, name);
    return true;
  } catch (e) {
    console.error('[DirectDownloadOne]', e);
    return false;
  }
}


/* ════ FIX33: iPhone用 未保存写真ZIP化保存 ════
 * iPhone Safari/PWAは複数a.downloadをブロックしやすいため、
 * 未保存写真を1つのZIPにまとめて1回だけ保存させる。
 * 圧縮はしない(store)ので、100枚以上でも処理が軽く、PCへ移しやすい。
 */
let _crcTable = null;
function getCrcTable() {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    _crcTable[n] = c >>> 0;
  }
  return _crcTable;
}
function crc32(bytes) {
  const table = getCrcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dosDateTime(ts) {
  const d = new Date(ts || Date.now());
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}
function u16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
function u32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function safeZipName(s) {
  return String(s || 'photo').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 80);
}
async function createZipBlobFromPhotos(list) {
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const blob = await dataUrlToBlob(p.dataUrl);
    if (!blob) throw new Error('画像変換に失敗しました');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const crc = crc32(bytes);
    const ts = fmtTime(p.timestamp).replace(/[/\s:]/g, '-');
    const prefix = p.scannedCode ? p.scannedCode.slice(-5) : 'photo';
    const name = safeZipName(`${String(i + 1).padStart(3, '0')}_${prefix}_${ts}.jpg`);
    const nameBytes = enc.encode(name);
    const dt = dosDateTime(p.timestamp);

    const localHeader = new Blob([
      u32(0x04034b50), // local file header signature
      u16(20),         // version needed
      u16(0),          // flags
      u16(0),          // compression: store
      u16(dt.time), u16(dt.date),
      u32(crc), u32(bytes.length), u32(bytes.length),
      u16(nameBytes.length), u16(0),
      nameBytes
    ]);
    localParts.push(localHeader, bytes);

    const centralHeader = new Blob([
      u32(0x02014b50), // central dir signature
      u16(20), u16(20),
      u16(0), u16(0),
      u16(dt.time), u16(dt.date),
      u32(crc), u32(bytes.length), u32(bytes.length),
      u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0),
      u32(0), u32(offset),
      nameBytes
    ]);
    centralParts.push(centralHeader);
    offset += 30 + nameBytes.length + bytes.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.size, 0);
  const end = new Blob([
    u32(0x06054b50),
    u16(0), u16(0),
    u16(list.length), u16(list.length),
    u32(centralSize), u32(offset),
    u16(0)
  ]);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}
async function saveUnsavedPhotosAsZipForIOS(list) {
  const btn = $('btn-save-unsaved');
  if (btn) btn.disabled = true;
  try {
    showToast(`未保存 ${list.length}枚をZIP化中...`, '', 3000);
    setSaveResultLog(0, 0, list.length, `ZIP作成中: ${list.length}枚`);
    const zipBlob = await createZipBlobFromPhotos(list);
    const url = URL.createObjectURL(zipBlob);
    const name = `photos_${new Date().toISOString().replace(/[:.]/g, '-').slice(0,19)}_${list.length}枚.zip`;
    fallbackDownload(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    // iPhoneはダウンロード完了をWeb側で厳密に検知できないため、
    // 1ファイル保存開始に成功した時点で未保存から外す。失敗時はcatchへ入る。
    await markPhotosSavedToDevice(list);
    setSaveResultLog(list.length, 0, list.length, `ZIP保存開始: ${list.length}枚`);
    showToast(`✓ ZIP保存を開始しました: ${list.length}枚`, 'ok', 5000);
    return true;
  } catch (e) {
    console.error('[IOSZipSave]', e);
    setSaveResultLog(0, list.length, list.length, '[E046] ZIP保存失敗');
    showToast('[E046] ZIP保存に失敗: ' + (e.message || e.name), 'err', 5000);
    return false;
  } finally {
    if (btn) btn.disabled = false;
    updateUnsavedSaveButton();
  }
}


function openIOSSavePanel(list) {
  const photosToShow = (list || []).filter(Boolean);
  if (!photosToShow.length) return;

  let bg = $('ios-save-panel-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'ios-save-panel-bg';
    bg.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.86);display:flex;flex-direction:column;color:#fff;font-family:system-ui,-apple-system,sans-serif;';
    bg.innerHTML = `
      <div style="padding:10px 12px;display:flex;align-items:center;gap:8px;background:#07111c;border-bottom:1px solid rgba(0,212,255,.35);">
        <div style="font-weight:700;font-size:14px;flex:1;">iPhone保存</div>
        <button id="ios-save-mark" style="border:1px solid #00d4ff;background:rgba(0,212,255,.12);color:#dff9ff;border-radius:8px;padding:7px 9px;font-size:12px;">保存済みにする</button>
        <button id="ios-save-close" style="border:1px solid #555;background:#111;color:#fff;border-radius:8px;padding:7px 10px;font-size:13px;">×</button>
      </div>
      <div id="ios-save-note" style="padding:8px 12px;font-size:12px;line-height:1.6;color:#cfefff;background:#0b1724;">
        iPhone Safari/PWAでは複数画像の自動ダウンロードがブロックされることがあります。画像を長押しして「写真に保存」または「画像を保存」を使ってください。保存後に「保存済みにする」を押すと未保存から外れます。
      </div>
      <div id="ios-save-list" style="flex:1;overflow:auto;padding:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;-webkit-overflow-scrolling:touch;"></div>
    `;
    document.body.appendChild(bg);
  }

  const grid = $('ios-save-list');
  grid.innerHTML = '';
  photosToShow.forEach((p, i) => {
    const card = document.createElement('div');
    card.style.cssText = 'background:#050a10;border:1px solid rgba(0,212,255,.35);border-radius:10px;overflow:hidden;';
    const img = document.createElement('img');
    img.src = p.dataUrl;
    img.alt = '保存画像 ' + (i + 1);
    img.loading = 'lazy';
    img.style.cssText = 'display:block;width:100%;height:auto;max-height:42vh;object-fit:contain;background:#000;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:6px;font-size:11px;color:#cfefff;';
    const label = document.createElement('span');
    label.textContent = `#${getPhotoDisplayNumber(p, i + 1)} · ${i + 1}/${photosToShow.length}`;
    label.style.flex = '1';
    const dl = document.createElement('button');
    dl.textContent = 'DL';
    dl.style.cssText = 'border:1px solid #00d4ff;background:rgba(0,212,255,.12);color:#dff9ff;border-radius:7px;padding:5px 8px;font-size:11px;';
    dl.onclick = async () => {
      const ok = await downloadOnePhotoDirect(p);
      showToast(ok ? 'ダウンロードを開始しました。保存されない場合は長押し保存してください' : '[E044] ダウンロード開始失敗', ok ? '' : 'warn', 3500);
    };
    row.append(label, dl);
    card.append(img, row);
    grid.appendChild(card);
  });

  bg.style.display = 'flex';
  $('ios-save-close').onclick = () => { bg.style.display = 'none'; };
  $('ios-save-mark').onclick = async () => {
    if (!confirm(`${photosToShow.length}枚を保存済みにしますか？\n実際に保存してから押してください。`)) return;
    await markPhotosSavedToDevice(photosToShow);
    setSaveResultLog(photosToShow.length, 0, photosToShow.length, `iPhone保存済み: ${photosToShow.length}枚`);
    showToast(`✓ ${photosToShow.length}枚を保存済みにしました`, 'ok');
    bg.style.display = 'none';
  };
}

async function saveUnsavedPhotosToDevice() {
  const list = getUnsavedPhotos();
  if (!list.length) {
    showToast('未保存の写真はありません', '');
    updateUnsavedSaveButton();
    return;
  }

  // FIX33: iPhoneは複数画像の連続DLではなく、未保存写真を1つのZIPにまとめて1回で保存する。
  // Androidは従来通り、都度保存/連続DLの挙動を維持する。
  if (typeof IS_IOS_LIKE !== 'undefined' && IS_IOS_LIKE) {
    await saveUnsavedPhotosAsZipForIOS(list);
    return;
  }

  // FIX8: ZIP/共有シートは使わず、未保存写真をそのまま連続ダウンロードする。
  // 上限は設けない。失敗した写真は保存済みにしない。
  const btn = $('btn-save-unsaved');
  if (btn) btn.disabled = true;

  let ok = 0, fail = 0;
  showToast(`未保存 ${list.length}枚をダウンロード開始...`, '', 2500);
  setSaveResultLog(0, 0, list.length, `保存中: 0/${list.length}`);

  try {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (btn) btn.textContent = `保存 ${i + 1}/${list.length}`;

      const done = await downloadOnePhotoDirect(p);
      if (done) {
        p.savedToDevice = true;
        if (typeof dbPut === 'function') await dbPut(p);
        ok++;
      } else {
        fail++;
      }
      setSaveResultLog(ok, fail, list.length, `保存中: ${ok + fail}/${list.length}`);

      // iPhone/Safariの連続DLが詰まりにくいよう少しだけ間隔を空ける。上限は設けない。
      await new Promise(r => setTimeout(r, 450));
    }

    if (typeof updateUnsavedSaveButton === 'function') updateUnsavedSaveButton();
    if (typeof renderPhotoGrid === 'function' && activeTab === 'photos') renderPhotoGrid();
    if (typeof updateThumbStrip === 'function') updateThumbStrip();

    if (fail) {
      setSaveResultLog(ok, fail, list.length, `[E042] ${ok}枚保存 / ${fail}枚失敗`);
      showToast(`[E042] ${ok}枚保存 / ${fail}枚失敗。未保存分は残しました`, 'warn', 5000);
    } else {
      setSaveResultLog(ok, fail, list.length, `保存完了: ${ok}枚`);
      showToast(`✓ ${ok}枚を保存済みにしました`, 'ok');
    }
  } catch (e) {
    console.error('[SaveUnsavedDirect]', e);
    setSaveResultLog(ok, fail + Math.max(0, list.length - ok - fail), list.length, '[E040] 保存処理エラー');
    showToast('[E040] 未保存写真の保存に失敗: ' + (e.message || e.name), 'err', 5000);
  } finally {
    if (btn) btn.disabled = false;
    updateUnsavedSaveButton();
  }
}

async function savePhotoToDevice(photo) {
  const done = await downloadOnePhotoDirect(photo);
  if (done) { await markPhotosSavedToDevice([photo]); setSaveResultLog(1, 0, 1, '保存完了: 1枚'); }
  else { setSaveResultLog(0, 1, 1, '[E043] 1枚保存失敗'); showToast('[E043] 写真のダウンロードに失敗しました', 'err', 4000); }
}

/* ════ 結合モード ════ */
function enterMergeMode() {
  exitMultiSelModePh(); mergeMode = true; mergeSelected = [];
  $('btn-merge-mode').classList.add('on');
  $('merge-bar').classList.add('on');
  $('merge-bar-txt').textContent = '写真をタップして選択（2枚以上）';
  $('btn-merge-exec').disabled   = true;
  renderPhotoGrid();
}

function exitMergeMode() {
  mergeMode = false; mergeSelected = [];
  $('btn-merge-mode').classList.remove('on');
  $('merge-bar').classList.remove('on');
  const prev = $('merge-sel-preview');
  if (prev) prev.innerHTML = '';
  renderPhotoGrid();
}

function toggleMergeSelect(id, itemEl) {
  const idx = mergeSelected.indexOf(id);
  if (idx >= 0) { mergeSelected.splice(idx, 1); itemEl.classList.remove('selected'); }
  else          { mergeSelected.push(id);        itemEl.classList.add('selected'); }
  const n = mergeSelected.length;
  $('merge-bar-txt').textContent  = n === 0 ? '写真をタップして選択（2枚以上）' : `${n}枚 選択中`;
  $('btn-merge-exec').disabled    = n < 2;
  const prev = $('merge-sel-preview');
  if (prev) {
    prev.innerHTML = '';
    mergeSelected.slice(0, 5).forEach(sid => {
      const ph = photos.find(p => p.id === sid);
      if (!ph) return;
      const img = document.createElement('img'); img.src = ph.thumbDataUrl || ph.dataUrl;
      prev.appendChild(img);
    });
    if (mergeSelected.length > 5) {
      const more = document.createElement('span');
      more.style.cssText = 'font-size:9px;color:var(--accent);font-family:monospace;';
      more.textContent   = `+${mergeSelected.length - 5}`;
      prev.appendChild(more);
    }
  }
}

async function mergeImages(sel, layout) {
  showToast('結合中...', '', 5000);
  try {
    const imgs = await Promise.all(sel.map(p => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img); img.onerror = rej; img.src = p.dataUrl;
    })));
    const c   = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const n   = imgs.length;

    if (layout === 'h') {
      const H = Math.max(...imgs.map(i => i.height));
      const W = imgs.reduce((s, i) => s + Math.round(i.width * (H / i.height)), 0);
      c.width = W; c.height = H;
      let x = 0;
      imgs.forEach(img => { const w = Math.round(img.width * (H / img.height)); ctx.drawImage(img, x, 0, w, H); x += w; });
    } else if (layout === 'v') {
      const W = Math.max(...imgs.map(i => i.width));
      const H = imgs.reduce((s, i) => s + Math.round(i.height * (W / i.width)), 0);
      c.width = W; c.height = H;
      let y = 0;
      imgs.forEach(img => { const h = Math.round(img.height * (W / img.width)); ctx.drawImage(img, 0, y, W, h); y += h; });
    } else if (layout === 'grid') {
      const cols = 2, rows = Math.ceil(n / cols);
      const cW = Math.max(...imgs.map(i => i.width)), cH = Math.max(...imgs.map(i => i.height));
      c.width = cW * cols; c.height = cH * rows;
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height);
      imgs.forEach((img, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const sc  = Math.min(cW / img.width, cH / img.height);
        ctx.drawImage(img, col * cW + (cW - img.width * sc) / 2, row * cH + (cH - img.height * sc) / 2, img.width * sc, img.height * sc);
      });
    } else {
      const H = 320, W = imgs.reduce((s, i) => s + Math.round(i.width * (H / i.height)), 0);
      c.width = W; c.height = H;
      let x = 0;
      imgs.forEach(img => { const w = Math.round(img.width * (H / img.height)); ctx.drawImage(img, x, 0, w, H); x += w; });
    }

    const dataUrl      = c.toDataURL('image/jpeg', 0.88);
    const thumbDataUrl = await createThumbnail(dataUrl, 400);
    const merged = {
      id: Date.now() + Math.random(), dataUrl, thumbDataUrl,
      timestamp: Date.now(), facingMode: 'merged', rotation: 0,
      merged: true, group: cfg.useGroup ? cfg.currentGroup : ''
    };
    await dbPut(merged); await dbPrune(MAX_PH);
    photos = (await dbAll()).reverse();
    updateCounts(); exitMergeMode(); renderPhotoGrid(); updateThumbStrip();
    showToast('✓ ' + n + '枚を結合しました', 'ok');
    openLightbox(merged);
  } catch (e) { showToast('[E020] 結合失敗: ' + e.message, 'err', 4000); }
}

/* ════ 初期化 ════ */
document.addEventListener('DOMContentLoaded', () => {
  initLightboxTouch();
  updateUnsavedSaveButton();
  updateSaveResultLogUI();

  const on = (id, fn) => $(id)?.addEventListener('click', fn);
  on('lb-close',  closeLightbox);
  on('lb-rotate', rotateLightboxPhoto);
  on('lb-dl',     () => { if (currentLightbox) savePhotoToDevice(currentLightbox); });
  on('lb-del',    () => { if (currentLightbox) deletePhoto(currentLightbox.id); });

  on('btn-ph-select-mode', () => multiSelModePh ? exitMultiSelModePh() : enterMultiSelModePh());
  updateUnsavedSaveButton();
});
