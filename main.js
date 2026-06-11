'use strict';


function normalizeAspectRatioSetting() {
  // FIX21: 旧4:3設定は「デフォルト」へ移行。4:3固定ではなく広めの標準カメラ風にする。
  if (!cfg.aspectRatio || cfg.aspectRatio === '4/3') cfg.aspectRatio = 'default';
}

function updateDeviceClassUI() {
  document.body.classList.toggle('ios-like', !!(typeof IS_IOS_LIKE !== 'undefined' && IS_IOS_LIKE));
}

function updateAppVersionUI() {
  const el = $('app-version-text');
  if (el) el.textContent = 'VERSION ' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'UNKNOWN');
}

function updateJumpButtonUI() {
  const place = cfg.jumpButtonPlace || 'barcode';
  document.body.classList.toggle('jump-place-barcode', place === 'barcode');
  document.body.classList.toggle('jump-place-toolbar', place === 'toolbar');
  document.body.classList.toggle('jump-toolbar-fixed', !!cfg.jumpButtonFixed);
  document.querySelectorAll('[data-jump-place]').forEach(b => b.classList.toggle('on', b.dataset.jumpPlace === place));
  const fixed = $('set-jump-fixed');
  if (fixed) fixed.checked = !!cfg.jumpButtonFixed;
}

async function forceAppUpdate() {
  try {
    showToast('更新準備中...', '', 1500);
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.update().catch(() => null)));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {
    console.warn('[ForceUpdate]', e);
  } finally {
    const base = location.href.split('?')[0].split('#')[0];
    location.href = base + '?v=' + encodeURIComponent(typeof APP_VERSION !== 'undefined' ? APP_VERSION : Date.now()) + '#settings';
  }
}


/* ════ グループUI ════ */
function updateGroupUI() {
  const gOn  = cfg.useGroup;
  const show = (id, v) => { const el = $(id); if (el) el.style.display = v ? (el.tagName === 'SELECT' || el.tagName === 'DIV' ? 'flex' : '') : 'none'; };
  show('scan-group-bar',     gOn);
  // FIX25: カメラ画面ではグループUIを常に非表示（設定/履歴側のON/OFFは維持）
  show('cam-group-bar',      false);
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
  if (typeof normalizeAspectRatioSetting === 'function') normalizeAspectRatioSetting();
  const setChk = (id, v) => { const el = $(id); if (el) el.checked = v; };
  setChk('set-auto-scan',    cfg.autoStartScan);
  setChk('set-cont-scan',    cfg.continuousScan);
  setChk('set-use-group',    cfg.useGroup);
  setChk('set-outdoor-mode', cfg.outdoorMode);
  setChk('set-android-auto-download', !!cfg.androidAutoDownload);
  setChk('set-jump-fixed', !!cfg.jumpButtonFixed);
  // 屋外モードをbodyクラスに反映
  document.body.classList.toggle('outdoor-mode', !!cfg.outdoorMode);

  document.querySelectorAll('[data-sf]').forEach(b  => b.classList.toggle('on', b.dataset.sf  === cfg.scanFormat));
  document.querySelectorAll('[data-cq]').forEach(b  => b.classList.toggle('on', b.dataset.cq  === cfg.camQuality));
  document.querySelectorAll('.quality-btn').forEach(b=> b.classList.toggle('on', b.dataset.q   === cfg.camQuality));
  document.querySelectorAll('[data-mp]').forEach(b  => b.classList.toggle('on', b.dataset.mp  === String(cfg.maxPhotos)));
  document.querySelectorAll('.mode-btn').forEach(b  => b.classList.toggle('on', b.dataset.mode === cfg.scanFormat));
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('on', b.dataset.r   === cfg.aspectRatio));

  if (typeof applyCameraViewportLayout === 'function') applyCameraViewportLayout();
  if (typeof updateCameraModeClass === 'function') updateCameraModeClass();
  scanMode   = cfg.scanFormat;
  camQuality = cfg.camQuality;

  const ps = $('set-photo-size');
  if (ps) {
    ps.value = cfg.photoSize || 80;
    $('val-photo-size').textContent = (cfg.photoSize || 80) + 'px';
    document.documentElement.style.setProperty('--photo-size', (cfg.photoSize || 80) + 'px');
  }
  $('btn-bc-compact')?.classList.toggle('on', cfg.bcCompactMode);
  updateJumpButtonUI();
  updateGroupUI();
}

