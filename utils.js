'use strict';

/* ════ DOM短縮 ════ */
const $ = id => document.getElementById(id);

/* ════ 設定管理 ════ */
function saveCfg() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); }
  catch (e) { console.error('[Utils] saveCfg:', e); }
}

function loadCfg() {
  const saved = localStorage.getItem(SETTINGS_KEY);
  if (!saved) return;
  try { cfg = { ...cfg, ...JSON.parse(saved) }; }
  catch (e) { console.error('[Utils] loadCfg:', e); }
}

/* ════ トースト・バイブレーション ════ */
function showToast(msg, type = '', duration = 3000) {
  const t = $('toast');
  if (!t) return;
  if (t._timer) clearTimeout(t._timer);
  t.textContent = msg;
  t.className   = `toast show ${type}`;
  t._timer = setTimeout(() => { t.classList.remove('show'); t._timer = null; }, duration);
}

function vibrate(pattern) {
  if (cfg.useVibration && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) {}
  }
}

/* ════ 日時フォーマット ════ */
const pad = n => String(n).padStart(2, '0');

function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtFileDate(d) {
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fmtShort(ts) {
  const d = new Date(ts);
  return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDayString(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

/* ════ データ変換 ════ */

// fetch を使った高速変換（ArrayBuffer ループ不要）
async function dataUrlToBlob(dataUrl) {
  if (!dataUrl?.startsWith('data:')) return null;
  try { return await (await fetch(dataUrl)).blob(); }
  catch (e) { console.error('[Utils] dataUrlToBlob:', e); return null; }
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function createThumbnail(dataUrl, maxSide = 400) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxSide) { h = h * maxSide / w; w = maxSide; } }
      else        { if (h > maxSide) { w = w * maxSide / h; h = maxSide; } }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      res(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => rej(new Error('Thumbnail failed'));
    img.src = dataUrl;
  });
}

async function compressIfNeeded(blob, maxSize) {
  if (blob.size <= maxSize) return blob;
  const dataUrl = await blobToDataUrl(blob);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width * 0.9; c.height = img.height * 0.9;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => res(b || blob), 'image/jpeg', 0.7);
    };
    img.src = dataUrl;
  });
}

/* ════ バーコード描画 ════ */
function renderBC(canvas, value, format, height = 60, displayValue = false) {
  const jf = JS_FMT[format];
  if (!jf || !window.JsBarcode) return;
  try {
    JsBarcode(canvas, value, {
      format: jf, width: 2, height,
      displayValue, fontSize: 14,
      font: 'Share Tech Mono',
      background: '#ffffff', lineColor: '#111111', margin: 10
    });
  } catch (e) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/* ════ UI更新 ════ */
function updateCounts() {
  const bc = bcHistory.length, ph = photos.length, max = cfg.maxPhotos || 200;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('hdr-count',       `${bc}BC / ${ph}📷`);
  set('bc-count',        bc);
  set('ph-count',        ph);
  set('photo-count-txt', `${ph} / ${max} 枚`);
  const show = (id, cond) => { const el = $(id); if (el) el.style.display = cond ? '' : 'none'; };
  show('btn-ph-select-mode', ph >= 1);
  show('btn-merge-mode',     ph >= 2);
  show('btn-photo-clear',    ph >= 1);
  show('btn-bc-select-mode', bc >= 1);
  show('btn-bc-csv',         bc >= 1);
  show('btn-bc-clear',       bc >= 1);
}

// switchTab は main.js に統合されました

/* ════ デバイス判定 ════ */
const isIOS             = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAndroid         = /Android/i.test(navigator.userAgent);
const hasFileSystemAccess = 'showDirectoryPicker' in window;

/* ════ 端末向きセンサー ════ */
function initOrientationSensor() {
  const dot   = $('orient-dot');
  const label = $('orient-label');

  function updateOrientUI() {
    const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
    window._deviceOrientAngle = angle;
    const ok = (angle === 90 || angle === 270 || angle === -90);
    if (dot)   dot.className   = 'orient-dot '   + (ok ? 'ok' : 'warn');
    if (label) {
      label.className  = 'orient-label ' + (ok ? 'ok' : 'warn');
      label.textContent = ok ? '横向き ✓' : '縦向き';
    }
  }

  // screen.orientation API（Android Chrome等）
  if (window.screen?.orientation) {
    updateOrientUI();
    window.screen.orientation.addEventListener('change', updateOrientUI);
    return;
  }
  // window.orientation フォールバック（旧Safari等）
  if (typeof window.orientation !== 'undefined') {
    updateOrientUI();
    window.addEventListener('orientationchange', updateOrientUI);
    return;
  }
  // iOS 13+ — ユーザー許可が必要
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    if (label) { label.textContent = 'タップで向き取得'; label.style.cursor = 'pointer'; }
    document.addEventListener('click', async function req() {
      document.removeEventListener('click', req);
      try {
        if (await DeviceOrientationEvent.requestPermission() === 'granted') {
          window.addEventListener('deviceorientation', updateOrientUI, true);
          window.addEventListener('orientationchange', updateOrientUI);
          if (label) label.style.cursor = '';
        }
      } catch (e) { console.warn('[Orientation]', e); }
    }, { once: true });
  } else {
    // 許可不要の環境
    window.addEventListener('deviceorientation', updateOrientUI, true);
    window.addEventListener('orientationchange', updateOrientUI);
    updateOrientUI();
  }
}
