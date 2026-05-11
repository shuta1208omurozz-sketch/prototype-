'use strict';

let isStarting = false;
let zoomPanelOpen = false;
let zoomAvailable = false;


function updateCameraGuide() {
  const vf = $('cam-vf');
  const guide = $('cam-range-guide');
  const box = $('cam-range-box');
  const label = $('cam-range-label');
  if (!vf || !guide || !box) return;

  const W = vf.clientWidth || vf.offsetWidth || 0;
  const H = vf.clientHeight || vf.offsetHeight || 0;
  if (!W || !H) return;

  const pad = 10;
  const availW = Math.max(40, W - pad * 2);
  const availH = Math.max(40, H - pad * 2);
  let boxW = availW, boxH = availH;
  let text = 'FULL';

  if (cfg.aspectRatio && cfg.aspectRatio !== 'full') {
    const parts = cfg.aspectRatio.split('/').map(Number);
    const target = (parts[0] && parts[1]) ? (parts[0] / parts[1]) : (availW / availH);
    if (availW / availH > target) {
      boxH = availH;
      boxW = boxH * target;
    } else {
      boxW = availW;
      boxH = boxW / target;
    }
    text = cfg.aspectRatio.replace('/', ':');
  }

  box.style.width = Math.round(boxW) + 'px';
  box.style.height = Math.round(boxH) + 'px';
  if (label) label.textContent = text;
}

function setZoomPanel(open, forceHide = false) {
  const row = document.querySelector('#pg-camera .zoom-toggle-row');
  const ctrls = $('zoom-controls');
  const btn = $('btn-zoom-toggle');
  if (!row || !ctrls || !btn) return;

  if (!zoomAvailable || forceHide) {
    zoomPanelOpen = false;
    row.style.display = zoomAvailable ? 'flex' : 'none';
    ctrls.classList.remove('on');
    ctrls.style.display = 'none';
    btn.classList.remove('on');
    btn.textContent = '🔍 倍率';
    return;
  }

  zoomPanelOpen = !!open;
  row.style.display = 'flex';
  ctrls.classList.toggle('on', zoomPanelOpen);
  ctrls.style.display = zoomPanelOpen ? 'flex' : 'none';
  btn.classList.toggle('on', zoomPanelOpen);
  btn.textContent = zoomPanelOpen ? '× 倍率を閉じる' : '🔍 倍率';
}


function applyCameraVideoFit() {
  const video = $('cam-video');
  const page = $('pg-camera');
  if (!video) return;
  const isTallPreview = activeTab === 'camera' && cfg && cfg.aspectRatio === 'full' && !forceHorizontal;

  if (page) page.classList.toggle('full-preview', isTallPreview);

  // FIX16: fullは4:3と同じ横方向スケールのまま、高さだけ増やす。
  // プレビューも保存も同じ「中央クロップ計算」に合わせるため、表示は常にcover固定。
  video.style.objectFit = 'cover';
  video.style.objectPosition = 'center center';
  video.style.position = 'absolute';
  video.style.inset = '0';
  video.style.left = '';
  video.style.top = '';
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.minHeight = '';
  video.style.maxWidth = '';
  if (!forceHorizontal) video.style.transform = '';
  video.style.backgroundColor = '#000';
}

