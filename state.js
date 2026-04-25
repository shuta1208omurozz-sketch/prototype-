'use strict';

/* ════ キー定数 ════ */
const SETTINGS_KEY = 'sc-settings-v1';
const BC_KEY       = 'sc-bc-v3';
let   MAX_PH       = 200;

/* ════ 設定 ════ */
let cfg = {
  autoStartScan:  true,
  scanFormat:     'ean13',
  camQuality:     'mid',
  maxPhotos:      200,
  photoSize:      80,
  bcCompactMode:  false,
  continuousScan: false,
  useGroup:       false,
  groups:         ['未分類', '食品', '機械', '文具'],
  currentGroup:   '未分類',
  aspectRatio:    'full',
  outdoorMode:    false
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
  mid:  { width: { ideal: 1280 }, height: { ideal:  720 } },
  high: { width: { ideal: 1920 }, height: { ideal: 1080 } },
  max:  { width: { ideal: 3840 }, height: { ideal: 2160 } }
};

const ASPECT_RATIOS = { '4/3': 4/3, '16/9': 16/9, '21/9': 21/9 };

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
