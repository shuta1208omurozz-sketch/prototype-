import zipfile
import os

# ---------------------------------------------------------
# ファイル内容の定義
# ---------------------------------------------------------

files = {
    # 1. index.html (UIの統合)
    "index.html": """<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"/>
  <title>Scanner + Camera Ultimate v4.1</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js"></script>
  <link rel="stylesheet" href="style.css">
</head>
<body class="theme-cyan">
<div id="app">
  <div class="hdr">
    <div class="hdr-icon">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#0a0c0f"><rect x="2" y="2" width="3" height="20"/><rect x="6" y="2" width="1" height="20"/><rect x="8" y="2" width="2" height="20"/><rect x="11" y="2" width="1" height="20"/><rect x="13" y="2" width="3" height="20"/><rect x="17" y="2" width="1" height="20"/><rect x="19" y="2" width="3" height="20"/></svg>
    </div>
    <div>
      <div class="hdr-title">Scanner + Camera</div>
      <div class="hdr-sub">SCAN · PHOTO · STORE [ULTIMATE]</div>
    </div>
    <div class="hdr-count" id="hdr-count">0BC / 0📷</div>
  </div>

  <div class="tabs">
    <button class="tab on" data-tab="scan">▶ スキャン</button>
    <button class="tab" data-tab="history">≡ 履歴</button>
    <button class="tab" data-tab="camera">📷 カメラ</button>
    <button class="tab" data-tab="photos">🖼 写真</button>
    <button class="tab" data-tab="settings">⚙ 設定</button>
  </div>

  <!-- スキャン画面 -->
  <div class="page on scan-pg" id="pg-scan">
    <div class="group-bar" id="scan-group-bar" style="display:flex;">
      <span class="group-lbl">📂 グループ:</span>
      <select id="scan-group-select" class="group-select"></select>
    </div>
    <div class="scan-top">
      <div class="mode-row">
        <button class="mode-btn" data-mode="all">全フォーマット</button>
        <button class="mode-btn on" data-mode="ean13">EAN-13のみ</button>
      </div>
      <div class="finder" id="scan-finder">
        <video id="scan-video" muted playsinline autoplay></video>
        <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
        <div class="scan-line" id="scan-line"></div>
        <div class="ph" id="scan-ph"><p>スキャン開始を押してください</p></div>
      </div>
      <div class="sbar"><div class="sdot" id="sdot"></div><span id="stxt">待機中</span></div>
      <button class="btn-main" id="btn-scan">▶ スキャン開始</button>
    </div>
    <div class="scan-bc-section" id="scan-bc-section">
      <div class="scan-bc-placeholder" id="scan-bc-placeholder">— バーコード表示エリア —</div>
      <div class="scan-bc-display" id="scan-bc-display" style="display:none">
        <div class="scan-bc-val" id="scan-bc-val"></div>
        <button id="btn-warp-cam" class="warp-cam-btn">📷 写真を撮影する</button>
        <div class="scan-bc-canvas-wrap"><canvas id="scan-bc-canvas"></canvas></div>
      </div>
    </div>
  </div>

  <!-- カメラ画面 (比率切り替え機能統合) -->
  <div class="page cam-pg" id="pg-camera">
    <div class="group-bar" style="display:flex;">
      <span class="group-lbl">📂 保存先:</span>
      <select id="cam-group-select" class="group-select"></select>
    </div>
    <div class="vf" id="cam-vf">
      <video id="cam-video" muted playsinline autoplay></video>
      <div class="flash" id="flash"></div>
      <div class="focus-ring" id="focus-ring"></div>
    </div>

    <!-- アスペクト比切り替えボタン -->
    <div class="ratio-row">
      <span class="ratio-lbl">ASPECT:</span>
      <button class="ratio-btn" data-ratio="4/3">4:3</button>
      <button class="ratio-btn on" data-ratio="16/9">16:9</button>
      <button class="ratio-btn" data-ratio="21/9">21:9</button>
    </div>

    <div class="cam-controls">
      <div class="btn-row">
        <button id="btn-cam-switch" class="btn-sub">🔄</button>
        <button id="btn-torch" class="btn-sub">🔦</button>
        <button id="btn-shutter" class="btn-shutter"></button>
        <button id="btn-goto-scan" class="btn-sub">SCAN</button>
      </div>
    </div>
  </div>

  <!-- 履歴画面 -->
  <div class="page hist-pg" id="pg-history">
    <div class="toolbar">
      <input class="sbox" id="search-box" placeholder="バーコード値を検索..." type="search"/>
      <button class="btn-sm" id="btn-bc-compact">≡ 1行</button>
      <button class="btn-sm accent" id="btn-bc-csv">CSV</button>
      <button class="btn-sm danger" id="btn-bc-clear">全削除</button>
    </div>
    <div class="list" id="bc-list"></div>
  </div>

  <!-- 写真画面 -->
  <div class="page photo-pg" id="pg-photos">
    <div class="photo-toolbar">
      <span class="photo-count" id="photo-count-txt">0 枚</span>
      <button class="btn-sm accent" id="btn-merge-mode">📐 結合</button>
      <button class="btn-sm danger" id="btn-photo-clear">全削除</button>
    </div>
    <div class="photo-list" id="photo-grid"></div>
  </div>

  <!-- 設定画面 -->
  <div class="page settings-pg" id="pg-settings">
    <div class="settings-section">
      <div class="settings-title">⚙ システム設定</div>
      <div class="settings-row">
        <div><div class="settings-lbl">ハプティック（振動）</div><div class="settings-sub">操作時の振動フィードバック</div></div>
        <label class="toggle-sw"><input type="checkbox" id="set-vibration" checked/><span class="toggle-slider"></span></label>
      </div>
      <div class="settings-btn-row">
        <button class="settings-btn danger" id="set-clear-all">全てのデータを初期化</button>
      </div>
    </div>
    <div class="settings-ver">SCANNER + CAMERA v4.1 INTEGRATED</div>
  </div>
</div>

<div class="toast" id="toast"></div>
<div class="lb" id="lightbox" style="display:none">
  <div class="lb-hdr"><span class="lb-ttl">VIEWER</span><button class="btn-close" id="lb-close">×</button></div>
  <div class="lb-img"><img id="lb-img" src=""/></div>
  <div class="lb-ftr">
    <button class="btn-dl" id="lb-dl">本体保存</button>
    <button class="btn-del" id="lb-del">削除</button>
  </div>
</div>

<script src="state.js"></script>
<script src="utils.js"></script>
<script src="storage.js"></script>
<script src="scanner.js"></script>
<script src="camera.js"></script>
<script src="photos.js"></script>
<script src="main.js"></script>
</body>
</html>""",

    # 2. style.css (サイバーパンクテーマ + 比率ボタン追加)
    "style.css": """@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');
:root { --accent: #00d4ff; --bg: #0a0c0f; --card: #0d1117; --border: #1e2a38; --text: #e0e8f0; --subtext: #4a6a8a; }
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
body { background: var(--bg); color: var(--text); font-family: 'Rajdhani', sans-serif; height: 100dvh; overflow: hidden; }
#app { height: 100%; display: flex; flex-direction: column; }
.hdr { display: flex; align-items: center; padding: 10px 15px; background: var(--card); border-bottom: 1px solid var(--border); }
.hdr-title { font-size: 15px; font-weight: 700; letter-spacing: 2px; }
.hdr-sub { font-size: 8px; color: var(--subtext); font-family: 'Share Tech Mono'; letter-spacing: 1px; }
.hdr-count { margin-left: auto; font-family: 'Share Tech Mono'; font-size: 10px; color: var(--accent); background: rgba(0,212,255,0.1); padding: 4px 8px; border: 1px solid var(--border); }
.tabs { display: flex; background: var(--card); border-bottom: 1px solid var(--border); }
.tab { flex: 1; padding: 12px 2px; background: none; border: none; color: var(--subtext); font-size: 10px; font-weight: 700; border-bottom: 2px solid transparent; }
.tab.on { color: var(--accent); border-bottom-color: var(--accent); background: rgba(0,212,255,0.05); }
.page { flex: 1; display: none; overflow: hidden; flex-direction: column; }
.page.on { display: flex; }
.group-bar { padding: 8px 15px; background: var(--card); border-bottom: 1px solid var(--border); align-items: center; gap: 10px; }
.group-lbl { font-size: 10px; color: var(--subtext); font-family: 'Share Tech Mono'; }
.group-select { flex: 1; background: #000; border: 1px solid var(--border); color: var(--accent); padding: 4px; font-family: 'Rajdhani'; font-weight: 700; }
.vf { flex: 1; background: #000; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.vf video { width: 100%; height: 100%; object-fit: cover; }
.ratio-row { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px; background: var(--card); border-top: 1px solid var(--border); }
.ratio-lbl { font-family: 'Share Tech Mono'; font-size: 10px; color: var(--subtext); margin-right: 5px; }
.ratio-btn { padding: 4px 10px; background: #1a1f26; border: 1px solid var(--border); color: var(--subtext); font-size: 10px; font-weight: 700; cursor: pointer; border-radius: 2px; }
.ratio-btn.on { border-color: var(--accent); color: var(--accent); background: rgba(0,212,255,0.1); }
.cam-controls { padding: 15px 10px calc(20px + env(safe-area-inset-bottom)); background: var(--card); }
.btn-row { display: flex; justify-content: space-around; align-items: center; }
.btn-sub { width: 46px; height: 46px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 18px; }
.btn-shutter { width: 74px; height: 74px; border-radius: 50%; background: #fff; border: 6px solid rgba(255,255,255,0.2); }
.btn-shutter:active { transform: scale(0.9); }
.scan-top { flex: 1; padding: 10px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.finder { flex: 1; border: 1px solid var(--border); position: relative; background: #000; }
.scan-line { position: absolute; left: 0; right: 0; height: 1px; background: var(--accent); box-shadow: 0 0 8px var(--accent); top: 20%; animation: scan 2s infinite ease-in-out; }
@keyframes scan { 0%,100% { top: 15%; } 50% { top: 85%; } }
.btn-main { padding: 12px; background: var(--accent); color: #000; border: none; font-weight: 700; letter-spacing: 2px; cursor: pointer; }
.scan-bc-section { height: 160px; background: #05070a; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: center; padding: 10px; text-align: center; }
.warp-cam-btn { width: 100%; padding: 10px; background: var(--accent); color: #000; border: none; font-weight: 700; margin-bottom: 8px; cursor: pointer; }
.list { padding: 10px; overflow-y: auto; flex: 1; }
.photo-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; overflow-y: auto; }
.photo-item { aspect-ratio: 1; background: #111; overflow: hidden; }
.toast { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: var(--accent); color: #000; padding: 8px 20px; font-weight: 700; opacity: 0; transition: 0.3s; pointer-events: none; }
.toast.show { opacity: 1; }""",

    # 3. state.js (状態管理、アスペクト比の追加)
    "state.js": """const state = {
  currentTab: 'scan',
  bcHistory: [],
  photos: [],
  groups: ['General', 'Stock', 'Shipping'],
  activeGroup: 'General',
  aspectRatio: '16/9', // '4/3', '16/9', '21/9'
  vibration: true,
  isScanning: false,
  facingMode: 'environment',
  torch: false,
  maxPhotos: 100
};""",

    # 4. storage.js (保存ロジック)
    "storage.js": """const storage = {
  key: 'scanner_camera_ultimate_v41',
  save() {
    const data = {
      bcHistory: state.bcHistory,
      photos: state.photos,
      groups: state.groups,
      aspectRatio: state.aspectRatio,
      vibration: state.vibration
    };
    localStorage.setItem(this.key, JSON.stringify(data));
  },
  load() {
    const raw = localStorage.getItem(this.key);
    if (raw) {
      const d = JSON.parse(raw);
      state.bcHistory = d.bcHistory || [];
      state.photos = d.photos || [];
      state.groups = d.groups || ['General', 'Stock', 'Shipping'];
      state.aspectRatio = d.aspectRatio || '16/9';
      state.vibration = (d.vibration !== undefined) ? d.vibration : true;
    }
  },
  clear() {
    localStorage.removeItem(this.key);
    location.reload();
  }
};""",

    # 5. utils.js
    "utils.js": """const utils = {
  getTimestamp() {
    const now = new Date();
    return now.toLocaleString('ja-JP');
  },
  vibrate(ms = 50) {
    if (state.vibration && navigator.vibrate) navigator.vibrate(ms);
  }
};""",

    # 6. camera.js (統合機能：比率計算 & クロップ保存)
    "camera.js": """const camera = {
  stream: null,
  videoEl: null,

  async start() {
    this.stop();
    this.videoEl = document.getElementById('cam-video');
    
    // 比率に応じた Constraints
    const ratio = this.getRatioNumber(state.aspectRatio);
    const constraints = {
      video: {
        facingMode: state.facingMode,
        aspectRatio: { ideal: ratio },
        width: { ideal: 1920 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoEl.srcObject = this.stream;
    } catch (err) {
      console.error(err);
      showToast("カメラを起動できません", "err");
    }
  },

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  },

  getRatioNumber(str) {
    const [w, h] = str.split('/').map(Number);
    return w / h;
  },

  async takePhoto() {
    if (!this.videoEl || !this.stream) return;

    const video = this.videoEl;
    const canvas = document.createElement('canvas');
    
    // 現在のプレビューの比率
    const [targetW, targetH] = state.aspectRatio.split('/').map(Number);
    const targetRatio = targetW / targetH;

    // ビデオ本来のサイズ
    const vW = video.videoWidth;
    const vH = video.videoHeight;
    const vRatio = vW / vH;

    let sw, sh, sx, sy;

    // 中央クロップの計算 (プレビューで見えている範囲を切り抜く)
    if (vRatio > targetRatio) {
      sh = vH;
      sw = vH * targetRatio;
      sx = (vW - sw) / 2;
      sy = 0;
    } else {
      sw = vW;
      sh = vW / targetRatio;
      sx = 0;
      sy = (vH - sh) / 2;
    }

    // 高品質な保存のため適度なサイズに調整 (例: 幅1280px基準)
    const scale = 1280 / sw;
    canvas.width = 1280;
    canvas.height = 1280 / targetRatio;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    
    const photoEntry = {
      id: Date.now(),
      src: dataUrl,
      time: utils.getTimestamp(),
      group: state.activeGroup,
      ratio: state.aspectRatio
    };

    state.photos.unshift(photoEntry);
    if (state.photos.length > state.maxPhotos) state.photos.pop();

    storage.save();
    ui.updatePhotoGrid();
    ui.updateCounts();
    utils.vibrate(60);
    showToast("写真を保存しました");
    
    // フラッシュエフェクト
    const flash = document.getElementById('flash');
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 100);
  }
};""",

    # 7. scanner.js (バーコードスキャンロジック)
    "scanner.js": """const scanner = {
  videoEl: null,
  active: false,

  async start() {
    this.videoEl = document.getElementById('scan-video');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      this.videoEl.srcObject = stream;
      this.active = true;
      state.isScanning = true;
      ui.updateScanUI();
      // 注: 実際のデコードにはBarcodeDetector API等が必要
    } catch (err) {
      showToast("スキャナーを起動できません");
    }
  },

  stop() {
    if (this.videoEl && this.videoEl.srcObject) {
      this.videoEl.srcObject.getTracks().forEach(t => t.stop());
    }
    this.active = false;
    state.isScanning = false;
    ui.updateScanUI();
  }
};""",

    # 8. photos.js (ギャラリー・結合ロジック)
    "photos.js": """const photos = {
  async clearAll() {
    if (confirm("全ての写真を削除しますか？")) {
      state.photos = [];
      storage.save();
      ui.updatePhotoGrid();
    }
  }
};""",

    # 9. main.js (全体の統括)
    "main.js": """document.addEventListener('DOMContentLoaded', () => {
  storage.load();
  ui.init();

  // タブ切り替え
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => ui.switchTab(btn.dataset.tab));
  });

  // カメラ操作
  document.getElementById('btn-shutter').addEventListener('click', () => camera.takePhoto());
  document.getElementById('btn-cam-switch').addEventListener('click', () => {
    state.facingMode = (state.facingMode === 'user') ? 'environment' : 'user';
    camera.start();
  });

  // 比率切り替え
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      state.aspectRatio = btn.dataset.ratio;
      camera.start(); // 比率を変えてカメラ再起動
    });
  });

  // スキャナー操作
  document.getElementById('btn-scan').addEventListener('click', () => {
    if (!state.isScanning) scanner.start();
    else scanner.stop();
  });

  document.getElementById('btn-warp-cam').addEventListener('click', () => ui.switchTab('camera'));
  document.getElementById('btn-goto-scan').addEventListener('click', () => ui.switchTab('scan'));
  
  // 設定
  document.getElementById('set-clear-all').addEventListener('click', () => storage.clear());
});

const ui = {
  init() {
    this.updateGroupSelects();
    this.updateCounts();
    this.updatePhotoGrid();
    this.renderHistory();
    // 初期のアスペクト比ボタン設定
    document.querySelectorAll('.ratio-btn').forEach(btn => {
      if(btn.dataset.ratio === state.aspectRatio) btn.classList.add('on');
      else btn.classList.remove('on');
    });
  },

  switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === `pg-${tab}`));

    if (tab === 'camera') {
      camera.start();
      scanner.stop();
    } else if (tab === 'scan') {
      scanner.start();
      camera.stop();
    } else {
      camera.stop();
      scanner.stop();
    }
  },

  updateCounts() {
    document.getElementById('hdr-count').textContent = `${state.bcHistory.length}BC / ${state.photos.length}📷`;
    document.getElementById('photo-count-txt').textContent = `${state.photos.length} 枚`;
  },

  updateGroupSelects() {
    const selects = ['scan-group-select', 'cam-group-select'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = state.groups.map(g => `<option value="${g}">${g}</option>`).join('');
      el.value = state.activeGroup;
      el.onchange = (e) => { state.activeGroup = e.target.value; };
    });
  },

  updatePhotoGrid() {
    const grid = document.getElementById('photo-grid');
    if (!grid) return;
    grid.innerHTML = state.photos.map(p => `
      <div class="photo-item" onclick="ui.openLightbox('${p.src}')">
        <img src="${p.src}" style="width:100%; height:100%; object-fit:cover;">
      </div>
    `).join('');
  },

  updateScanUI() {
    const btn = document.getElementById('btn-scan');
    btn.textContent = state.isScanning ? "■ スキャン停止" : "▶ スキャン開始";
    btn.style.background = state.isScanning ? "#ff4466" : var(--accent);
    document.getElementById('scan-ph').style.display = state.isScanning ? 'none' : 'flex';
  },

  renderHistory() {
    const list = document.getElementById('bc-list');
    if (!list) return;
    list.innerHTML = state.bcHistory.length ? '' : '<p style="text-align:center; padding:40px; color:var(--subtext);">履歴はありません</p>';
    state.bcHistory.forEach(item => {
      const card = document.createElement('div');
      card.className = 'bc-card';
      card.style.background = 'var(--card)';
      card.style.border = '1px solid var(--border)';
      card.style.padding = '10px';
      card.style.marginBottom = '8px';
      card.innerHTML = `<div style="font-weight:700;">${item.value}</div><div style="font-size:10px; color:var(--subtext);">${item.time} [${item.group}]</div>`;
      list.appendChild(card);
    });
  },

  openLightbox(src) {
    const lb = document.getElementById('lightbox');
    document.getElementById('lb-img').src = src;
    lb.style.display = 'flex';
    document.getElementById('lb-close').onclick = () => lb.style.display = 'none';
  }
};

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}"""
}

# ---------------------------------------------------------
# ZIP生成実行
# ---------------------------------------------------------

zip_name = "scanner_camera_v4_1_ultimate.zip"
with zipfile.ZipFile(zip_name, 'w') as zipf:
    for file_name, content in files.items():
        zipf.writestr(file_name, content)

print(f"Complete project ZIP created: {zip_name}")