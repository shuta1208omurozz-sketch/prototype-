'use strict';

/* ════ iPhone/非対応ブラウザ用 ZXing フォールバック ════ */
let zxingReader = null;
let zxingControls = null;
let zxingLoadingPromise = null;
let scanEngine = ''; // 'native' or 'zxing'
const ZXING_CDN = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/index.min.js';

function isIOSDevice() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function getScanEnvReason() {
  if (isIOSDevice()) return 'iPhone/iPadはBarcodeDetector非対応のため互換スキャンを使用';
  if (!('BarcodeDetector' in window)) return 'このブラウザはBarcodeDetector非対応のため互換スキャンを使用';
  return '高速スキャン対応';
}

function normalizeZxingFormat(fmt) {
  const s = String(fmt || '').toLowerCase();
  if (s.includes('ean') && s.includes('13')) return 'ean_13';
  if (s.includes('ean') && s.includes('8')) return 'ean_8';
  if (s.includes('qr')) return 'qr_code';
  if (s.includes('code_128')) return 'code_128';
  if (s.includes('code_39')) return 'code_39';
  if (s.includes('code_93')) return 'code_93';
  if (s.includes('upc') && s.includes('a')) return 'upc_a';
  if (s.includes('upc') && s.includes('e')) return 'upc_e';
  if (s.includes('itf')) return 'itf';
  return 'unknown';
}

function loadZxingBrowser() {
  if (window.ZXingBrowser?.BrowserMultiFormatReader) return Promise.resolve(window.ZXingBrowser);
  if (zxingLoadingPromise) return zxingLoadingPromise;
  zxingLoadingPromise = new Promise((resolve, reject) => {
    const old = document.querySelector('script[data-zxing-browser]');
    if (old) old.remove();
    const s = document.createElement('script');
    s.src = ZXING_CDN;
    s.async = true;
    s.dataset.zxingBrowser = '1';
    s.onload = () => {
      if (window.ZXingBrowser?.BrowserMultiFormatReader) resolve(window.ZXingBrowser);
      else reject(new Error('ZXingBrowser global not found'));
    };
    s.onerror = () => reject(new Error('ZXing CDN load failed'));
    document.head.appendChild(s);
  });
  return zxingLoadingPromise;
}


/* ════ CDN不要: iPhone用ローカルEAN-13スキャン（E011対策） ════ */
const EAN_L = {
  '0001101':'0','0011001':'1','0010011':'2','0111101':'3','0100011':'4',
  '0110001':'5','0101111':'6','0111011':'7','0110111':'8','0001011':'9'
};
const EAN_G = {
  '0100111':'0','0110011':'1','0011011':'2','0100001':'3','0011101':'4',
  '0111001':'5','0000101':'6','0010001':'7','0001001':'8','0010111':'9'
};
const EAN_R = {
  '1110010':'0','1100110':'1','1101100':'2','1000010':'3','1011100':'4',
  '1001110':'5','1010000':'6','1000100':'7','1001000':'8','1110100':'9'
};
const EAN_PARITY = {
  'LLLLLL':'0','LLGLGG':'1','LLGGLG':'2','LLGGGL':'3','LGLLGG':'4',
  'LGGLLG':'5','LGGGLL':'6','LGLGLG':'7','LGLGGL':'8','LGGLGL':'9'
};

function ean13ChecksumOk(code) {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 ? 3 : 1);
  return ((10 - (sum % 10)) % 10) === Number(code[12]);
}

function otsuThreshold(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[v|0]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 127, maxVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; best = t; }
  }
  return best;
}

function decodeEan13Bits(bits) {
  if (!bits || bits.length !== 95) return null;
  if (bits.slice(0,3) !== '101' || bits.slice(45,50) !== '01010' || bits.slice(92,95) !== '101') return null;
  let left = '', parity = '';
  for (let i = 0; i < 6; i++) {
    const seg = bits.slice(3 + i * 7, 3 + (i + 1) * 7);
    if (EAN_L[seg] !== undefined) { left += EAN_L[seg]; parity += 'L'; }
    else if (EAN_G[seg] !== undefined) { left += EAN_G[seg]; parity += 'G'; }
    else return null;
  }
  const first = EAN_PARITY[parity];
  if (first === undefined) return null;
  let right = '';
  for (let i = 0; i < 6; i++) {
    const seg = bits.slice(50 + i * 7, 50 + (i + 1) * 7);
    if (EAN_R[seg] === undefined) return null;
    right += EAN_R[seg];
  }
  const code = first + left + right;
  return ean13ChecksumOk(code) ? code : null;
}

