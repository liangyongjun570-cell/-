const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');

// ch0 概述卡的延伸入口：相关公式 / 相关章节
const OVERVIEW_LINKS = {
  'ch0-t1': { formulas: ['f18', 'f19', 'f20'], chapters: ['ch5'] },
  'ch0-t2': { formulas: ['f26', 'f27', 'f28'], chapters: ['ch7'] },
  'ch0-t3': { formulas: ['f02', 'f03'], chapters: ['ch7'] },
  'ch0-t4': { formulas: ['f13', 'f14'], chapters: ['ch2', 'ch3'] },
  'ch0-t5': { formulas: ['f15', 'f16'], chapters: ['ch4'] },
  'ch0-t6': { formulas: ['f28', 'f26'], chapters: ['ch7'] },
  'ch0-t7': { formulas: ['f16', 'f17'], chapters: ['ch4'] },
  'ch0-t8': { formulas: ['f18', 'f20'], chapters: ['ch5'] },
};

Page({
  data: {
    theme: 'light',
    t: null,
    chInfo: null,
    learned: false,
    fav: false,
    note: '',
    noteOpen: false,
    tabs: [
      { k: 'concept', t: '① 概念' },
      { k: 'formula', t: '② 公式' },
      { k: 'example', t: '③ 例题' },
      { k: 'case', t: '④ 应用' },
    ],
    tab: 'concept',
    // ch0 概述卡（另一种数据形状）
    overview: false,
    relFormulas: [],
    relChapters: [],
    letters: ['A', 'B', 'C', 'D'],
    formulaList: [],
    // 例题
    stepShown: 1,
    hintOpen: false,
    // 公式弹层
    sheet: null,
    // 随堂测
    quizPick: {},
    quizDone: {},
    quizScore: 0,
    quizTotal: 0,
    // 下一专题
    nextTopic: null,
    prevTopic: null,
  },

  onLoad(q) {
    const id = q.id;
    const t = D.getTopic(id);
    if (!t) {
      util.toast('专题不存在');
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const ch = D.getChapter(t.chapterId);
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    wx.setNavigationBarTitle({ title: t.name });

    // 同章内前后专题
    const ids = D.chapterTopicIndex[t.chapterId] || [];
    const i = ids.indexOf(id);
    const prev = i > 0 ? D.topicMap[ids[i - 1]] : null;
    const nx = i >= 0 && i < ids.length - 1 ? D.topicMap[ids[i + 1]] : null;

    // 公式引用 → 完整对象
    const formulaList = (t.formulas || [])
      .map((fid) => D.getFormula(fid))
      .filter((x) => !!x)
      .map((f) => ({ id: f.id, name: f.name, cat: f.cat, math: f.math }));

    // ch0 概述卡：另一套字段（abbr / target / domain / points）
    const overview = !(t.sections && t.sections.length);
    const rel = OVERVIEW_LINKS[id] || { formulas: [], chapters: [] };
    const relFormulas = rel.formulas
      .map((fid) => D.getFormula(fid))
      .filter((x) => !!x)
      .map((f) => ({ id: f.id, name: f.name, cat: f.cat, math: f.math }));
    const relChapters = rel.chapters
      .map((cid) => D.getChapter(cid))
      .filter((x) => !!x)
      .map((c) => ({ id: c.id, num: c.num, name: c.name, tagline: c.tagline }));

    this.setData({
      t: Object.assign({}, t, {
        intro: t.intro || t.desc || '',
        short: t.short || t.target || '',
        minutes: t.minutes || 8,
      }),
      overview,
      relFormulas,
      relChapters,
      formulaList,
      chInfo: {
        id: ch.id,
        num: ch.num,
        name: ch.name,
        color: ch.color,
        sticker: ch.sticker,
      },
      prevTopic: prev ? { id: prev.id, name: prev.name } : null,
      nextTopic: nx ? { id: nx.id, name: nx.name } : null,
      quizTotal: (t.quiz || []).length,
      tab: q.tab || 'concept',
    });

    this.refresh();
  },

  onShow() {
    if (!this.data.t) return;
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    this.refresh();
  },

  refresh() {
    const t = this.data.t;
    if (!t) return;
    const acc = app.account();
    const data = store.load(acc);
    // 记一条学习足迹
    store.addRecord(acc, { type: 'topic', id: t.id, name: t.name, ch: t.chapterNum });
    const fresh = store.load(acc);
    this.setData({
      learned: fresh.learned.topics.indexOf(t.id) >= 0,
      fav: fresh.fav.courses.indexOf(t.id) >= 0,
      note: (data.notes || {})[t.id] || '',
    });
  },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.k });
  },

  toggleLearn() {
    const acc = app.account();
    const next = !this.data.learned;
    store.setLearned(acc, 'topics', this.data.t.id, next);
    util.vibrate();
    util.toast(next ? '已标记为已学' : '已取消标记');
    this.setData({ learned: next });
  },

  toggleFav() {
    const acc = app.account();
    const added = store.toggleFavCourse(acc, this.data.t.id);
    this.setData({ fav: added });
    util.toast(added ? '已收藏本专题' : '已取消收藏');
  },

  // ---------- 例题 ----------
  nextStep() {
    const total = (this.data.t.example.steps || []).length;
    if (this.data.stepShown < total) {
      this.setData({ stepShown: this.data.stepShown + 1 });
    } else {
      this.setData({ stepShown: total + 1 });
    }
  },

  allSteps() {
    const total = (this.data.t.example.steps || []).length;
    this.setData({ stepShown: total + 1, hintOpen: true });
  },

  toggleHint() {
    this.setData({ hintOpen: !this.data.hintOpen });
  },

  // ---------- 公式 ----------
  openFormula(e) {
    const id = e.currentTarget.dataset.id;
    const f = D.getFormula(id);
    if (!f) return;
    const acc = app.account();
    store.addRecord(acc, { type: 'formula', id: f.id, name: f.name, ch: f.ch });
    const data = store.load(acc);
    this.setData({
      sheet: {
        id: f.id,
        name: f.name,
        ch: f.ch,
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
  },

  toggleFavFormula() {
    if (!this.data.sheet) return;
    const acc = app.account();
    const added = store.toggleFavFormula(acc, this.data.sheet.id);
    this.setData({ 'sheet.fav': added });
    util.toast(added ? '已收藏公式' : '已取消收藏');
  },

  markFormula() {
    if (!this.data.sheet) return;
    const acc = app.account();
    store.setLearned(acc, 'formulas', this.data.sheet.id, true);
    util.vibrate();
    util.toast('已记录学习进度');
    this.setData({ 'sheet.learned': true });
  },

  copy(e) {
    const kind = e.currentTarget.dataset.kind;
    const s = this.data.sheet;
    if (!s) return;
    let txt = s.text;
    if (kind === 'latex') txt = s.latex;
    if (kind === 'matlab') txt = s.matlab;
    if (kind === 'python') txt = s.python;
    wx.setClipboardData({ data: txt, success: () => util.toast('已复制') });
  },

  // ---------- 随堂测 ----------
  pickQuiz(e) {
    const { i, o } = e.currentTarget.dataset;
    const idx = Number(i);
    if (this.data.quizDone[idx]) return;
    const quiz = this.data.t.quiz || [];
    const q = quiz[idx];
    if (!q) return;
    const correct = Number(o) === Number(q.answer);
    const acc = app.account();
    store.recordAnswer(acc, correct);
    if (!correct) store.addWrong(acc, 'topic-' + this.data.t.id + '-' + idx);
    util.vibrate();

    const pick = Object.assign({}, this.data.quizPick);
    pick[idx] = Number(o);
    const done = Object.assign({}, this.data.quizDone);
    done[idx] = true;
    const score = Object.keys(done).reduce((s, k) => {
      const qq = quiz[Number(k)];
      return s + (pick[Number(k)] === Number(qq.answer) ? 1 : 0);
    }, 0);

    this.setData({ quizPick: pick, quizDone: done, quizScore: score });
  },

  // ---------- 笔记 ----------
  openNote() {
    this.setData({ noteOpen: true });
  },

  closeNote() {
    this.setData({ noteOpen: false });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  saveNote() {
    const acc = app.account();
    store.setNote(acc, this.data.t.id, this.data.note);
    util.toast(this.data.note.trim() ? '笔记已保存' : '笔记已清空');
    this.setData({ noteOpen: false });
  },

  // ---------- 跳转 ----------
  goChapter() {
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + this.data.chInfo.id });
  },

  goCh(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + id });
  },

  goTopic(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.redirectTo({ url: '/pages/topic/topic?id=' + id });
  },

  goLab() {
    const n = this.data.chInfo.num;
    let tab = 0;
    if (n === 4 || n === 5) tab = 1;
    else if (n === 6 || n === 7) tab = 2;
    app.globalData.ctx = { labTab: tab };
    util.crossTab(2, { hint: '本章实验' });
  },

  goTutor() {
    app.globalData.ctx = { tutorTheme: this.data.t.id, tutorName: this.data.t.name };
    wx.navigateTo({ url: '/pages/tutor/tutor?q=' + encodeURIComponent(this.data.t.name) });
  },

  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz?topic=' + this.data.t.id });
  },

  onShareAppMessage() {
    return {
      title: this.data.t.name + ' · 信号与系统',
      path: '/pages/topic/topic?id=' + this.data.t.id,
    };
  },
});
