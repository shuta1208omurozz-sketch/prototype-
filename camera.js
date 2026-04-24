'use strict';

let isStarting = false;

/* ════ カメラ停止 ════ */
function stopCam() {
  camActive = false;
  // ストリームは共有のため物理停止しない。ビデオ要素からのみ切断する
  const video = $('cam-video');
  if (video) {
    video.pause();
    // 他のタブで使う可能性があるため、完全に srcObject = null にせず pause のみにとどめる場合もあるが、
    // 確実に描画を止めるために pause() は必須。
  }
  const ph = $('cam-ph');
  if (ph) ph.style.display = 'flex';
}

/* ════ バックグラウンド時の自動停止 ════ */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // 全ビデオ要素を切断
    const sv = $('scan-video');
    if (sv) { sv.pause(); sv.srcObject = null; }
    const cv = $('cam-video');
    if (cv) { cv.pause(); cv.srcObject = null; }
    // スキャンループを停止
    if (typeof stopScan === 'function') stopScan();
    // 物理カメラを完全停止（省電力・発熱防止）
    if (typeof stopGlobalCamera === 'function') stopGlobalCamera();
    camActive = false;
    camStream = null;
    camTrack  = null;
  } else {
    // フォアグラウンド復帰：現在のタブを再開
    if (activeTab === 'camera') {
      if (typeof startCam === 'function') startCam();
    } else if (activeTab === 'scan') {
      if (cfg?.autoStartScan && typeof startScan === 'function') startScan();
    }
  }
});

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
        Object.assign(video.style, { objectFit:'cover', width:'100%', height:'100%', backgroundColor:'#000' });
      }

      if (video.readyState < 1) {
        await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }));
      }

      try {
        await video.play();
        if (ph) ph.style.display = 'none';
        const vf = $('cam-vf');
        if (vf) { vf.style.aspectRatio = cfg.aspectRatio; vf.style.overflow = 'hidden'; }
        camTrack  = stream.getVideoTracks()[0];
        camActive = true;
        initCamFeatures(camTrack);
        showCropOverlay(cfg.aspectRatio);
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
      if (zoomCtrls) zoomCtrls.style.display = 'flex';
      const uwLabel = $('uw-label');
      if (uwLabel) uwLabel.style.display = dMin < 1 ? 'inline-block' : 'none';
      if (cfg.zoom && cfg.zoom !== cur) applyZoom(cfg.zoom);
    } else if (zoomCtrls) {
      zoomCtrls.style.display = 'none';
    }

    const torchBtn = $('btn-torch');
    if (torchBtn) {
      torchBtn.style.display = 'block';
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
  const isFull = (cfg.aspectRatio === 'full');
  const [rW, rH] = isFull ? [vw, vh] : (cfg.aspectRatio || '16/9').split('/');
  const tgtRatio   = parseFloat(rW) / parseFloat(rH);
  const videoRatio = vw / vh;

  let sw, sh, sx, sy;
  if (isFull) {
    // FULL: センサー全面、クロップなし
    sw = vw; sh = vh; sx = 0; sy = 0;
  } else if (videoRatio > tgtRatio) {
    sh = vh; sw = vh * tgtRatio; sx = (vw - sw) / 2; sy = 0;
  } else {
    sw = vw; sh = vw / tgtRatio; sx = 0; sy = (vh - sh) / 2;
  }

  const maxW   = { low:1024, mid:1920, high:2560, max:4096 }[cfg.camQuality] || 1920;

  // ── 撮影後補正方式（センサー依存ゼロ・端末差吸収）──
  // forceHorizontal=true かつ映像が縦長の場合だけ 90° 回転して横に直す
  const needsRotate = forceHorizontal && (vh > vw);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (needsRotate) {
    // 縦映像を右90°回転 → 横画像として出力
    canvas.width  = Math.min(sh, maxW);
    canvas.height = Math.round(canvas.width * (sw / sh));
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    // 回転後の座標系で描画（sw↔sh が入れ替わっている）
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

  // サムネイル生成
  const thumbC = document.createElement('canvas');
  thumbC.width = 300; thumbC.height = isFull ? Math.round(300 * vh / vw) : Math.round(300 / tgtRatio);
  thumbC.getContext('2d').drawImage(canvas, 0, 0, thumbC.width, thumbC.height);
  const thumbDataUrl = thumbC.toDataURL('image/jpeg', 0.6);

  const grp   = cfg.useGroup ? cfg.currentGroup : '未分類';
  const photo = {
    id: Date.now() + Math.random(), dataUrl: thumbDataUrl, thumbDataUrl,
    timestamp: Date.now(), facingMode, aspectRatio: cfg.aspectRatio,
    group: grp, scannedCode: lastScannedValue || ''
  };
  photos.unshift(photo);
  updateCounts();
  updateThumbStrip();
  if (activeTab === 'photos') renderPhotoGrid();
  showFlashEffect();
  vibrate([50]);
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
  if (ratio === 'full') { overlay.style.display = 'none'; return; }
  const label = $('crop-ratio-label');
  if (label) label.textContent = ratio.replace('/', ':');
  ['crop-mask-top','crop-mask-bottom'].forEach(cls => {
    const el = document.querySelector('.' + cls);
    if (el) el.style.height = '0px';
  });
  overlay.style.display = 'flex';
  overlay.classList.add('show');
}

/* ════ 横固定モード ════ */
function updateHorizontalUI() {
  const btn = $('btn-horizontal');
  if (!btn) return;
  btn.classList.toggle('on', forceHorizontal);
}

function toggleHorizontal() {
  forceHorizontal = !forceHorizontal;
  updateHorizontalUI();
}

function setAspectRatio(ratio) {
  if (cfg.aspectRatio === ratio) return;
  cfg.aspectRatio = ratio;
  if (typeof saveCfg === 'function') saveCfg();
  document.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.toggle('on', btn.dataset.r === ratio));
  const vf = $('cam-vf');
  if (vf) vf.style.aspectRatio = (ratio === 'full') ? 'auto' : ratio;
  showCropOverlay(ratio);
  if (camActive) startCam(true); // 解像度変更のため強制再起動
  else if (typeof applyCfgToUI === 'function') applyCfgToUI();
}

/* ════ イベント登録 ════ */
document.addEventListener('DOMContentLoaded', () => {
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('btn-shutter',    takePhoto);
  on('btn-torch',      toggleTorch);
  on('cam-retry',      startCam);
  on('btn-horizontal', toggleHorizontal);
  on('btn-goto-scan',  () => { if (typeof switchTab === 'function') switchTab('scan'); });

  const RATIOS = ['full', '4/3', '16/9', '21/9'];
  let ratioIdx = Math.max(0, RATIOS.indexOf(cfg.aspectRatio));
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.onclick = () => { setAspectRatio(btn.dataset.r); ratioIdx = RATIOS.indexOf(btn.dataset.r); };
  });

  // スワイプでアスペクト比切替
  const camControls = $('cam-controls');
  if (camControls) {
    let startX = 0;
    camControls.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    camControls.addEventListener('touchend',   e => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 60) {
        ratioIdx = (ratioIdx + (diff > 0 ? 1 : -1) + RATIOS.length) % RATIOS.length;
        setAspectRatio(RATIOS[ratioIdx]);
      }
    }, { passive: true });
  }

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

  const folderToggle = $('btn-folder-toggle');
  if (folderToggle) {
    folderToggle.onclick = () => {
      const row = $('save-folder-row');
      if (row) row.style.display = row.style.display === 'none' ? 'block' : 'none';
    };
  }
});
