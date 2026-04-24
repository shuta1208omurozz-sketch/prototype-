'use strict';

/* ════ スキャンUI ════ */
function setScanUI(active) {
  $('scan-line').style.display = (!active || scanMode !== 'all') ? 'none' : '';
  $('ean-guide').style.display = (active && scanMode === 'ean13') ? '' : 'none';
  $('scan-ov').style.display   = active ? '' : 'none';
  $('scan-ph').style.display   = active ? 'none' : '';
  $('scan-ov').className       = 'finder-ov' + (scanMode === 'ean13' ? ' ean' : '');
  $('scan-ov').textContent     = scanMode === 'ean13' ? 'EAN-13 MODE' : 'SCANNING...';
}

function setStatus(dot, txt) {
  const dotEl = $('sdot'), txtEl = $('stxt');
  if (!dotEl || !txtEl) return;
  if (txtEl.textContent === txt && dotEl.dataset.dot === dot) return;
  dotEl.dataset.dot = dot;
  const cls = dot === 'go' ? ` go${scanMode === 'ean13' ? ' ean' : ''}` : dot === 'ok' ? ' ok' : dot === 'err' ? ' err' : '';
  dotEl.className   = 'sdot' + cls;
  txtEl.textContent = txt;
}

/* ════ スキャン制御 ════ */
function stopScan() {
  // scanning を先に false にして detect() の再帰を止める
  scanning = false;
  _lastScanTime = 0;
  
  // RAF を確実にキャンセル
  if (raf) { cancelAnimationFrame(raf); raf = null; }

  // ビデオ要素の再生を停止（GPU負荷削減）
  const v = $('scan-video');
  if (v) { v.pause(); }
  scanStream = null;

  setScanUI(false);
  setStatus('', '待機中');

  const btn = $('btn-scan');
  if (btn) {
    btn.textContent = '▶ スキャン開始';
    btn.classList.remove('stop', 'active');
  }
}

async function startScan() {
  if (scanning) return;
  if (!('BarcodeDetector' in window)) {
    setStatus('err', '[E001] BarcodeDetector 非対応 (Chrome等が必要)');
    return;
  }
  try {
    // 共有ストリームを取得
    const stream = await startGlobalCamera();
    scanStream = stream;

    const v = $('scan-video');
    if (v.srcObject !== stream) v.srcObject = stream;
    v.playsInline = true;
    v.muted       = true;

    if (v.readyState < 1) {
      await new Promise(resolve => v.addEventListener('loadedmetadata', resolve, { once: true }));
    }

    try {
      await v.play();
      scanning = true;
      setScanUI(true);
      setStatus('go', 'スキャン中...');
      const btn = $('btn-scan');
      if (btn) {
        btn.textContent = '■ スキャン停止';
        btn.classList.add('stop', 'active');
      }
      detect();
    } catch (e) { console.warn('[Scanner] Play interrupted:', e); }
  } catch (e) {
    setStatus('err', `[${e.name === 'NotAllowedError' ? 'E002' : 'E005'}] ` +
      (e.name === 'NotAllowedError' ? 'カメラの許可が必要です' : 'カメラエラー: ' + e.message));
  }
}

/* ════ スキャン頻度の厳密な制限（究極の節電） ════ */
let _lastScanTime = 0;
const SCAN_INTERVAL = 200; // 200ms (5fps) に厳密に固定。

/* ROI用オフスクリーンcanvas */
let _roiCanvas = null;
let _roiCtx    = null;

