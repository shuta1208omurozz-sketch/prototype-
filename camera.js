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
    let target;
    if (cfg.aspectRatio === 'default' || cfg.aspectRatio === '4/3') {
      // FIX28: デフォルトは商品撮影の最大範囲寄り。枠で範囲を狭めない。
      target = availW / availH;
      text = 'DEFAULT';
    } else {
      const parts = cfg.aspectRatio.split('/').map(Number);
      target = (parts[0] && parts[1]) ? (parts[0] / parts[1]) : 1.18;
      text = cfg.aspectRatio.replace('/', ':');
    }
    if (availW / availH > target) {
      boxH = availH;
      boxW = boxH * target;
    } else {
      boxW = availW;
      boxH = boxW / target;
    }
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

function updateWideStatus(reason = '') {
  const el = $('wide-status');
  if (!el) return;
  try {
    const track = camTrack || globalCamTrack;
    const st = track?.getSettings?.() || {};
    const caps = track?.getCapabilities?.() || {};
    const z = (typeof st.zoom === 'number') ? st.zoom : (typeof cfg.zoom === 'number' ? cfg.zoom : null);
    const minZ = (caps.zoom && typeof caps.zoom.min === 'number') ? caps.zoom.min : (typeof cfg._wideMinZoom === 'number' ? cfg._wideMinZoom : null);
    const label = String(cfg.cameraDeviceLabel || track?.label || '').toLowerCase();
    const wideByZoom = typeof z === 'number' && z < 0.99;
    const wideByLabel = /ultra|0\.5|0,5|wide|広角|超広角/.test(label);
    const widePossible = typeof minZ === 'number' && minZ < 0.99;
    el.classList.toggle('on', wideByZoom || wideByLabel);
    el.classList.remove('err');
    if (wideByZoom) el.textContent = 'WIDE ' + z.toFixed(2) + 'x';
    else if (wideByLabel) el.textContent = 'WIDE';
    else if (typeof z === 'number') el.textContent = (widePossible ? 'WIDE可 ' : '標準 ') + z.toFixed(2) + 'x';
    else el.textContent = '標準';
    el.title = (cfg.cameraDeviceLabel || track?.label || 'カメラ') + (reason ? ' / ' + reason : '');
  } catch (e) {
    el.textContent = 'WIDE ?';
    el.classList.add('err');
  }
}

function markWideStatusError(msg = 'WIDE不可') {
  const el = $('wide-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('on');
  el.classList.add('err');
}

function getVideoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return Promise.resolve([]);
  return navigator.mediaDevices.enumerateDevices()
    .then(list => list.filter(d => d.kind === 'videoinput'))
    .catch(() => []);
}

function scoreWideCamera(device) {
  const label = (device.label || '').toLowerCase();
  let score = 0;
  // FIX25: 商品撮影優先。望遠/マクロ/前面を避け、広角/超広角/背面を最優先。
  if (/front|user|face|前面|イン/.test(label)) score -= 1000;
  if (/tele|望遠|macro|マクロ|depth|深度/.test(label)) score -= 500;
  if (/ultra|0\.5|0,5|super|wide|広角|超広角/.test(label)) score += 500;
  if (/back|rear|environment|背面|後面|アウト|camera 0|カメラ 0/.test(label)) score += 120;
  // ラベルが空の端末もあるため、空ラベルは中立。deviceId順の後段チェックで試す。
  return score;
}


