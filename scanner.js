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
  // 同じ内容なら更新しない（DOM操作を減らす）
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
  _roiCanvas = null;
  _roiCtx    = null;

  // RAF を確実にキャンセル
  if (raf) { cancelAnimationFrame(raf); raf = null; }

  // ストリーム解放
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const v = $('scan-video');
  if (v) v.srcObject = null;

  setScanUI(false);
  setStatus('', '待機中');

  // ボタン状態を両クラスで管理（.stop と .active を同期）
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
    // EAN-13は横長バーコードのため低解像度で十分・速度＆バッテリー最優先
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width:  { ideal: 640 },
        height: { ideal: 480 }
      }
    });
    const v = $('scan-video');
    v.srcObject = scanStream;
    v.playsInline = true;  // iOS対策
    v.muted       = true;  // 無駄な音声処理防止
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    await v.play();
    detector = new BarcodeDetector({ formats: scanMode === 'ean13' ? ['ean_13'] : ALL_FMTS });
    scanning = true;
    setScanUI(true);
    setStatus('go', scanMode === 'ean13' ? 'EAN-13 スキャン中...' : 'スキャン中...');

    // ボタン状態：.stop（赤背景）と .active（視覚フィードバック）を両方付与
    const btn = $('btn-scan');
    if (btn) {
      btn.textContent = '■ スキャン停止';
      btn.classList.add('stop', 'active');
    }
    detect();
  } catch (e) {
    setStatus('err', `[${e.name === 'NotAllowedError' ? 'E002' : 'E005'}] ` +
      (e.name === 'NotAllowedError' ? 'カメラの許可が必要です' : 'カメラエラー: ' + e.message));
  }
}

/* スキャンFPS制限（電池消費削減） */
let _lastScanTime = 0;
const SCAN_INTERVAL = 250; // ms（4fps上限・EAN-13で十分・CPU削減）

/* ROI用オフスクリーンcanvas（EAN-13中央帯クロップ） */
let _roiCanvas = null;
let _roiCtx    = null;

async function detect() {
  // ① 先頭でフラグ確認 — stopScan済みなら即抜ける
  if (!scanning) return;

  const now = performance.now();
  if (now - _lastScanTime < SCAN_INTERVAL) {
    raf = requestAnimationFrame(detect);
    return;
  }
  _lastScanTime = now;

  const v = $('scan-video');
  if (!v || v.readyState < 2) { raf = requestAnimationFrame(detect); return; }

  // ── ROI: 中央の横帯のみ処理（処理量を半分以下に削減）──
  let detectTarget = v;
  if (scanMode === 'ean13' && v.videoWidth > 0 && v.videoHeight > 0) {
    if (!_roiCanvas) {
      _roiCanvas = document.createElement('canvas');
      _roiCtx    = _roiCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    }
    const roiH = Math.round(v.videoHeight * 0.3);
    const sy   = Math.round((v.videoHeight - roiH) / 2);
    _roiCanvas.width  = v.videoWidth;
    _roiCanvas.height = roiH;
    _roiCtx.drawImage(v, 0, sy, v.videoWidth, roiH, 0, 0, v.videoWidth, roiH);
    detectTarget = _roiCanvas;
  }

  try {
    const codes = await detector.detect(detectTarget);

    // ② await 復帰後に再確認 — 非同期待機中に stopScan された場合を防ぐ
    if (!scanning) return;

    if (codes.length) {
      const { rawValue, format } = codes[0];
      const ts = Date.now();
      // EAN-13モード時は13桁のみ受理
      if (scanMode === 'ean13' && rawValue.length !== 13) { /* skip */ }
      else {
        const waitTime = cfg.continuousScan ? 500 : 1500; // 同一コード抑制：連続=500ms / 通常=1500ms
        if (rawValue !== lastCode || ts - lastCodeTime > waitTime) {
          lastCode = rawValue; lastCodeTime = ts;
          onDetected(rawValue, format);
        }
      }
    }
  } catch (_) {}

  // ③ RAF発行前にも最終確認 — 二重ループを確実に防ぐ
  if (scanning) raf = requestAnimationFrame(detect);
}

/* ════ 検出時処理 ════ */
let flashTimer = null;
function flashFinder() {
  const fl = $('finder-flash');
  fl.classList.add('show');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => fl.classList.remove('show'), 220);
}

function showLargeBarcode(value, format, isDup) {
  $('scan-bc-placeholder').style.display = 'none';
  $('scan-bc-display').style.display     = '';
  $('scan-bc-val').textContent           = value;
  $('scan-bc-meta').textContent          = (format || '').toUpperCase().replace('_', ' ');
  $('scan-bc-dup').className             = 'scan-bc-dup' + (isDup ? ' show' : '');
  const cv   = $('scan-bc-canvas');
  const jf   = JS_FMT[format];
  if (jf && window.JsBarcode) {
    try {
      const wrap = $('scan-bc-canvas-wrap');
      const maxW = Math.min(wrap.clientWidth || window.innerWidth - 20, 600);
      JsBarcode(cv, value, {
        format: jf, width: Math.max(2, Math.floor(maxW / 80)),
        height: 110, displayValue: true, fontSize: 18,
        background: '#ffffff', lineColor: '#111111', margin: 10
      });
    } catch (_) { cv.width = 0; }
  }
}