async function detect() {
  // ① タブ切り替えや停止時に即座に抜ける
  if (!scanning || activeTab !== 'scan') {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    return;
  }

  const now = performance.now();
  // 200ms 経過していない場合は、一切の計算を行わずに次のフレームへ（CPU負荷を最小化）
  if (now - _lastScanTime < SCAN_INTERVAL) {
    raf = requestAnimationFrame(detect);
    return;
  }
  _lastScanTime = now;

  const v = $('scan-video');
  if (!v || v.readyState < 2) { raf = requestAnimationFrame(detect); return; }

  // ── ここから先は 200ms に一度だけ実行される ──

  let detectTarget = v;
  // ROI: 中央帯のみ処理（EAN-13の場合、解析範囲を絞ることで計算量をさらに削減）
  if (scanMode === 'ean13' && v.videoWidth > 0 && v.videoHeight > 0) {
    if (!_roiCanvas) {
      _roiCanvas = document.createElement('canvas');
      _roiCtx    = _roiCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    }
    const vw = v.videoWidth, vh = v.videoHeight;
    const h = vh * 0.25;
    _roiCanvas.width = vw; _roiCanvas.height = h;
    _roiCtx.drawImage(v, 0, (vh - h) / 2, vw, h, 0, 0, vw, h);
    detectTarget = _roiCanvas;
  }

  try {
    if (!detector) detector = new BarcodeDetector({ formats: ALL_FMTS });
    const barcodes = await detector.detect(detectTarget);
    if (barcodes.length > 0 && scanning) {
      const b = barcodes[0];
      let val = b.rawValue;
      if (scanMode === 'ean13' && val.length === 12) val = '0' + val;
      if (scanMode === 'ean13' && val.length !== 13) { raf = requestAnimationFrame(detect); return; }
      
      handleScanSuccess(val, b.format);
    }
  } catch (e) { console.error('[Scanner] Detect:', e); }

  if (scanning) raf = requestAnimationFrame(detect);
}