async function discoverWidestBackCamera(qBase) {
  // FIX25: 表示比率ではなく、Webに公開されている背面カメラの中から
  // できるだけ広い候補を探す。ラベルだけでなく zoom.min も見て判定する。
  const cams = await getVideoInputs();
  if (!cams.length || !navigator.mediaDevices?.getUserMedia) return null;

  let candidates = cams.filter(d => !/front|user|face|前面|イン/i.test(d.label || ''));
  if (!candidates.length) candidates = cams;

  // 無駄に何度もカメラを開かないよう最大6候補まで。広角っぽい名前を優先。
  candidates = candidates
    .slice()
    .sort((a, b) => scoreWideCamera(b) - scoreWideCamera(a))
    .slice(0, 12);

  let best = null;
  for (const d of candidates) {
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: d.deviceId }, width: qBase.width, height: qBase.height, resizeMode: 'none' },
        audio: false
      });
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() || {};
      const settings = track?.getSettings?.() || {};
      const label = d.label || track?.label || '';
      const minZoom = (caps.zoom && typeof caps.zoom.min === 'number') ? caps.zoom.min : 1;

      let score = scoreWideCamera({ label });
      // zoom.min < 1 はChromeが超広角相当を出せる強い証拠
      if (minZoom < 1) score += 220 + Math.round((1 - minZoom) * 100);
      // 望遠っぽい名前は避ける
      if (/tele|望遠|macro|マクロ/i.test(label)) score -= 120;
      // 解像度が取れている候補を少し優遇。ただしFOVとは別なので加点は小さくする。
      if ((settings.width || 0) >= 1280) score += 5;
      if ((settings.height || 0) >= 720) score += 5;

      const item = { deviceId: d.deviceId, label, minZoom, score };
      if (!best || item.score > best.score) best = item;
    } catch (e) {
      // 端末によっては exact deviceId が使えない候補があるので無視
      console.warn('[WideDiscover] skip camera:', d.label || d.deviceId, e.name || e.message);
    } finally {
      if (stream) stream.getTracks().forEach(t => t.stop());
    }
  }
  return best;
}

async function chooseBestWideCameraId(qBase) {
  const best = await discoverWidestBackCamera(qBase || (CAM_QUALITY?.mid || { width:{ideal:1280}, height:{ideal:720} }));
  return best?.deviceId || '';
}

async function switchToCameraDevice(deviceId, label = '') {
  if (!deviceId) return false;
  cfg.cameraDeviceId = deviceId;
  cfg.cameraDeviceLabel = label || '';
  if (typeof saveCfg === 'function') saveCfg();
  if (typeof stopGlobalCamera === 'function') stopGlobalCamera();
  await startCam(true);
  return true;
}

async function switchToNextBackCamera(preferWide = false) {
  const cams = await getVideoInputs();
  if (!cams.length) {
    if (typeof showToast === 'function') showToast('[WIDE01] カメラ一覧を取得できません', 'warn', 2500);
    return false;
  }
  let candidates = cams.filter(d => !/front|user|face|前面|イン/i.test(d.label || ''));
  if (!candidates.length) candidates = cams;

  if (preferWide) candidates = candidates.slice().sort((a, b) => scoreWideCamera(b) - scoreWideCamera(a));

  const cur = cfg.cameraDeviceId || camTrack?.getSettings?.().deviceId || '';
  let idx = candidates.findIndex(d => d.deviceId === cur);
  let next;
  if (preferWide) next = candidates[0];
  else next = candidates[(idx + 1 + candidates.length) % candidates.length];

  if (!next || next.deviceId === cur && candidates.length < 2 && !preferWide) {
    if (typeof showToast === 'function') showToast('[WIDE02] 切替可能な背面カメラがありません', 'warn', 2500);
    return false;
  }

  await switchToCameraDevice(next.deviceId, next.label || '');
  if (typeof showToast === 'function') showToast('カメラ切替: ' + ((next.label || '背面カメラ').slice(0, 24)), 'ok', 2500);
  return true;
}

async function activateWideCamera() {
  // FIX25: ボタンを押したら必ず「再探索→再起動」を試す。現在トラックのzoomだけで終了しない。
  const btn = $('btn-wide-camera');
  if (btn) { btn.disabled = true; btn.textContent = '探索中'; }
  try {
    cfg.preferUltraWide = true;
    // 既存deviceIdが通常レンズを固定している可能性があるため、一度解除して再探索する。
    cfg.cameraDeviceId = '';
    cfg.cameraDeviceLabel = '';
    if (typeof saveCfg === 'function') saveCfg();

    const qBase = (typeof CAM_QUALITY !== 'undefined' && CAM_QUALITY[cfg.camQuality]) ? CAM_QUALITY[cfg.camQuality] : { width:{ideal:1280}, height:{ideal:720} };
    const best = await discoverWidestBackCamera(qBase);
    if (best?.deviceId) {
      cfg.cameraDeviceId = best.deviceId;
      cfg.cameraDeviceLabel = best.label || '広角候補';
      cfg._wideMinZoom = best.minZoom || 1;
      if (typeof saveCfg === 'function') saveCfg();
    }

    if (typeof stopGlobalCamera === 'function') stopGlobalCamera();
    await startCam(true);

    // 再起動後にも必ず最小zoomを適用する。
    if (camTrack) await autoApplyWideIfAvailable(camTrack, true);
    const z = camTrack?.getSettings?.().zoom;
    const label = cfg.cameraDeviceLabel || camTrack?.label || '背面カメラ';
    if (typeof showToast === 'function') {
      showToast('広角再取得: ' + (typeof z === 'number' ? z.toFixed(2) + 'x · ' : '') + String(label).slice(0, 22), 'ok', 3500);
    }
  } catch (e) {
    console.warn('[Wide] force reacquire failed:', e);
    markWideStatusError('WIDE失敗');
    if (typeof showToast === 'function') showToast('[WIDE04] 広角再取得に失敗: ' + (e.name || e.message || 'unknown'), 'warn', 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '広角再取得'; }
  }
}