/* ════ タブ切替 ════ */
function switchTab(newTab, pushHistory = true) {
  if (newTab === activeTab) return;

  // UI更新
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === newTab));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === 'pg-' + newTab));

  const prevTab = activeTab;
  activeTab = newTab;
  if (typeof updateCameraModeClass === 'function') updateCameraModeClass();

  // 戻るボタン対策: タブ遷移を履歴に積む
  if (pushHistory) {
    history.pushState({ tab: newTab }, '', '#' + newTab);
  }

  if (newTab === 'scan') {
    // カメラ画面からの移動時は video だけ止め、共有ストリームは再利用する
    if (typeof stopCam === 'function') stopCam();
    if (cfg.autoStartScan) startScan();

  } else if (newTab === 'camera') {
    stopScan();
    startCam();
    const sv = $('scan-video');
    if (sv) { sv.pause(); sv.srcObject = null; }

  } else {
    // 履歴・写真・設定では物理カメラも止める（電池・発熱対策）
    stopScan();
    if (typeof stopCam === 'function') stopCam();
    if (typeof stopGlobalCamera === 'function') stopGlobalCamera();
    if (newTab === 'history') { exitMultiSelModeBc(); renderBcList(); }
    else if (newTab === 'photos') { exitMergeMode(); exitMultiSelModePh(); renderPhotoGrid(); }
  }
}

/* ════ 戻るボタン対策: ブラウザ履歴でタブを管理 ════ */
window.addEventListener('popstate', (e) => {
  if (e.state && e.state.tab) {
    // 履歴の状態からタブを復元（push不要）
    switchTab(e.state.tab, false);
  } else {
    // 履歴が尽きた場合 → スキャン画面に戻す（アプリ終了を防ぐ）
    history.pushState({ tab: 'scan' }, '', '#scan');
    switchTab('scan', false);
  }
});

document.querySelectorAll('.tab').forEach(btn => {
  btn.onclick = () => switchTab(btn.dataset.tab);
});

function scrollTargetIntoView(target) {
  if (!target) return;
  // FIX37: offsetTopでscrollToすると、履歴ページ/本文スクロールの環境差で動かないことがある。
  // scrollIntoViewはAndroid Chrome/iPhone Safari両方で一番安定する。
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  } catch (_) {
    target.scrollIntoView(true);
  }
}

