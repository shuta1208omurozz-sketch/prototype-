import { state } from './state.js';
import { $, getDayString, showToast, fmtTime, createThumbnail, dataUrlToBlob, updateCounts } from './utils.js';
import { dbDel, dbPut, dbAll, dbPrune, fallbackDownload } from './storage.js';

/* ════ フィルタ・ソート ════ */
export function getFilteredPh() {
  let f = state.photos.slice();
  if (state.cfg.useGroup) {
    const g = $('hist-ph-group-select').value;
    if (g !== 'all') f = f.filter(x => x.group === g);
  }
  if (state.sortOrderPh === 'asc') f.reverse();
  return f;
}

/* ════ フォトグリッド ════ */
export function renderPhotoGrid() {
  const grid  = $('photo-grid');
  const empty = $('photo-empty');
  if (!state.photos.length) { grid.style.display = 'none'; empty.style.display = ''; return; }
  empty.style.display = 'none';
  grid.style.display  = '';
  grid.className = 'photo-list' + (state.mergeMode ? ' merge-mode' : state.multiSelModePh ? ' multi-mode-ph' : '');
  grid.innerHTML = '';

  let lastDay = '';
  getFilteredPh().forEach(p => {
    const day = getDayString(p.timestamp);
    if (day !== lastDay) {
      const hdr = document.createElement('div');
      hdr.className = 'photo-section-header'; hdr.textContent = day;
      grid.appendChild(hdr); lastDay = day;
    }
    const isSel = (state.mergeMode && state.mergeSelected.includes(p.id)) || (state.multiSelModePh && state.multiSelectedPh.includes(p.id));
    const item  = document.createElement('div');
    item.className = 'photo-card photo-item' + (isSel ? ' selected' : '');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'photo-card-img';

    if (state.cfg.useGroup && p.group) {
      const gb = document.createElement('div');
      gb.className = 'card-group-badge'; gb.textContent = p.group;
      imgWrap.appendChild(gb);
    }
    const img = document.createElement('img');
    img.src = p.thumbDataUrl || p.dataUrl; img.loading = 'lazy';
    imgWrap.appendChild(img);

    const selOv = document.createElement('div'); selOv.className = 'photo-select-overlay';
    const chk   = document.createElement('div'); chk.className   = 'photo-select-check'; chk.textContent = '✓';
    selOv.appendChild(chk); imgWrap.appendChild(selOv);
    item.appendChild(imgWrap);

    item.addEventListener('click', () => {
      if (state.mergeMode)       toggleMergeSelect(p.id, item);
      else if (state.multiSelModePh) toggleMultiSelectPh(p.id, item);
      else                 openLightbox(p);
    });
    grid.appendChild(item);
  });
}

