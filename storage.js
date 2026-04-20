const storage = {
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
};