document.addEventListener('DOMContentLoaded', () => {
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
}