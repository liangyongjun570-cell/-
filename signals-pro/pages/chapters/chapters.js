const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');

Page({
  data: {
    theme: 'light',
    overall: { done: 0, total: 66, percent: 0, chaptersDone: 0, chaptersTotal: 8 },
    list: [],
    filter: 'all',
    // 跨 tab 跳进来的来源（null = 不显示返回条）
    back: null,
    filters: [
      { k: 'all', t: '全部' },
      { k: 'doing', t: '进行中' },
      { k: 'todo', t: '未开始' },
      { k: 'done', t: '已完成' },
    ],
    counts: { all: 0, doing: 0, todo: 0, done: 0 },
    totalTopics: 36,
    totalFormulas: 28,
  },

  onLoad() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    // 「我的 → 记录 → 章节」这类跳转留下的来源。读完立刻清，
    // 免得源页 onHide 先跑、把目标页要读的 back 删掉
    this.setData({ back: util.backInfo() });
    util.clearBack();
    this.refresh();
    util.setTabBar(this, 1, theme);
  },

  onHide() {
    if (this.data.back) this.setData({ back: null });
  },

  goBackTab() {
    util.goBackTab();
  },

  refresh() {
    const acc = app.account();
    const data = store.load(acc);
    const learned = data.learned;
    const counts = { all: 0, doing: 0, todo: 0, done: 0 };

    const list = D.chapters.map((ch) => {
      const p = D.chapterProgress(learned, ch);
      let state = 'todo';
      if (p.percent >= 100) state = 'done';
      else if (p.done > 0) state = 'doing';
      counts.all += 1;
      counts[state] += 1;
      const topicIds = D.chapterTopicIndex[ch.id] || [];
      return {
        id: ch.id,
        num: ch.num,
        name: ch.name,
        en: ch.en,
        sticker: ch.sticker,
        color: ch.color,
        tagline: ch.tagline,
        minutes: ch.minutes,
        state,
        done: p.done,
        total: p.total,
        percent: p.percent,
        topicCount: topicIds.length,
        formulaCount: D.formulasOfChapter(ch.num).length,
        exampleCount: (ch.examples || []).length,
      };
    });

    this.setData({
      list,
      filters: [
        { k: 'all', t: '全部', n: counts.all },
        { k: 'doing', t: '进行中', n: counts.doing },
        { k: 'todo', t: '未开始', n: counts.todo },
        { k: 'done', t: '已完成', n: counts.done },
      ],
      counts,
      overall: D.overall(learned),
      totalTopics: 36,
      totalFormulas: 28,
    });
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.k });
  },

  openChapter(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + id });
  },

  // 直达本章第一个未学专题
  jumpNext(e) {
    const id = e.currentTarget.dataset.id;
    const ch = D.getChapter(id);
    if (!ch) return;
    const acc = app.account();
    const data = store.load(acc);
    const t = (ch.topics || []).find((x) => data.learned.topics.indexOf(x.id) < 0);
    if (t) wx.navigateTo({ url: '/pages/topic/topic?id=' + t.id });
    else wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + id });
  },

  goSearch() {
    app.globalData.ctx = { openSearch: true };
    util.crossTab(0, { hint: '搜索' });
  },

  goLab() {
    util.crossTab(2);
  },

  onShareAppMessage() {
    return { title: '信号与系统 · 章节目录', path: '/pages/chapters/chapters' };
  },
});
