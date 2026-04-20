const utils = {
  getTimestamp() {
    const now = new Date();
    return now.toLocaleString('ja-JP');
  },
  vibrate(ms = 50) {
    if (state.vibration && navigator.vibrate) navigator.vibrate(ms);
  }
};