const app = require('../../utils/appref');
const store = require('../../utils/store');
const util = require('../../utils/util');
const pk = require('../../utils/pk');
const cloud = require('../../utils/cloud');
const D = require('../../data/index');

const LETTERS = ['A', 'B', 'C', 'D'];
const ME_AVATAR = 'cheer';
const TICK = 100; // 计时刷新间隔（毫秒）

Page({
  data: {
    theme: 'light',
    mode: 'lobby', // lobby | matching | run | result
    letters: LETTERS,
    limit: pk.LIMIT_MS / 1000,
    totalN: pk.N_Q,

    // 大厅
    tier: null,
    rp: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    best: 0,
    matches: 0,
    rate: 0,
    recent: [],
    cloudOn: false,

    // 匹配 / 房间
    matchTip: '正在寻找同段位的对手…',
    room: '',
    roomOpen: false,
    fromInvite: false,
    inviteTip: '',

    // 对局
    me: null,
    foe: null,
    q: null,
    idx: 0,
    picked: -1,
    answered: false,
    correctIdx: -1,
    left: '10.0',
    leftPct: 100,
    warn: false,
    combo: 0,
    maxCombo: 0,
    floatMe: '',
    floatFoe: '',
    flash: '', // me | foe | ''  屏幕上的一次对错闪烁

    // 结算
    result: null,
    rpDelta: 0,
    tierUp: false,
    tierDown: false,
    friendScore: null,
    friendName: '',
  },

  onLoad(q) {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    this.query = q || {};
    this.loadProfile();
    this.setData({ cloudOn: cloud.available() });

    // 好友从对战卡片进来：房间号 + 种子都在 query 里
    const room = pk.validRoom(this.query.room);
    if (room) {
      let nick = '';
      try {
        nick = this.query.nick ? decodeURIComponent(this.query.nick) : '';
      } catch (e) {
        nick = '';
      }
      this.room = room;
      this.seed = Number(this.query.seed) || pk.hashStr('PK' + room);
      this.setData({
        room,
        fromInvite: true,
        mode: 'lobby',
        inviteTip:
          '房间 ' + room + ' · ' + (nick ? nick + ' 邀你' : '好友邀你') + '打一局（同房间同一套题）',
      });
    }
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    if (theme !== this.data.theme) {
      this.setData({ theme });
      util.applyTheme(theme);
    }
    if (this.data.mode === 'lobby') this.loadProfile();
    // 切后台会把所有计时器清掉，回来必须接上：匹配中重开匹配，对局中重进当前题
    if (this.data.mode === 'matching') {
      this.beginMatch(this.data.fromInvite);
    } else if (this.data.mode === 'run') {
      if (this._answered) this.nextQ();
      else {
        this._qStart = Date.now();
        this.startClock();
      }
    }
  },

  onHide() {
    this._pausedAt = Date.now();
    this.stopClock();
    clearTimeout(this._matchT);
    clearTimeout(this._nextT);
  },

  onUnload() {
    this._pausedAt = 0;
    this.stopClock();
    clearTimeout(this._matchT);
    clearTimeout(this._nextT);
  },

  // ---------- 档案 ----------
  loadProfile() {
    const acc = app.account();
    const d = store.load(acc);
    const p = d.pk || {};
    const tier = pk.tierOf(p.rp || 0);
    const wins = p.wins || 0;
    const losses = p.losses || 0;
    const matches = wins + losses;
    this.setData({
      tier,
      rp: tier.rp,
      wins,
      losses,
      streak: p.streak || 0,
      best: p.best || 0,
      matches,
      rate: matches ? Math.round((wins / matches) * 100) : 0,
      recent: (p.history || []).slice(0, 5),
    });
  },

  // ---------- 开局 ----------
  // 随机匹配：房间码随手生成，seed 由时间和随机数混出来
  tapRandom() {
    const room = pk.makeRoom();
    this.room = room;
    this.seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    this.beginMatch(false);
  },

  // 邀好友：房间码固定，seed 由房间码派生 —— 好友拿到同一 seed 就拿到同一套题
  openRoom() {
    if (!this.room) {
      this.room = pk.makeRoom();
      this.seed = pk.hashStr('PK' + this.room);
    }
    this.setData({ roomOpen: true, room: this.room });
  },

  closeRoom() {
    this.setData({ roomOpen: false });
  },

  startFromRoom() {
    this.setData({ roomOpen: false });
    if (!this.seed) this.seed = pk.hashStr('PK' + this.room);
    this.beginMatch(true);
  },

  copyRoom() {
    util.copy(this.room, '房间号已复制：' + this.room);
  },

  goMatch() {
    wx.navigateTo({ url: '/pages/match/match' });
  },

  // 好友点开邀请卡片后的"开始对战"
  acceptInvite() {
    if (!this.seed) this.seed = pk.hashStr('PK' + this.room);
    this.beginMatch(true);
  },

  beginMatch(isRoom) {
    const d = this.data;
    const rpg = d.rp || 0;
    this.setData({
      mode: 'matching',
      matchTip: isRoom ? '正在进入房间 ' + this.room + '…' : '正在寻找同段位的对手…',
      me: {
        name: store.getNickname(app.account()) || '我',
        avatar: '/assets/pet/' + ME_AVATAR + '.png',
        tierName: d.tier ? d.tier.short : '青铜阶跃',
        tierColor: d.tier ? d.tier.color : '#B08D57',
        hp: pk.HP_MAX,
        score: 0,
        correct: 0,
        show: true,
      },
      foe: { name: '???', avatar: '/assets/pet/confused.png', hp: pk.HP_MAX, score: 0, show: false },
      combo: 0,
      maxCombo: 0,
      idx: 0,
      q: null,
      result: null,
      rpDelta: 0,
      tierUp: false,
      tierDown: false,
      friendScore: null,
    });

    // 高拟真匹配：留 1.5 秒让人看到"在找人"，而不是瞬间硬塞一个 AI
    const self = this;
    clearTimeout(this._matchT);
    this._matchT = setTimeout(() => {
      const rival = pk.makeRival(this.seed ^ 0x9e3779b9, rpg);
      this.rival = rival;
      this.setData({
        foe: {
          name: rival.name,
          avatar: '/assets/pet/' + rival.avatar + '.png',
          tierName: rival.tier.short,
          tierColor: rival.tier.color,
          hp: pk.HP_MAX,
          score: 0,
          correct: 0,
          show: true,
          rp: rival.rp,
        },
      });
      self._matchT = setTimeout(() => self.startRun(), 620);
    }, 1500);
  },

  startRun() {
    const rng = pk.mulberry32(this.seed);
    const qs = pk.pickQuestions(rng, pk.N_Q);
    const rival = this.rival || pk.makeRival(this.seed ^ 0x9e3779b9, this.data.rp);

    this.qs = qs;
    this.rng = rng;
    this.plans = [];
    this.answers = [];
    this.myCombo = 0;
    this.foeCombo = 0;
    this.maxCombo = 0;

    // 每一题的对手作答计划一次性排好：进度条跑到位就"作答"，
    // 这样对手的节奏是平滑的，而不是答完题才忽然结算
    let lead = 0;
    let foeGot = 0;
    for (let i = 0; i < qs.length; i++) {
      const plan = pk.planAnswer(rng, qs[i], rival.params, lead);
      // 连丢两题后 AI 会急，抢答提前 —— 否则玩家手快时对手整局 0 分，看着像挂机
      if (i >= 2 && foeGot === 0) plan.at = Math.max(1.3, Math.round(plan.at * 0.66 * 10) / 10);
      plan.combo = plan.ok ? (i > 0 && this.plans[i - 1].ok ? this.plans[i - 1].combo + 1 : 1) : 0;
      if (plan.ok) {
        foeGot += 1;
        lead += pk.scoreOf(true, (10 - plan.at) * 1000, plan.combo) * 0.4;
      }
      this.plans.push(plan);
    }

    this.setData({ mode: 'run', idx: 0 });
    this.nextQ();
  },

  nextQ() {
    const i = this.data.idx;
    if (i >= this.qs.length) return this.finish(false);

    const q = this.qs[i];
    this._qStart = Date.now();
    this._foeDone = false;
    this._answered = false;

    this.setData({
      q: {
        id: q.id,
        ch: q.ch,
        difficulty: q.difficulty,
        stem: q.stem,
        options: q.options,
        chName: (D.chapters[q.ch] || {}).name || '',
      },
      picked: -1,
      answered: false,
      correctIdx: -1,
      left: '10.0',
      leftPct: 100,
      warn: false,
      idx: i + 1,
      floatMe: '',
      floatFoe: '',
      flash: '',
    });
    this.startClock();
  },

  // ---------- 时钟 ----------
  startClock() {
    this.stopClock();
    const self = this;
    this._timer = setInterval(() => self.tick(), TICK);
  },

  stopClock() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  tick() {
    if (this.data.mode !== 'run' || this._answered) return;
    const el = Date.now() - this._qStart;
    const leftMs = Math.max(0, pk.LIMIT_MS - el);

    // 对手到点作答（先于玩家答完就弹提示，抢答的紧张感来自这里）
    const plan = this.plans[this.data.idx - 1];
    if (plan && !this._foeDone && el >= plan.at * 1000) {
      this._foeDone = true;
      this.foeAnswer(plan);
    }

    if (leftMs <= 0) {
      this.submit(-1);
      return;
    }

    const left = (leftMs / 1000).toFixed(1);
    const pct = Math.round((leftMs / pk.LIMIT_MS) * 100);
    const warn = leftMs <= 3000;
    if (left !== this.data.left || warn !== this.data.warn) {
      this.setData({ left, leftPct: pct, warn });
    }
  },

  foeAnswer(plan) {
    const foe = Object.assign({}, this.data.foe);
    if (plan.ok) {
      this.foeCombo += 1;
      const gain = pk.scoreOf(true, (10 - plan.at) * 1000, this.foeCombo);
      foe.score += gain;
      foe.correct += 1;
      foe.hp = Math.min(pk.HP_MAX, foe.hp + pk.hpOf(true, false));
      this.setData({ foe, floatFoe: '+' + gain });
    } else {
      this.foeCombo = 0;
      foe.hp = Math.max(0, foe.hp + pk.hpOf(false, false));
      this.setData({ foe, floatFoe: '✗' });
    }
    // 飘字 900ms 后消失
    clearTimeout(this._foeFloatT);
    this._foeFloatT = setTimeout(() => this.setData({ floatFoe: '' }), 900);
  },

  // ---------- 作答 ----------
  pick(e) {
    if (this.data.answered || this.data.mode !== 'run') return;
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ picked: i });
    // 选完立刻判，抢答的爽点在于"点了就算"
    this.submit(i);
  },

  submit(picked) {
    if (this._answered) return;
    this._answered = true;
    this.stopClock();

    const i = this.data.idx - 1;
    const q = this.qs[i];
    const el = Date.now() - this._qStart;
    const leftMs = Math.max(0, pk.LIMIT_MS - el);
    const correct = picked === q.answer;
    const timeout = picked < 0;

    const me = Object.assign({}, this.data.me);
    let gain = 0;
    let combo = this.myCombo;

    if (correct) {
      combo += 1;
      this.myCombo = combo;
      if (combo > this.maxCombo) this.maxCombo = combo;
      gain = pk.scoreOf(true, leftMs, combo);
      me.score += gain;
      me.correct += 1;
      me.hp = Math.min(pk.HP_MAX, me.hp + pk.hpOf(true, false));
      util.vibrate();
    } else {
      this.myCombo = 0;
      combo = 0;
      me.hp = Math.max(0, me.hp + pk.hpOf(false, timeout));
      if (!timeout) util.vibrate();
    }

    this.answers.push({ id: q.id, picked, ok: correct, at: Math.round((el / 1000) * 10) / 10 });

    this.setData({
      me,
      answered: true,
      correctIdx: q.answer,
      combo,
      maxCombo: this.maxCombo,
      floatMe: gain ? '+' + gain : '',
      flash: correct ? 'me' : 'foe',
      leftPct: Math.round((leftMs / pk.LIMIT_MS) * 100),
    });

    // 血条清零 = KO，直接结束，不等第 5 题
    const ko = me.hp <= 0;
    clearTimeout(this._nextT);
    const self = this;
    this._nextT = setTimeout(
      () => {
        if (ko) self.finish(true);
        else self.nextQ();
      },
      ko ? 900 : 1150
    );
  },

  // ---------- 结算 ----------
  finish(ko) {
    this.stopClock();
    clearTimeout(this._nextT);

    const me = Object.assign({}, this.data.me);
    const foe = Object.assign({}, this.data.foe);
    const win = me.score > foe.score || (me.score === foe.score && me.hp > foe.hp);
    const draw = me.score === foe.score && me.hp === foe.hp;
    const total = this.qs ? this.qs.length : pk.N_Q;

    const delta = pk.rpDelta(win && !draw, this.data.rp, this.data.foe.rp || this.data.rp, ko);
    const before = this.data.rp;
    const after = pk.applyRp(before, draw ? 3 : delta);
    const t0 = pk.tierOf(before);
    const t1 = pk.tierOf(after);
    const usedDelta = after - before;

    const acc = app.account();
    store.recordPk(acc, {
      rp: after,
      win: win && !draw,
      my: me.score,
      foe: foe.score,
      foeName: foe.name,
      foeTier: foe.tierName,
      delta: usedDelta,
      room: this.room || '',
      ko,
    });

    let fastest = 0;
    (this.answers || []).forEach((a) => {
      if (a.ok && (!fastest || a.at < fastest)) fastest = a.at;
    });

    const result = {
      win: win && !draw,
      draw,
      ko,
      my: me.score,
      foe: foe.score,
      myCorrect: me.correct,
      foeCorrect: foe.correct,
      total,
      maxCombo: this.maxCombo,
      fastest: fastest ? fastest.toFixed(1) + 's' : '—',
      foeName: foe.name,
      foeTier: foe.tierName,
      foeAvatar: foe.avatar,
      myAvatar: me.avatar,
      myTier: t1.name,
      myTierColor: t1.color,
      room: this.room || '',
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      word: pk.verdict(win && !draw, { score: me.score }, { score: foe.score }, ko),
      answers: (this.answers || []).slice(),
    };

    this.setData({
      mode: 'result',
      result,
      me,
      foe,
      rpDelta: usedDelta,
      rp: after,
      tier: t1,
      tierUp: t1.i > t0.i,
      tierDown: t1.i < t0.i,
      floatMe: '',
      floatFoe: '',
      flash: '',
    });

    this.loadProfile();
    if (this.room) this.syncRoom(after, me.score);
    setTimeout(() => this.drawReport(), 120);
  },

  // 房间成绩：云可用时写一份，好友打完能读到真实分数；不可用就纯本地
  syncRoom(rp, score) {
    const room = this.room;
    if (!room) return;
    try {
      if (!cloud.available()) return;
      const self = this;
      cloud
        .call('pksave', {
          room,
          score,
          rp,
          name: store.getNickname(app.account()) || '同学',
        })
        .then((r) => {
          if (!r.ok) return null;
          return cloud.call('pkget', { room }).then((g) => (g.ok ? g : null));
        })
        .then((g) => {
          if (!g) return;
          const rows = (g.list || []).filter((x) => !x.self);
          if (!rows.length) return;
          const top = rows.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
          self.setData({ friendScore: top.score || 0, friendName: top.name || '好友' });
        })
        .catch(() => {});
    } catch (e) {}
  },

  // ---------- 再来一局 / 返回 ----------
  again() {
    this.seed = 0;
    this.setData({ mode: 'lobby', q: null, result: null, roomOpen: false, inviteTip: '' });
    this.loadProfile();
    setTimeout(() => {
      this.tapRandom();
    }, 60);
  },

  backLobby() {
    this.stopClock();
    this.seed = 0;
    this.setData({ mode: 'lobby', q: null, result: null, inviteTip: '' });
    this.loadProfile();
  },

  quit() {
    const self = this;
    wx.showModal({
      title: '退出对局？',
      content: '本局不计入战绩，确认离开擂台？',
      confirmText: '退出',
      success(r) {
        if (r.confirm) self.backLobby();
      },
    });
  },

  // ---------- 战报卡片 ----------
  drawReport() {
    const r = this.data.result;
    if (!r) return;
    const self = this;
    wx.createSelectorQuery()
      .in(this)
      .select('#cvReport')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const node = res[0].node;
        const w = res[0].width;
        const h = res[0].height;
        if (!w || !h) return;
        let dpr = 2;
        try {
          dpr = wx.getWindowInfo().pixelRatio || 2;
        } catch (e) {
          dpr = 2;
        }
        node.width = Math.round(w * dpr);
        node.height = Math.round(h * dpr);
        const ctx = node.getContext('2d');
        ctx.scale(dpr, dpr);
        this._reportCv = node;
        this.paintReport(ctx, w, h, r);
      });
  },

  paintReport(ctx, w, h, r) {
    const dark = this.data.theme === 'dark';
    const bg1 = dark ? '#2B211A' : '#FFFDFB';
    const bg2 = dark ? '#221A15' : '#FFF3EC';
    const ink = dark ? '#F4E9E0' : '#33261F';
    const ink2 = dark ? '#C2AEA0' : '#7B685C';
    const ink3 = dark ? '#8E7A6C' : '#A89384';
    const line = dark ? '#3A2C23' : '#F1E2D6';
    const prim = dark ? '#FF8B6B' : '#F2694B';
    const mint = dark ? '#8FD6B2' : '#1FA97C';
    const winColor = r.win ? mint : r.draw ? ink2 : prim;

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bg1);
    g.addColorStop(1, bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 卡片宽高都随屏幕缩放（宽 100%、高 860rpx），坐标必须按比例算，
    // 否则小屏上段位那行会压到底部横线
    const kx = w / 320;
    const ky = h / 430;
    const pad = 22 * kx;
    const Y = (v) => v * ky;
    const SZ = (v) => Math.max(6, v * kx);

    const F = (size, bold) => (bold ? '700 ' : '') + size + 'px -apple-system, "PingFang SC", sans-serif';
    const text = (t, x, y, color, size, align, bold) => {
      ctx.fillStyle = color;
      ctx.font = F(size, bold);
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, x, y);
    };

    // 头部
    text('信号擂台 · 战报', pad, Y(30), ink, SZ(15), 'left', true);
    text(r.at, w - pad, Y(30), ink3, SZ(10.5), 'right');
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, Y(46));
    ctx.lineTo(w - pad, Y(46));
    ctx.stroke();

    // 胜负大字
    const title = r.ko ? (r.win ? 'K.O. 胜利' : 'K.O. 落败') : r.draw ? '平局' : r.win ? '胜利' : '惜败';
    text(title, w / 2, Y(78), winColor, SZ(27), 'center', true);

    // 比分
    const off = 42 * kx;
    text(String(r.my), w / 2 - off, Y(120), prim, SZ(30), 'right', true);
    text(':', w / 2, Y(118), ink3, SZ(20), 'center');
    text(String(r.foe), w / 2 + off, Y(120), ink2, SZ(30), 'left', true);
    text('我', w / 2 - off, Y(152), ink3, SZ(10), 'right');
    text('对手', w / 2 + off, Y(152), ink3, SZ(10), 'left');

    // 双方信息
    const rowY = Y(188);
    text(r.myTier, pad, rowY, ink, SZ(11), 'left', true);
    text(r.foeTier + ' · ' + r.foeName, w - pad, rowY, ink2, SZ(11), 'right');

    // 数据条
    const barTop = rowY + Y(16);
    const barH = Y(62);
    ctx.fillStyle = dark ? '#33261F' : '#FFF6F0';
    ctx.fillRect(pad, barTop, w - pad * 2, barH);
    const cols = [
      ['答对', r.myCorrect + '/' + r.total],
      ['最长连击', 'x' + r.maxCombo],
      ['最快单题', r.fastest],
    ];
    cols.forEach((c, i) => {
      const cx = pad + ((w - pad * 2) / 3) * (i + 0.5);
      text(c[1], cx, barTop + Y(26), ink, SZ(14), 'center', true);
      text(c[0], cx, barTop + Y(46), ink3, SZ(9.5), 'center');
    });

    // 段位变化
    const dy = barTop + barH + Y(22);
    const before = Math.max(0, this.data.rp - this.data.rpDelta);
    text('段位分', pad, dy, ink3, SZ(10.5), 'left');
    text(before + ' → ' + this.data.rp, pad + 52 * kx, dy, ink, SZ(13), 'left', true);
    const dTxt = (this.data.rpDelta > 0 ? '+' : '') + this.data.rpDelta;
    text(dTxt, w - pad, dy, this.data.rpDelta >= 0 ? mint : prim, SZ(15), 'right', true);

    // 段位进度条
    const tier = pk.tierOf(this.data.rp);
    const by = dy + Y(16);
    ctx.fillStyle = dark ? '#3A2C23' : '#F1E2D6';
    ctx.fillRect(pad, by, w - pad * 2, Y(6));
    ctx.fillStyle = tier.color;
    ctx.fillRect(pad, by, (w - pad * 2) * tier.progress, Y(6));
    text(tier.icon + ' ' + tier.name, pad, by + Y(22), tier.color, SZ(11.5), 'left', true);
    text(
      tier.i >= 5 ? '已是顶点' : '距 ' + tier.nextName + ' ' + tier.toNext + ' 分',
      w - pad,
      by + Y(22),
      ink3,
      SZ(10),
      'right'
    );

    // 底部
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(pad, h - Y(40));
    ctx.lineTo(w - pad, h - Y(40));
    ctx.stroke();
    text(r.word, w / 2, h - Y(26), ink2, SZ(11), 'center');
    text(
      '信号与系统 Pro · 1v1 擂台' + (r.room ? ' · 房间 ' + r.room : ''),
      w / 2,
      h - Y(11),
      ink3,
      SZ(9),
      'center'
    );
  },

  saveReport() {
    const self = this;
    const cv = this._reportCv;
    if (!cv) {
      util.toast('战报还没画好');
      return;
    }
    wx.canvasToTempFilePath({
      canvas: cv,
      success(res) {
        self._reportPath = res.tempFilePath;
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success() {
            util.toast('已保存到相册');
          },
          fail(e) {
            const msg = (e && e.errMsg) || '';
            if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0) {
              wx.showModal({
                title: '需要相册权限',
                content: '保存战报需要写入相册，去设置里打开一下？',
                confirmText: '去设置',
                success(r) {
                  if (r.confirm) wx.openSetting();
                },
              });
            } else {
              util.toast('保存失败，请重试');
            }
          },
        });
      },
      fail() {
        util.toast('生成图片失败');
      },
    });
  },

  // ---------- 分享 ----------
  onShareAppMessage() {
    const d = this.data;
    if (d.mode === 'result' && d.result) {
      const r = d.result;
      return {
        title:
          (r.win ? '我赢了 ' : r.draw ? '打成平手 ' : '差一点 ') +
          r.my +
          ':' +
          r.foe +
          '，来挑战我的 ' +
          r.myTier +
          ' 分数',
        path: '/pages/pk/pk?room=' + (r.room || pk.makeRoom()) + '&seed=' + (this.seed || 0) + '&score=' + r.my,
      };
    }
    if (!this.room) {
      this.room = pk.makeRoom();
      this.seed = pk.hashStr('PK' + this.room);
    }
    const nick = store.getNickname(app.account()) || '';
    return {
      title: (nick ? nick + ' 在信号擂台等你：' : '') + '同房间同一套题，5 题抢答见真章（房间 ' + this.room + '）',
      path:
        '/pages/pk/pk?room=' +
        this.room +
        '&seed=' +
        this.seed +
        (nick ? '&nick=' + encodeURIComponent(nick) : ''),
    };
  },

  onShareTimeline() {
    return {
      title: '信号与系统 1v1 擂台：5 题抢答，越界越强',
      query: 'room=' + (this.room || pk.makeRoom()),
    };
  },
});
