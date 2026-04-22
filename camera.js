import { state } from './state.js';
import { $, vibrate, blobToDataUrl, updateCounts, switchTab, saveCfg } from './utils.js';
import { stopScan } from './scanner.js';
import { updateThumbStrip, renderPhotoGrid } from './photos.js';
import { autoSaveToDevice, dbPut, dbPrune } from './storage.js';

let isStarting = false;

/* ════ WebKit toBlob ポリフィル（iPhone Safari 対応） ════ */
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.toBlob) {
  HTMLCanvasElement.prototype.toBlob = function(cb, type, q) {
    const data = this.toDataURL(type, q);
    const bin  = atob(data.split(',')[1]);
    const arr  = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    cb(new Blob([arr], { type: type || 'image/jpeg' }));
  };
}

/* ════ カメラ停止 ════ */
export function stopCam() {
  if (state.camStream) { state.camStream.getTracks().forEach(t => t.stop()); state.camStream = null; }
  state.camTrack  = null;
  state.camActive = false;
  const video = $('cam-video');
  if (video) { video.pause(); video.srcObject = null; try { video.load(); } catch(_){} }
  const ph = $('cam-ph');
  if (ph) ph.style.display = 'flex';
}

/* ════ カメラ起動 ════ */
export async function startCam() {
  if (isStarting) return;
  isStarting = true;
  stopCam();
  stopScan();

  const video  = $('cam-video');
  const ph     = $('cam-ph');
  const txt    = $('cam-ph-txt');
  const errBox = $('cam-err');
  if (ph)     ph.style.display     = 'flex';
  if (txt)    txt.textContent      = 'カメラ初期化中...';
  if (errBox) errBox.style.display = 'none';

  const qBase = state.CAM_QUALITY[state.cfg.camQuality] || state.CAM_QUALITY.mid;
  const [arW, arH] = (state.cfg.aspectRatio || '16/9').split('/').map(Number);

  const constraints = {
    video: { facingMode: state.facingMode, width: qBase.width, height: qBase.height, aspectRatio: { ideal: arW / arH } },
    audio: false
  };

  // state.camera.facingMode と同期
  state.camera.facingMode = state.facingMode;

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.camStream = stream;
    if (video) {
      video.srcObject = stream;
      Object.assign(video.style, { objectFit:'cover', width:'100%', height:'100%', backgroundColor:'#000' });
      video.onloadedmetadata = async () => {
        try {
          await video.play();
          if (ph) ph.style.display = 'none';
          const vf = $('cam-vf');
          if (vf) { vf.style.aspectRatio = state.cfg.aspectRatio; vf.style.overflow = 'hidden'; }
          state.camTrack  = stream.getVideoTracks()[0];
          state.camActive = true;
          initCamFeatures(state.camTrack);
          showCropOverlay(state.cfg.aspectRatio);
        } catch (e) { console.warn('[Camera] Play interrupted:', e); }
      };
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
      if (state.cfg.zoom && state.cfg.zoom !== cur) applyZoom(state.cfg.zoom);
    } else if (zoomCtrls) {
      zoomCtrls.style.display = 'none';
    }

    const torchBtn = $('btn-torch');
    if (torchBtn) {
      torchBtn.style.display = 'block';
      torchBtn.disabled      = !caps.torch;
      torchBtn.style.opacity = caps.torch ? '' : '0.35';
    }

    // applyCfgToUI() is in main.js, which imports this file. 
    // We should handle UI updates in main.js or export a function to be called.
  } catch (e) { console.warn('[Camera] Feature init:', e); }
}

/* ════ ズーム ════ */
async function applyZoom(val) {
  if (!state.camTrack) return;
  try {
    await state.camTrack.applyConstraints({ advanced: [{ zoom: val }] });
    const lbl = $('zoom-level');
    if (lbl) { lbl.textContent = `${val.toFixed(2)}x`; lbl.style.color = val < 1 ? '#ffaa44' : 'var(--accent)'; }
  } catch (e) { console.error('[Camera] Zoom:', e); }
}

/* ════ トーチ ════ */
async function toggleTorch() {
  if (!state.camTrack) return;
  try {
    const newState = !state.camTrack.getSettings().torch;
    await state.camTrack.applyConstraints({ advanced: [{ torch: newState }] });
    const btn = $('btn-torch');
    if (btn) { btn.classList.toggle('on', newState); btn.style.color = newState ? 'var(--accent)' : ''; }
  } catch (e) { console.error('[Camera] Torch:', e); }
}