function tryDecodeEan13FromRow(gray, width) {
  const thr = otsuThreshold(gray);
  let bin = new Uint8Array(width);
  for (let i = 0; i < width; i++) bin[i] = gray[i] < thr ? 1 : 0; // 黒=1

  // 端の黒点を探す。少し内側から複数候補を試す
  let first = -1, last = -1;
  for (let i = 0; i < width; i++) if (bin[i]) { first = i; break; }
  for (let i = width - 1; i >= 0; i--) if (bin[i]) { last = i; break; }
  if (first < 0 || last <= first || last - first < 95) return null;

  const span = last - first + 1;
  const shifts = [-8,-4,0,4,8];
  const scales = [0.96,0.98,1.0,1.02,1.04];
  for (const sc of scales) {
    const w = span * sc;
    const cx = (first + last) / 2;
    const st = cx - w / 2;
    const step = w / 95;
    if (st < 0 || st + w >= width) continue;
    for (const sh of shifts) {
      let bits = '';
      for (let m = 0; m < 95; m++) {
        const x = Math.max(0, Math.min(width - 1, Math.round(st + (m + 0.5) * step + sh * step / 10)));
        bits += bin[x] ? '1' : '0';
      }
      const val = decodeEan13Bits(bits);
      if (val) return val;
    }
  }
  return null;
}

function localDecodeEan13FromVideo(video) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  if (!_roiCanvas) {
    _roiCanvas = document.createElement('canvas');
    _roiCtx = _roiCanvas.getContext('2d', { alpha:false, willReadFrequently:true });
  }
  const vw = video.videoWidth, vh = video.videoHeight;
  const srcH = Math.round(vh * 0.34);
  const outW = Math.min(900, vw);
  const outH = Math.max(120, Math.round(srcH * outW / vw));
  if (_roiCanvas.width !== outW) _roiCanvas.width = outW;
  if (_roiCanvas.height !== outH) _roiCanvas.height = outH;
  _roiCtx.drawImage(video, 0, Math.round((vh - srcH) / 2), vw, srcH, 0, 0, outW, outH);
  const img = _roiCtx.getImageData(0, 0, outW, outH).data;
  const rows = [0.42,0.46,0.50,0.54,0.58,0.36,0.64];
  for (const rr of rows) {
    const y = Math.max(0, Math.min(outH - 1, Math.round(outH * rr)));
    const gray = new Uint8Array(outW);
    let p = y * outW * 4;
    for (let x = 0; x < outW; x++, p += 4) {
      gray[x] = (img[p] * 0.299 + img[p+1] * 0.587 + img[p+2] * 0.114) | 0;
    }
    const val = tryDecodeEan13FromRow(gray, outW);
    if (val) return val;
  }
  return null;
}

async function startLocalEanScan(reasonText = '') {
  try {
    await prepareScanVideo();
    scanning = true;
    scanEngine = 'local-ean13';
    setScanUI(true);
    setStatus('go', '[I003] iPhoneローカルEAN-13スキャン中...');
    const btn = $('btn-scan');
    if (btn) {
      btn.textContent = '■ スキャン停止';
      btn.classList.add('stop', 'active');
    }
    if (typeof showToast === 'function') showToast(reasonText || 'CDN不要のEAN-13スキャンに切替', 'ok', 3500);
    localEanDetectLoop();
  } catch (e) {
    handleScanStartError(e, 'LOCAL_EAN');
  }
}

