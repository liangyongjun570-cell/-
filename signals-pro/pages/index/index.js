const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const S = require('../../utils/search');
const T = require('../../data/theme');
const util = require('../../utils/util');
const F = require('../../data/formulas');

const WK = ['日', '一', '二', '三', '四', '五', '六'];
// 题量随题库增长自动跟随，避免"再多写 100 道题、首页还写 30 题"
const QN = D.questions.length;

Page({
  data: {
    theme: 'light',
    greeting: '',
    dateText: '',
    account: '',
    isGuest: true,
    // 跨 tab 跳进来的来源（null = 不显示返回条）
    back: null,
    overall: { done: 0, total: 66, percent: 0, chaptersDone: 0, chaptersTotal: 8 },
    stats: { topics: 36, learnedTopics: 0, formulas: 28, learnedFormulas: 0, wrong: 0, fav: 0 },
    qn: QN,
    next: null,
    recent: [],
    slides: T.slides,
    slide: 0,
    tip: '',
    map: [
      { k: '时域', name: '时域分析', color: 'mint', desc: '不换域，直接算', items: [
        { t: '信号的时域分析', id: 'ch2' }, { t: '系统的时域分析', id: 'ch3' },
      ] },
      { k: '频域', name: '频域分析', color: 'blue', desc: '看由哪些频率组成', items: [
        { t: '周期信号（CFS）', id: 'ch4' }, { t: '非周期信号（FT）', id: 'ch5' }, { t: '系统的频域分析', id: 'ch6' },
      ] },
      { k: '复频域', name: '复频域分析', color: 'violet', desc: '极点决定稳定性', items: [
        { t: '拉普拉斯 / Z 变换', id: 'ch7' },
      ] },
    ],
    transforms: [
      { t: 'FT', name: '傅里叶', id: 'f18' },
      { t: 'LT', name: '拉普拉斯', id: 'f26' },
      { t: 'ZT', name: 'Z 变换', id: 'f02' },
    ],
    quick: [
      { k: 'formulas', t: '公式库', d: '28 条', icon: '∫', color: 'coral', img: 's32' },
      { k: 'fav', t: '我的收藏', d: '', icon: '★', color: 'butter', img: 's31' },
      { k: 'progress', t: '学习进度', d: '', icon: '◎', color: 'mint', img: 's28' },
      { k: 'tutor', t: '智能助教', d: '离线', icon: '?', color: 'blue', img: 's29' },
      { k: 'quiz', t: '智能题库', d: QN + ' 题', icon: '✓', color: 'violet', img: 's25' },
      { k: 'lab', t: '仿真实验室', d: '4 个', icon: '∿', color: 'pink', img: 's30' },
    ],
    // 搜索
    searchOpen: false,
    q: '',
    searching: false,
    results: [],
    counts: { all: 0, chapter: 0, topic: 0, formula: 0, example: 0 },
    typeFilter: 'all',
    searches: [],
    recommend: S.RECOMMEND,
    sampleQueries: S.EXAMPLES,
    // 公式弹层
    sheet: null,
  },

  onLoad() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    const d = new Date();
    this.setData({
      greeting: util.greeting(),
      dateText: d.getMonth() + 1 + '月' + d.getDate() + '日 周' + WK[d.getDay()],
      tip: T.tips[d.getDate() % T.tips.length],
    });
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    util.setTabBar(this, 0, theme);
    // 从章节「搜索」这类跨 tab 入口过来时，顶部给一条回原 tab 的路。
    // 读完立刻清：源页 onHide 会先于本页 onShow 触发，清理放 onHide 会误删
    this.setData({ back: util.backInfo() });
    util.clearBack();
    this.refresh();
    const ctx = app.globalData.ctx;
    if (ctx && ctx.openSearch) {
      app.globalData.ctx = null;
      this.openSearch();
    }
  },

  goBackTab() {
    util.goBackTab();
  },

  onHide() {
    if (this.data.back) this.setData({ back: null });
    this.setData({ slide: this.data.slide });
  },

  refresh() {
    const acc = app.account();
    store.markVisit(acc);
    const data = store.load(acc);
    const overall = D.overall(data.learned);
    const nx = D.nextTopic(data.learned);
    const recent = (data.records || []).slice(0, 3).map((r) => {
      const learnedFlag =
        (r.type === 'topic' && data.learned.topics.indexOf(r.id) >= 0) ||
        (r.type === 'formula' && data.learned.formulas.indexOf(r.id) >= 0) ||
        (r.type === 'example' && data.learned.examples.indexOf(r.id) >= 0);
      return Object.assign({}, r, {
        icon: r.type === 'topic' ? '知' : r.type === 'formula' ? '式' : '例',
        dateText: util.dateLabel(r.date),
        learned: learnedFlag,
      });
    });

    this.setData({
      account: acc === store.GUEST ? '游客' : acc,
      isGuest: acc === store.GUEST,
      overall,
      stats: {
        topics: 36,
        learnedTopics: data.learned.topics.length,
        formulas: 28,
        learnedFormulas: data.learned.formulas.length,
        wrong: data.wrong.length,
        fav: data.fav.formulas.length + data.fav.courses.length,
      },
      next: nx
        ? {
          id: nx.topic.id,
          chId: nx.ch.id,
          name: nx.topic.name,
          chapter: nx.ch.name,
          chNum: nx.ch.num,
          minutes: nx.topic.minutes || 10,
          percent: D.chapterProgress(data.learned, nx.ch).percent,
        }
        : null,
      recent,
      searches: data.searches || [],
    });
  },

  gotoAccount() {
    if (this.data.isGuest) {
      wx.navigateTo({ url: '/pages/login/login' });
    } else {
      util.crossTab(4);
    }
  },

  // ---------- 搜索 ----------
  openSearch() {
    if (this.data.searchOpen) return;
    const acc = app.account();
    this.setData({ searchOpen: true, searches: store.load(acc).searches || [] });
  },

  closeSearch() {
    this.setData({ searchOpen: false, q: '', results: [], typeFilter: 'all', searching: false });
  },

  onInput(e) {
    const q = e.detail.value;
    this.setData({ q });
    this.runQuery(q, this.data.typeFilter, false);
  },

  runQuery(raw, type, record) {
    const q = String(raw || '');
    if (!q.trim()) {
      this.setData({ results: [], counts: { all: 0, chapter: 0, topic: 0, formula: 0, example: 0 }, searching: false });
      return;
    }
    const res = S.query(q);
    const list = S.filterByType(res.items, type).map((it) => ({
      key: it.type + '_' + it.id,
      type: it.type,
      id: it.id,
      title: it.title,
      ch: it.ch,
      chName: it.chName,
      typeLabel: S.TYPE_LABEL[it.type],
      icon: it.type === 'chapter' ? '章' : it.type === 'topic' ? '知' : it.type === 'formula' ? '式' : '例',
      summary: S.summaryOf(it),
    }));
    this.setData({ results: list, counts: res.counts, searching: true });
  },

  pickTerm(e) {
    const term = e.currentTarget.dataset.t;
    const acc = app.account();
    store.addSearch(acc, term);
    this.setData({ q: term, typeFilter: 'all', searching: true, searches: store.load(acc).searches });
    this.runQuery(term, 'all', true);
  },

  clearQ() {
    this.setData({ q: '', results: [], typeFilter: 'all', searching: false });
  },

  setType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ typeFilter: type });
    this.runQuery(this.data.q, type, false);
  },

  clearHistory() {
    const acc = app.account();
    store.clearSearches(acc);
    this.setData({ searches: [] });
  },

  tapResult(e) {
    const { type, id } = e.currentTarget.dataset;
    const acc = app.account();
    if (this.data.q) store.addSearch(acc, this.data.q);
    if (type === 'formula') {
      this.openFormula(id);
      return;
    }
    if (type === 'chapter') {
      wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + id });
      return;
    }
    if (type === 'topic') {
      wx.navigateTo({ url: '/pages/topic/topic?id=' + id });
      return;
    }
    if (type === 'example') {
      wx.navigateTo({ url: '/pages/chapter/chapter?chId=ch0&ex=' + id });
    }
  },

  // ---------- 公式弹层 ----------
  openFormula(id) {
    const f = F.find((x) => x.id === id);
    if (!f) return;
    const acc = app.account();
    const data = store.load(acc);
    store.addRecord(acc, { type: 'formula', id: f.id, name: f.name, ch: f.ch });
    this.setData({
      sheet: {
        id: f.id,
        name: f.name,
        ch: f.ch,
        chName: (D.chapters[f.ch] || {}).name || '',
        cat: f.cat,
        math: f.math,
        desc: f.desc,
        cond: f.cond,
        tip: f.tip,
        text: f.text,
        latex: f.latex,
        matlab: f.matlab,
        python: f.python,
        learned: data.learned.formulas.indexOf(f.id) >= 0,
        fav: data.fav.formulas.indexOf(f.id) >= 0,
      },
    });
  },

  closeSheet() {
    this.setData({ sheet: null });
    this.refresh();
  },

  markLearned() {
    if (!this.data.sheet) return;
    const acc = app.account();
    store.setLearned(acc, 'formulas', this.data.sheet.id, true);
    util.vibrate();
    wx.showToast({ title: '已记录学习进度', icon: 'success' });
    this.setData({ 'sheet.learned': true });
    this.refresh();
  },

  toggleFav() {
    if (!this.data.sheet) return;
    const acc = app.account();
    const added = store.toggleFavFormula(acc, this.data.sheet.id);
    this.setData({ 'sheet.fav': added });
    wx.showToast({ title: added ? '已收藏' : '已取消收藏', icon: 'none' });
  },

  copy(e) {
    const kind = e.currentTarget.dataset.kind;
    const s = this.data.sheet;
    if (!s) return;
    let txt = s.text;
    if (kind === 'latex') txt = s.latex;
    if (kind === 'matlab') txt = s.matlab;
    if (kind === 'python') txt = s.python;
    wx.setClipboardData({
      data: txt,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'none' }),
    });
  },

  // ---------- 推荐轮播 ----------
  onSlide(e) {
    this.setData({ slide: e.detail.current });
  },

  tapSlide(e) {
    const i = Number(e.currentTarget.dataset.i);
    const s = T.slides[i];
    if (!s) return;
    if (s.link.type === 'lab') {
      app.globalData.ctx = { labTab: s.link.tab || 0 };
      util.crossTab(2, { hint: '按章节实验' });
    } else if (s.link.type === 'formula') {
      this.openFormula(s.link.id);
    } else if (s.link.type === 'topic') {
      wx.navigateTo({ url: '/pages/topic/topic?id=' + s.link.id });
    }
  },

  // ---------- 入口跳转 ----------
  // 跨 tab 一律走 util.crossTab：switchTab 没有返回栈，靠它留一条回去的路
  quick(e) {
    const k = e.currentTarget.dataset.k;
    if (k === 'formulas') return util.crossTab(3);
    if (k === 'fav') {
      app.globalData.ctx = { favOnly: true };
      return util.crossTab(3, { hint: '只看收藏' });
    }
    if (k === 'progress') return util.crossTab(1);
    if (k === 'tutor') return wx.navigateTo({ url: '/pages/tutor/tutor' });
    if (k === 'quiz') return wx.navigateTo({ url: '/pages/quiz/quiz' });
    if (k === 'lab') return util.crossTab(2);
  },

  openChapter(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + id });
  },

  tapFormula(e) {
    const id = e.currentTarget.dataset.id;
    this.openFormula(id);
  },

  openTopic(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (id === 'next' && this.data.next) {
      wx.navigateTo({ url: '/pages/topic/topic?id=' + this.data.next.id });
      return;
    }
    wx.navigateTo({ url: '/pages/topic/topic?id=' + id });
  },

  openRecord(e) {
    const { type, id } = e.currentTarget.dataset;
    if (type === 'formula') return this.openFormula(id);
    if (type === 'example') return wx.navigateTo({ url: '/pages/chapter/chapter?chId=ch0&ex=' + id });
    wx.navigateTo({ url: '/pages/topic/topic?id=' + id });
  },

  allRecords() {
    wx.navigateTo({ url: '/pages/records/records' });
  },

  onShareAppMessage() {
    return {
      title: '工程信号与系统 Pro：三大变换 + 4 个交互仿真实验室',
      path: '/pages/index/index',
    };
  },
});
