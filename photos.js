'use strict';

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
  getFilteredPh().forEach(p => {
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

    if (cfg.useGroup && p.group) {
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
  photos.slice(0, 10).forEach(p => {
    const d   = document.createElement('div'); d.className = 'mini-thumb';
    const img = document.createElement('img'); img.src = p.thumbDataUrl || p.dataUrl;
    d.appendChild(img); d.onclick = () => openLightbox(p);
    strip.appendChild(d);
  });
  if (photos.length > 10) {
    const m = document.createElement('button');
    m.className = 'more-btn'; m.textContent = '+' + (photos.length - 10);
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
  $('lb-ttl').textContent = fmtTime(p.timestamp) + ' · ' +
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
async function savePhotoToDevice(photo) {
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

  const on = (id, fn) => $(id)?.addEventListener('click', fn);
  on('lb-close',  closeLightbox);
  on('lb-rotate', rotateLightboxPhoto);
  on('lb-dl',     () => { if (currentLightbox) savePhotoToDevice(currentLightbox); });
  on('lb-del',    () => { if (currentLightbox) deletePhoto(currentLightbox.id); });

  on('btn-ph-select-mode', () => multiSelModePh ? exitMultiSelModePh() : enterMultiSelModePh());
});