function localEanDetectLoop() {
  if (!scanning || activeTab !== 'scan') { if (raf) cancelAnimationFrame(raf); raf = null; return; }
  const now = performance.now();
  if (now - _lastScanTime < 260) { raf = requestAnimationFrame(localEanDetectLoop); return; }
  _lastScanTime = now;
  const v = $('scan-video');
  try {
    const val = localDecodeEan13FromVideo(v);
    if (val) handleScanSuccess(val, 'ean_13');
    else _requiresClearFrame = false;
  } catch (e) {
    console.warn('[LocalEAN13]', e);
  }
  if (scanning) raf = requestAnimationFrame(localEanDetectLoop);
}


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
  _requiresClearFrame = false; // 停止時はリセット（次回スキャン開始時に即反応できるよう）
  
  // RAF を確実にキャンセル
  if (raf) { cancelAnimationFrame(raf); raf = null; }

  // ZXing互換スキャンを停止
  if (zxingControls && typeof zxingControls.stop === 'function') {
    try { zxingControls.stop(); } catch (_) {}
  }
  zxingControls = null;
  if (zxingReader && typeof zxingReader.reset === 'function') {
    try { zxingReader.reset(); } catch (_) {}
  }
  scanEngine = '';

  // ビデオ要素の再生を停止（GPU負荷削減）
  const v = $('scan-video');
  if (v) { v.pause(); }
  scanStream = null;
  // 解析用canvasを解放してメモリ/GPU負荷を残さない
  _roiCanvas = null;
  _roiCtx = null;

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
  const ios = isIOSDevice();

  // FIX33: iPhoneでEAN-13を使う場合は、外部CDNに依存しないローカルEAN-13スキャンを優先。
  // CDN失敗(E011)でスキャン開始できない事故を避ける。
  if (ios && scanMode === 'ean13') {
    return startLocalEanScan('[I003] iPhone EAN-13ローカルスキャン中');
  }

  const useNative = ('BarcodeDetector' in window) && !ios;
  if (useNative) return startNativeScan();
  return startZxingScan();
}

async function prepareScanVideo() {
  const stream = await startGlobalCamera();
  scanStream = stream;

  const v = $('scan-video');
  if (!v) throw new Error('scan-video element missing');
  if (v.srcObject !== stream) v.srcObject = stream;
  v.playsInline = true;
  v.muted       = true;

  if (v.readyState < 1) {
    await new Promise(resolve => v.addEventListener('loadedmetadata', resolve, { once: true }));
  }
  await v.play();
  return { stream, video: v };
}

async function startNativeScan() {
  try {
    await prepareScanVideo();
    scanEngine = 'native';
    scanning = true;
    setScanUI(true);
    setStatus('go', 'スキャン中...');
    const btn = $('btn-scan');
    if (btn) {
      btn.textContent = '■ スキャン停止';
      btn.classList.add('stop', 'active');
    }
    detect();
  } catch (e) {
    handleScanStartError(e, 'NATIVE');
  }
}

async function startZxingScan() {
  try {
    const reason = getScanEnvReason();
    setStatus('go', isIOSDevice() ? '[I001] iPhone互換スキャン準備中...' : '[I002] 互換スキャン準備中...');

    const { stream, video } = await prepareScanVideo();
    const ZXingBrowser = await loadZxingBrowser();

    // 1D専用リーダーが使える場合はEAN/JANに強いので優先。なければMultiFormatに戻す。
    const ReaderClass = ZXingBrowser.BrowserMultiFormatOneDReader || ZXingBrowser.BrowserMultiFormatReader;
    zxingReader = new ReaderClass();

    scanning = true;
    scanEngine = 'zxing';
    setScanUI(true);
    setStatus('go', isIOSDevice() ? '[I001] iPhone互換スキャン中...' : '[I002] 互換スキャン中...');
    const btn = $('btn-scan');
    if (btn) {
      btn.textContent = '■ スキャン停止';
      btn.classList.add('stop', 'active');
    }

    let lastZxingHit = 0;
    const onResult = (result, error, controls) => {
      if (!scanning || activeTab !== 'scan') return;
      if (controls && !zxingControls) zxingControls = controls;
      if (result) {
        const now = Date.now();
        if (now - lastZxingHit < 700) return;
        lastZxingHit = now;
        let val = typeof result.getText === 'function' ? result.getText() : String(result.text || result.rawValue || '');
        let fmtRaw = typeof result.getBarcodeFormat === 'function' ? result.getBarcodeFormat() : result.format;
        let fmt = normalizeZxingFormat(fmtRaw);
        if (scanMode === 'ean13' && val.length === 12) val = '0' + val;
        if (scanMode === 'ean13' && val.length !== 13) return;
        handleScanSuccess(val, fmt === 'unknown' && scanMode === 'ean13' ? 'ean_13' : fmt);
      } else if (error) {
        const name = error.name || '';
        const msg = error.message || '';
        // NotFound系は「まだ読めていない」だけなので表示しない
        if (!/NotFound|No MultiFormat Readers|No barcode/i.test(name + ' ' + msg)) {
          console.warn('[ZXing]', error);
        }
      }
    };

    if (typeof zxingReader.decodeFromStream === 'function') {
      zxingControls = await zxingReader.decodeFromStream(stream, video, onResult);
    } else if (typeof zxingReader.decodeFromVideoElement === 'function') {
      zxingControls = await zxingReader.decodeFromVideoElement(video, onResult);
    } else if (typeof zxingReader.decodeFromVideoDevice === 'function') {
      zxingControls = await zxingReader.decodeFromVideoDevice(undefined, video, onResult);
    } else {
      throw new Error('ZXing reader method not found');
    }

    if (typeof showToast === 'function') showToast(reason, 'ok', 3500);
  } catch (e) {
    console.error('[ZXing start]', e);
    // iPhoneでE011(CDN失敗)が出る環境向け。CDN不要のEAN-13専用ローカルスキャンへ自動切替。
    if (scanMode === 'ean13') {
      return startLocalEanScan('[I003] CDN不要のEAN-13スキャンに切替');
    }
    handleScanStartError(e, 'ZXING');
  }
}