/* ════ サムネストリップ ════ */
export function updateThumbStrip() {
  const wrap = $('thumb-strip-wrap');
  if (!state.thumbStripVisible || !state.photos.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  const strip = $('thumb-strip');
  strip.innerHTML = '';
  state.photos.slice(0, 10).forEach(p => {
    const d   = document.createElement('div'); d.className = 'mini-thumb';
    const img = document.createElement('img'); img.src = p.thumbDataUrl || p.dataUrl;
    d.appendChild(img); d.onclick = () => openLightbox(p);
    strip.appendChild(d);
  });
  if (state.photos.length > 10) {
    const m = document.createElement('button');
    m.className = 'more-btn'; m.textContent = '+' + (state.photos.length - 10);
    m.onclick = () => document.querySelector('[data-tab="photos"]').click();
    strip.appendChild(m);
  }
}

export function setThumbVisible(v) {
  state.thumbStripVisible = v;
  localStorage.setItem('sc-thumb-vis', v ? '1' : '0');
  $('btn-thumb-toggle').classList.toggle('on', v);
  $('btn-thumb-toggle').textContent  = v ? '🖼 ON' : '🖼 OFF';
  $('btn-thumb-toggle2').textContent = v ? '非表示' : '表示';
  $('btn-thumb-toggle2').classList.toggle('on', v);
  updateThumbStrip();
}

/* ════ 写真削除 ════ */
export function deletePhoto(id) {
  if (!confirm('この写真を削除しますか？')) return;
  dbDel(id).then(async () => {
    state.photos = state.photos.filter(p => p.id !== id);
    updateCounts(); renderPhotoGrid(); updateThumbStrip();
    if (state.currentLightbox?.id === id) closeLightbox();
  });
}

/* ════ 複数選択 ════ */
export function enterMultiSelModePh(initialId = null) {
  state.multiSelModePh = true; state.multiSelectedPh = initialId ? [initialId] : [];
  $('btn-ph-select-mode').classList.add('on');
  $('multi-sel-bar').classList.add('on');
  updateMultiSelTxtPh(); renderPhotoGrid();
}

export function exitMultiSelModePh() {
  state.multiSelModePh = false; state.multiSelectedPh = [];
  $('btn-ph-select-mode').classList.remove('on');
  $('multi-sel-bar').classList.remove('on');
  renderPhotoGrid();
}

function toggleMultiSelectPh(id, itemEl) {
  const idx = state.multiSelectedPh.indexOf(id);
  if (idx >= 0) { state.multiSelectedPh.splice(idx, 1); itemEl.classList.remove('selected'); }
  else          { state.multiSelectedPh.push(id);        itemEl.classList.add('selected'); }
  updateMultiSelTxtPh();
}

export function updateMultiSelTxtPh() {
  $('multi-sel-txt').textContent = state.multiSelectedPh.length + '枚 選択中';
}

/* ════ ライトボックス ════ */
export function openLightbox(p) {
  state.currentLightbox = p;
  $('lb-img').src       = p.dataUrl;
  $('lb-img').style.transform = `rotate(${p.rotation || 0}deg)`;
  $('lb-ttl').textContent = fmtTime(p.timestamp) + ' · ' +
    (p.facingMode === 'user' ? 'フロント' : p.facingMode === 'merged' ? '結合' : 'リア');
  $('lightbox').style.display = '';
}

export function closeLightbox() {
  $('lightbox').style.display = 'none';
  state.currentLightbox = null;
}

/* ライトボックス スワイプ（統合：lbTouch と initSwipe を一本化） */
function initLightboxTouch() {
  const lb = $('lightbox');
  if (!lb) return;
  let sx = 0, sy = 0;
  lb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener('touchend',   e => {
    if (!state.currentLightbox) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { closeLightbox(); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      const f   = getFilteredPh();
      const idx = f.findIndex(p => p.id === state.currentLightbox.id);
      if (idx === -1) return;
      if (dx < 0 && idx < f.length - 1) openLightbox(f[idx + 1]);
      if (dx > 0 && idx > 0)            openLightbox(f[idx - 1]);
    }
  });
}

/* ════ 写真回転 ════ */
export async function rotateLightboxPhoto() {
  if (!state.currentLightbox) return;
  const img = new Image();
  img.src   = state.currentLightbox.dataUrl;
  await new Promise(r => { img.onload = r; });

  const c   = document.createElement('canvas');
  c.width   = img.height; c.height = img.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(90 * Math.PI / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  const newUrl      = c.toDataURL('image/jpeg', 0.9);
  const newThumbUrl = await createThumbnail(newUrl, 400);
  state.currentLightbox   = { ...state.currentLightbox, dataUrl: newUrl, thumbDataUrl: newThumbUrl, rotation: 0 };
  await dbPut(state.currentLightbox);
  state.photos         = (await dbAll()).reverse();
  $('lb-img').src = newUrl;
  $('lb-img').style.transform = '';
  renderPhotoGrid(); updateThumbStrip();
  showToast('↻ 回転しました', 'ok');
}

/* ════ 保存 ════ */
export async function savePhotoToDevice(photo) {
  const ts     = fmtTime(photo.timestamp).replace(/[/:\s]/g, '-');
  const prefix = photo.scannedCode ? photo.scannedCode.slice(-5) : 'photo';
  const name   = `${prefix}_${ts}.jpg`;
  if (navigator.share && navigator.canShare) {
    try {
      const blob = await dataUrlToBlob(photo.dataUrl);
      if (blob) {
        const file = new File([blob], name, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '写真を保存' }); return; }
      }
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  fallbackDownload(photo.dataUrl, name);
}

/* ════ 結合モード ════ */
export function enterMergeMode() {
  exitMultiSelModePh(); state.mergeMode = true; state.mergeSelected = [];
  $('btn-merge-mode').classList.add('on');
  $('merge-bar').classList.add('on');
  $('merge-bar-txt').textContent = '写真をタップして選択（2枚以上）';
  $('btn-merge-exec').disabled   = true;
  renderPhotoGrid();
}

export function exitMergeMode() {
  state.mergeMode = false; state.mergeSelected = [];
  $('btn-merge-mode').classList.remove('on');
  $('merge-bar').classList.remove('on');
  const prev = $('merge-sel-preview');
  if (prev) prev.innerHTML = '';
  renderPhotoGrid();
}

function toggleMergeSelect(id, itemEl) {
  const idx = state.mergeSelected.indexOf(id);
  if (idx >= 0) { state.mergeSelected.splice(idx, 1); itemEl.classList.remove('selected'); }
  else          { state.mergeSelected.push(id);        itemEl.classList.add('selected'); }
  const n = state.mergeSelected.length;
  $('merge-bar-txt').textContent  = n === 0 ? '写真をタップして選択（2枚以上）' : `${n}枚 選択中`;
  $('btn-merge-exec').disabled    = n < 2;
  const prev = $('merge-sel-preview');
  if (prev) {
    prev.innerHTML = '';
    state.mergeSelected.slice(0, 5).forEach(sid => {
      const ph = state.photos.find(p => p.id === sid);
      if (!ph) return;
      const img = document.createElement('img'); img.src = ph.thumbDataUrl || ph.dataUrl;
      prev.appendChild(img);
    });
    if (state.mergeSelected.length > 5) {
      const more = document.createElement('span');
      more.style.cssText = 'font-size:9px;color:var(--accent);font-family:monospace;';
      more.textContent   = `+${state.mergeSelected.length - 5}`;
      prev.appendChild(more);
    }
  }
}

export async function mergeImages(sel, layout) {
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
      merged: true, group: state.cfg.useGroup ? state.cfg.currentGroup : ''
    };
    await dbPut(merged); await dbPrune(state.cfg.MAX_PH);
    state.photos = (await dbAll()).reverse();
    updateCounts(); exitMergeMode(); renderPhotoGrid(); updateThumbStrip();
    showToast('✓ ' + n + '枚を結合しました', 'ok');
    openLightbox(merged);
  } catch (e) { showToast('[E020] 結合失敗: ' + e.message, 'err', 4000); }
}

/* ════ 初期化 ════ */
document.addEventListener('DOMContentLoaded', () => {
  initLightboxTouch();

  const on = (id, fn) => $(id)?.addEventListener('click', fn);
  on('lb-close',  closeLightbox);
  on('lb-rotate', rotateLightboxPhoto);
  on('lb-dl',     () => { if (state.currentLightbox) savePhotoToDevice(state.currentLightbox); });
  on('lb-del',    () => { if (state.currentLightbox) deletePhoto(state.currentLightbox.id); });

  on('btn-ph-select-mode', () => state.multiSelModePh ? exitMultiSelModePh() : enterMultiSelModePh());
});