async function autoApplyWideIfAvailable(track, force = false) {
  if ((!cfg.preferUltraWide && !force) || !track) return;
  // FIX25: 商品撮影では広い範囲を最優先。保存済みzoom値より、端末が出せる最小倍率を優先する。
  try {
    const caps = track.getCapabilities?.();
    if (caps?.zoom && typeof caps.zoom.min === 'number' && caps.zoom.min < 1) {
      const z = caps.zoom.min;
      await track.applyConstraints({ advanced: [{ zoom: z }] });
      cfg.zoom = z;
      if (typeof saveCfg === 'function') saveCfg();
      const btn = $('btn-wide-camera');
      if (btn) btn.classList.add('on');
      const zoomSlider = $('zoom-slider');
      const zoomLevel = $('zoom-level');
      if (zoomSlider) zoomSlider.value = z;
      if (zoomLevel) {
        zoomLevel.textContent = `${z.toFixed(2)}x`;
        zoomLevel.style.color = '#ffaa44';
      }
      updateWideStatus('auto-wide');
    }
  } catch (e) {
    console.warn('[Wide] auto apply:', e);
  }
}



function getCameraTargetRatio(mode, fallbackW, fallbackH) {
  // FIX21: FULL/デフォルトは「比率で切る」のではなく、取得できたカメラ映像の比率を基準にする。
  // これにより商品撮影時に勝手に拡大されるのを避ける。
  const nativeRatio = (fallbackW && fallbackH) ? (fallbackW / fallbackH) : 3 / 4;
  if (mode === 'full' || mode === 'default' || mode === '4/3' || !mode) return nativeRatio;
  const [a, b] = String(mode).split('/').map(Number);
  return (a && b) ? (a / b) : nativeRatio;
}

function getRatioLabel(mode) {
  if (mode === 'default' || mode === '4/3' || !mode) return 'デフォルト';
  if (mode === 'full') return 'FULL';
  return String(mode).replace('/', ':');
}

