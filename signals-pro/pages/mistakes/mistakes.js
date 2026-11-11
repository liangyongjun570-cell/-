const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');

const LETTERS = ['A', 'B', 'C', 'D'];

Page({
  data: {
    theme: 'light',
    letters: LETTERS,
    list: [],
    all: [],
    filter: 0,
    chs: [],
    open: {},
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
    const rows = [];

    (data.wrong || []).forEach((id) => {
      // 题库题：q01
      if (id.charAt(0) === 'q') {
        const q = D.questions.find((x) => x.id === id);
        if (!q) return;
        rows.push({
          key: id,
          id,
          kind: 'quiz',
          ch: q.ch,
          chName: (D.chapters[q.ch] || {}).name || '',
          difficulty: q.difficulty,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explain: q.explanation,
          hint: q.hint,
          formulaRef: q.formulaRef || '',
        });
        return;
      }
      // 随堂测：topic-ch1-t1-0
      if (id.indexOf('topic-') === 0) {
        const parts = id.split('-');
        const idx = Number(parts[parts.length - 1]);
        const tid = parts.slice(1, parts.length - 1).join('-');
        const t = D.getTopic(tid);
        if (!t || !t.quiz || !t.quiz[idx]) return;
        const q = t.quiz[idx];
        rows.push({
          key: id,
          id,
          kind: 'topic',
          ch: t.chapterNum,
          chName: (D.chapters[t.chapterNum] || {}).name || '',
          difficulty: '随堂测 · ' + t.name,
          stem: q.q,
          options: q.options,
          answer: q.answer,
          explain: q.explain,
          hint: '',
          formulaRef: '',
        });
      }
    });

    const chSet = [];
    rows.forEach((r) => {
      if (chSet.indexOf(r.ch) < 0) chSet.push(r.ch);
    });
    chSet.sort((a, b) => a - b);

    this.setData({
      all: rows,
      chs: chSet.map((c) => ({ k: c, t: 'ch' + c })),
      filter: -1,
    });
    this.applyFilter(-1);
  },

  applyFilter(ch) {
    const all = this.data.all;
    const list = (ch < 0 ? all : all.filter((r) => r.ch === ch)).map((r) =>
      Object.assign({}, r, { open: false })
    );
    this.setData({ list, filter: ch });
  },

  setFilter(e) {
    const v = Number(e.currentTarget.dataset.k);
    this.applyFilter(v);
  },

  toggle(e) {
    const i = Number(e.currentTarget.dataset.i);
    const list = this.data.list.slice();
    if (!list[i]) return;
    list[i] = Object.assign({}, list[i], { open: !list[i].open });
    this.setData({ list });
  },

  mastered(e) {
    const id = e.currentTarget.dataset.id;
    const acc = app.account();
    store.removeWrong(acc, id);
    util.vibrate();
    util.toast('已移出错题本');
    this.build();
  },

  redo() {
    if (!this.data.all.length) return;
    wx.navigateTo({ url: '/pages/quiz/quiz?mode=wrong' });
  },

  goQuiz() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  openFormula(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const f = D.getFormula(id);
    if (!f) return;
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=ch' + f.ch + '&tab=formulas' });
  },

  clearAll() {
    if (!this.data.all.length) return;
    wx.showModal({
      title: '清空错题本',
      content: '将移除全部 ' + this.data.all.length + ' 道错题记录，此操作不可恢复。',
      confirmText: '清空',
      confirmColor: '#F2694B',
      success: (res) => {
        if (!res.confirm) return;
        const acc = app.account();
        this.data.all.forEach((r) => store.removeWrong(acc, r.id));
        util.toast('错题本已清空');
        this.build();
      },
    });
  },

  onShareAppMessage() {
    return { title: '信号与系统 · 错题本', path: '/pages/mistakes/mistakes' };
  },
});
