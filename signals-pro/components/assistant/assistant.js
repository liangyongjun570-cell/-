const app = require('../../utils/appref');
const chat = require('../../utils/chat');
const engine = require('../../utils/engine');
const ai = require('../../utils/ai');
const vision = require('../../utils/vision');
const sync = require('../../utils/sync');
const A = require('../../data/assistant');
const util = require('../../utils/util');

const POS_KEY = 'ssp_pet_pos';
const PET_W = 96;
const PET_H = 96;

// 情绪 → 宠物表情图（assets/pet/*.png）
const FACE = {
  idle: 'wave',
  think: 'confused',
  happy: 'love',
  alert: 'surprise',
};

// 带自定义 tabBar 的页面（app.json 的 tabBar.list）
// 原生 tabBar 渲染在页面层之上，fixed 元素的底部会被它整块盖住，
// 半屏抽屉必须抬高到它上面，否则底部输入框点不到
const TAB_PAGES = [
  'pages/index/index',
  'pages/chapters/chapters',
  'pages/lab/lab',
  'pages/formulas/formulas',
  'pages/me/me',
];
const TAB_H = 56; // 自定义 tabBar 112rpx ≈ 56px（375 基准）
Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  data: {
    ready: false,
    // pet = 桌宠悬挂；half = 半屏伴读
    state: 'pet',
    x: 300,
    y: 520,
    dragging: false,
    mood: 'idle',
    petImg: 'wave',
    swap: false,
    imgErr: '',
    hasTab: false,
    ctx: A.DEFAULT_CTX,
    styles: A.STYLES,
    style: 'intuition',
    symbols: A.SYMBOLS_SHORT,
    quick: [],
    msgs: [],
    input: '',
    scrollTo: '',
    busy: false,
    petLine: A.PET_MOODS.idle,
    // 云端流式输出的临时文本；非空时在消息列表末尾多渲染一条"正在打字"的气泡
    streamText: '',
    papers: vision.PAPERS,
  },

  lifetimes: {
    attached() {
      // 版本标记：用来确认开发者工具跑的是不是最新代码（旧版有气泡卡片）
      console.log('[assistant] build 2026-10-29-0126 | 无气泡版');
      let w = 375;
      let h = 640;
      try {
        const info = wx.getSystemInfoSync();
        w = info.windowWidth || 375;
        h = info.windowHeight || 640;
      } catch (e) {}
      this.winW = w;
      this.winH = h;

      let x = w - PET_W - 10;
      let y = h - PET_H - 130;
      try {
        const pos = wx.getStorageSync(POS_KEY);
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          x = pos.x;
          y = pos.y;
        }
      } catch (e) {}
      // 先取上下文（含 hasTab），再夹取坐标，避免桌宠落到 tabBar 后面
      this.refreshCtx();
      x = this.clampX(x);
      y = this.clampY(y);

      this.setData({ ready: true, x, y, petImg: this.faceOf('idle') });
      this.loadMsgs();
    },

    detached() {
      if (this._swapT) {
        clearTimeout(this._swapT);
        this._swapT = null;
      }
    },
  },

  pageLifetimes: {
    resize() {
      // 旋转 / 分屏 / 窗口尺寸变化：重算边界与气泡几何，避免桌宠留在屏幕外
      try {
        const info = wx.getSystemInfoSync();
        this.winW = info.windowWidth || this.winW;
        this.winH = info.windowHeight || this.winH;
      } catch (e) {}
      const x = this.clampX(this.data.x);
      const y = this.clampY(this.data.y);
      this.setData({ x, y });
    },

    show() {
      this.refreshCtx();
      // 从全屏平台缩回半屏
      if (app.globalData && app.globalData.halfBack) {
        app.globalData.halfBack = false;
        this.loadMsgs();
        this.setData({ state: 'half' });
        this.scrollBottom();
        return;
      }
      this.loadMsgs();
    },
  },

  methods: {
    clampX(v) {
      const max = (this.winW || 375) - PET_W - 4;
      return Math.max(4, Math.min(v, max));
    },
    clampY(v) {
      // 有 tabBar 的页面要给它留出高度，否则桌宠会被压在原生 tabBar 后面
      const pad = this.data.hasTab ? TAB_H + 8 : 4;
      const max = (this.winH || 640) - PET_H - pad;
      return Math.max(30, Math.min(v, max));
    },

    // 夜深了（22:00–6:00）待机就打瞌睡
    faceOf(m) {
      if (m === 'idle') {
        const h = new Date().getHours();
        if (h >= 22 || h < 6) return 'sleepy';
      }
      return FACE[m] || 'wave';
    },

    // 换表情：先淡出，再换图淡入，避免画面直接跳变
    setMood(m, face) {
      const img = face || this.faceOf(m);
      if (this.data.mood === m && this.data.petImg === img) return;
      if (this._swapT) {
        clearTimeout(this._swapT);
        this._swapT = null;
      }
      this.setData({ swap: true });
      this._swapT = setTimeout(() => {
        this._swapT = null;
        this.setData({ mood: m, petImg: img, swap: false, imgErr: '' });
      }, 120);
    },

    // 图片加载失败时把原因显示在桌宠位置，方便定位（正常时永远不出现）
    onImgError(e) {
      const msg = (e && e.detail && e.detail.errMsg) || 'image error';
      this.setData({ imgErr: msg });
    },

    // ---------- 上下文 ----------
    refreshCtx() {
      let route = '';
      let options = {};
      try {
        const pages = getCurrentPages();
        const cur = pages[pages.length - 1];
        if (cur) {
          route = cur.route || cur.__route__ || '';
          options = cur.options || {};
        }
      } catch (e) {}
      const ctx = A.contextOf(route, options);
      const hasTab = TAB_PAGES.indexOf(route) >= 0;
      const patch = { ctx, quick: A.quickOf(ctx.chapter) };
      if (hasTab !== this.data.hasTab) patch.hasTab = hasTab;
      this.setData(patch);
    },

    // ---------- 消息 ----------
    loadMsgs() {
      const acc = app.account();
      const s = chat.current(acc);
      this.sid = s.id;
      this.renderMsgs(s.msgs || []);
    },

    renderMsgs(raw) {
      const list = (raw || []).map((m, i) => {
        const item = {
          id: m.id || 'm' + i,
          role: m.role,
          text: m.text || '',
        };
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

    send(text) {
      const q = String(text || this.data.input || '').trim();
      if (!q || this.data.busy) return;
      const acc = app.account();
      const sid = this.sid;
      chat.append(acc, sid, { role: 'user', text: q, ts: Date.now() });
      this.setData({ input: '', busy: true, petLine: A.PET_MOODS.think });
      this.setMood('think');
      this.reload();

      // 0) 用户配了自定义模型就优先（与全屏助教页共用同一份配置）
      const cfg = ai.readCfg();
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
            } else {
              // 说清失败原因（Key 错 / 域名没放行 / 超时），再回退，别默默换引擎
              this.cloudOrLocal(acc, sid, q, ai.errText(r.err, r.msg));
            }
          });
        return;
      }
      this.cloudOrLocal(acc, sid, q, '');
    },

    // 1) 云开发 AI 流式；2) 不可用时离线引擎直接答
    cloudOrLocal(acc, sid, q, note) {
      const started = ai.stream({
        q: q,
        style: this.data.style,
        ctx: this.data.ctx,
        history: (this.data.msgs || []).slice(-4).map((m) => ({ role: m.role, text: m.text })),
        onDelta: (t) => this.pushStream(t),
        onDone: (r) => {
          if (r.ok) {
            this.commit(acc, sid, { text: r.title || q.slice(0, 20), blocks: r.blocks, refs: r.refs });
          } else {
            this.localAnswer(acc, sid, q, (note ? note + '；' : '') + '云端模型未响应，已用离线教授引擎');
          }
        },
      });

      if (!started) {
        setTimeout(() => this.localAnswer(acc, sid, q, note ? note + '，已用离线教授引擎' : ''), 280);
      } else {
        // 兜底：云端迟迟不收尾就强制回落离线，避免一直卡在"正在翻书"
        this._aiT = setTimeout(() => {
          this._aiT = null;
          if (this.data.busy) this.localAnswer(acc, sid, q, (note ? note + '；' : '') + '云端超时，已切回离线引擎');
        }, 26000);
      }
    },

    // 流式增量：节流 70ms，避免每来一个字就 setData
    pushStream(t) {
      const now = Date.now();
      if (this._stT && now - this._stT < 70) {
        this._stNext = t;
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
      this._stNext = t;
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

    // 落库 + 收尾（云与离线共用）
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
      this.reload();
      this.setData({ busy: false, petLine: A.PET_MOODS.happy });
      this.setMood('happy');
      setTimeout(() => {
        this.setData({ petLine: A.PET_MOODS.idle });
        this.setMood('idle');
      }, 2200);
      sync.schedule(acc);
    },

    localAnswer(acc, sid, q, note) {
      const r = engine.answer(q, this.data.style, this.data.ctx);
      const blocks = r.blocks.slice();
      if (note) blocks.unshift({ type: 'tip', text: note });
      this.commit(acc, sid, { text: r.title, blocks: blocks, refs: r.refs });
    },

    // ---------- 相机：拍照识题 / 手写批改 ----------
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
      this.setData({ busy: true, petLine: A.PET_MOODS.think });
      this.setMood('think');
      this.reload();

      // 像素分析始终本地做；OCR 只在云开发可用时尝试（失败自动为空）
      const px = vision.readPixels(path);
      const tx = vision.ocr(path);
      Promise.all([px, tx]).then((arr) => {
        const rep = vision.build(paper, arr[0], arr[1]);
        const blocks = this.reportBlocks(rep);
        this.commit(acc, sid, {
          text: paper ? '📷 已批改：' + paper.title : '📷 识题结果',
          blocks: blocks,
          refs: { ch: paper && paper.sub ? '' : '', lab: -1 },
        });
      });
    },

    // 把批改报告转成消息块
    reportBlocks(rep) {
      // 渲染逻辑在 utils/vision.reportBlocks（含搜题结果段），页面端 / 组件端共用一份
      return vision.reportBlocks(rep);
    },

    reload() {
      const acc = app.account();
      const s = chat.current(acc);
      this.sid = s.id;
      this.renderMsgs(s.msgs || []);
    },

    onInput(e) {
      this.setData({ input: e.detail.value });
    },

    onConfirm(e) {
      this.send(e.detail.value);
    },

    onSend() {
      this.send();
    },

    tapAsk(e) {
      const q = e.currentTarget.dataset.q;
      if (q) this.send(q);
    },

    insSym(e) {
      const v = e.currentTarget.dataset.v || '';
      this.setData({ input: (this.data.input || '') + v });
    },

    tapSymbolChip(e) {
      const q = e.currentTarget.dataset.q;
      wx.showToast({ title: q, icon: 'none' });
    },

    setStyle(e) {
      const id = e.currentTarget.dataset.id;
      if (id === this.data.style) return;
      this.setData({ style: id });
      // 立即用新风格重答最后一条
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
      const acc = app.account();
      chat.replaceLast(acc, this.sid, {
        role: 'assistant',
        text: r.title,
        blocks: r.blocks,
        refs: r.refs,
        ts: Date.now(),
      });
      this.reload();
    },

    copyCode(e) {
      const text = e.currentTarget.dataset.text || '';
      util.copy(text, '代码已复制');
    },

    previewImg(e) {
      const src = e.currentTarget.dataset.src;
      if (!src) return;
      try {
        wx.previewImage({ urls: [src], current: src });
      } catch (err) {}
    },

    // ---------- 三级切换 ----------
    expand() {
      this.refreshCtx();
      this.loadMsgs();
      this.setData({ state: 'half' });
    },

    collapse() {
      this.setData({ state: 'pet' });
      this.setMood('idle');
    },

    toFull() {
      this.setData({ state: 'pet' });
      wx.navigateTo({ url: '/pages/assistant/assistant?sid=' + (this.sid || '') });
    },

    // ---------- 拖拽 ----------
    onTouchStart(e) {
      const t = e.touches[0];
      this.startX = t.clientX;
      this.startY = t.clientY;
      this.originX = this.data.x;
      this.originY = this.data.y;
      this.moved = false;
    },

    onTouchMove(e) {
      const t = e.touches[0];
      const dx = t.clientX - this.startX;
      const dy = t.clientY - this.startY;
      if (!this.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 10) return;
        this.moved = true;
        this.setData({ dragging: true });
        this.setMood('alert');
      }
      const nx = this.clampX(this.originX + dx);
      const ny = this.clampY(this.originY + dy);
      // 位置未变就不 setData，降低抖动与卡顿
      if (this._lx === nx && this._ly === ny) return;
      this._lx = nx;
      this._ly = ny;
      this.setData({ x: nx, y: ny });
    },

    onTouchEnd() {
      if (this.moved) {
        try {
          wx.setStorageSync(POS_KEY, { x: this.data.x, y: this.data.y });
        } catch (e) {}
        this.setData({ dragging: false });
        this.setMood('idle');
        return;
      }
      this.setData({ dragging: false });
      this.setMood('idle');
      // 没有移动 = 单击：直接展开半屏（不依赖 tap，避免 catchtouchstart 吃掉 tap）
      this.expand();
    },

    onTouchCancel() {
      this.setData({ dragging: false });
      this.setMood('idle');
    },

    // ---------- 联动 ----------
    goLab(e) {
      const tab = Number(e.currentTarget.dataset.lab);
      app.globalData.ctx = { labTab: tab >= 0 ? tab : 0 };
      this.setData({ state: 'pet' });
      util.crossTab(2, { hint: '试一试这个实验' });
    },

    goChapter(e) {
      const ch = e.currentTarget.dataset.ch;
      if (!ch) return;
      this.setData({ state: 'pet' });
      wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + ch });
    },

  },
});