/* ════ 撮影 ════ */
export async function takePhoto() {
  if (!state.camActive || !state.camStream) return;
  const video   = $('cam-video');
  const shutter = $('btn-shutter');
  if (!video || video.readyState < 2) return;
  if (shutter) shutter.disabled = true;

  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d', { alpha: false, desynchronized: true });

  // ── Android対策: videoWidth/Height が 0 になるバグ ──
  let vw = video.videoWidth  || video.clientWidth;
  let vh = video.videoHeight || video.clientHeight;

  const isFront = state.camera.facingMode === 'user';

  const [rW, rH]  = (state.cfg.aspectRatio || '16/9').split('/');
  const tgtRatio  = parseFloat(rW) / parseFloat(rH);
  const videoRatio = vw / vh;

  let sw, sh, sx, sy;
  if (videoRatio > tgtRatio) { sh = vh; sw = vh * tgtRatio; sx = (vw - sw) / 2; sy = 0; }
  else                        { sw = vw; sh = vw / tgtRatio; sx = 0; sy = (vh - sh) / 2; }

  const maxW   = { low:1024, mid:1920, high:2560, max:4096 }[state.cfg.camQuality] || 1920;
  const MAX_SAFE = 1920; // クラッシュ防止の絶対上限

  // ── 横向き強制保存モード ──
  const camIsPortrait = vh > vw;   // 実ストリーム解像度で判定
  const needsRotate   = state.camera.forceHorizontal && camIsPortrait;

  let outW, outH;
  if (needsRotate) {
    // 回転後に横長になるよう outW/outH を入れ替える
    outW = Math.min(sh, maxW, MAX_SAFE);
    outH = Math.round(outW / tgtRatio);
  } else {
    outW = Math.min(sw, maxW, MAX_SAFE);
    outH = Math.round(outW / tgtRatio);
  }

  canvas.width  = outW;
  canvas.height = outH;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 中心基準で変換（回転・ミラーの合成に必須）
  ctx.translate(outW / 2, outH / 2);

  if (needsRotate) {
    ctx.rotate(Math.PI / 2);   // 時計回り 90°
  }

  // ── フロントカメラ左右反転補正（重要） ──
  if (isFront) {
    ctx.scale(-1, 1);
  }

  if (needsRotate) {
    // 回転後は幅高さが入れ替わるため dst サイズも反転
    ctx.drawImage(video, sx, sy, sw, sh, -outH / 2, -outW / 2, outH, outW);
  } else {
    ctx.drawImage(video, sx, sy, sw, sh, -outW / 2, -outH / 2, outW, outH);
  }

  ctx.restore();

  // サムネイル生成
  const thumbC = document.createElement('canvas');
  thumbC.width = 300; thumbC.height = 300 / tgtRatio;
  thumbC.getContext('2d').drawImage(canvas, 0, 0, thumbC.width, thumbC.height);
  const thumbDataUrl = thumbC.toDataURL('image/jpeg', 0.6);

  const grp   = state.cfg.useGroup ? state.cfg.currentGroup : '未分類';
  const photo = {
    id: Date.now() + Math.random(), dataUrl: thumbDataUrl, thumbDataUrl,
    timestamp: Date.now(), facingMode: state.facingMode, aspectRatio: state.cfg.aspectRatio,
    group: grp, scannedCode: state.lastScannedValue || ''
  };
  state.photos.unshift(photo);
  updateCounts();
  updateThumbStrip();
  if (state.activeTab === 'photos') renderPhotoGrid();
  showFlashEffect();
  vibrate([50]);
  if (shutter) shutter.disabled = false;

  // 高画質を非同期保存
  setTimeout(async () => {
    try {
      const q    = { low:0.7, mid:0.85, high:0.92, max:0.98 }[state.cfg.camQuality] || 0.85;
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
      if (!blob) return;
      photo.dataUrl = await blobToDataUrl(blob);
      autoSaveToDevice(photo, blob);
      await dbPut(photo); await dbPrune(state.cfg.maxPhotos);
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
  const label = $('crop-ratio-label');
  if (label) label.textContent = ratio.replace('/', ':');
  ['crop-mask-top','crop-mask-bottom'].forEach(cls => {
    const el = document.querySelector('.' + cls);
    if (el) el.style.height = '0px';
  });
  overlay.style.display = 'flex';
  overlay.classList.add('show');
}

export function setAspectRatio(ratio) {
  if (state.cfg.aspectRatio === ratio) return;
  state.cfg.aspectRatio = ratio;
  saveCfg();
  document.querySelectorAll('.ratio-btn').forEach(btn => btn.classList.toggle('on', btn.dataset.r === ratio));
  const vf = $('cam-vf');
  if (vf) vf.style.aspectRatio = ratio;
  showCropOverlay(ratio);
  if (state.camActive) startCam();
}

/* ════ 横向き強制保存トグル ════ */
export function toggleForceHorizontal() {
  state.camera.forceHorizontal = !state.camera.forceHorizontal;
  const btn = $('btn-force-h');
  if (btn) {
    btn.classList.toggle('on', state.camera.forceHorizontal);
    btn.title = state.camera.forceHorizontal ? '横向き強制保存: ON' : '横向き強制保存: OFF';
  }
  localStorage.setItem('forceH', state.camera.forceHorizontal ? '1' : '0');
}

/* ════ イベント登録 ════ */
document.addEventListener('DOMContentLoaded', () => {
  // ── state 初期化（localStorage から復元） ──
  state.camera.forceHorizontal = localStorage.getItem('forceH') === '1';
  const forceBtn = $('btn-force-h');
  if (forceBtn) {
    forceBtn.classList.toggle('on', state.camera.forceHorizontal);
    forceBtn.title = state.camera.forceHorizontal ? '横向き強制保存: ON' : '横向き強制保存: OFF';
  }

  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on('btn-shutter', takePhoto);
  on('btn-torch',   toggleTorch);
  on('btn-force-h', toggleForceHorizontal);
  on('cam-retry',   startCam);
  on('btn-goto-scan', () => { switchTab('scan'); });

  const RATIOS = ['4/3', '16/9', '21/9'];
  let ratioIdx = Math.max(0, RATIOS.indexOf(state.cfg.aspectRatio));
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
      applyZoom(v); state.cfg.zoom = v;
      const min = parseFloat(e.target.min) || 1, max = parseFloat(e.target.max) || 5;
      e.target.style.setProperty('--zoom-progress', (((v - min) / (max - min)) * 100).toFixed(1) + '%');
    };
  }

  document.querySelectorAll('.quality-btn').forEach(btn => {
    btn.onclick = () => {
      state.cfg.camQuality = btn.dataset.q;
      saveCfg();
      // UI update will be handled in main.js or via direct DOM manipulation here
      if (state.camActive) startCam();
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