function handleScanStartError(e, engine) {
  const ios = isIOSDevice();
  const errMap = {
    NotAllowedError:      ['E002', ios ? 'iPhoneでカメラ許可が拒否されています' : 'カメラの許可が必要です'],
    NotFoundError:        ['E003', 'カメラが見つかりません'],
    OverconstrainedError: ['E004', '解像度設定が非対応です'],
    NotReadableError:     ['E005', 'カメラが使用中です'],
  };
  let code, msg;
  if (engine === 'ZXING') {
    if (String(e.message || '').includes('CDN')) [code, msg] = ['E011', '互換スキャン読込失敗。通信/CDN/広告ブロックを確認'];
    else [code, msg] = ['E012', (ios ? 'iPhone互換スキャン初期化失敗: ' : '互換スキャン初期化失敗: ') + (e.message || e.name || 'unknown')];
  } else if (engine === 'LOCAL_EAN') {
    [code, msg] = ['E013', 'iPhoneローカルEAN-13スキャン開始失敗: ' + (e.message || e.name || 'unknown')];
  } else {
    [code, msg] = errMap[e.name] || ['E005', 'カメラエラー: ' + String(e.message || e.name || '').slice(0, 80)];
  }
  setStatus('err', `[${code}] ${msg}`);
  scanning = false;
  const btn = $('btn-scan');
  if (btn) { btn.textContent = '▶ スキャン開始'; btn.classList.remove('stop', 'active'); }
}

/* ════ スキャン頻度の厳密な制限（究極の節電） ════ */
let _lastScanTime = 0;
const SCAN_INTERVAL = 300; // 300ms (約3.3fps) に制限。EAN-13用途では電池・発熱を優先。

/* 同一バーコードの連続誤登録防止フラグ
 * スキャン成功後 true → 空フレームを1回でも検出したら false に戻す
 * このフラグが true の間は同じ値を再登録しない（持ち続け対策）*/
let _requiresClearFrame = false;

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
  // ROI: EAN-13は中央帯だけ + 横幅を縮小して解析（CPU/GPU負荷を削減）
  if (scanMode === 'ean13' && v.videoWidth > 0 && v.videoHeight > 0) {
    if (!_roiCanvas) {
      _roiCanvas = document.createElement('canvas');
      _roiCtx    = _roiCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
    }
    const vw = v.videoWidth, vh = v.videoHeight;
    const srcH = Math.round(vh * 0.28);
    const maxW = 960;
    const outW = Math.min(vw, maxW);
    const outH = Math.max(120, Math.round(srcH * (outW / vw)));
    if (_roiCanvas.width !== outW) _roiCanvas.width = outW;
    if (_roiCanvas.height !== outH) _roiCanvas.height = outH;
    _roiCtx.drawImage(v, 0, (vh - srcH) / 2, vw, srcH, 0, 0, outW, outH);
    detectTarget = _roiCanvas;
  }

  try {
    const wantedMode = scanMode === 'ean13' ? 'ean13' : 'all';
    if (!detector || detectorMode !== wantedMode) {
      detector = new BarcodeDetector({ formats: wantedMode === 'ean13' ? ['ean_13'] : ALL_FMTS });
      detectorMode = wantedMode;
    }
    const barcodes = await detector.detect(detectTarget);

    if (barcodes.length === 0) {
      // 空フレーム → 同一バーコードの再スキャンを解禁
      _requiresClearFrame = false;
    } else if (scanning) {
      const b = barcodes[0];
      let val = b.rawValue;
      if (scanMode === 'ean13' && val.length === 12) val = '0' + val;
      if (scanMode === 'ean13' && val.length !== 13) { raf = requestAnimationFrame(detect); return; }

      handleScanSuccess(val, b.format);
    }
  } catch (e) {
    console.error('[Scanner] Detect:', e);
    setStatus('err', `[E006] 検出エラー: ${e.name}`);
  }

  if (scanning) raf = requestAnimationFrame(detect);
}