function getCaptureCrop(vw, vh) {
  // 4:3: 横幅全体を使う標準クロップ。
  // full: 4:3と同じ横幅全体を使い、縦だけ増やす。横方向は絶対に再計算しない。
  const isTall = cfg.aspectRatio === 'full';
  const targetRatio = isTall ? 1 : (() => {
    const [a, b] = (cfg.aspectRatio || '4/3').split('/').map(Number);
    return (a && b) ? a / b : 4 / 3;
  })();

  const videoRatio = vw / vh;
  let sw, sh, sx, sy;

  if (isTall) {
    // ここが今回の要点: 4:3と同じく横幅は全て使う。
    // 縦だけ 1:1 まで増やす。映像が足りない場合だけvhまで。
    sw = vw;
    sh = Math.min(vh, vw / targetRatio);
    sx = 0;
    sy = Math.max(0, (vh - sh) / 2);
  } else if (videoRatio > targetRatio) {
    sh = vh;
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / targetRatio;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  return { sx, sy, sw, sh, targetRatio, isTall };
}

/* ════ カメラ停止 ════ */
function stopCam() {
  camActive = false;
  // ストリームは共有のため物理停止しない。ビデオ要素からのみ切断する
  const video = $('cam-video');
  if (video) {
    video.pause();
    // 描画停止。物理ストリームは switchTab 側で必要に応じて停止/再利用する。
  }
  const ph = $('cam-ph');
  if (ph) ph.style.display = 'flex';
}

/* ════ バックグラウンド / iPhone復帰時の自動停止・再起動 ════ */
let _resumeScanWanted = false;
let _lastResumeAt = 0;

function pauseAllCameraForBackground() {
  _resumeScanWanted = activeTab === 'scan' && !!scanning;

  const sv = $('scan-video');
  if (sv) { sv.pause(); sv.srcObject = null; }
  const cv = $('cam-video');
  if (cv) { cv.pause(); cv.srcObject = null; }

  if (typeof stopScan === 'function') stopScan();
  if (typeof stopGlobalCamera === 'function') stopGlobalCamera();
  camActive = false;
  camStream = null;
  camTrack  = null;
}

function resumeCameraAfterReturn(reason = 'resume') {
  if (document.hidden) return;
  // pageshow / focus / visibilitychange が連続で走るので多重起動を抑制
  const now = Date.now();
  if (now - _lastResumeAt < 700) return;
  _lastResumeAt = now;

  setTimeout(() => {
    if (document.hidden) return;
    try {
      if (activeTab === 'camera') {
        // iPhone PWA/Safariの黒画面対策: 復帰時は古いストリームを捨てて取り直す
        if (typeof stopGlobalCamera === 'function') stopGlobalCamera();
        camActive = false;
        if (typeof startCam === 'function') startCam(true);
        if (typeof showToast === 'function') showToast('カメラを再起動しました', '', 1200);
      } else if (activeTab === 'scan') {
        if (_resumeScanWanted || cfg?.autoStartScan) {
          if (typeof stopGlobalCamera === 'function') stopGlobalCamera();
          if (typeof startScan === 'function') startScan();
          if (typeof showToast === 'function') showToast('スキャンを再起動しました', '', 1200);
        }
      }
    } catch (e) {
      console.error('[ResumeCamera]', reason, e);
      if (typeof showToast === 'function') showToast('[E050] 復帰時のカメラ再起動に失敗: ' + (e.message || e.name), 'err', 4000);
    }
  }, 180);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseAllCameraForBackground();
  else resumeCameraAfterReturn('visibilitychange');
});

// iPhone Safari/PWAは戻った時に visibilitychange だけでは足りないことがある
window.addEventListener('pageshow', e => {
  if (e.persisted) resumeCameraAfterReturn('pageshow-bfcache');
  else resumeCameraAfterReturn('pageshow');
});
window.addEventListener('focus', () => resumeCameraAfterReturn('focus'));

