const app = require('../../utils/appref');
const chat = require('../../utils/chat');
const engine = require('../../utils/engine');
const ai = require('../../utils/ai');
const vision = require('../../utils/vision');
const sync = require('../../utils/sync');
const cloud = require('../../utils/cloud');
const A = require('../../data/assistant');
const util = require('../../utils/util');

function defaultApi() {
  return ai.defaultCfg();
}

function hm(ts) {
  const d = new Date(ts || Date.now());
  return util.pad(d.getHours()) + ':' + util.pad(d.getMinutes());
}

function readApi() {
  return ai.readCfg();
}

Page({
  data: {
    theme: 'light',
    statusBar: 20,
    sid: '',
    ctx: A.DEFAULT_CTX,
    styles: A.STYLES,
    style: 'intuition',
    symbols: A.SYMBOLS_FULL,
    guides: A.GUIDE_CARDS,
    hard: A.HARD.map((q) => ({
      id: q.id,
      title: q.title,
      ch: q.ch,
      num: String(q.ch).replace('ch', ''),
    })),
    msgs: [],
    input: '',
    scrollTo: '',
    busy: false,
    drawer: false,
    sessions: [],
    apiSheet: false,
    apiCfg: defaultApi(),
    apiDraft: defaultApi(),
    apiTesting: false,
    apiTestMsg: '',
    apiTestOk: false,
    streamText: '',
    papers: vision.PAPERS,
    engineLabel: '离线信号教授引擎',
  },

  onLoad(q) {
    const theme = app.globalData.theme || 'light';
    let sb = 20;
    try {
      sb = wx.getSystemInfoSync().statusBarHeight || 20;
    } catch (e) {}
    this.setData({ theme, statusBar: sb, apiCfg: readApi() });
    util.applyTheme(theme);

    let sid = (q && q.sid) || '';
    const acc = app.account();
    if (sid) {
      const s = chat.select(acc, sid);
      if (s) {
        this.sid = s.id;
        this.setData({ sid: s.id });
      }
    }
    if (!this.sid) {
      const s = chat.current(acc);
      this.sid = s.id;
      this.setData({ sid: s.id });
    }
    this.refreshSessions();
    this.reload();
    this.refreshCtx();

    // 引擎标签：让用户一眼知道这次回答是谁给的
    this.setData({ engineLabel: this.engineLabelOf(this.data.apiCfg) });

    // 打开页面时顺手同步一次档案（云未开通时是空操作）
    if (cloud.available()) sync.syncAll(acc).then(() => this.refreshSessions());
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    this.refreshSessions();
    this.reload();
  },

  // ---------- 上下文 ----------
  refreshCtx() {
    let route = '';
    let options = {};
    try {
      const pages = getCurrentPages();
      // 取本页之前的那一页，作为"用户从哪里进来"的上下文
      const prev = pages[pages.length - 2];
      const cur = prev || pages[pages.length - 1];
      if (cur) {
        route = cur.route || cur.__route__ || '';
        options = cur.options || {};
      }
    } catch (e) {}
    const ctx = A.contextOf(route, options);
    this.setData({ ctx });
  },

  // ---------- 会话 ----------
  refreshSessions() {
    const acc = app.account();
    const list = chat.list(acc).map((s) => ({
      id: s.id,
      title: s.title,
      current: s.id === this.sid,
      time: hm(s.ts),
      count: s.count,
    }));
    this.setData({ sessions: list });
  },

  reload() {
    const acc = app.account();
    const s = chat.current(acc);
    this.sid = s.id;
    this.setData({ sid: s.id });
    this.renderMsgs(s.msgs || []);
  },

  renderMsgs(raw) {
    const list = (raw || []).map((m, i) => {
      const item = { id: m.id || 'm' + i, role: m.role, text: m.text || '' };
      if (m.img) item.img = m.img;
      if (m.via) item.via = m.via;
      if (m.blocks && m.blocks.length) {
        item.blocks = m.blocks.map((b, j) => {
          const bb = { k: 'b' + i + '_' + j, type: b.type || 'p' };
          if (b.type === 'formula') {
            bb.list = engine.formulaList(b.ids);
          } else {
            bb.text = b.text || '';
            bb.index = b.index || 0;
            bb.lang = b.lang || '';
          }
          return bb;
        });
      }
      if (m.refs && (m.refs.ch || m.refs.lab >= 0)) {
        item.refs = {
          ch: m.refs.ch || '',
          lab: typeof m.refs.lab === 'number' ? m.refs.lab : -1,
          chName: m.refs.ch ? '第 ' + String(m.refs.ch).replace('ch', '') + ' 章' : '',
        };
      }
      return item;
    });
    this.setData({ msgs: list });
    this.scrollBottom();
  },

  scrollBottom() {
    const n = (this.data.msgs || []).length;
    if (!n) return;
    this.setData({ scrollTo: 'mb' + (n - 1) });
  },

  // ---------- 发送 ----------
  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  insSym(e) {
    const v = e.currentTarget.dataset.v || '';
    this.setData({ input: (this.data.input || '') + v });
  },

  onConfirm() {
    this.send();
  },

  onSend() {
    this.send();
  },

  send(text) {
    const q = String(text || this.data.input || '').trim();
    if (!q || this.data.busy) return;
    const acc = app.account();
    const sid = this.sid;

    chat.append(acc, sid, { role: 'user', text: q, ts: Date.now() });
    this.setData({ input: '', busy: true, drawer: false });
    this.reload();
    this.refreshSessions();

    const cfg = this.data.apiCfg;
    // 优先级：用户自定义模型 > 云开发 AI（流式）> 离线引擎
    if (cfg.enabled) {
      ai
        .remote(cfg, {
          q: q,
          style: this.data.style,
          ctx: this.data.ctx,
          history: (this.data.msgs || []).slice(-4).map((m) => ({ role: m.role, text: m.text })),
        })
        .then((r) => {
          if (r.ok) {
            this.commit(acc, sid, {
              text: r.title,
              blocks: r.blocks,
              refs: { ch: this.data.ctx.chapter, lab: -1 },
              via: r.via === 'cloud' ? 'cloud' : 'direct',
            });
            this.setData({ engineLabel: this.engineLabelOf(cfg) });
          } else {
            // 失败原因要说到点子上，用户才知道是改 Key 还是改域名
            this.fallbackToAI(acc, sid, q, ai.errText(r.err, r.msg));
          }
        });
      return;
    }
    this.fallbackToAI(acc, sid, q, '');
  },

  // 云开发 AI 流式；不可用时直接离线
  fallbackToAI(acc, sid, q, note) {
    const started = ai.stream({
      q: q,
      style: this.data.style,
      ctx: this.data.ctx,
      history: (this.data.msgs || []).slice(-4).map((m) => ({ role: m.role, text: m.text })),
      onDelta: (t) => this.pushStream(t),
      onDone: (r) => {
        if (r.ok) {
          this.commit(acc, sid, { text: r.title || q.slice(0, 20), blocks: r.blocks, refs: r.refs });
          this.setData({ engineLabel: '云开发 AI · 流式' });
        } else {
          this.local(acc, sid, q, note ? note + '，已回退离线引擎' : '');
        }
      },
    });
    if (!started) {
      this.local(acc, sid, q, note ? note + '，已回退离线引擎' : '');
      return;
    }
    this._aiT = setTimeout(() => {
      this._aiT = null;
      if (this.data.busy) this.local(acc, sid, q, '云端超时，已回退离线引擎');
    }, 26000);
  },

  // 流式增量：节流 70ms
  pushStream(t) {
    const now = Date.now();
    this._stNext = t;
    if (this._stT && now - this._stT < 70) {
      if (!this._stTimer) {
        this._stTimer = setTimeout(() => {
          this._stTimer = null;
          this._stT = Date.now();
          this.setData({ streamText: this._stNext || '' });
          this.scrollBottom();
        }, 70);
      }
      return;
    }
    this._stT = now;
    this.setData({ streamText: t });
    this.scrollBottom();
  },

  clearStream() {
    if (this._stTimer) {
      clearTimeout(this._stTimer);
      this._stTimer = null;
    }
    if (this.data.streamText) this.setData({ streamText: '' });
  },

  commit(acc, sid, msg) {
    if (this._aiT) {
      clearTimeout(this._aiT);
      this._aiT = null;
    }
    this.clearStream();
    chat.append(acc, sid, {
      role: 'assistant',
      text: msg.text,
      blocks: msg.blocks,
      refs: msg.refs,
      via: msg.via || '',
      ts: Date.now(),
    });
    this.setData({ busy: false });
    this.reload();
    this.refreshSessions();
    sync.schedule(acc);
  },

  local(acc, sid, q, note) {
    const r = engine.answer(q, this.data.style, this.data.ctx);
    const blocks = r.blocks.slice();
    if (note) blocks.unshift({ type: 'tip', text: note });
    this.setData({ engineLabel: '离线信号教授引擎' });
    this.commit(acc, sid, { text: r.title, blocks: blocks, refs: r.refs });
  },

  // ---------- 相机 ----------
  camera() {
    if (this.data.busy) return;
    vision.choose().then((path) => {
      if (!path) return;
      this.analyze(path, null);
    });
  },

  pickPaper(e) {
    if (this.data.busy) return;
    const id = e.currentTarget.dataset.id;
    let p = null;
    vision.PAPERS.forEach((x) => {
      if (x.id === id) p = x;
    });
    if (p) this.analyze(p.img, p);
  },

  analyze(path, paper) {
    const acc = app.account();
    const sid = this.sid;
    chat.append(acc, sid, {
      role: 'user',
      text: paper ? '📷 ' + paper.title : '📷 拍照识题',
      img: path,
      ts: Date.now(),
    });
    this.setData({ busy: true, drawer: false });
    this.reload();
    this.refreshSessions();

    Promise.all([vision.readPixels(path), vision.ocr(path)]).then((arr) => {
      const rep = vision.build(paper, arr[0], arr[1]);
      this.commit(acc, sid, {
        text: paper ? '📷 已批改：' + paper.title : '📷 识题结果',
        blocks: this.reportBlocks(rep),
        refs: { ch: '', lab: -1 },
      });
    });
  },

  reportBlocks(rep) {
    // 渲染逻辑在 utils/vision.reportBlocks（含搜题结果段），页面端 / 组件端共用一份
    return vision.reportBlocks(rep);
  },

  previewImg(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;
    try {
      wx.previewImage({ urls: [src], current: src });
    } catch (err) {}
  },

  // ---------- 自定义模型 ----------
  // 三级链的公共实现都在 utils/ai：remote（对话）/ ping（自检）/ errText（报错转人话）
  engineLabelOf(cfg) {
    if (cfg && cfg.enabled) {
      const m = cfg.model || '';
      const name = (m.indexOf('mimo') === 0 ? '小米 MiMo · ' : '自定义模型 · ') + m;
      // 没带 Key 就是全走云函数中转，标签如实说明
      return cfg.key ? name : name + '（云函数中转）';
    }
    if (ai.hasCloudAI()) return '云开发 AI · deepseek 流式';
    return '离线信号教授引擎';
  },

  openApi() {
    const cfg = this.data.apiCfg;
    this.setData({
      apiSheet: true,
      apiTestMsg: '',
      apiDraft: {
        enabled: !!cfg.enabled,
        baseUrl: cfg.baseUrl,
        key: cfg.key,
        model: cfg.model,
      },
    });
  },

  closeApi() {
    this.setData({ apiSheet: false });
  },

  apiInput(e) {
    const k = e.currentTarget.dataset.k;
    const draft = Object.assign({}, this.data.apiDraft);
    draft[k] = e.detail.value;
    // 配置变了，旧的自检结论就不算数了
    this.setData({ apiDraft: draft, apiTestMsg: '' });
  },

  apiToggle(e) {
    const draft = Object.assign({}, this.data.apiDraft);
    draft.enabled = !!e.detail.value;
    this.setData({ apiDraft: draft });
  },

  // 当场验一遍配置：连通/Key 无效/域名没放行，比保存后在对话里踩坑强
  testApi() {
    if (this.data.apiTesting) return;
    this.setData({ apiTesting: true, apiTestMsg: '正在连接…' });
    ai.ping(this.data.apiDraft).then((r) => {
      this.setData({ apiTesting: false, apiTestMsg: r.msg, apiTestOk: r.ok });
    });
  },

  saveApi() {
    const d = this.data.apiDraft;
    // 不填 Key 也允许启用：此时走云函数中转（服务端持 Key），标签会如实标「云函数中转」
    const cfg = ai.saveCfg(d);
    this.setData({ apiCfg: cfg, apiSheet: false, engineLabel: this.engineLabelOf(cfg) });
    if (!cfg.enabled) util.toast('已切回引擎选择');
    else util.toast(cfg.key ? '已启用自定义模型' : '已启用自定义模型（未填 Key，走云函数中转）');
  },

  // ---------- 会话管理 ----------
  newChat() {
    const acc = app.account();
    const s = chat.create(acc);
    this.sid = s.id;
    this.setData({ sid: s.id, input: '' });
    this.reload();
    this.refreshSessions();
    this.setData({ drawer: false });
  },

  switchSession(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.sid) {
      this.setData({ drawer: false });
      return;
    }
    const acc = app.account();
    const s = chat.select(acc, id);
    if (!s) return;
    this.sid = s.id;
    this.setData({ sid: s.id, drawer: false });
    this.renderMsgs(s.msgs || []);
    this.refreshSessions();
  },

  delSession(e) {
    const id = e.currentTarget.dataset.id;
    const self = this;
    wx.showModal({
      title: '删除这条对话？',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: '#E05536',
      success(res) {
        if (!res.confirm) return;
        const acc = app.account();
        chat.remove(acc, id);
        self.refreshSessions();
        self.reload();
      },
    });
  },

  toggleDrawer() {
    this.setData({ drawer: !this.data.drawer });
  },

  closeDrawer() {
    this.setData({ drawer: false });
  },

  // ---------- 风格 ----------
  setStyle(e) {
    const id = e.currentTarget.dataset.id;
    if (id === this.data.style) return;
    this.setData({ style: id });
    const msgs = this.data.msgs || [];
    let lastQ = '';
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastQ = msgs[i].text;
        break;
      }
    }
    if (!lastQ) return;
    const r = engine.answer(lastQ, id, this.data.ctx);
    chat.replaceLast(app.account(), this.sid, {
      role: 'assistant',
      text: r.title,
      blocks: r.blocks,
      refs: r.refs,
      ts: Date.now(),
    });
    this.reload();
  },

  // ---------- 交互 ----------
  tapHard(e) {
    const id = e.currentTarget.dataset.id;
    let q = null;
    A.HARD.forEach((x) => {
      if (x.id === id) q = x.title;
    });
    if (q) this.send(q);
  },

  tapGuide(e) {
    const ask = e.currentTarget.dataset.ask;
    if (ask) this.send(ask);
  },

  tapAsk(e) {
    const q = e.currentTarget.dataset.q;
    if (q) this.send(q);
  },

  copyCode(e) {
    util.copy(e.currentTarget.dataset.text || '', '代码已复制');
  },

  // ---------- 三级切换 ----------
  backHalf() {
    if (app.globalData) app.globalData.halfBack = true;
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/index/index' });
      },
    });
  },

  backHome() {
    if (app.globalData) app.globalData.halfBack = false;
    wx.navigateBack({
      fail() {
        wx.switchTab({ url: '/pages/index/index' });
      },
    });
  },

  goLab(e) {
    const tab = Number(e.currentTarget.dataset.lab);
    if (app.globalData) app.globalData.ctx = { labTab: tab >= 0 ? tab : 0 };
    util.crossTab(2, { hint: '试一试这个实验' });
  },

  goChapter(e) {
    const ch = e.currentTarget.dataset.ch;
    if (!ch) return;
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + ch });
  },
});
