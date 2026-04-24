'use strict';

/* ════ グループUI ════ */
function updateGroupUI() {
  const gOn  = cfg.useGroup;
  const show = (id, v) => { const el = $(id); if (el) el.style.display = v ? (el.tagName === 'SELECT' || el.tagName === 'DIV' ? 'flex' : '') : 'none'; };
  show('scan-group-bar',     gOn);
  show('cam-group-bar',      gOn);
  show('hist-bc-group-sel',  gOn);
  show('hist-ph-group-sel',  gOn);
  $('group-mgr-area').style.display = gOn ? 'block' : 'none';
  $('btn-bc-select-mode').style.display = bcHistory.length ? '' : 'none';

  if (!cfg.groups.includes(cfg.currentGroup))
    cfg.currentGroup = cfg.groups.length ? cfg.groups[0] : '';

  const opts    = cfg.groups.map(g => `<option value="${g}">${g}</option>`).join('');
  const addOpts = `<option value="all">全グループ</option>` + opts;
  const noneOpt = `<option value="">未分類 (空白)</option>`;

  const setSelect = (id, html, val) => {
    const el = $(id); if (!el) return;
    el.innerHTML = html; if (val !== undefined) el.value = val;
  };
  setSelect('scan-group-select',     opts,    cfg.currentGroup);
  setSelect('cam-group-select',      opts,    cfg.currentGroup);
  setSelect('hist-bc-group-select',  addOpts, $('hist-bc-group-select')?.value || 'all');
  setSelect('hist-ph-group-select',  addOpts, $('hist-ph-group-select')?.value || 'all');
  setSelect('group-move-select',     noneOpt + opts);
  renderSettingsGroupList();
}

function renderSettingsGroupList() {
  const list = $('grp-list-el');
  list.innerHTML = '';
  cfg.groups.forEach((g, i) => {
    const item = document.createElement('div');
    item.className = 'grp-item';
    item.innerHTML = `<span>${g}</span> <button class="btn-del" data-idx="${i}">削除</button>`;
    list.appendChild(item);
  });
  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (cfg.groups.length <= 1) { showToast('[E030] 最低1つのグループが必要です', 'warn'); return; }
      cfg.groups.splice(+btn.dataset.idx, 1);
      saveCfg(); updateGroupUI();
    });
  });
}

/* ════ UI反映 ════ */
function applyCfgToUI() {
  const setChk = (id, v) => { const el = $(id); if (el) el.checked = v; };
  setChk('set-auto-scan',   cfg.autoStartScan);
  setChk('set-cont-scan',   cfg.continuousScan);
  setChk('set-vibration',   cfg.useVibration);
  setChk('set-use-group',   cfg.useGroup);

  document.querySelectorAll('[data-sf]').forEach(b  => b.classList.toggle('on', b.dataset.sf  === cfg.scanFormat));
  document.querySelectorAll('[data-cq]').forEach(b  => b.classList.toggle('on', b.dataset.cq  === cfg.camQuality));
  document.querySelectorAll('.quality-btn').forEach(b=> b.classList.toggle('on', b.dataset.q   === cfg.camQuality));
  document.querySelectorAll('[data-mp]').forEach(b  => b.classList.toggle('on', b.dataset.mp  === String(cfg.maxPhotos)));
  document.querySelectorAll('.mode-btn').forEach(b  => b.classList.toggle('on', b.dataset.mode === cfg.scanFormat));
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('on', b.dataset.r   === cfg.aspectRatio));

  const camVf = $('cam-vf');
  if (camVf) camVf.style.aspectRatio = (cfg.aspectRatio === 'full') ? 'auto' : cfg.aspectRatio;
  scanMode   = cfg.scanFormat;
  camQuality = cfg.camQuality;

  const ps = $('set-photo-size');
  if (ps) {
    ps.value = cfg.photoSize || 80;
    $('val-photo-size').textContent = (cfg.photoSize || 80) + 'px';
    document.documentElement.style.setProperty('--photo-size', (cfg.photoSize || 80) + 'px');
  }
  $('btn-bc-compact')?.classList.toggle('on', cfg.bcCompactMode);
  updateGroupUI();
}

