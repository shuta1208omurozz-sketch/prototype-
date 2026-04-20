const state = {
  aspectRatio: 16/9,
  photos: JSON.parse(localStorage.getItem('sc_photos') || '[]'),
  bcHistory: JSON.parse(localStorage.getItem('sc_bcs') || '[]'),
  camStream: null
};

// 初期化
window.onload = () => {
  initTabs();
  startCamera();
  renderPhotos();
  renderBcList();
  updateCount();

  document.getElementById('btn-shutter').onclick = takePhoto;
  document.querySelectorAll('.ratio-btn').forEach(btn => {
    btn.onclick = () => {
      const r = btn.dataset.ratio.split('/');
      state.aspectRatio = r[0] / r[1];
      document.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('on', b === btn));
      startCamera(); // カメラ再起動
    };
  });
};

async function startCamera() {
  if (state.camStream) state.camStream.getTracks().forEach(t => t.stop());
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', aspectRatio: { ideal: state.aspectRatio } }
    });
    state.camStream = stream;
    document.getElementById('cam-video').srcObject = stream;
  } catch (e) {
    showToast("カメラの起動に失敗しました");
  }
}

function takePhoto() {
  const video = document.getElementById('cam-video');
  const canvas = document.createElement('canvas');
  const w = video.videoWidth;
  const h = w / state.aspectRatio;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const sy = (video.videoHeight - h) / 2;
  ctx.drawImage(video, 0, sy, w, h, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  state.photos.unshift({ id: Date.now(), src: dataUrl });
  localStorage.setItem('sc_photos', JSON.stringify(state.photos));
  renderPhotos();
  updateCount();
  showToast("SAVED");
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab, .page').forEach(el => el.classList.remove('on'));
      tab.classList.add('on');
      document.getElementById(`pg-${tab.dataset.tab}`).classList.add('on');
    };
  });
}

function renderPhotos() {
  const grid = document.getElementById('photo-grid');
  grid.innerHTML = state.photos.map(p => `<div class="photo-item"><img src="${p.src}" onclick="openLightbox('${p.src}')"></div>`).join('');
}

function renderBcList() {
  const list = document.getElementById('bc-list');
  list.innerHTML = state.bcHistory.map(b => `<div style="padding:10px; border-bottom:1px solid var(--border)">${b.value}</div>`).join('');
}

function updateCount() {
  document.getElementById('hdr-count').textContent = `${state.bcHistory.length} BC / ${state.photos.length} 📷`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lb-img').src = src;
  lb.style.display = 'flex';
  document.getElementById('lb-close').onclick = () => lb.style.display = 'none';
}