function handleScanSuccess(val, format) {
  // ── 重複チェック ──
  // 同じ値かつ「カメラから一度も消えていない」場合はスキップ（持ち続け対策）
  // _requiresClearFrame が true = 前回スキャン後まだ空フレームを検出していない
  if (val === lastCode && _requiresClearFrame) {
    return; // バーコードがまだカメラに映ったまま → 無視
  }
  // 同じ値でも空フレームを経由したが、念のため最低1秒のクールダウン
  if (val === lastCode && (Date.now() - lastCodeTime < 1000)) {
    const dupEl = $('scan-bc-dup');
    if (dupEl) { dupEl.style.display = ''; setTimeout(() => { dupEl.style.display = 'none'; }, 1500); }
    return;
  }
  lastCode = val; lastCodeTime = Date.now();
  lastScannedValue = val;
  _requiresClearFrame = true;

  // ── 同一数値の重複登録を禁止 ──
  if (bcHistory.some(x => x.value === val)) {
    const dupEl = $('scan-bc-dup');
    if (dupEl) { dupEl.style.display = ''; setTimeout(() => { dupEl.style.display = 'none'; }, 1500); }
    showToast('既に登録済み: ' + val, '');
    // スキャン表示エリアだけ更新して終了
    const dispEl = $('scan-bc-display');
    const phEl   = $('scan-bc-placeholder');
    const valEl  = $('scan-bc-val');
    if (phEl)   phEl.style.display   = 'none';
    if (dispEl) dispEl.style.display = '';
    if (valEl)  valEl.textContent    = val;
    if (!cfg.continuousScan) stopScan();
    return;
  }

  const grp  = cfg.useGroup ? cfg.currentGroup : '未分類';
  const item = { id: Date.now(), value: val, format, timestamp: Date.now(), group: grp, checked: false };
  bcHistory.unshift(item);
  localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));

  /* ── スキャン結果表示エリアを更新 ── */
  const dispEl = $('scan-bc-display');
  const phEl   = $('scan-bc-placeholder');
  const valEl  = $('scan-bc-val');
  const metaEl = $('scan-bc-meta');
  const cnvEl  = $('scan-bc-canvas');
  const wrapEl = $('scan-bc-canvas-wrap');
  if (phEl)   phEl.style.display   = 'none';
  if (dispEl) dispEl.style.display = '';
  if (valEl)  valEl.textContent    = val;
  if (metaEl) metaEl.textContent   = (format || '').toUpperCase().replace('_', ' ') + ' · ' + fmtShort(item.timestamp);
  if (cnvEl && wrapEl) {
    if (JS_FMT[format]) {
      wrapEl.style.display = '';
      setTimeout(() => renderBC(cnvEl, val, format, 50, false), 10);
    } else {
      wrapEl.style.display = 'none';
    }
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

function getScanTimeBucketLabel(ts) {
  const d = new Date(ts || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:00〜${h}:59`;
}

function makeTimeSectionHeader(label, count) {
  const hdr = document.createElement('div');
  hdr.className = 'time-section-header';
  const left = document.createElement('span');
  left.textContent = '⏱ ' + label;
  const right = document.createElement('span');
  right.className = 'time-count';
  right.textContent = count + '件';
  hdr.appendChild(left);
  hdr.appendChild(right);
  return hdr;
}

function renderBcList() {
  const container = $('bc-list');
  const emptyEl   = $('bc-empty');
  if (!container) return;
  const list = getFilteredBc();

  // 空状態の切り替え
  if (emptyEl) emptyEl.style.display = list.length ? 'none' : '';
  container.style.display = list.length ? 'flex' : 'none';

  // 複数選択モードのクラス付与
  container.classList.toggle('multi-mode-bc', multiSelModeBc);

  container.innerHTML = '';
  const frag = document.createDocumentFragment();

  const bucketCounts = {};
  list.forEach(x => {
    const label = getScanTimeBucketLabel(x.timestamp);
    bucketCounts[label] = (bucketCounts[label] || 0) + 1;
  });
  let lastBucketLabel = '';

  list.forEach(item => {
    const bucketLabel = getScanTimeBucketLabel(item.timestamp);
    if (bucketLabel !== lastBucketLabel) {
      frag.appendChild(makeTimeSectionHeader(bucketLabel, bucketCounts[bucketLabel] || 0));
      lastBucketLabel = bucketLabel;
    }
    const isSelected = multiSelectedBc.includes(item.id);
    const fmtUpper   = (item.format || '').toUpperCase().replace('_', ' ');
    const isEan      = (item.format || '').includes('ean');

    const el = document.createElement('div');
    el.className = 'bc-card'
      + (isEan         ? ' ean'           : '')
      + (item.checked  ? ' checked'       : '')
      + (isSelected    ? ' multi-selected': '');

    // 複数選択チェック（絶対配置）
    const selChk = document.createElement('button');
    selChk.className = 'bc-sel-chk';
    selChk.textContent = isSelected ? '✓' : '';

    // バーコード画像エリア（コンパクトモード時は非表示）
    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'bc-thumb';
    const canvas = document.createElement('canvas');
    thumbDiv.appendChild(canvas);
    if (cfg.bcCompactMode) thumbDiv.style.display = 'none';

    // 値テキスト + FIX37: ↓3ボタンをバーコード横に配置
    const valueRow = document.createElement('div');
    valueRow.className = 'bc-value-row';

    const valDiv = document.createElement('div');
    valDiv.className = 'bc-val-large';
    valDiv.textContent = item.value;

    const inlineJumpBtn = document.createElement('button');
    inlineJumpBtn.className = 'bc-inline-jump';
    inlineJumpBtn.type = 'button';
    inlineJumpBtn.title = 'この位置から3件下へ移動';
    inlineJumpBtn.textContent = '↓3';

    valueRow.appendChild(valDiv);
    valueRow.appendChild(inlineJumpBtn);

    // メタ行
    const metaRow = document.createElement('div');
    metaRow.className = 'bc-meta-row';

    const metaInfo = document.createElement('div');
    metaInfo.className = 'bc-meta-info';
    metaInfo.innerHTML = `<span class="card-fmt${isEan ? ' ean' : ''}">${fmtUpper}</span>`
      + `<span class="card-time">${fmtShort(item.timestamp)}</span>`
      + `<span class="card-num">#${item.value.slice(-4)}</span>`
      + (item.checked ? '<span class="card-chk-lbl">✓済</span>' : '');
    if (cfg.useGroup && item.group) {
      const badge = document.createElement('span');
      badge.className = 'card-group-badge';
      badge.textContent = item.group;
      el.appendChild(badge);
    }

    const checkBtn = document.createElement('button');
    checkBtn.className = 'card-check';
    checkBtn.textContent = item.checked ? '✓' : '';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-delete';
    deleteBtn.title = '削除';
    deleteBtn.innerHTML = '&#x1F5D1;';

    metaRow.appendChild(metaInfo);
    metaRow.appendChild(checkBtn);
    metaRow.appendChild(deleteBtn);

    el.appendChild(selChk);
    el.appendChild(thumbDiv);
    el.appendChild(valueRow);
    el.appendChild(metaRow);

    // イベント
    el.onclick = (e) => {
      if (multiSelModeBc) { toggleMultiSelectBc(item.id, el); return; }
      if (e.target === checkBtn || e.target === selChk || e.target === deleteBtn || e.target === inlineJumpBtn) return;
      openBcModal(item);
    };
    checkBtn.onclick = (e) => {
      e.stopPropagation();
      item.checked = !item.checked;
      localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
      renderBcList();
    };
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteBc(item.id);
    };
    selChk.onclick = (e) => {
      e.stopPropagation();
      toggleMultiSelectBc(item.id, el);
    };

    inlineJumpBtn.onclick = (e) => {
      e.stopPropagation();
      if (typeof jumpListItemsFromElement === 'function') {
        jumpListItemsFromElement('bc-list', '.bc-card', el, 3);
      }
    };

    frag.appendChild(el);

    // バーコード画像を非同期描画
    if (JS_FMT[item.format] && !cfg.bcCompactMode) {
      setTimeout(() => renderBC(canvas, item.value, item.format, 50, false), 0);
    }
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
  $('bc-list')?.classList.add('multi-mode-bc');
  updateMultiSelTxtBc(); renderBcList();
}
function exitMultiSelModeBc() {
  multiSelModeBc = false; multiSelectedBc = [];
  $('btn-bc-select-mode').classList.remove('on');
  $('multi-sel-bar-bc').classList.remove('on');
  $('bc-list')?.classList.remove('multi-mode-bc');
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

function importCSV(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      // BOM除去 & 行分割
      let text = e.target.result.replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { showToast('データが見つかりません', 'warn'); return; }

      // ヘッダー行でカラム位置を特定
      const headers = parseCsvRow(lines[0]).map(h => h.trim());
      const iVal  = headers.findIndex(h => h === '値');
      const iFmt  = headers.findIndex(h => h === 'フォーマット');
      const iGrp  = headers.findIndex(h => h === 'グループ');
      const iChk  = headers.findIndex(h => h === '確認済み');
      if (iVal < 0) { showToast('「値」列が見つかりません', 'warn'); return; }

      let added = 0, skipped = 0;
      const grpDefault = cfg.useGroup ? cfg.currentGroup : '未分類';

      lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const cols = parseCsvRow(line);
        const val  = (cols[iVal] || '').trim();
        if (!val) return;

        // 重複チェック（同じ値がすでにある場合はスキップ）
        if (bcHistory.some(x => x.value === val)) { skipped++; return; }

        const fmtRaw = iFmt >= 0 ? (cols[iFmt] || '').trim().toLowerCase().replace(/ /g, '_') : '';
        const grp    = iGrp >= 0 && cols[iGrp] ? cols[iGrp].trim() : grpDefault;
        const chk    = iChk >= 0 && cols[iChk] ? cols[iChk].trim() === '済' : false;

        bcHistory.push({
          id:        Date.now() + added,
          value:     val,
          format:    fmtRaw || 'ean_13',
          timestamp: Date.now() + added,
          group:     grp,
          checked:   chk
        });
        added++;
      });

      localStorage.setItem(BC_KEY, JSON.stringify(bcHistory));
      updateCounts();
      renderBcList();
      showToast(`${added}件を取り込みました（重複スキップ: ${skipped}件）`, 'ok');
    } catch (err) {
      showToast('CSVの読み込みに失敗しました', 'warn');
      console.error(err);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// シンプルなCSV行パーサー（ダブルクォート対応）
function parseCsvRow(line) {
  const cols = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      cols.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  cols.push(cur);
  return cols;
}

/* ════ イベント登録 ════ */
document.addEventListener('DOMContentLoaded', () => {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);
  on('btn-scan', 'click', () => scanning ? stopScan() : startScan());
  on('btn-scan-to-camera', 'click', () => {
    if (typeof switchTab === 'function') switchTab('camera');
  });
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
      if (msg) { msg.style.display = ''; setTimeout(() => msg.style.display = 'none', 2000); }
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
  on('btn-bc-csv',   'click', exportCSV);

  // ── モーダル内削除ボタン ──
  on('btn-modal-del', 'click', () => {
    if (!currentDetail) return;
    if (!confirm(`「${currentDetail.value}」を削除しますか？`)) return;
    deleteBc(currentDetail.id);
    closeBcModal();
  });

  // ── CSV インポート ──
  on('set-import-csv', 'click', () => $('csv-import-input')?.click());
  $('csv-import-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) importCSV(file);
    e.target.value = ''; // 同じファイルを再選択できるようリセット
  });

  on('btn-bc-clear', 'click', () => {
    if (!confirm('全てのバーコード履歴を削除しますか？')) return;
    bcHistory = []; localStorage.setItem(BC_KEY, '[]');
    updateCounts(); renderBcList(); showToast('BC履歴を削除しました');
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
    groupMoveTarget = 'bc'; $('group-move-popup').style.display = 'flex';
  });
});
