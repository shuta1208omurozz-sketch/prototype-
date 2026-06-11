'use strict';

const APP_VERSION = 'FIX36';
const IS_IOS_LIKE = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ════ キー定数 ════ */
const SETTINGS_KEY = 'sc-settings-v1';
const BC_KEY       = 'sc-bc-v3';
let   MAX_PH       = 200;

/* ════ 設定 ════ */
let cfg = {
  autoStartScan:  false,
  scanFormat:     'ean13',
  camQuality:     'mid',
  maxPhotos:      1000,
  photoSize:      80,
  bcCompactMode:  false,
  continuousScan: false,
  useGroup:       false,
  groups:         ['未分類', '食品', '機械', '文具'],
  currentGroup:   '未分類',
  aspectRatio:    'default',
  outdoorMode:    false,
  cameraDeviceId: '',
  cameraDeviceLabel: '',
  preferUltraWide: true,
  _wideMinZoom: 1,
  androidAutoDownload: false,
  jumpButtonPlace: 'barcode',
  jumpButtonFixed: true
};

/* ════ データ ════ */
let bcHistory = [];
let photos    = [];

/* ════ カメラ・スキャン状態 ════ */
let scanning        = false;
let scanMode        = 'ean13';
let camActive       = false;
let camQuality      = 'mid';
let forceHorizontal = false; // 横固定モード（撮影後・スキャン成功後に自動OFF）
let rotateRight     = true;  // 横撮影の向き（true=右向き→, false=左向き←）

/* ════ メディアストリーム ════ */
let globalStream      = null;   // 共有カメラストリーム（1回のみ取得）
let globalCamTrack    = null;   // 共有トラック参照
let scanStream        = null;   // 後方互換のための参照（globalStream と同一）
let camStream         = null;   // 後方互換のための参照（globalStream と同一）
let detector          = null;
let detectorMode      = ''; // BarcodeDetectorの生成モードキャッシュ
let raf               = null;
let lastCode          = null;
let lastCodeTime      = 0;
let camTrack          = null;
let lastScannedValue  = '';

/* ════ UI状態 ════ */
let activeTab         = 'scan';
let currentDetail     = null;
let currentLightbox   = null;
let histFilter        = 'all';
let thumbStripVisible = localStorage.getItem('sc-thumb-vis') !== '0';
let iosPopupShown     = false;

/* ════ 選択モード ════ */
let mergeMode       = false;
let mergeSelected   = [];
let multiSelModePh  = false;
let multiSelectedPh = [];
let multiSelModeBc  = false;
let multiSelectedBc = [];

/* ════ ソート・その他 ════ */
let sortOrderBc     = 'desc';
let sortOrderPh     = 'desc';
let facingMode      = 'environment';
let groupMoveTarget = 'ph';

/* ════ 定数マッピング ════ */
const CAM_QUALITY = {
  low:  { width: { ideal:  640 }, height: { ideal:  480 } },
  mid:  { width: { ideal: 1280 }, height: { ideal:  960 } },
  high: { width: { ideal: 1920 }, height: { ideal: 1440 } },
  max:  { width: { ideal: 4000 }, height: { ideal: 3000 } }
};

const ASPECT_RATIOS = { 'default': 0, '16/9': 16/9, '21/9': 21/9 };

const JS_FMT = {
  ean_13: 'EAN13', ean_8: 'EAN8',   code_128: 'CODE128',
  code_39:'CODE39', code_93:'CODE93', upc_a: 'UPC',
  upc_e:  'UPC',   itf:    'ITF14'
};

const ALL_FMTS = [
  'qr_code','ean_13','ean_8','code_128','code_39',
  'code_93','itf','upc_a','upc_e','aztec',
  'data_matrix','pdf417'
];
