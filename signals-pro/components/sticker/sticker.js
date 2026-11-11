Component({
  properties: {
    name: { type: String, value: 's01' },
    size: { type: Number, value: 120 },
    radius: { type: Number, value: 26 },
    fit: { type: String, value: 'aspectFit' },
  },
  data: {
    src: '/assets/theme/s01.jpg',
  },
  observers: {
    name(v) {
      this.setData({ src: '/assets/theme/' + (v || 's01') + '.jpg' });
    },
  },
  lifetimes: {
    attached() {
      this.setData({ src: '/assets/theme/' + (this.data.name || 's01') + '.jpg' });
    },
  },
});