function handleScanSuccess(val, format) {
  if (val === lastCode && (Date.now() - lastCodeTime < 2000)) return;
  lastCode = val; lastCodeTime = Date.now();
  lastScannedValue = val;
  
  vibrate([100]);
  const grp = cfg.useGroup ? cfg.currentGroup : '未分類';
  const item = { id: Date.now(), value: val, format, timestamp: Date.now(), group: grp, checked: false };
  const isDup = bcHistory.some(x => x.value === val);
  bcHistory.unshift(item);
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
  
  // ── スキャン画面の結果エリアを更新 ──
  const dispEl   = $('scan-bc-display');
  const holdEl   = $('scan-bc-placeholder');
  const valEl    = $('scan-bc-val');
  const metaEl   = $('scan-bc-meta');
  const dupEl    = $('scan-bc-dup');
  const canvas   = $('scan-bc-canvas');
  const flashEl  = $('finder-flash');

  if (holdEl)   holdEl.style.display = 'none';
  if (dispEl)   dispEl.style.display = 'flex';
  if (valEl)    valEl.textContent = val;
  if (metaEl)   metaEl.textContent = format.toUpperCase().replace('_',' ') + ' · ' + fmtShort(item.timestamp);
  if (dupEl)    dupEl.classList.toggle('show', isDup);

  // バーコード画像の描画（1Dフォーマットのみ）
  if (canvas && JS_FMT[format]) {
    setTimeout(() => renderBC(canvas, val, format, 60, false), 10);
  } else if (canvas) {
    // QR等2Dは描画不可のためクリア
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // スキャン成功フラッシュ
  if (flashEl) {
    flashEl.classList.remove('show');
    void flashEl.offsetWidth;
    flashEl.classList.add('show');
    setTimeout(() => flashEl.classList.remove('show'), 150);
  }

  updateCounts();
  renderBcList();
  showToast('スキャン成功: ' + val, 'ok');
  
  if (!cfg.continuousScan) stopScan();
}

/* ════ 履歴表示 ════ */
function getFilteredBc() {
  let list = bcHistory;
  if (histFilter === 'checked') list = list.filter(x => x.checked);
  else if (histFilter === 'unchecked') list = list.filter(x => !x.checked);
  const q = $('search-box')?.value.toLowerCase();
  if (q) list = list.filter(x => x.value.toLowerCase().includes(q));
  const g = $('hist-bc-group-select')?.value;
  if (g && g !== 'all') list = list.filter(x => x.group === g);
  return list.sort((a, b) => sortOrderBc === 'desc' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
}

function renderBcList() {
  const container = $('bc-list');
  if (!container) return;
  const list = getFilteredBc();
  container.innerHTML = list.length ? '' : '<div class="empty-msg">履歴がありません</div>';
  
  const frag = document.createDocumentFragment();
  list.forEach(item => {
    const el = document.createElement('div');
    el.className = 'bc-item' + (item.checked ? ' checked' : '') + (multiSelectedBc.includes(item.id) ? ' multi-selected' : '');
    el.innerHTML = `
      <div class="bc-info">
        <div class="bc-val">${item.value}</div>
        <div class="bc-meta">${(item.format||'').toUpperCase().replace('_',' ')} · ${fmtShort(item.timestamp)}</div>
      </div>
      <div class="bc-actions">
        <button class="btn-check">${item.checked ? '✓' : '未'}</button>
        <button class="btn-del-single">×</button>
      </div>
    `;
    el.onclick = (e) => {
      if (multiSelModeBc) { toggleMultiSelectBc(item.id, el); return; }
      if (e.target.closest('.btn-check') || e.target.closest('.btn-del-single')) return;
      openBcModal(item);
    };
    el.querySelector('.btn-check').onclick = (e) => {
      e.stopPropagation();
      item.checked = !item.checked;
      localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
      renderBcList();
    };
    el.querySelector('.btn-del-single').onclick = (e) => {
      e.stopPropagation();
      if (confirm('この項目を削除しますか？')) deleteBc(item.id);
    };
    frag.appendChild(el);
  });
  container.appendChild(frag);
}

function deleteBc(id) {
  bcHistory = bcHistory.filter(x => x.id !== id);
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
  updateCounts(); renderBcList();
}

/* ════ BC 一括選択 ════ */
function enterMultiSelModeBc() {
  multiSelModeBc = true; multiSelectedBc = [];
  $('btn-bc-select-mode').classList.add('on');
  $('multi-sel-bar-bc').classList.add('on');
  updateMultiSelTxtBc(); renderBcList();
}
function exitMultiSelModeBc() {
  multiSelModeBc = false; multiSelectedBc = [];
  $('btn-bc-select-mode').classList.remove('on');
  $('multi-sel-bar-bc').classList.remove('on');
  renderBcList();
}
function toggleMultiSelectBc(id, itemEl) {
  const idx = multiSelectedBc.indexOf(id);
  if (idx >= 0) { multiSelectedBc.splice(idx, 1); itemEl.classList.remove('multi-selected'); }
  else          { multiSelectedBc.push(id);        itemEl.classList.add('multi-selected'); }
  updateMultiSelTxtBc();
}
function updateMultiSelTxtBc() {
  $('multi-sel-txt-bc').textContent = multiSelectedBc.length + '件 選択中';
}

/* ════ BC モーダル ════ */
function openBcModal(item) {
  currentDetail = item;
  $('modal-val').textContent  = item.value;
  $('modal-meta').textContent = (item.format||'').toUpperCase().replace('_',' ') + ' · ' + fmtTime(item.timestamp);
  $('copied-msg').style.display = 'none';
  const hasFmt = !!JS_FMT[item.format];
  $('modal-bc').style.display  = hasFmt ? '' : 'none';
  $('modal-2d').style.display  = hasFmt ? 'none' : '';
  $('btn-png').style.display   = hasFmt ? '' : 'none';
  if (hasFmt) setTimeout(() => renderBC($('modal-canvas'), item.value, item.format, 68, true), 10);
  $('bc-modal').style.display = '';
}
function closeBcModal() {
  $('bc-modal').style.display = 'none';
  currentDetail = null;
}

function exportCSV() {
  if (!bcHistory.length) return;
  const hasG = cfg.useGroup;
  const hdr  = hasG ? '\uFEFF値,フォーマット,グループ,日時,確認済み' : '\uFEFF値,フォーマット,日時,確認済み';
  const rows = [hdr, ...bcHistory.map(x => {
    const v = `"${x.value}","${(x.format||'').replace('_',' ')}"`;
    const g = hasG ? `,"${x.group||''}"` : '';
    return v + g + `,"${fmtTime(x.timestamp)}","${x.checked?'済':''}"`;
  })];
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([rows.join('\n')], { type:'text/csv' }));
  a.download = 'barcodes_' + Date.now() + '.csv';
  a.click();
}

/* ════ イベント登録 ════ */
document.addEventListener('DOMContentLoaded', () => {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);
  on('btn-scan', 'click', () => scanning ? stopScan() : startScan());
  on('btn-warp-cam', 'click', () => switchTab('camera'));
  on('scan-bc-copy', 'click', () => {
    if (!lastScannedValue) return;
    navigator.clipboard.writeText(lastScannedValue).then(() => showToast('コピーしました', 'ok'));
  });
  on('search-box', 'input', renderBcList);
  on('btn-bc-compact', 'click', () => {
    cfg.bcCompactMode = !cfg.bcCompactMode; saveCfg(); applyCfgToUI(); renderBcList();
  });
  on('btn-bc-sort', 'click', e => {
    sortOrderBc = sortOrderBc === 'desc' ? 'asc' : 'desc';
    e.target.textContent = sortOrderBc === 'desc' ? '↓ 新しい順' : '↑ 古い順';
    renderBcList();
  });
  document.querySelectorAll('.flt-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.flt-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on'); histFilter = btn.dataset.filter; renderBcList();
  }));
  on('modal-close', 'click', closeBcModal);
  $('bc-modal')?.addEventListener('click', e => { if (e.target === $('bc-modal')) closeBcModal(); });
  on('btn-copy', 'click', () => {
    if (!currentDetail) return;
    navigator.clipboard.writeText(currentDetail.value).then(() => {
      const msg = $('copied-msg');
      if (msg) { msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 2000); }
      showToast('コピーしました', 'ok');
    });
  });
  on('btn-png', 'click', () => {
    if (!currentDetail) return;
    const a = Object.assign(document.createElement('a'), {
      href: $('modal-canvas').toDataURL('image/png'),
      download: `barcode_${currentDetail.value}.png`
    });
    a.click();
  });
  on('btn-bc-select-mode', 'click', () => multiSelModeBc ? exitMultiSelModeBc() : enterMultiSelModeBc());
  on('btn-bc-csv',         'click', exportCSV);
  on('btn-bc-clear',       'click', () => {
    if (!confirm('全てのバーコード履歴を削除しますか？')) return;
    bcHistory = []; localStorage.setItem(BC_KEY, '[]'); updateCounts(); renderBcList(); showToast('BC履歴を削除しました');
  });
  on('btn-multi-cancel-bc', 'click', exitMultiSelModeBc);
  on('btn-multi-all-bc', 'click', () => {
    const f = getFilteredBc();
    multiSelectedBc = multiSelectedBc.length === f.length && f.length ? [] : f.map(x => x.id);
    updateMultiSelTxtBc(); renderBcList();
  });
  on('btn-multi-del-bc', 'click', () => {
    if (!multiSelectedBc.length) return;
    if (!confirm(`${multiSelectedBc.length}件の履歴を削除しますか？`)) return;
    bcHistory = bcHistory.filter(x => !multiSelectedBc.includes(x.id));
    localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
    updateCounts(); exitMultiSelModeBc(); showToast('削除しました');
  });
  on('btn-multi-move-bc', 'click', () => {
    if (!multiSelectedBc.length) return;
    groupMoveTarget = 'bc'; $('group-move-popup').style.display = 'block';
  });
});