/* ════ カメラ起動 ════ */
async function startCam(forceRestart = false) {
  if (isStarting) return;
  isStarting = true;

  const video  = $('cam-video');
  const ph     = $('cam-ph');
  const txt    = $('cam-ph-txt');
  const errBox = $('cam-err');
  if (ph)     ph.style.display     = 'flex';
  if (txt)    txt.textContent      = 'カメラ初期化中...';
  if (errBox) errBox.style.display = 'none';

  // 他タブの処理を停止（解析エンジンの物理停止）
  if (typeof stopScan === 'function') stopScan();

  try {
    // 共有ストリームを取得（すでに起動中なら再利用。ここでの getUserMedia 再走は物理停止時のみ）
    const stream = await startGlobalCamera(forceRestart);
    camStream = stream;

    if (video) {
      // ストリームが既にセットされている場合は再セットしない（スパイク防止）
      if (video.srcObject !== stream) {
        video.srcObject = stream;
        video.playsInline = true;
        video.muted       = true;
        Object.assign(video.style, { width:'100%', height:'100%', backgroundColor:'#000' });
        applyCameraVideoFit();
      }

      if (video.readyState < 1) {
        await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }));
      }

      try {
        await video.play();
        if (ph) ph.style.display = 'none';
        if (typeof applyCameraViewportLayout === 'function') applyCameraViewportLayout();
        if (typeof updateCameraModeClass === 'function') updateCameraModeClass();
        applyCameraVideoFit();
        camTrack  = stream.getVideoTracks()[0];
        camActive = true;
        initCamFeatures(camTrack);
        showCropOverlay(cfg.aspectRatio);
        requestAnimationFrame(() => { updateCameraGuide(); updatePreview(); });
        setTimeout(updateCameraGuide, 120);
      } catch (e) { console.warn('[Camera] Play interrupted:', e); }
    }
  } catch (e) {
    handleCamError(e);
  } finally {
    isStarting = false;
  }
}

/* ════ カメラ機能初期化 ════ */
async function initCamFeatures(track) {
  if (!track) return;
  try {
    const caps        = track.getCapabilities();
    const zoomSlider  = $('zoom-slider');
    const zoomLevel   = $('zoom-level');
    const zoomCtrls   = document.querySelector('.zoom-controls');

    if (caps.zoom && zoomSlider) {
      const dMin = caps.zoom.min ?? 1;
      const dMax = Math.min(caps.zoom.max ?? 5, 5);
      Object.assign(zoomSlider, { min: dMin, max: dMax, step: caps.zoom.step || 0.05 });
      const cur = track.getSettings().zoom || 1;
      zoomSlider.value = cur;
      if (zoomLevel) {
        zoomLevel.textContent = `${parseFloat(cur).toFixed(2)}x`;
        zoomLevel.style.color = cur < 1 ? '#ffaa44' : 'var(--accent)';
      }
      zoomSlider.style.setProperty('--zoom-progress', (((cur - dMin) / (dMax - dMin)) * 100).toFixed(1) + '%');
      zoomAvailable = true;
      const uwLabel = $('uw-label');
      if (uwLabel) uwLabel.style.display = dMin < 1 ? 'inline-block' : 'none';
      if (cfg.zoom && cfg.zoom !== cur) applyZoom(cfg.zoom);
      setZoomPanel(false);
    } else {
      zoomAvailable = false;
      setZoomPanel(false, true);
    }

    const torchBtn = $('btn-torch');
    if (torchBtn) {
      torchBtn.style.display = 'flex';
      torchBtn.disabled      = !caps.torch;
      torchBtn.style.opacity = caps.torch ? '' : '0.35';
    }

    if (typeof applyCfgToUI === 'function') applyCfgToUI();
  } catch (e) { console.warn('[Camera] Feature init:', e); }
}

/* ════ ズーム ════ */
async function applyZoom(val) {
  if (!camTrack) return;
  try {
    await camTrack.applyConstraints({ advanced: [{ zoom: val }] });
    const lbl = $('zoom-level');
    if (lbl) { lbl.textContent = `${val.toFixed(2)}x`; lbl.style.color = val < 1 ? '#ffaa44' : 'var(--accent)'; }
  } catch (e) { console.error('[Camera] Zoom:', e); }
}

/* ════ トーチ ════ */
async function toggleTorch() {
  if (!camTrack) return;
  try {
    const newState = !camTrack.getSettings().torch;
    await camTrack.applyConstraints({ advanced: [{ torch: newState }] });
    const btn = $('btn-torch');
    if (btn) { btn.classList.toggle('on', newState); btn.style.color = newState ? 'var(--accent)' : ''; }
  } catch (e) { console.error('[Camera] Torch:', e); }
}

