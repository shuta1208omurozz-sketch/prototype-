const camera = {
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
};