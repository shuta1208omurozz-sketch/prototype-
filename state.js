/* ════ キー定数 ════ */
export const SETTINGS_KEY = 'sc-settings-v1';
export const BC_KEY       = 'sc-bc-v3';

export const state = {
  /* ════ 設定 ════ */
  MAX_PH: 200,
  cfg: {
    autoStartScan:  true,
    scanFormat:     'ean13',
    camQuality:     'mid',
    maxPhotos:      200,
    photoSize:      80,
    bcCompactMode:  false,
    useVibration:   true,
    continuousScan: false,
    useGroup:       false,
    groups:         ['未分類', '食品', '機械', '文具'],
    currentGroup:   '未分類',
    aspectRatio:    '16/9'
  },

  /* ════ データ ════ */
  bcHistory: [],
  photos:    [],

  /* ════ カメラ・スキャン状態 ════ */
  scanning:   false,
  scanMode:   'ean13',
  camActive:  false,
  camQuality: 'mid',

  /* ════ カメラ一元管理オブジェクト ════ */
  camera: {
    forceHorizontal: false,   // 初期値。DOMContentLoaded で localStorage から上書き
    facingMode:      'environment'
  },

  /* ════ メディアストリーム ════ */
  scanStream:        null,
  camStream:         null,
  detector:          null,
  raf:               null,
  lastCode:          null,
  lastCodeTime:      0,
  camTrack:          null,
  lastScannedValue:  '',

  /* ════ UI状態 ════ */
  activeTab:         'scan',
  currentDetail:     null,
  currentLightbox:   null,
  histFilter:        'all',
  thumbStripVisible: localStorage.getItem('sc-thumb-vis') !== '0',
  iosPopupShown:     false,

  /* ════ 選択モード ════ */
  mergeMode:       false,
  mergeSelected:   [],
  multiSelModePh:  false,
  multiSelectedPh: [],
  multiSelModeBc:  false,
  multiSelectedBc: [],

  /* ════ ソート・その他 ════ */
  sortOrderBc:     'desc',
  sortOrderPh:     'desc',
  facingMode:      'environment',   // 後方互換用（state.camera.facingMode と同期）
  groupMoveTarget: 'ph',
  
  /* ════ 定数マッピング ════ */
  CAM_QUALITY: {
    low:  { width: { ideal:  640 }, height: { ideal:  480 } },
    mid:  { width: { ideal: 1280 }, height: { ideal:  720 } },
    high: { width: { ideal: 1920 }, height: { ideal: 1080 } },
    max:  { width: { ideal: 3840 }, height: { ideal: 2160 } }
  },

  ASPECT_RATIOS: { '4/3': 4/3, '16/9': 16/9, '21/9': 21/9 },

  JS_FMT: {
    ean_13: 'EAN13', ean_8: 'EAN8',   code_128: 'CODE128',
    code_39:'CODE39', code_93:'CODE93', upc_a: 'UPC',
    upc_e:  'UPC',   itf:    'ITF14'
  },

  ALL_FMTS: [
    'qr_code','ean_13','ean_8','code_128','code_39',
    'code_93','itf','upc_a','upc_e','aztec',
    'data_matrix','pdf417'
  ]
};