function applyCameraVideoFit() {
  const video = $('cam-video');
  const page = $('pg-camera');
  if (!video) return;
  const isFullPreview = activeTab === 'camera' && cfg && cfg.aspectRatio === 'full' && !forceHorizontal;

  if (page) page.classList.toggle('full-preview', isFullPreview);

  // FIX21: FULLだけは追加拡大・追加クロップをしない。
  // デフォルト/16:9/21:9は枠に合わせて表示し、保存も同じ範囲にする。
  video.style.objectFit = 'contain';
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
  // FIX29:
  // デフォルト/FULLは最大範囲を優先してクロップしない。
  // 16:9 / 21:9 は「選んだ比率で保存される」ことを優先して、保存時だけ正確にクロップする。
  const mode = (cfg.aspectRatio === '4/3') ? 'default' : cfg.aspectRatio;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  let targetRatio = vw / vh;

  if (mode === '16/9' || mode === '21/9') {
    targetRatio = mode === '16/9' ? (16 / 9) : (21 / 9);
    const srcRatio = vw / vh;
    if (srcRatio > targetRatio) {
      // 元映像が横に広すぎる → 左右を少し切る
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
    } else {
      // 元映像が縦に広すぎる → 上下を切る
      sh = vw / targetRatio;
      sy = (vh - sh) / 2;
    }
  }

  return { sx, sy, sw, sh, targetRatio, isFull: mode === 'full' };
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
  if (now - _lastResumeAt < 1100) return;
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
  }, 250);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseAllCameraForBackground();
  else resumeCameraAfterReturn('visibilitychange');
});
window.addEventListener('pagehide', () => pauseAllCameraForBackground());

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
        if (camTrack) camTrack.onended = () => {
          if (!document.hidden && activeTab === 'camera') resumeCameraAfterReturn('track-ended');
        };
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
      if (!cfg.preferUltraWide && cfg.zoom && cfg.zoom !== cur) applyZoom(cfg.zoom);
      setZoomPanel(false);
    } else {
      zoomAvailable = false;
      setZoomPanel(false, true);
    }

    await autoApplyWideIfAvailable(track);
    updateWideStatus('init');
    const wideBtn = $('btn-wide-camera');
    if (wideBtn) {
      wideBtn.style.display = 'inline-flex';
      const curZoom = track.getSettings?.().zoom;
      wideBtn.classList.toggle('on', typeof curZoom === 'number' && curZoom < 1);
      const label = cfg.cameraDeviceLabel || '';
      wideBtn.title = label ? ('広角/カメラ切替: ' + label) : '広角/背面カメラ切替';
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
    const slider = $('zoom-slider');
    if (slider) {
      slider.value = val;
      const min = parseFloat(slider.min) || 1, max = parseFloat(slider.max) || 5;
      slider.style.setProperty('--zoom-progress', (((val - min) / (max - min)) * 100).toFixed(1) + '%');
    }
    if (lbl) { lbl.textContent = `${val.toFixed(2)}x`; lbl.style.color = val < 1 ? '#ffaa44' : 'var(--accent)'; }
    const wideBtn = $('btn-wide-camera');
    if (wideBtn) wideBtn.classList.toggle('on', val < 1);
    updateWideStatus('zoom');
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
    const mode = (cfg.aspectRatio === '4/3') ? 'default' : cfg.aspectRatio;
    const outRatio = (mode === '16/9') ? (16 / 9) : (mode === '21/9') ? (21 / 9) : (sw / sh);
    canvas.width  = Math.min(sw, maxW);
    canvas.height = Math.round(canvas.width / outRatio);
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
      // FIX31: iPhoneは撮影ごとの保存/共有画面を出さない。Androidのみ設定ONで自動ダウンロード。
      if (cfg.androidAutoDownload && !(typeof IS_IOS_LIKE !== 'undefined' && IS_IOS_LIKE)) {
        try {
          const ok = (typeof downloadOnePhotoDirect === 'function') ? await downloadOnePhotoDirect(photo) : false;
          if (ok) {
            photo.savedToDevice = true;
            if (typeof showToast === 'function') showToast('✓ 自動保存しました', 'ok', 1200);
          } else {
            if (typeof showToast === 'function') showToast('[E044] 自動保存に失敗。未保存に残しました', 'warn', 3500);
          }
        } catch (dlErr) {
          console.warn('[AndroidAutoDownload]', dlErr);
          if (typeof showToast === 'function') showToast('[E044] 自動保存に失敗。未保存に残しました', 'warn', 3500);
        }
      }
      if (typeof dbPut === 'function') { await dbPut(photo); await dbPrune(cfg.maxPhotos); }
      if (typeof updateUnsavedSaveButton === 'function') updateUnsavedSaveButton();
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
  // FIX25: 比率変更で範囲を狭めない方針のため、クロップ枠は出さない。
  const overlay = $('crop-overlay');
  if (overlay) overlay.style.display = 'none';
  updateCameraGuide();
}

/* ════ カメラUI固定・FULL表示制御 ════ */
function applyCameraViewportLayout() {
  const vf = $('cam-vf');
  const video = $('cam-video');
  if (!vf) return;

  vf.style.width = '100%';
  vf.style.overflow = 'hidden';
  vf.style.position = 'relative';

  // FIX25: すべての比率で範囲優先。比率で映像を切らない。
  // FULLは縦方向の表示スペースを多く取り、デフォルト/他比率も取得映像の比率を基本にする。
  if (cfg.aspectRatio === 'full') {
    // FIX28: FULLは縦写真用だが、専用フル画面UIにはしない。通常UIのまま少し縦を使う。
    vf.style.aspectRatio = 'auto';
    vf.style.flex = '1 1 auto';
    vf.style.height = 'auto';
    vf.style.maxHeight = 'calc(100dvh - 210px)';
    vf.style.minHeight = '260px';
  } else {
    const vw = video?.videoWidth || 4;
    const vh = video?.videoHeight || 3;
    vf.style.aspectRatio = String(vw / vh);
    vf.style.flex = '0 0 auto';
    vf.style.height = 'auto';
    vf.style.maxHeight = 'calc(100dvh - 250px)';
    vf.style.minHeight = '0';
  }
  requestAnimationFrame(() => { updateCameraGuide(); applyCameraVideoFit(); });
}

