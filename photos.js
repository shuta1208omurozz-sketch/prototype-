const photos = {
  async clearAll() {
    if (confirm("全ての写真を削除しますか？")) {
      state.photos = [];
      storage.save();
      ui.updatePhotoGrid();
    }
  }
};