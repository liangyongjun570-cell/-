Component({
  data: {
    selected: 0,
    theme: 'light',
    list: [
      { path: '/pages/index/index', text: '首页', img: 's26' },
      { path: '/pages/chapters/chapters', text: '章节', img: 's27' },
      { path: '/pages/lab/lab', text: '实验室', img: 's30' },
      { path: '/pages/formulas/formulas', text: '公式', img: 's32' },
      { path: '/pages/me/me', text: '我的', img: 's31' },
    ],
  },
  methods: {
    onTap(e) {
      const idx = e.currentTarget.dataset.idx;
      const item = this.data.list[idx];
      if (idx === this.data.selected) return;
      // 手动点 tabbar 切走：跨 tab 来源随之作废，别让目标页挂着「返回xx」
      try {
        const app = getApp();
        if (app && app.globalData) app.globalData.back = null;
      } catch (err) {}
      wx.switchTab({ url: item.path });
    },
  },
});