/* ════ 撮影 ════ */
async function takePhoto() {
  if (!camActive || !camStream) return;
  const video   = $('cam-video');
  const shutter = $('btn-shutter');
  if (!video || video.readyState < 2) return;
  if (shutter) shutter.disabled = true;

  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const vw = video.videoWidth, vh = video.videoHeight;
  const { sx, sy, sw, sh } = getCaptureCrop(vw, vh);

  const maxW   = { low:1024, mid:1920, high:2560, max:4096 }[cfg.camQuality] || 1920;

  // ── 撮影後補正方式（センサー依存ゼロ・端末差吸収）──
  // forceHorizontal=true かつ映像が縦長の場合だけ 90° 回転して横に直す
  const needsRotate = forceHorizontal && (vh > vw);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (needsRotate) {
    // 縦映像を回転して横画像として出力（rotateRight で方向切り替え）
    canvas.width  = Math.min(sh, maxW);
    canvas.height = Math.round(canvas.width * (sw / sh));
    ctx.save();
    if (rotateRight) {
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(0, canvas.height);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.height, canvas.width);
    ctx.restore();
  } else {
    canvas.width  = Math.min(sw, maxW);
    canvas.height = Math.round(canvas.width / (sw / sh));
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  // 撮影後は横固定を自動OFF（状態が残らない設計）
  forceHorizontal = false;
  updateHorizontalUI();
  updateArrow();
  updatePreview(video);

  // サムネイル生成
  const thumbC = document.createElement('canvas');
  thumbC.width = 300; thumbC.height = Math.round(300 * (sh / sw));
  thumbC.getContext('2d').drawImage(canvas, 0, 0, thumbC.width, thumbC.height);
  const thumbDataUrl = thumbC.toDataURL('image/jpeg', 0.6);

  const grp   = cfg.useGroup ? cfg.currentGroup : '未分類';
  const photo = {
    id: Date.now() + Math.random(), dataUrl: thumbDataUrl, thumbDataUrl,
    timestamp: Date.now(), facingMode, aspectRatio: cfg.aspectRatio,
    group: grp, scannedCode: lastScannedValue || '', savedToDevice: false
  };
  photos.unshift(photo);
  updateCounts();
  updateThumbStrip();
  if (typeof updateUnsavedSaveButton === 'function') updateUnsavedSaveButton();
  if (activeTab === 'photos') renderPhotoGrid();
  showFlashEffect();
  if (shutter) shutter.disabled = false;

  // 高画質を非同期保存
  setTimeout(async () => {
    try {
      const q    = { low:0.7, mid:0.85, high:0.92, max:0.98 }[cfg.camQuality] || 0.85;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
      if (!blob) return;
      photo.dataUrl = await blobToDataUrl(blob);
      if (typeof autoSaveToDevice === 'function') autoSaveToDevice(photo, blob);
      if (typeof dbPut === 'function') { await dbPut(photo); await dbPrune(cfg.maxPhotos); }
    } catch (e) { console.error('[Camera] Save:', e); }
  }, 50);
}

/* ════ フラッシュ / エラー ════ */
function showFlashEffect() {
  const fl = $('flash');
  if (!fl) return;
  fl.classList.remove('show');
  void fl.offsetWidth;
  fl.classList.add('show');
  setTimeout(() => fl.classList.remove('show'), 150);
}

function handleCamError(err) {
  const errBox  = $('cam-err');
  const errBody = $('cam-err-body');
  const errCode = $('cam-err-code');
  if (!errBox || !errBody) return;
  errBox.style.display = 'flex';
  const msgs = {
    NotAllowedError: ['権限が拒否されました。設定を確認してください。', 'AUTH_DENIED'],
    NotFoundError:   ['カメラが見つかりません。', 'NO_DEVICE']
  };
  const [msg, code] = msgs[err.name] || ['カメラにアクセスできません。', 'DEV_ERR'];
  errCode.textContent = code;
  errBody.textContent = msg;
  const ph = $('cam-ph');
  if (ph) ph.style.display = 'none';
}

/* ════ クロップ・アスペクト比 ════ */
function showCropOverlay(ratio) {
  const overlay = $('crop-overlay');
  if (!overlay) return;
  if (ratio === 'full') { overlay.style.display = 'none'; updateCameraGuide(); return; }
  const label = $('crop-ratio-label');
  if (label) label.textContent = ratio.replace('/', ':');
  ['crop-mask-top','crop-mask-bottom'].forEach(cls => {
    const el = document.querySelector('.' + cls);
    if (el) el.style.height = '0px';
  });
  overlay.style.display = 'flex';
  overlay.classList.add('show');
  updateCameraGuide();
}

/* ════ カメラUI固定・FULL表示制御 ════ */
function applyCameraViewportLayout() {
  const vf = $('cam-vf');
  if (!vf) return;

  vf.style.width = '100%';
  vf.style.overflow = 'hidden';
  vf.style.position = 'relative';

  if (cfg.aspectRatio === 'full') {
    // FIX16: FULLボタンは「縦拡張」モードとして扱う。
    // 4:3と横幅感を揃え、高さだけ4:3より増やす。
    vf.style.aspectRatio = '1 / 1';
    vf.style.flex = '0 0 auto';
    vf.style.height = 'auto';
    vf.style.maxHeight = 'calc(100dvh - 290px)';
    vf.style.minHeight = '0';
  } else {
    vf.style.aspectRatio = cfg.aspectRatio || '4 / 3';
    vf.style.flex = '0 0 auto';
    vf.style.height = 'auto';
    vf.style.maxHeight = 'calc(100dvh - 250px)';
    vf.style.minHeight = '0';
  }
  requestAnimationFrame(() => { updateCameraGuide(); applyCameraVideoFit(); });
}

function updateCameraModeClass() {
  const full = activeTab === 'camera' && cfg.aspectRatio === 'full';
  document.body.classList.toggle('cam-full-mode', !!full);
  document.body.classList.toggle('fullscreen', document.fullscreenElement != null || document.webkitFullscreenElement != null);
}

function goToScanModeFromCamera() {
  // カメラUI状態をリセットしてからスキャンへ。FULL表示時でも確実に戻れるようにする。
  forceHorizontal = false;
  updateHorizontalUI();
  updateArrow();
  updatePreview();
  if (typeof switchTab === 'function') switchTab('scan');
  // 設定で自動開始OFFでも、このボタンは「スキャンモードへ移動」なので明示的に開始する。
  setTimeout(() => { if (activeTab === 'scan' && typeof startScan === 'function') startScan(); }, 80);
}

/* ════ 横固定モード ════ */
function updateHorizontalUI() {
  const btn = $('btn-horizontal');
  if (btn) btn.classList.toggle('on', forceHorizontal);
  // 方向ボタン: 横固定ONのとき有効化、状態を反映
  const dirBtn = $('btn-direction');
  if (dirBtn) {
    // 「→」だけだと意味が分かりにくいので、横固定ONの時だけ「向き→/向き←」として表示する
    dirBtn.style.display      = forceHorizontal ? 'flex' : 'none';
    dirBtn.style.opacity      = forceHorizontal ? '1' : '0';
    dirBtn.style.pointerEvents= forceHorizontal ? '' : 'none';
    dirBtn.textContent        = rotateRight ? '向き→' : '向き←';
    dirBtn.title              = '横向き保存の回転方向を反転';
    dirBtn.setAttribute('aria-label', '横向き保存の回転方向を反転');
    dirBtn.classList.toggle('direction-right',  forceHorizontal && rotateRight);
    dirBtn.classList.toggle('direction-left',   forceHorizontal && !rotateRight);
  }
}

function updateArrow() {
  const arrow = $('direction-arrow');
  if (!arrow) return;
  if (!forceHorizontal) {
    arrow.style.display = 'none';
    return;
  }
  arrow.style.display = 'flex';
  arrow.textContent = rotateRight ? '→' : '←';
  // 方向ボタンのテキストも更新
  const dirBtn = $('btn-direction');
  if (dirBtn) {
    dirBtn.textContent = rotateRight ? '向き→' : '向き←';
    dirBtn.classList.toggle('direction-right',  rotateRight);
    dirBtn.classList.toggle('direction-left',   !rotateRight);
  }
}

function updatePreview(video) {
  if (!video) video = $('cam-video');
  if (!video) return;
  if (!forceHorizontal) {
    video.style.transform = '';
    applyCameraVideoFit();
    return;
  }
  // コンテナサイズに合わせてスケール計算（overflow:hidden対応）
  const vf = $('cam-vf');
  if (vf && vf.offsetWidth && vf.offsetHeight) {
    const W = vf.offsetWidth, H = vf.offsetHeight;
    const scale = Math.max(W / H, H / W);
    const deg   = rotateRight ? 90 : -90;
    video.style.transform = `rotate(${deg}deg) scale(${scale})`;
  } else {
    const deg = rotateRight ? 90 : -90;
    video.style.transform = `rotate(${deg}deg)`;
  }
}

function toggleHorizontal() {
  forceHorizontal = !forceHorizontal;
  applyCameraVideoFit();
  updateHorizontalUI();
  updateArrow();
  updatePreview();
}

function toggleDirection() {
  if (!forceHorizontal) return;
  rotateRight = !rotateRight;
  updateArrow();
  updatePreview();
}

function setAspectRatio(ratio) {
  if (cfg.aspectRatio === ratio) return;
  const prevRatio = cfg.aspectRatio;
  cfg.aspectRatio = ratio;
  if (typeof saveCfg === 'function') saveCfg();
  document.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.toggle('on', btn.dataset.r === ratio));
  if (typeof applyCameraViewportLayout === 'function') applyCameraViewportLayout();
  if (typeof updateCameraModeClass === 'function') updateCameraModeClass();
  applyCameraVideoFit();
  showCropOverlay(ratio);
  updateCameraGuide();
  const sameFourThreeStream = (prevRatio === '4/3' && ratio === 'full') || (prevRatio === 'full' && ratio === '4/3');
  if (camActive && !sameFourThreeStream) startCam(true); // 画質/比率変更時のみ再起動
  else if (camActive) { applyCameraVideoFit(); updateCameraGuide(); updatePreview(); }
  else if (typeof applyCfgToUI === 'function') applyCfgToUI();
}


