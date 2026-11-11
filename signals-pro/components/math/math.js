const { parse } = require('../../utils/math');

Component({
  properties: {
    src: { type: String, value: '', observer: 'render' },
    size: { type: Number, value: 34 },
    block: { type: Boolean, value: false },
  },
  data: {
    tokens: [],
  },
  lifetimes: {
    attached() {
      this.render(this.data.src);
    },
  },
  methods: {
    render(src) {
      let tokens = [];
      try {
        tokens = parse(src || '');
      } catch (e) {
        tokens = [{ t: 't', v: String(src || '') }];
      }
      tokens = tokens.map((tk, i) => Object.assign({ k: 'k' + i }, tk));
      this.setData({ tokens });
    },
  },
});
