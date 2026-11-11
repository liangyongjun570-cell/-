const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');

Page({
  data: {
    theme: 'light',
    ch: null,
    progress: null,
    tabs: [
      { k: 'overview', t: '概览' },
      { k: 'topics', t: '知识专题' },
      { k: 'formulas', t: '本章公式' },
      { k: 'practice', t: '例题自测' },
    ],
    tab: 'overview',
    topics: [],
    formulas: [],
    examples: [],
    threeCols: [],
    isCh0: false,
    prev: null,
    next: null,
    sheet: null,
  },

  onLoad(q) {
    const id = q.chId || 'ch0';
    const ch = D.getChapter(id);
    if (!ch) {
      util.toast('章节不存在');
      wx.navigateBack();
      return;
    }
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);

    wx.setNavigationBarTitle({ title: 'ch' + ch.num + ' · ' + ch.name });

    const i = D.chapters.findIndex((c) => c.id === id);
    const prev = i > 0 ? D.chapters[i - 1] : null;
    const next = i < D.chapters.length - 1 ? D.chapters[i + 1] : null;

    const isCh0 = ch.num === 0;
    const threeCols = isCh0
      ? [
        { k: 'transform', t: '三大变换', d: '变换域工具', items: ch.topics.filter((t) => t.kind === 'transform') },
        { k: 'analysis', t: '五大分析', d: '分析视角', items: ch.topics.filter((t) => t.kind === 'analysis') },
        { k: 'example', t: '章节例题', d: '五道精讲', items: ch.examples || [] },
      ]
      : [];

    this.setData({
      ch,
      isCh0,
      threeCols,
      prev: prev ? { id: prev.id, num: prev.num, name: prev.name } : null,
      next: next ? { id: next.id, num: next.num, name: next.name } : null,
      tab: q.tab || 'overview',
    });

    if (q.ex) {
      this.setData({ tab: 'practice' });
      setTimeout(() => this.openExample(q.ex), 260);
    }

    this.refresh();
  },

  onShow() {
    if (!this.data.ch) return;
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    this.refresh();
  },

  refresh() {
    const ch = this.data.ch;
    if (!ch) return;
    const acc = app.account();
    const data = store.load(acc);
    const learned = data.learned;

    const topics = (ch.topics || []).map((t) => ({
      id: t.id,
      name: t.name,
      short: t.short || '',
      minutes: t.minutes || 10,
      kind: t.kind || 'topic',
      abbr: t.abbr || '',
      intro: t.intro || t.desc || '',
      formulaCount: (t.formulas || []).length,
      learned: learned.topics.indexOf(t.id) >= 0,
    }));

    const formulas = D.formulasOfChapter(ch.num).map((f) => ({
      id: f.id,
      name: f.name,
      cat: f.cat,
      math: f.math,
      learned: learned.formulas.indexOf(f.id) >= 0,
      fav: data.fav.formulas.indexOf(f.id) >= 0,
    }));

    const examples = (ch.examples || []).map((e) => ({
      id: e.id,
      no: e.no,
      title: e.title,
      tag: e.tag,
      stem: e.stem,
      learned: learned.examples.indexOf(e.id) >= 0,
    }));

    this.setData({
      topics,
      formulas,
      examples,
      progress: D.chapterProgress(learned, ch),
      noteCount: Object.keys(data.notes || {}).length,
    });
  },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.k });
  },

  openTopic(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/topic/topic?id=' + id });
  },

  // ch0 三栏：专题跳专题页，例题开弹层
  tapThree(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (id.indexOf('ch0-e') === 0) {
      this.openExample(id);
      return;
    }
    wx.navigateTo({ url: '/pages/topic/topic?id=' + id });
  },

  // ch0 例题是老结构：用弹层讲，避免再开一页
  openExample(e) {
    const id = typeof e === 'string' ? e : e.currentTarget.dataset.id;
    const ex = (this.data.ch.examples || []).find((x) => x.id === id);
    if (!ex) return;
    const acc = app.account();
    store.addRecord(acc, { type: 'example', id: ex.id, name: ex.title, ch: this.data.ch.num });
    const data = store.load(acc);
    this.setData({
      sheet: Object.assign({}, ex, {
        chName: this.data.ch.name,
        learned: data.learned.examples.indexOf(ex.id) >= 0,
      }),
    });
  },

  closeSheet() {
    this.setData({ sheet: null });
    this.refresh();
  },

  markExample() {
    if (!this.data.sheet) return;
    const acc = app.account();
    store.setLearned(acc, 'examples', this.data.sheet.id, true);
    util.vibrate();
    util.toast('已标记为已学');
    this.setData({ 'sheet.learned': true });
    this.refresh();
  },

  openFormula(e) {
    const id = e.currentTarget.dataset.id;
    const f = D.getFormula(id);
    if (!f) return;
    const acc = app.account();
    store.addRecord(acc, { type: 'formula', id: f.id, name: f.name, ch: f.ch });
    const data = store.load(acc);
    this.setData({
      sheet: {
        isFormula: true,
        id: f.id,
        name: f.name,
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

  toggleFav() {
    if (!this.data.sheet || !this.data.sheet.isFormula) return;
    const acc = app.account();
    const added = store.toggleFavFormula(acc, this.data.sheet.id);
    this.setData({ 'sheet.fav': added });
    util.toast(added ? '已收藏' : '已取消收藏');
  },

  markFormula() {
    if (!this.data.sheet || !this.data.sheet.isFormula) return;
    const acc = app.account();
    store.setLearned(acc, 'formulas', this.data.sheet.id, true);
    util.vibrate();
    util.toast('已记录学习进度');
    this.setData({ 'sheet.learned': true });
    this.refresh();
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
      success: () => util.toast('已复制到剪贴板'),
    });
  },

  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz?ch=' + this.data.ch.num });
  },

  goLab() {
    app.globalData.ctx = { labTab: this.data.ch.num >= 4 ? 1 : 0 };
    util.crossTab(2, { hint: '本章实验' });
  },

  goChapter(e) {
    const id = e.currentTarget.dataset.id;
    wx.redirectTo({ url: '/pages/chapter/chapter?chId=' + id });
  },

  onShareAppMessage() {
    return {
      title: 'ch' + this.data.ch.num + ' · ' + this.data.ch.name,
      path: '/pages/chapter/chapter?chId=' + this.data.ch.id,
    };
  },
});