function updateCameraModeClass() {
  const full = activeTab === 'camera' && cfg.aspectRatio === 'full';
  const page = $('pg-camera');
  if (page) {
    page.classList.toggle('default-preview', cfg.aspectRatio === 'default' || cfg.aspectRatio === '4/3');
    page.classList.toggle('full-preview', !!full);
  }
  // FIX28: FULLでもヘッダー/タブ/操作UIは通常のまま。cam-full-modeによる専用UIは使わない。
  document.body.classList.remove('cam-full-mode');
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
  if (ratio === '4/3') ratio = 'default';
  if (cfg.aspectRatio === '4/3') cfg.aspectRatio = 'default';
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
  // FIX18: ストリームは比率で縛らないため、比率切替ではカメラ再起動しない。
  // プレビュー枠と保存クロップだけ変更するので、切替が速くなりレンズ/FOVも変わりにくい。
  if (camActive) {
    if (typeof autoApplyWideIfAvailable === 'function' && camTrack) autoApplyWideIfAvailable(camTrack, true);
    applyCameraVideoFit(); updateCameraGuide(); updatePreview();
  }
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



/* ════ 純正カメラで撮影 → アプリへ取り込み ════ */
async function importNativeCameraFile(file) {
  if (!file) return;
  try {
    if (typeof showToast === 'function') showToast('写真を取り込み中...', '', 1800);
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    let thumbDataUrl = dataUrl;
    try {
      const img = new Image();
      img.src = dataUrl;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const max = 360;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d', { alpha:false }).drawImage(img, 0, 0, c.width, c.height);
      thumbDataUrl = c.toDataURL('image/jpeg', 0.72);
    } catch (_) {}

    const photo = {
      id: Date.now() + Math.random(),
      dataUrl,
      thumbDataUrl,
      timestamp: Date.now(),
      facingMode: 'native',
      aspectRatio: 'native',
      group: cfg.useGroup ? cfg.currentGroup : '未分類',
      scannedCode: lastScannedValue || '',
      savedToDevice: false,
      source: 'native-camera'
    };
    photos.unshift(photo);
    if (typeof dbPut === 'function') { await dbPut(photo); await dbPrune(cfg.maxPhotos); }
    updateCounts();
    updateThumbStrip();
    if (typeof updateUnsavedSaveButton === 'function') updateUnsavedSaveButton();
    if (activeTab === 'photos' && typeof renderPhotoGrid === 'function') renderPhotoGrid();
    if (typeof showToast === 'function') showToast('純正カメラ写真を取り込みました', 'ok', 2500);
  } catch (e) {
    console.error('[NativeCameraImport]', e);
    if (typeof showToast === 'function') showToast('[NATIVE01] 取り込み失敗: ' + (e.message || e.name), 'err', 4000);
  }
}

function openNativeCameraCapture() {
  const input = $('native-camera-input');
  if (!input) {
    if (typeof showToast === 'function') showToast('[NATIVE00] 入力欄が見つかりません', 'err', 3000);
    return;
  }
  input.value = '';
  input.click();
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
  on('btn-wide-camera',    activateWideCamera);
  on('btn-native-camera',  openNativeCameraCapture);
  const nativeInput = $('native-camera-input');
  if (nativeInput) nativeInput.addEventListener('change', e => importNativeCameraFile(e.target.files?.[0]));
  on('btn-save-unsaved',   () => { if (typeof saveUnsavedPhotosToDevice === 'function') saveUnsavedPhotosToDevice(); });

  const RATIOS = ['full', 'default', '16/9', '21/9'];
  if (cfg.aspectRatio === '4/3') cfg.aspectRatio = 'default';
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
      const idx = RATIOS.indexOf(cfg.aspectRatio === '4/3' ? 'default' : cfg.aspectRatio);
      ratioIdx = idx >= 0 ? idx : 0;
    };
    const moveRatio = (dx) => {
      syncRatioIndex();
      ratioIdx = (ratioIdx + (dx > 0 ? 1 : -1) + RATIOS.length) % RATIOS.length;
      setAspectRatio(RATIOS[ratioIdx]);
      if (typeof showToast === 'function') showToast('比率: ' + getRatioLabel(RATIOS[ratioIdx]), 'ok', 900);
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