/* ════ タブ切替 ════ */
function switchTab(newTab) {
  if (newTab === activeTab) return;

  // UI更新
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === newTab));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === 'pg-' + newTab));

  const prevTab = activeTab;
  activeTab = newTab;

  if (newTab === 'scan') {
    // 1. スキャンループ開始（ストリーム再利用で瞬時）
    if (cfg.autoStartScan) startScan();
    // 2. カメラ側の描画は止めて節電
    const cv = $('cam-video');
    if (cv) cv.pause();

  } else if (newTab === 'camera') {
    // 1. スキャンループを即座に停止（最大の節電）
    stopScan();
    // 2. カメラ起動
    startCam();
    // 3. スキャン側の描画は止める
    const sv = $('scan-video');
    if (sv) sv.pause();

  } else {
    // スキャン・カメラ以外のタブ（履歴・写真・設定）
    stopScan();
    if (typeof stopCam === 'function') stopCam();
    if (newTab === 'history') { exitMultiSelModeBc(); renderBcList(); }
    else if (newTab === 'photos') { exitMergeMode(); exitMultiSelModePh(); renderPhotoGrid(); }
  }
}

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});

/* ════ イベント登録 ════ */
function bindEvents() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);



  // UI設定
  on('set-photo-size', 'input',  e => { $('val-photo-size').textContent = e.target.value + 'px'; document.documentElement.style.setProperty('--photo-size', e.target.value + 'px'); });
  on('set-photo-size', 'change', e => { cfg.photoSize = +e.target.value; saveCfg(); });

  // スキャン設定
  on('set-cont-scan', 'change', e => { cfg.continuousScan = e.target.checked; saveCfg(); showToast('連続スキャン: ' + (cfg.continuousScan ? 'ON' : 'OFF'), cfg.continuousScan ? 'ok' : ''); });
  on('set-auto-scan', 'change', e => { cfg.autoStartScan  = e.target.checked; saveCfg(); });
  document.querySelectorAll('[data-sf]').forEach(btn => btn.addEventListener('click', () => {
    cfg.scanFormat = btn.dataset.sf; saveCfg(); applyCfgToUI();
    if (scanning) { stopScan(); setTimeout(startScan, 200); }
    showToast('フォーマット: ' + (cfg.scanFormat === 'ean13' ? 'EAN-13' : '全て'), 'ok');
  }));

  // カメラ設定
  document.querySelectorAll('[data-cq]').forEach(btn => btn.addEventListener('click', () => {
    cfg.camQuality = btn.dataset.cq; saveCfg(); applyCfgToUI();
    showToast('デフォルト画質: ' + ({ low:'低', mid:'標準', high:'高', max:'最高' })[cfg.camQuality], 'ok');
  }));

  // グループ
  on('set-use-group', 'change', e => { cfg.useGroup = e.target.checked; saveCfg(); updateGroupUI(); renderBcList(); renderPhotoGrid(); });
  on('scan-group-select', 'change', e => { cfg.currentGroup = e.target.value; saveCfg(); const c = $('cam-group-select');  if (c) c.value = cfg.currentGroup; });
  on('cam-group-select',  'change', e => { cfg.currentGroup = e.target.value; saveCfg(); const s = $('scan-group-select'); if (s) s.value = cfg.currentGroup; });
  on('hist-bc-group-select', 'change', renderBcList);
  on('hist-ph-group-select', 'change', renderPhotoGrid);
  on('grp-add-btn', 'click', () => {
    const val = $('grp-add-input').value.trim();
    if (!val) return;
    if (cfg.groups.includes(val)) { showToast('[E031] 既に存在します', 'warn'); return; }
    cfg.groups.push(val); $('grp-add-input').value = ''; saveCfg(); updateGroupUI();
  });

  // システム設定
  on('set-vibration', 'change', e => { cfg.useVibration = e.target.checked; saveCfg(); if (cfg.useVibration) vibrate([50]); });
  document.querySelectorAll('[data-mp]').forEach(btn => btn.addEventListener('click', () => {
    MAX_PH = +btn.dataset.mp; cfg.maxPhotos = MAX_PH; saveCfg(); applyCfgToUI(); updateCounts();
    showToast('最大保存枚数: ' + MAX_PH + '枚', 'ok');
  }));

  // データ管理
  on('set-export-csv', 'click', exportCSV);
  on('set-clear-bc', 'click', () => {
    if (!confirm('全てのバーコード履歴を完全に削除しますか？')) return;
    bcHistory = []; localStorage.setItem(BC_KEY, '[]'); updateCounts(); renderBcList(); showToast('BC履歴を削除しました');
  });
  on('set-clear-photos', 'click', () => {
    if (!confirm('保存されている全ての写真を完全に削除しますか？')) return;
    dbClear().then(() => { photos = []; updateCounts(); renderPhotoGrid(); updateThumbStrip(); showToast('写真を全削除しました'); });
  });

  // フォルダ設定
  on('btn-folder-pick',  'click', pickSaveFolder);
  on('btn-folder-clear', 'click', clearSaveFolder);
  const sfp = $('set-folder-pick');  if (sfp) sfp.onclick = pickSaveFolder;
  const sfc = $('set-folder-clear-btn'); if (sfc) sfc.onclick = clearSaveFolder;

  // 写真操作
  on('btn-ph-sort', 'click', e => {
    sortOrderPh = sortOrderPh === 'desc' ? 'asc' : 'desc';
    e.target.textContent = sortOrderPh === 'desc' ? '↓ 新しい順' : '↑ 古い順';
    renderPhotoGrid();
  });
  on('btn-multi-all', 'click', () => {
    const f = getFilteredPh();
    multiSelectedPh = multiSelectedPh.length === f.length && f.length ? [] : f.map(x => x.id);
    updateMultiSelTxtPh(); renderPhotoGrid();
  });
  on('btn-multi-cancel', 'click', exitMultiSelModePh);
  on('btn-multi-del', 'click', () => {
    if (!multiSelectedPh.length) { showToast('[E023] 項目が選択されていません', 'warn'); return; }
    if (!confirm(multiSelectedPh.length + '枚の写真を削除しますか？')) return;
    Promise.all(multiSelectedPh.map(id => dbDel(id))).then(() => {
      photos = photos.filter(p => !multiSelectedPh.includes(p.id));
      updateCounts(); updateThumbStrip(); exitMultiSelModePh(); showToast('削除しました');
    });
  });
  on('btn-multi-move', 'click', () => {
    if (!multiSelectedPh.length) { showToast('[E024] 項目が選択されていません', 'warn'); return; }
    groupMoveTarget = 'ph'; $('group-move-popup').style.display = '';
  });
  on('btn-multi-dl', 'click', async () => {
    if (!multiSelectedPh.length) { showToast('[E025] 項目が選択されていません', 'warn'); return; }
    showToast('準備中...', '', 2000);
    const selPhotos = multiSelectedPh.map(id => photos.find(p => p.id === id)).filter(Boolean);
    if (navigator.share && navigator.canShare) {
      try {
        const files = (await Promise.all(selPhotos.map(async p => {
          const blob = await dataUrlToBlob(p.dataUrl);
          if (!blob) return null;
          const ts = fmtTime(p.timestamp).replace(/[/:\s]/g, '-');
          return new File([blob], `${p.scannedCode ? p.scannedCode.slice(-5) : 'photo'}_${ts}.jpg`, { type:'image/jpeg' });
        }))).filter(Boolean);
        if (navigator.canShare({ files })) { await navigator.share({ files, title:'写真を保存' }); exitMultiSelModePh(); return; }
      } catch (e) { if (e.name !== 'AbortError') console.error(e); }
    }
    showToast('連続ダウンロードを開始します');
    for (const p of selPhotos) {
      const ts = fmtTime(p.timestamp).replace(/[/:\s]/g, '-');
      fallbackDownload(p.dataUrl, `${p.scannedCode ? p.scannedCode.slice(-5) : 'photo'}_${ts}.jpg`);
      await new Promise(r => setTimeout(r, 600));
    }
    exitMultiSelModePh();
  });

  on('btn-photo-clear', 'click', () => {
    if (!confirm('保存されている全ての写真を削除しますか？')) return;
    dbClear().then(() => { photos = []; updateCounts(); renderPhotoGrid(); updateThumbStrip(); showToast('写真を全て削除しました'); });
  });

  // 結合モード
  on('btn-merge-mode',   'click', () => {
    if (mergeMode) exitMergeMode();
    else { if (photos.length < 2) { showToast('[E026] 2枚以上の写真が必要です', 'warn'); return; } enterMergeMode(); }
  });
  on('btn-merge-cancel', 'click', exitMergeMode);
  on('btn-merge-exec',   'click', () => { if (mergeSelected.length >= 2) $('merge-modal').style.display = ''; });
  on('merge-modal-cancel', 'click', () => $('merge-modal').style.display = 'none');
  document.querySelectorAll('.merge-layout-btn').forEach(btn => btn.addEventListener('click', () => {
    $('merge-modal').style.display = 'none';
    mergeImages(mergeSelected.map(id => photos.find(p => p.id === id)).filter(Boolean), btn.dataset.layout);
  }));

  // iOS / グループ移動
  on('ios-popup-close', 'click', () => $('ios-popup').style.display = 'none');
  $('ios-popup')?.addEventListener('click', e => { if (e.target === $('ios-popup')) $('ios-popup').style.display = 'none'; });
  on('group-move-cancel', 'click', () => $('group-move-popup').style.display = 'none');
  on('group-move-exec', 'click', async () => {
    const g = $('group-move-select').value;
    $('group-move-popup').style.display = 'none';
    if (groupMoveTarget === 'ph') {
      if (!multiSelectedPh.length) return;
      await Promise.all(multiSelectedPh.map(id => { const p = photos.find(x => x.id === id); if (p) { p.group = g; return dbPut(p); } }));
      photos = (await dbAll()).reverse(); exitMultiSelModePh(); showToast('✓ グループを移動しました', 'ok');
    } else if (groupMoveTarget === 'bc') {
      if (!multiSelectedBc.length) return;
      multiSelectedBc.forEach(id => { const b = bcHistory.find(x => x.id === id); if (b) b.group = g; });
      localStorage.setItem(BC_KEY, JSON.stringify(bcHistory)); exitMultiSelModeBc(); showToast('✓ グループを移動しました', 'ok');
    }
  });

  // サムネトグル（修正: イベント登録欠落の対応）
  on('btn-thumb-toggle',  'click', () => setThumbVisible(!thumbStripVisible));
  on('btn-thumb-toggle2', 'click', () => setThumbVisible(!thumbStripVisible));
}