function onDetected(value, format) {
  lastScannedValue = value;
  const now   = Date.now();
  const isDup = bcHistory.some(x => x.value === value);

  // スキャン成功 → 横固定を強制OFF（状態リセット）
  if (forceHorizontal) {
    forceHorizontal = false;
    if (typeof updateHorizontalUI === 'function') updateHorizontalUI();
  }

  flashFinder();
  vibrate([50]);
  showLargeBarcode(value, format, isDup);
  const wait = cfg.continuousScan ? 300 : 1500;
  if (isDup) {
    showToast('⊘ 登録済み: ' + value, 'dup', 1800);
    setStatus('ok', '登録済み: ' + value.slice(0, 20));
    setTimeout(() => { if (scanning) setStatus('go', scanMode === 'ean13' ? 'EAN-13 スキャン中...' : 'スキャン中...'); }, wait);
    return;
  }
  const grp   = cfg.useGroup ? cfg.currentGroup : '';
  const entry = { id: now + Math.random(), value, format, timestamp: now, checked: false, group: grp };
  bcHistory   = [entry, ...bcHistory];
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
  updateCounts();
  setStatus('ok', '検出！ ' + value.slice(0, 22));
  setTimeout(() => { if (scanning) setStatus('go', scanMode === 'ean13' ? 'EAN-13 スキャン中...' : 'スキャン中...'); }, wait);
}

/* ════ バーコード履歴UI ════ */
function toggleBcChecked(id) {
  const item = bcHistory.find(x => x.id === id);
  if (!item) return;
  item.checked = !item.checked;
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
  renderBcList();
}

function getFilteredBc() {
  const q = $('search-box').value.toLowerCase();
  let f = bcHistory.slice();
  if (q) f = f.filter(x => x.value.toLowerCase().includes(q));
  if (histFilter === 'checked')   f = f.filter(x =>  x.checked);
  if (histFilter === 'unchecked') f = f.filter(x => !x.checked);
  if (cfg.useGroup) {
    const g = $('hist-bc-group-select').value;
    if (g !== 'all') f = f.filter(x => x.group === g);
  }
  if (sortOrderBc === 'asc') f.reverse();
  return f;
}

function renderBcList() {
  const filtered = getFilteredBc();
  const list = $('bc-list'), empty = $('bc-empty');
  if (!filtered.length) { list.style.display = 'none'; empty.style.display = ''; return; }
  empty.style.display = 'none';
  list.style.display  = '';
  list.innerHTML      = '';
  list.classList.toggle('compact-mode', cfg.bcCompactMode);
  list.classList.toggle('multi-mode-bc', multiSelModeBc);

  filtered.forEach((item, i) => {
    const isSel = multiSelModeBc && multiSelectedBc.includes(item.id);
    const card  = document.createElement('div');
    card.className = 'bc-card' +
      (item.format === 'ean_13' ? ' ean' : '') +
      (item.checked ? ' checked' : '') +
      (isSel ? ' multi-selected' : '');

    const selChk = document.createElement('div');
    selChk.className = 'bc-sel-chk'; selChk.textContent = '✓';
    card.appendChild(selChk);

    if (cfg.useGroup && item.group) {
      const gb = document.createElement('div');
      gb.className = 'card-group-badge'; gb.textContent = item.group;
      card.appendChild(gb);
    }

    const valEl = document.createElement('div');
    valEl.className = 'bc-val-large'; valEl.textContent = item.value;

    const checkBtn = document.createElement('button');
    checkBtn.className = 'card-check'; checkBtn.textContent = '✓';
    checkBtn.addEventListener('click', e => { e.stopPropagation(); if (!multiSelModeBc) toggleBcChecked(item.id); });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-x'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => { e.stopPropagation(); if (!multiSelModeBc) deleteBc(item.id); });

    const dispNum = sortOrderBc === 'desc' ? (filtered.length - i) : (i + 1);

    if (cfg.bcCompactMode) {
      card.appendChild(checkBtn);
      card.appendChild(valEl);
      const ts = document.createElement('span');
      ts.className = 'card-time'; ts.textContent = fmtShort(item.timestamp);
      card.appendChild(ts);
      card.appendChild(delBtn);
    } else {
      const thumb = document.createElement('div');
      thumb.className = 'bc-thumb';
      const cv = document.createElement('canvas');
      thumb.appendChild(cv); card.appendChild(thumb);

      const metaRow  = document.createElement('div'); metaRow.className = 'bc-meta-row';
      const metaInfo = document.createElement('div'); metaInfo.className = 'bc-meta-info';
      metaInfo.innerHTML =
        `<span class="card-fmt ${item.format === 'ean_13' ? 'ean' : ''}">${(item.format||'').replace('_',' ')}</span>` +
        `<span class="card-time">${fmtTime(item.timestamp)}</span>` +
        `<span class="card-num">#${String(dispNum).padStart(3,'0')}</span>` +
        (item.checked ? '<span class="card-chk-lbl">✓ 確認済</span>' : '');
      metaRow.appendChild(checkBtn); metaRow.appendChild(metaInfo); metaRow.appendChild(delBtn);
      card.appendChild(valEl); card.appendChild(metaRow);

      // バーコード描画を非同期で（レイアウト安定後）
      requestAnimationFrame(() => {
        const jf = JS_FMT[item.format];
        if (!jf || !window.JsBarcode) {
          cv.replaceWith(Object.assign(document.createElement('div'), { className:'bc-thumb-txt', textContent: item.value }));
          return;
        }
        const w = Math.max(2, Math.floor(Math.max(thumb.clientWidth || window.innerWidth - 20, 200) / 105));
        try { JsBarcode(cv, item.value, { format:jf, width:w, height:60, displayValue:false, background:'#ffffff', lineColor:'#111111', margin:6 }); }
        catch (_) { cv.replaceWith(Object.assign(document.createElement('div'), { className:'bc-thumb-txt', textContent: item.value })); }
      });
    }

    card.addEventListener('click', () => multiSelModeBc ? toggleMultiSelectBc(item.id, card) : openBcModal(item));
    list.appendChild(card);
  });
}

function deleteBc(id) {
  if (!confirm('このバーコードを削除しますか？')) return;
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
