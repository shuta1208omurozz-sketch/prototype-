const scanner = {
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
};