/* ════ グローバルカメラストリーム管理（省電力共有） ════
 *  getUserMedia は1回のみ呼び出し、scan/camera 両タブで同一ストリームを使い回す。
 *  タブ切替時は video.srcObject の付け替えのみ行い、物理カメラは停止しない。
 *  ════ */

// ストリーム取得中の二重実行防止
let _isStartingGlobal = false;

async function startGlobalCamera(forceRestart = false) {
  // すでに有効なストリームがあり、強制再起動でなければ即座に再利用（最速・最小電力）
  if (globalStream && globalStream.active && !forceRestart) {
    return globalStream;
  }
  
  if (_isStartingGlobal) {
    // すでに起動処理中の場合は、完了まで待機して既存のものを返す
    while (_isStartingGlobal) { await new Promise(r => setTimeout(r, 50)); }
    if (globalStream && globalStream.active) return globalStream;
  }

  _isStartingGlobal = true;
  try {
    // 古いストリームを物理停止（画質変更時など）
    if (globalStream) {
      globalStream.getTracks().forEach(t => t.stop());
      globalStream     = null;
      globalCamTrack   = null;
    }

    const qBase = CAM_QUALITY[cfg.camQuality] || CAM_QUALITY.mid;
    const isFull = cfg.aspectRatio === 'full';

    // FULL モード: aspectRatio 制約を渡さずセンサー本来の画角を使う
    const videoConstraints = isFull
      ? { facingMode, width: qBase.width, height: qBase.height }
      : (() => {
          const [arW, arH] = (cfg.aspectRatio || '16/9').split('/').map(Number);
          return { facingMode, width: qBase.width, height: qBase.height, aspectRatio: { ideal: arW / arH } };
        })();

    globalStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    });
    globalCamTrack = globalStream.getVideoTracks()[0];
    return globalStream;
  } finally {
    _isStartingGlobal = false;
  }
}

function stopGlobalCamera() {
  // 物理カメラを完全停止（バックグラウンド移行時のみ呼ぶ）
  if (globalStream) {
    globalStream.getTracks().forEach(t => t.stop());
    globalStream   = null;
    globalCamTrack = null;
  }
  // 後方互換参照もクリア
  scanStream = null;
  camStream  = null;
  camTrack   = null;
}

/* ════ 初期化 ════ */
async function init() {
  loadCfg();
  MAX_PH = cfg.maxPhotos || 200;
  try { bcHistory = JSON.parse(localStorage.getItem(BC_KEY) || '[]'); } catch(_) { bcHistory = []; }
  bcHistory = bcHistory.map(x => ({ checked: false, ...x }));
  try { photos = (await dbAll()).reverse(); } catch(_) { photos = []; }
  applyCfgToUI();
  setThumbVisible(thumbStripVisible);
  updateCounts();
  restoreFolderHandle();
  bindEvents();
  initOrientationSensor();
  if (cfg.autoStartScan) setTimeout(startScan, 400);
}

document.addEventListener('DOMContentLoaded', init);