function getVisibleListItems(containerId, itemSelector) {
  const container = $(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll(itemSelector)).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function jumpListItems(containerId, itemSelector, count) {
  const items = getVisibleListItems(containerId, itemSelector);
  if (!items.length) { showToast('移動できる項目がありません', 'warn'); return; }

  // 今画面内で一番上に近いカードを基準に、3件下へ移動
  const topLine = 8;
  let currentIdx = items.findIndex(el => el.getBoundingClientRect().bottom > topLine);
  if (currentIdx < 0) currentIdx = 0;

  const targetIdx = Math.min(items.length - 1, currentIdx + Math.max(1, count || 3));
  if (targetIdx === currentIdx) { showToast('これ以上下はありません', 'warn'); return; }
  scrollTargetIntoView(items[targetIdx]);
}

function jumpListItemsFromElement(containerId, itemSelector, fromEl, count) {
  const items = getVisibleListItems(containerId, itemSelector);
  if (!items.length || !fromEl) { showToast('移動できる項目がありません', 'warn'); return; }

  const currentIdx = items.indexOf(fromEl.closest(itemSelector) || fromEl);
  if (currentIdx < 0) { showToast('移動位置を取得できません', 'warn'); return; }

  const targetIdx = Math.min(items.length - 1, currentIdx + Math.max(1, count || 3));
  if (targetIdx === currentIdx) { showToast('これ以上下はありません', 'warn'); return; }
  scrollTargetIntoView(items[targetIdx]);
}

// scanner.js側のバーコード横ボタンから確実に呼べるように公開
window.jumpListItems = jumpListItems;
window.jumpListItemsFromElement = jumpListItemsFromElement;

/* ════ イベント登録 ════ */
function bindEvents() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);
  on('btn-force-update', 'click', forceAppUpdate);
  on('btn-bc-jump-3', 'click', () => jumpListItems('bc-list', '.bc-card', 3));
  on('btn-ph-jump-3', 'click', () => jumpListItems('photo-grid', '.photo-card', 3));



  // UI設定
  on('set-photo-size', 'input',  e => { $('val-photo-size').textContent = e.target.value + 'px'; document.documentElement.style.setProperty('--photo-size', e.target.value + 'px'); });
  on('set-photo-size', 'change', e => { cfg.photoSize = +e.target.value; saveCfg(); });

  document.querySelectorAll('[data-jump-place]').forEach(btn => btn.addEventListener('click', () => {
    cfg.jumpButtonPlace = btn.dataset.jumpPlace || 'barcode';
    saveCfg();
    updateJumpButtonUI();
    renderBcList();
    showToast('↓3位置: ' + (cfg.jumpButtonPlace === 'barcode' ? 'バーコード横' : '上部'), 'ok');
  }));
  on('set-jump-fixed', 'change', e => {
    cfg.jumpButtonFixed = !!e.target.checked;
    saveCfg();
    updateJumpButtonUI();
    showToast('↓3固定: ' + (cfg.jumpButtonFixed ? 'ON' : 'OFF'), cfg.jumpButtonFixed ? 'ok' : '');
  });

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
  on('set-outdoor-mode', 'change', e => {
    cfg.outdoorMode = e.target.checked;
    saveCfg();
    document.body.classList.toggle('outdoor-mode', cfg.outdoorMode);
    showToast(cfg.outdoorMode ? '☀ 屋外モード ON' : '屋外モード OFF', cfg.outdoorMode ? 'ok' : '');
  });
  on('set-android-auto-download', 'change', e => {
    if (typeof IS_IOS_LIKE !== 'undefined' && IS_IOS_LIKE) {
      e.target.checked = false;
      cfg.androidAutoDownload = false;
      saveCfg();
      showToast('iPhoneでは撮影ごとの自動保存はOFF固定です', 'warn', 3500);
      return;
    }
    cfg.androidAutoDownload = !!e.target.checked;
    saveCfg();
    showToast('Android自動保存: ' + (cfg.androidAutoDownload ? 'ON' : 'OFF') + '（固定しました）', cfg.androidAutoDownload ? 'ok' : '');
  });
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

  // iOS 共有ボタン（Web Share API - iOSのカメラロールへ送れる）
  on('btn-multi-share', 'click', async () => {
    if (!multiSelectedPh.length) { showToast('[E025] 項目が選択されていません', 'warn'); return; }
    showToast('共有シートを準備中...', '', 2000);
    const selPhotos = multiSelectedPh.map(id => photos.find(p => p.id === id)).filter(Boolean);
    try {
      const files = (await Promise.all(selPhotos.map(async p => {
        const blob = await dataUrlToBlob(p.dataUrl);
        if (!blob) return null;
        const ts = fmtTime(p.timestamp).replace(/[/:\s]/g, '-');
        const name = `${p.scannedCode ? p.scannedCode.slice(-5) : 'photo'}_${ts}.jpg`;
        return new File([blob], name, { type: 'image/jpeg' });
      }))).filter(Boolean);

      if (!files.length) { showToast('[E027] 画像変換に失敗しました', 'err'); return; }

      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files, title: 'スキャン写真' });
        exitMultiSelModePh();
      } else if (navigator.share) {
        // ファイル共有非対応の場合はURLで試みる
        await navigator.share({ title: 'スキャン写真', text: `${files.length}枚の写真` });
      } else {
        showToast('このブラウザは共有機能に対応していません', 'warn', 4000);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[Share]', e);
        showToast('共有に失敗しました: ' + e.message, 'err', 4000);
      }
    }
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

    // FIX25: デフォルトが狭い問題はCSSではなく、掴んでいる背面カメラ/zoomが原因になりやすい。
    // 起動時に広角候補を探し、可能ならそのdeviceIdを使う。
    if (cfg.preferUltraWide && !cfg.cameraDeviceId && typeof discoverWidestBackCamera === 'function') {
      try {
        const best = await discoverWidestBackCamera(qBase);
        if (best?.deviceId) {
          cfg.cameraDeviceId = best.deviceId;
          cfg.cameraDeviceLabel = best.label || '';
          cfg._wideMinZoom = best.minZoom || 1;
          if (typeof saveCfg === 'function') saveCfg();
          console.log('[Camera] wide candidate selected:', best);
        }
      } catch (e) {
        console.warn('[Camera] wide discovery failed:', e);
      }
    }

    // aspectRatioで縛らず、端末が出せる広い映像を取得する。
    let videoConstraints = {
      facingMode,
      width: qBase.width,
      height: qBase.height,
      resizeMode: 'none'
    };
    if (cfg.cameraDeviceId) {
      videoConstraints = {
        deviceId: { exact: cfg.cameraDeviceId },
        width: qBase.width,
        height: qBase.height,
        resizeMode: 'none'
      };
    }

    try {
      globalStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
    } catch (e) {
      // 保存済みdeviceIdが無効になった場合は通常の背面カメラへフォールバック
      if (cfg.cameraDeviceId) {
        console.warn('[Camera] selected device failed, fallback environment:', e);
        cfg.cameraDeviceId = '';
        cfg.cameraDeviceLabel = '';
        if (typeof saveCfg === 'function') saveCfg();
        globalStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: qBase.width, height: qBase.height, resizeMode: 'none' },
          audio: false
        });
      } else {
        throw e;
      }
    }
    globalCamTrack = globalStream.getVideoTracks()[0];
    try {
      const st = globalCamTrack.getSettings?.() || {};
      const caps = globalCamTrack.getCapabilities?.() || {};
      if (st.deviceId) cfg.cameraDeviceId = st.deviceId;
      // FIX25: 0.5x/0.6x等に対応している場合は、商品撮影優先で自動的に最小倍率へ寄せる。
      if (cfg.preferUltraWide && caps.zoom && typeof caps.zoom.min === 'number' && caps.zoom.min < 1) {
        const z = caps.zoom.min;
        await globalCamTrack.applyConstraints({ advanced: [{ zoom: z }] });
        cfg.zoom = z;
      }
      if (typeof saveCfg === 'function') saveCfg();
    } catch (e) { console.warn('[Camera] wide min zoom apply failed:', e); }
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
  updateDeviceClassUI();
  if (typeof normalizeAspectRatioSetting === 'function') normalizeAspectRatioSetting();
  MAX_PH = cfg.maxPhotos || 200;
  try { bcHistory = JSON.parse(localStorage.getItem(BC_KEY) || '[]'); } catch(_) { bcHistory = []; }
  bcHistory = bcHistory.map(x => ({ checked: false, ...x }));
  try { photos = (await dbAll()).reverse(); } catch(_) { photos = []; }
  applyCfgToUI();
  updateAppVersionUI();
  if (typeof updateUnsavedSaveButton === 'function') updateUnsavedSaveButton();
  if (typeof updateSaveResultLogUI === 'function') updateSaveResultLogUI();
  setThumbVisible(thumbStripVisible);
  updateCounts();
  restoreFolderHandle();
  bindEvents();
  initOrientationSensor();

  // 戻るボタン対策: アプリの初期履歴を積む
  // replaceState で現在エントリを上書きしてから、スキャン画面を「最初の状態」として登録
  history.replaceState({ tab: 'scan' }, '', '#scan');

  if (cfg.autoStartScan) setTimeout(startScan, 400);
}

document.addEventListener('DOMContentLoaded', init);