/* ════ カメラ → スキャンへ移動（手動開始用） ════ */
function goToScanFromCamera() {
  // 横固定やプレビュー回転が残ったまま移動しないように戻す
  forceHorizontal = false;
  updateHorizontalUI();
  updateArrow();
  updatePreview();
  if (typeof switchTab === 'function') switchTab('scan');
  // autoStartScan=falseでも、このボタンだけは明示的にスキャン開始する
  setTimeout(() => {
    if (!scanning && typeof startScan === 'function') startScan();
  }, 120);
}

/* ════ フルスクリーン切り替え検知 ════ */
document.addEventListener('fullscreenchange', () => {
  document.body.classList.toggle('fullscreen', document.fullscreenElement != null);
  if (typeof updateCameraModeClass === 'function') updateCameraModeClass();
});
document.addEventListener('webkitfullscreenchange', () => {
  document.body.classList.toggle('fullscreen', document.webkitFullscreenElement != null);
  if (typeof updateCameraModeClass === 'function') updateCameraModeClass();
});

/* ════ イベント登録 ════ */
document.addEventListener('DOMContentLoaded', () => {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('btn-shutter',    () => { if (Date.now() < window.__suppressCameraShutterClickUntil) return; takePhoto(); });
  on('btn-torch',      toggleTorch);
  on('cam-retry',      startCam);
  on('btn-horizontal', toggleHorizontal);
  on('btn-direction',  toggleDirection);
  on('btn-goto-scan',      goToScanFromCamera);
  on('btn-goto-scan-main', goToScanFromCamera);
  on('btn-zoom-toggle',    () => setZoomPanel(!zoomPanelOpen));
  on('btn-save-unsaved',   () => { if (typeof saveUnsavedPhotosToDevice === 'function') saveUnsavedPhotosToDevice(); });

  const RATIOS = ['full', '4/3', '16/9', '21/9'];
  let ratioIdx = Math.max(0, RATIOS.indexOf(cfg.aspectRatio));
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.onclick = () => { setAspectRatio(btn.dataset.r); ratioIdx = RATIOS.indexOf(btn.dataset.r); };
  });

  // FIX3: 比率スワイプは上側ASPECT行ではなく、下側のシャッターボタン周辺で行う
  // 右スワイプ = 右隣の比率、左スワイプ = 左隣の比率。
  // ズームスライダーとは完全に分離する。
  window.__suppressCameraShutterClickUntil = 0;
  const btnRow = document.querySelector('#cam-controls .btn-row');
  if (btnRow) {
    let startX = 0, startY = 0, moved = false, suppressClickUntil = 0;

    const syncRatioIndex = () => {
      const idx = RATIOS.indexOf(cfg.aspectRatio);
      ratioIdx = idx >= 0 ? idx : 0;
    };
    const moveRatio = (dx) => {
      syncRatioIndex();
      ratioIdx = (ratioIdx + (dx > 0 ? 1 : -1) + RATIOS.length) % RATIOS.length;
      setAspectRatio(RATIOS[ratioIdx]);
      if (typeof showToast === 'function') showToast('比率: ' + RATIOS[ratioIdx].replace('/', ':'), 'ok', 900);
    };

    btnRow.addEventListener('touchstart', e => {
      if (window.__lockRatioSwipeUntil && Date.now() < window.__lockRatioSwipeUntil) return;
      if (e.target?.closest?.('#thumb-strip-wrap, #thumb-strip, .mini-thumb, .zoom-controls, .zoom-toggle-row, #btn-save-unsaved')) return;
      if (!e.touches || e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      moved = false;
      syncRatioIndex();
    }, { passive: true });

    btnRow.addEventListener('touchmove', e => {
      if (window.__lockRatioSwipeUntil && Date.now() < window.__lockRatioSwipeUntil) return;
      if (!e.touches || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.45) moved = true;
    }, { passive: true });

    btnRow.addEventListener('touchend', e => {
      if (window.__lockRatioSwipeUntil && Date.now() < window.__lockRatioSwipeUntil) return;
      const endX = e.changedTouches?.[0]?.clientX ?? startX;
      const endY = e.changedTouches?.[0]?.clientY ?? startY;
      const dx = endX - startX;
      const dy = endY - startY;
      if (!moved || Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.45) return;

      // スワイプ後にシャッター等のclickが誤発火しないよう短時間だけ抑制
      suppressClickUntil = Date.now() + 450;
      window.__suppressCameraShutterClickUntil = suppressClickUntil;
      moveRatio(dx);
    }, { passive: true });

    btnRow.addEventListener('click', e => {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  // 上側ASPECT行はタップ専用。スワイプ判定は入れない。

  const zoomSlider = $('zoom-slider');
  if (zoomSlider) {
    zoomSlider.oninput = e => {
      const v = parseFloat(e.target.value);
      applyZoom(v); cfg.zoom = v;
      const min = parseFloat(e.target.min) || 1, max = parseFloat(e.target.max) || 5;
      e.target.style.setProperty('--zoom-progress', (((v - min) / (max - min)) * 100).toFixed(1) + '%');
    };
  }

  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.onclick = () => {
      cfg.camQuality = btn.dataset.q;
      if (typeof saveCfg === 'function') saveCfg();
      if (typeof applyCfgToUI === 'function') applyCfgToUI();
      if (camActive) startCam(true); // 画質変更のため強制再起動
    };
  });

  window.addEventListener('resize', () => { updateCameraGuide(); updatePreview(); });

  const folderToggle = $('btn-folder-toggle');
  if (folderToggle) {
    folderToggle.onclick = () => {
      const row = $('save-folder-row');
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    };
  }

  updateHorizontalUI();
  updateArrow();
  setZoomPanel(false, !zoomAvailable);
  if (typeof updateUnsavedSaveButton === 'function') updateUnsavedSaveButton();
  setTimeout(updateCameraGuide, 120);
});
