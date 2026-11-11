const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');
const T = require('../../data/theme');

Page({
  data: {
    theme: 'light',
    all: [],
    groups: [],
    filter: 'all',
    filters: [
      { k: 'all', t: '全部' },
      { k: 'topic', t: '知识点' },
      { k: 'formula', t: '公式' },
      { k: 'example', t: '例题' },
    ],
    sticker: T.stickers.emptyRecords,
    counts: { all: 0, topic: 0, formula: 0, example: 0 },
  },

  onLoad() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    this.build();
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    this.build();
  },

  build() {
    const acc = app.account();
    const data = store.load(acc);
    const all = (data.records || []).map((r) => {
      let title = r.name;
      let sub = '';
      if (r.type === 'topic') {
        const t = D.getTopic(r.id);
        sub = t ? t.short || '' : '';
      } else if (r.type === 'formula') {
        const f = D.getFormula(r.id);
        sub = f ? f.cat : '';
      } else if (r.type === 'example') {
        sub = '章节例题';
      }
      return {
        key: r.key || r.type + ':' + r.id,
        type: r.type,
        id: r.id,
        name: title,
        sub,
        ch: r.ch,
        date: r.date,
        dateText: util.dateLabel(r.date),
        icon: r.type === 'topic' ? '知' : r.type === 'formula' ? '式' : '例',
      };
    });

    const counts = { all: all.length, topic: 0, formula: 0, example: 0 };
    all.forEach((r) => {
      counts[r.type] = (counts[r.type] || 0) + 1;
    });
    this.setData({
      all,
      counts,
      filters: [
        { k: 'all', t: '全部', n: counts.all },
        { k: 'topic', t: '知识点', n: counts.topic },
        { k: 'formula', t: '公式', n: counts.formula },
        { k: 'example', t: '例题', n: counts.example },
      ],
    });
    this.applyFilter(this.data.filter);
  },

  applyFilter(k) {
    const all = this.data.all;
    const list = k === 'all' ? all : all.filter((r) => r.type === k);
    // 按日期分组
    const order = [];
    const map = {};
    list.forEach((r) => {
      if (!map[r.date]) {
        map[r.date] = { date: r.date, label: r.dateText, items: [] };
        order.push(r.date);
      }
      map[r.date].items.push(r);
    });
    const groups = order.map((d) => map[d]);
    this.setData({ groups, filter: k });
  },

  setFilter(e) {
    this.applyFilter(e.currentTarget.dataset.k);
  },

  open(e) {
    const { type, id } = e.currentTarget.dataset;
    if (type === 'formula') {
      const f = D.getFormula(id);
      if (!f) return;
      wx.navigateTo({ url: '/pages/chapter/chapter?chId=ch' + f.ch + '&tab=formulas' });
      return;
    }
    if (type === 'example') {
      wx.navigateTo({ url: '/pages/chapter/chapter?chId=ch0&ex=' + id });
      return;
    }
    wx.navigateTo({ url: '/pages/topic/topic?id=' + id });
  },

  goChapters() {
    util.crossTab(1);
  },

  clear() {
    if (!this.data.all.length) return;
    wx.showModal({
      title: '清空学习记录',
      content: '只清除足迹列表，已学标记、收藏与笔记都会保留。',
      confirmText: '清空',
      confirmColor: '#F2694B',
      success: (res) => {
        if (!res.confirm) return;
        const acc = app.account();
        store.update(acc, (d) => {
          d.records = [];
          return d;
        });
        util.toast('记录已清空');
        this.build();
      },
    });
  },

  onShareAppMessage() {
    return { title: '信号与系统 · 学习记录', path: '/pages/records/records' };
  },
});
