const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');
const TU = require('../../data/tutor');
const T = require('../../data/theme');

Page({
  data: {
    theme: 'light',
    modes: TU.MODES,
    mode: 'chat',
    hot: TU.HOT,
    topics: [],
    msgs: [],
    input: '',
    scrollTo: '',
    sticker: T.stickers.tutor,
    busy: false,
  },

  onLoad(q) {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    this.setData({
      topics: TU.THEMES.map((t) => ({ id: t.id, title: t.title })),
    });
    this.seq = 0;
    this.pushBot(
      '我是这门课的内置助教，全部内容离线保存在本机，不联网也能用。\n可以选择下面的讲解方式，或者直接问：卷积为什么翻转、系统怎么判稳、FT 和 LT 差在哪。'
    );
    if (q && q.q) {
      const text = decodeURIComponent(q.q);
      setTimeout(() => this.ask(text), 260);
    }
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
  },

  // ---------- 消息 ----------
  pushUser(text) {
    const msgs = this.data.msgs.concat([{ id: 'm' + this.seq++, role: 'user', text }]);
    this.setData({ msgs });
    this.scrollBottom();
  },

  pushBot(text, blocks, title) {
    const msgs = this.data.msgs.concat([
      {
        id: 'm' + this.seq++,
        role: 'bot',
        text: text || '',
        blocks: blocks || [],
        title: title || '',
      },
    ]);
    this.setData({ msgs });
    this.scrollBottom();
  },

  scrollBottom() {
    const last = this.data.msgs[this.data.msgs.length - 1];
    if (!last) return;
    this.setData({ scrollTo: 'anchor' });
    // 用唯一锚点让 scroll-view 滚到底
    setTimeout(() => this.setData({ scrollTo: 'msg-' + last.id }), 60);
  },

  // ---------- 提问 ----------
  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  onConfirm() {
    this.ask(this.data.input);
  },

  ask(raw) {
    const text = String(raw || '').trim();
    if (!text) {
      util.toast('先输一个问题');
      return;
    }
    this.pushUser(text);
    this.setData({ input: '' });
    const theme = TU.match(text);
    if (!theme) {
      this.pushBot(
        '这个问题我还没把握。可以换个说法，或者点下面的主题直接问——每个主题都准备了「概念 / 推导 / 例题 / 方法」四种讲法。',
        [],
        '没匹配到'
      );
      return;
    }
    const res = TU.compose(theme, this.data.mode);
    this.pushBot('', this.resolve(res.blocks), res.title);
  },

  // 把 formula 块里的 id 换成可渲染的公式
  resolve(blocks) {
    return (blocks || []).map((b) => {
      if (b.type !== 'formula') return b;
      const list = (b.ids || [])
        .map((id) => D.getFormula(id))
        .filter((x) => !!x)
        .map((f) => ({ id: f.id, name: f.name, math: f.math }));
      return { type: 'formula', list };
    });
  },

  // ---------- 模式 ----------
  setMode(e) {
    const mode = e.currentTarget.dataset.k;
    this.setData({ mode });
    const m = TU.MODES.find((x) => x.id === mode);
    util.toast('切换为「' + (m ? m.name : mode) + '」');
  },

  // ---------- 主题直问 ----------
  tapHot(e) {
    const i = Number(e.currentTarget.dataset.i);
    const h = TU.HOT[i];
    if (!h) return;
    this.setData({ mode: h.mode || 'chat' });
    this.ask(h.q);
  },

  tapTheme(e) {
    const id = e.currentTarget.dataset.id;
    const theme = TU.THEMES.find((x) => x.id === id);
    if (!theme) return;
    this.pushUser(theme.title);
    const res = TU.compose(theme, this.data.mode);
    this.pushBot('', this.resolve(res.blocks), res.title);
  },

  // ---------- 公式 ----------
  openFormula(e) {
    const id = e.currentTarget.dataset.id;
    const f = D.getFormula(id);
    if (!f) return;
    const acc = app.account();
    store.addRecord(acc, { type: 'formula', id: f.id, name: f.name, ch: f.ch });
    wx.setClipboardData({
      data: f.text,
      success: () => util.toast('公式已复制：' + f.name),
    });
  },

  goChapter() {
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=ch3' });
  },

  clear() {
    this.seq = 0;
    this.setData({ msgs: [] });
    this.pushBot('对话已清空。可以重新提问，或从下面的主题里挑一个。');
  },

  onShareAppMessage() {
    return { title: '信号与系统 · 智能助教', path: '/pages/tutor/tutor' };
  },
});
