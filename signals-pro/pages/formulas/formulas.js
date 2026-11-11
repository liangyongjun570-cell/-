const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');

Page({
  data: {
    theme: 'light',
    all: [],
    list: [],
    q: '',
    cat: '全部',
    ch: '全部',
    favOnly: false,
    cats: [],
    chs: [],
    counts: { total: 28, fav: 0, learned: 0 },
    sheet: null,
    filterOpen: false,
    // 从别的 tab 跳进来时的返回条（null = 不显示）
    back: null,
  },

  onLoad() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    const cats = ['全部'];
    D.formulas.forEach((f) => {
      if (cats.indexOf(f.cat) < 0) cats.push(f.cat);
    });
    const chs = [{ k: '全部', t: '全部章节' }];
    D.chapters.forEach((c) => chs.push({ k: c.num, t: 'ch' + c.num + ' ' + c.name }));
    this.setData({ cats, chs });
    this.build();
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    util.setTabBar(this, 3, theme);
    const ctx = app.globalData.ctx;
    if (ctx && ctx.favOnly) {
      this.setData({ favOnly: true });
      app.globalData.ctx = null;
    }
    // 「我的 → 收藏」这类跨 tab 跳转会留一条来源，顶部据此显示返回条。
    // 读完立刻清：来源只对这一次进入有效。不能放到 onHide 清——wx.switchTab 的
    // 顺序是「源页 onHide -> 本页 onShow」，放 onHide 会在本页读到之前就被删掉。
    this.setData({ back: util.backInfo() });
    util.clearBack();
    this.build();
  },

  // 切走时清掉本页显示的返回条，避免下次直接进 tab 时残留
  onHide() {
    if (this.data.back) this.setData({ back: null });
  },

  goMatchGame() {
    wx.navigateTo({ url: '/pages/match/match' });
  },

  goBackTab() {
    util.goBackTab();
  },

  build() {
    const acc = app.account();
    const data = store.load(acc);
    const all = D.formulas.map((f) => ({
      id: f.id,
      ch: f.ch,
      name: f.name,
      cat: f.cat,
      math: f.math,
      desc: f.desc,
      text: f.text,
      latex: f.latex,
      cond: f.cond,
      tip: f.tip,
      matlab: f.matlab,
      python: f.python,
      learned: data.learned.formulas.indexOf(f.id) >= 0,
      fav: data.fav.formulas.indexOf(f.id) >= 0,
    }));
    this.setData({
      all,
      counts: {
        total: all.length,
        fav: all.filter((f) => f.fav).length,
        learned: all.filter((f) => f.learned).length,
      },
    });
    this.filter();
  },

  filter() {
    const { all, cat, ch, favOnly, q } = this.data;
    const kw = String(q || '').trim().toLowerCase();
    const list = all.filter((f) => {
      if (cat !== '全部' && f.cat !== cat) return false;
      if (ch !== '全部' && Number(ch) !== f.ch) return false;
      if (favOnly && !f.fav) return false;
      if (kw) {
        const hay = (f.name + ' ' + f.cat + ' ' + f.desc + ' ' + f.text + ' ch' + f.ch).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    this.setData({ list });
  },

  onSearch(e) {
    this.setData({ q: e.detail.value });
    this.filter();
  },

  clearQ() {
    this.setData({ q: '' });
    this.filter();
  },

  toggleFilter() {
    this.setData({ filterOpen: !this.data.filterOpen });
  },

  setCat(e) {
    this.setData({ cat: e.currentTarget.dataset.v });
    this.filter();
  },

  setCh(e) {
    this.setData({ ch: e.currentTarget.dataset.v });
    this.filter();
  },

  toggleFavOnly() {
    this.setData({ favOnly: !this.data.favOnly });
    this.filter();
  },

  resetFilter() {
    this.setData({ cat: '全部', ch: '全部', favOnly: false, q: '' });
    this.filter();
  },

  open(e) {
    const id = e.currentTarget.dataset.id;
    const f = this.data.all.find((x) => x.id === id);
    if (!f) return;
    const acc = app.account();
    store.addRecord(acc, { type: 'formula', id: f.id, name: f.name, ch: f.ch });
    this.setData({
      sheet: Object.assign({}, f, {
        chName: (D.chapters[f.ch] || {}).name || '',
      }),
    });
  },

  close() {
    this.setData({ sheet: null });
  },

  toggleFav(e) {
    const id = e.currentTarget.dataset.id;
    const acc = app.account();
    const added = store.toggleFavFormula(acc, id);
    util.vibrate();
    util.toast(added ? '已收藏' : '已取消收藏');
    if (this.data.sheet && this.data.sheet.id === id) this.setData({ 'sheet.fav': added });
    this.build();
  },

  markLearned() {
    if (!this.data.sheet) return;
    const acc = app.account();
    store.setLearned(acc, 'formulas', this.data.sheet.id, true);
    util.vibrate();
    util.toast('已记录学习进度');
    this.setData({ 'sheet.learned': true });
    this.build();
  },

  copy(e) {
    const kind = e.currentTarget.dataset.kind;
    const s = this.data.sheet;
    if (!s) return;
    let txt = s.text;
    if (kind === 'latex') txt = s.latex;
    if (kind === 'matlab') txt = s.matlab;
    if (kind === 'python') txt = s.python;
    wx.setClipboardData({ data: txt, success: () => util.toast('已复制到剪贴板') });
  },

  copyAll() {
    const s = this.data.sheet;
    if (!s) return;
    const txt = [
      s.name,
      '【公式】' + s.text,
      '【LaTeX】' + s.latex,
      '【MATLAB】' + s.matlab,
      '【Python】' + s.python,
      '【条件】' + s.cond,
    ].join('\n');
    wx.setClipboardData({ data: txt, success: () => util.toast('四段内容已一起复制') });
  },

  goChapter() {
    if (!this.data.sheet) return;
    const ch = D.chapters[this.data.sheet.ch];
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + ch.id });
  },

  onShareAppMessage() {
    return { title: '信号与系统 · 公式库', path: '/pages/formulas/formulas' };
  },
});
