const app = require('../../utils/appref');
const util = require('../../utils/util');

const PAL = {
  light: {
    bg: '#FFFFFF', panel: '#FCEFE7', line: '#F1E2D6', ink: '#33261F', ink2: '#7B685C', ink3: '#A89384',
    primary: '#F2694B', blue: '#3D86D4', mint: '#1FA97C', butter: '#D98E2B', violet: '#9B86CE',
  },
  dark: {
    bg: '#221A15', panel: '#2B211A', line: '#3A2C23', ink: '#F4E9E0', ink2: '#C2AEA0', ink3: '#8E7A6C',
    primary: '#FF8B6B', blue: '#9CC0E8', mint: '#8FD6B2', butter: '#F0C069', violet: '#BFB0E6',
  },
};

// 第 5 个实验台（声波频谱）的固定参数：
// 16kHz 采样 + 1024 点 FFT -> 频率分辨率约 15.6Hz，画到 4kHz 足够覆盖人声与口哨
const SR = 16000;
const FFT_N = 1024;

Page({
  data: {
    theme: 'light',
    tab: 0,
    // 跨 tab 跳进来的来源（null = 不显示返回条）
    back: null,
    tabs: [
      { k: 0, t: '卷积扫描', s: '看两段信号怎样叠出 y(t)' },
      { k: 1, t: '谐波合成', s: 'N 个正弦叠加逼近方波' },
      { k: 2, t: '零极点', s: '拖极点看稳定性与频响' },
      { k: 3, t: '采样混叠', s: '采样率不够会折出假频率' },
      { k: 4, t: '声波频谱', s: '麦克风实时 FFT' },
      { k: 5, t: '震动滤波', s: '手机加速度计实时测振与滤波' },
    ],
    // 参数
    a: 2.0,
    b: 1.6,
    tau: 1.2,
    wave: 0,
    waves: ['方波', '锯齿波', '三角波'],
    N: 5,
    r: 0.8,
    ang: 60,
    f0: 3,
    fs: 8,
    // ⑥ 手绘自定义波形（tab 0 的子模式）
    drawMode: false,
    hk: 'box',
    hks: [
      { k: 'box', t: '矩形 h(t)' },
      { k: 'exp', t: '指数衰减' },
      { k: 'tri', t: '三角 h(t)' },
    ],
    drawn: false,
    dPeak: '0',
    dArea: '0',
    dBw: '0',
    // 结论
    convY: 0,
    convPhase: '',
    harmPeak: '0',
    poleSigma: '0',
    poleOmega: '0',
    poleStable: true,
    aliasF: '0',
    aliased: false,
    // ⑤ 声波频谱
    micOn: false,
    simKind: 'whistle',
    sims: [
      { k: 'whistle', t: '口哨 2.6k' },
      { k: 'chord', t: '和弦 A4' },
      { k: 'sweep', t: '扫频 0.3→3.2k' },
    ],
    peakHz: '0',
    peakNote: '未开始',
    specHint: '点「开麦克风」吹个口哨，或直接用内置测试信号',
    // 分享复原
    // ⑥ 震动滤波
    accelOn: false,
    accelSim: false,
    filterType: 'iir',
    accelAlpha: 0.15,
    accelWin: 9,
    accelPeakHz: '0.0',
    accelRms: '0.00',
    accelRed: '0%',
    accelStatus: '未开始',
    accelHint: '点「开加速度计」摇晃手机，或在电脑上点「模拟手摇」',
    shared: false,
  },

  onLoad(q) {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    this._cv = {};
    this._spec = null;
    this._d = null;
    this._ink = false;
    this._drawing = false;
    this._lastCi = null;
    this.applyQuery(q);
    this.calcConv();
    this.calcHarm();
    this.calcPole();
    this.calcSamp();
  },

  // 从分享路径复原参数（如 ?tab=2&r=-0.5&ang=40）
  applyQuery(q) {
    if (!q) return;
    const patch = {};
    if (q.tab !== undefined && !isNaN(Number(q.tab))) {
      const t = Math.max(0, Math.min(5, Math.round(Number(q.tab))));
      patch.tab = t;
    }
    ['a', 'b', 'tau', 'N', 'wave', 'r', 'ang', 'f0', 'fs'].forEach((k) => {
      if (q[k] !== undefined && q[k] !== '' && !isNaN(Number(q[k]))) patch[k] = Number(q[k]);
    });
    // 手绘波形走另一条路径：mode=draw + d=（14 段量化高度），等 canvas 量出宽度后再铺回
    if (q.mode === 'draw') {
      patch.drawMode = true;
      if (q.hk === 'box' || q.hk === 'exp' || q.hk === 'tri') patch.hk = q.hk;
      if (q.d) this._pendingD = q.d;
    }
    if (!Object.keys(patch).length) return;
    patch.shared = true;
    this.setData(patch);
  },

  onReady() {
    this.mount();
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    util.setTabBar(this, 2, theme);
    // 从章节 / 专题 / 助教跳过来的，顶部显示一条回原页的路。
    // 读完立刻清，否则源页 onHide 先跑会把它删掉
    this.setData({ back: util.backInfo() });
    util.clearBack();
    const ctx = app.globalData.ctx;
    if (ctx && typeof ctx.labTab === 'number' && ctx.labTab !== this.data.tab) {
      this.setData({ tab: ctx.labTab });
      app.globalData.ctx = null;
      setTimeout(() => this.mount(), 60);
      return;
    }
    if (ctx) app.globalData.ctx = null;
    this.mount();
  },

  goBackTab() {
    util.goBackTab();
  },

  // ---------- Canvas 基础设施 ----------
  mount() {
    const tab = this.data.tab;
    let id = ['cvConv', 'cvHarm', 'cvPole', 'cvSamp', 'cvSpec', 'cvAccel'][tab];
    // 卷积台分两套画布：矩形拖动用 cvConv，手绘用 cvDraw（要挂触摸事件）
    if (tab === 0 && this.data.drawMode) id = 'cvDraw';
    setTimeout(() => this.setup(id, () => this.draw()), 40);
  },

  setup(id, cb, retry) {
    wx.createSelectorQuery()
      .in(this)
      .select('#' + id)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const node = res[0].node;
        const w = res[0].width;
        const h = res[0].height;
        // 刚切到某个 tab 时节点可能还没排版完，尺寸取到 0 会导致整张图不画，补一次重试
        if (!w || !h) {
          if (!retry) setTimeout(() => this.setup(id, cb, true), 120);
          return;
        }
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
        this._cv[id] = { ctx, w, h };
        if (cb) cb();
      });
  },

  draw() {
    const tab = this.data.tab;
    if (tab === 0) {
      if (this.data.drawMode) this.drawDraw();
      else this.drawConv();
    }
    if (tab === 1) this.drawHarm();
    if (tab === 2) this.drawPole();
    if (tab === 3) this.drawSamp();
    if (tab === 4) this.drawSpec();
    if (tab === 5) this.drawAccel();
  },

  pal() {
    return PAL[this.data.theme === 'dark' ? 'dark' : 'light'];
  },

  clear(ctx, w, h, p) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
  },

  // 通用坐标轴
  axis(ctx, x0, y0, x1, y1, p) {
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, y0);
    ctx.stroke();
  },

  label(ctx, txt, x, y, color, size, align, bold) {
    ctx.fillStyle = color;
    ctx.font = (bold ? '700 ' : '') + (size || 11.5) + 'px -apple-system, "PingFang SC", sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
  },

  // ---------- ① 卷积 ----------
  calcConv() {
    const { a, b, tau } = this.data;
    const val = Math.max(0, Math.min(a, tau) - Math.max(0, tau - b));
    let phase = '未重叠';
    if (tau > 0 && tau < Math.min(a, b)) phase = '上升段';
    else if (tau >= Math.min(a, b) && tau <= Math.max(a, b)) phase = '平台段';
    else if (tau > Math.max(a, b) && tau < a + b) phase = '下降段';
    this.setData({ convY: Math.round(val * 100) / 100, convPhase: phase });
  },

  drawConv() {
    const c = this._cv.cvConv;
    if (!c) return;
    const { ctx, w, h } = c;
    const p = this.pal();
    const { a, b, tau } = this.data;
    this.clear(ctx, w, h, p);

    // 版面：上区放 x(τ) 与 h(t−τ) 的重叠，下区放卷积结果 y(t)
    const padL = 44;
    const padR = 16;
    const xMax = Math.max(a + b + 0.8, tau + 0.6);
    const px = (v) => padL + ((v + 0.4) / (xMax + 0.4)) * (w - padL - padR);

    const yBase1 = h * 0.42;          // 上区基线
    const yLine1 = yBase1 - h * 0.24; // 上区顶部
    const amp = yBase1 - yLine1;
    const hH = amp * 0.72;
    const hy = yBase1 - hH;

    const yTop2 = h * 0.60;
    const yBot = h - 26;
    const yMax = Math.max(a, b) + 0.2;
    const py = (v) => yBot - Math.min(v / yMax, 1.1) * (yBot - yTop2);

    // 整点竖网格：贯穿上下两区，方便判断两段信号是否对齐
    ctx.save();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    for (let k = 1; k <= Math.floor(xMax); k++) {
      const X = Math.round(px(k)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, yLine1 - 4);
      ctx.lineTo(X, yBot);
      ctx.stroke();
    }
    ctx.restore();

    // 上区底板
    ctx.fillStyle = p.panel;
    ctx.fillRect(padL, yLine1 - 10, w - padL - padR, amp + 20);

    // x(τ)：淡蓝面 + 深蓝边
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = p.blue;
    ctx.fillRect(px(0), yLine1, px(a) - px(0), amp);
    ctx.restore();

    // h(t−τ)：淡绿面 + 深绿边
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = p.mint;
    ctx.fillRect(px(tau - b), hy, px(tau) - px(tau - b), hH);
    ctx.restore();

    // 交集阴影：卷积值就是这个重叠宽度
    const lo = Math.max(0, tau - b);
    const hi = Math.min(a, tau);
    if (hi > lo) {
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = 0.72;
      ctx.fillRect(px(lo), hy, px(hi) - px(lo), hH);
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = p.primary;
      ctx.fillRect(px(lo), hy, px(hi) - px(lo), hH);
      ctx.restore();
    }

    // 两条信号的轮廓
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = p.blue;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(padL, yBase1);
    ctx.lineTo(px(0), yBase1);
    ctx.lineTo(px(0), yLine1);
    ctx.lineTo(px(a), yLine1);
    ctx.lineTo(px(a), yBase1);
    ctx.lineTo(w - padR, yBase1);
    ctx.stroke();

    ctx.strokeStyle = p.mint;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(padL, yBase1);
    ctx.lineTo(px(tau - b), yBase1);
    ctx.lineTo(px(tau - b), hy);
    ctx.lineTo(px(tau), hy);
    ctx.lineTo(px(tau), yBase1);
    ctx.lineTo(w - padR, yBase1);
    ctx.stroke();

    // 上区坐标轴 + 时间刻度
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, yBase1);
    ctx.lineTo(w - padR, yBase1);
    ctx.moveTo(padL, yLine1 - 10);
    ctx.lineTo(padL, yBase1 + 5);
    ctx.stroke();

    for (let k = 0; k <= Math.floor(xMax); k++) {
      const X = Math.round(px(k)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, yBase1);
      ctx.lineTo(X, yBase1 + 5);
      ctx.stroke();
      this.label(ctx, String(k), X, yBase1 + 14, p.ink3, 10.5, 'center');
    }

    // 信号名：贴图形外侧，不压波形
    this.label(ctx, 'x(τ)', padL - 6, yLine1 + 2, p.blue, 12, 'right', true);
    this.label(ctx, 'h(t−τ)', w - padR, hy - 11, p.mint, 12, 'right', true);

    // ---------- 下区 y(t)
    ctx.save();
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, yBot);
    ctx.lineTo(w - padR, yBot);
    ctx.stroke();
    ctx.restore();

    const pts = [];
    const N = 260;
    for (let i = 0; i <= N; i++) {
      const tt = (i / N) * xMax;
      const v = Math.max(0, Math.min(a, tt) - Math.max(0, tt - b));
      pts.push([px(tt), py(v)]);
    }

    // 面积：单根线看不出"累积"的感觉，铺一层淡橙
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], yBot);
    for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(pts[pts.length - 1][0], yBot);
    ctx.closePath();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = p.primary;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = p.primary;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
      else ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();

    // 游标：竖线 + 白心高亮点
    const cv = Math.max(0, Math.min(a, tau) - Math.max(0, tau - b));
    ctx.strokeStyle = p.butter;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(px(tau), yTop2 - 6);
    ctx.lineTo(px(tau), yBot);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(px(tau), py(cv), 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = p.butter;
    ctx.stroke();

    this.label(ctx, 'y(t)', padL - 6, yTop2 + 2, p.primary, 12, 'right', true);
    this.label(ctx, 't', w - padR - 2, yBot - 15, p.ink3, 10.5, 'right');

    // 当前 t 值：带白底小标签跟着游标，超边界自动夹住
    const tag = 't=' + tau.toFixed(1);
    ctx.font = '700 11.5px -apple-system, "PingFang SC", sans-serif';
    const tw = ctx.measureText(tag).width + 14;
    let tx = px(tau) - tw / 2;
    tx = Math.max(padL, Math.min(tx, w - padR - tw));
    const ty = yTop2 - 23;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = '#fff';
    ctx.fillRect(tx, ty, tw, 18);
    ctx.restore();
    ctx.strokeStyle = p.butter;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 17);
    this.label(ctx, tag, tx + tw / 2, ty + 9.5, p.butter, 11.5, 'center', true);
  },

  // ---------- ② 谐波 ----------
  harVal(wave, t, N) {
    let s = 0;
    if (wave === 0) {
      for (let n = 1; n <= N; n += 2) s += Math.sin(2 * Math.PI * n * t) / n;
      return (4 / Math.PI) * s;
    }
    if (wave === 1) {
      for (let n = 1; n <= N; n++) s += (n % 2 ? 1 : -1) * Math.sin(2 * Math.PI * n * t) / n;
      return (2 / Math.PI) * s;
    }
    for (let n = 1; n <= N; n += 2) {
      const sgn = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
      s += (sgn * Math.sin(2 * Math.PI * n * t)) / (n * n);
    }
    return (8 / (Math.PI * Math.PI)) * s;
  },

  calcHarm() {
    const { wave, N } = this.data;
    let peak = 0;
    for (let i = 0; i <= 400; i++) {
      const v = Math.abs(this.harVal(wave, i / 400, N));
      if (v > peak) peak = v;
    }
    this.setData({ harmPeak: peak.toFixed(2) });
  },

  drawHarm() {
    const c = this._cv.cvHarm;
    if (!c) return;
    const { ctx, w, h } = c;
    const p = this.pal();
    const { wave, N } = this.data;
    this.clear(ctx, w, h, p);

    const padL = 30;
    const padR = 12;
    const top = 12;
    const mid = h * 0.62;
    const zero = (top + mid) / 2;
    const ampY = (mid - top) / 2 - 6;
    const px = (t) => padL + t * (w - padL - padR);

    // 理想波形（虚线）
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = p.ink3;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const t = i / 300;
      let v = 0;
      if (wave === 0) v = Math.sin(2 * Math.PI * t) >= 0 ? 1 : -1;
      if (wave === 1) v = 2 * (((t % 1) < 0.5 ? t % 1 : t % 1) * 2 - 1);
      if (wave === 2) {
        const x = (t % 1) * 2;
        v = x <= 1 ? 2 * x - 1 : 3 - 2 * x;
      }
      const X = px(t);
      const Y = zero - v * ampY * 0.78;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    ctx.restore();

    // 合成波形
    ctx.strokeStyle = p.primary;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * 2;
      const v = this.harVal(wave, t, N);
      const X = px(t / 2);
      const Y = zero - v * ampY * 0.78;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    this.axis(ctx, padL, zero, w - padR, top, p);
    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(padL, zero);
    ctx.lineTo(w - padR, zero);
    ctx.stroke();
    this.label(ctx, '+1', padL - 6, zero - ampY * 0.78, p.ink3, 10, 'right');
    this.label(ctx, '合成波', w - padR, top + 4, p.primary, 11, 'right');

    // 频谱柱
    const sTop = mid + 14;
    const sBot = h - 20;
    const maxN = Math.min(N % 2 === 0 && wave !== 1 ? N + 1 : N, 15);
    const cols = 15;
    const bw = (w - padL - padR) / cols;
    let maxA = 0.001;
    const amps = [];
    for (let n = 1; n <= cols; n++) {
      let A = 0;
      if (wave === 1) A = 2 / (Math.PI * n);
      else if (n % 2 === 1) A = wave === 0 ? 4 / (Math.PI * n) : 8 / (Math.PI * Math.PI * n * n);
      amps.push(A);
      if (A > maxA) maxA = A;
    }
    for (let n = 1; n <= cols; n++) {
      const A = amps[n - 1];
      const bh = (A / maxA) * (sBot - sTop);
      const X = padL + (n - 1) * bw + bw * 0.22;
      ctx.fillStyle = n <= maxN ? p.violet : p.line;
      ctx.fillRect(X, sBot - bh, bw * 0.56, bh);
    }
    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(padL, sBot);
    ctx.lineTo(w - padR, sBot);
    ctx.stroke();
    this.label(ctx, '谐波幅度', padL, sTop - 8, p.ink3, 10);
    this.label(ctx, '1', padL + bw * 0.22, sBot + 10, p.ink3, 9, 'center');
    this.label(ctx, '15', padL + 14 * bw + bw * 0.22, sBot + 10, p.ink3, 9, 'center');
  },

  // ---------- ③ 零极点 ----------
  calcPole() {
    const { r, ang } = this.data;
    const rad = (ang * Math.PI) / 180;
    const sigma = -r * Math.cos(rad);
    const omegaP = r * Math.sin(rad);
    this.setData({
      poleSigma: sigma.toFixed(2),
      poleOmega: omegaP.toFixed(2),
      poleStable: sigma < 0,
    });
  },

  drawPole() {
    const c = this._cv.cvPole;
    if (!c) return;
    const { ctx, w, h } = c;
    const p = this.pal();
    const { r, ang } = this.data;
    this.clear(ctx, w, h, p);

    const rad = (ang * Math.PI) / 180;
    const sigma = -r * Math.cos(rad);
    const w0 = r * Math.sin(rad);

    // --- s 平面 ---
    const size = Math.min(w * 0.46, h - 30);
    const cx = 18 + size / 2;
    const cy = h / 2;
    const scale = size / 2 / 2.4;

    ctx.fillStyle = p.panel;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);

    // ROC 阴影
    if (sigma < 0) {
      ctx.fillStyle = p.mint;
      ctx.globalAlpha = 0.16;
      ctx.fillRect(cx + sigma * scale, cy - size / 2, size / 2 - sigma * scale, size);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.primary;
      ctx.globalAlpha = 0.14;
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      ctx.globalAlpha = 1;
    }

    // 轴
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - size / 2, cy);
    ctx.lineTo(cx + size / 2, cy);
    ctx.moveTo(cx, cy - size / 2);
    ctx.lineTo(cx, cy + size / 2);
    ctx.stroke();
    this.label(ctx, 'σ', cx + size / 2 - 8, cy - 10, p.ink3, 10);
    this.label(ctx, 'jω', cx + 8, cy - size / 2 + 8, p.ink3, 10);

    // 极点
    const pxp = cx + sigma * scale;
    const pyp = cy - w0 * scale;
    const pyq = cy + w0 * scale;
    ctx.strokeStyle = p.primary;
    ctx.lineWidth = 2;
    [pyp, pyq].forEach((Y) => {
      ctx.beginPath();
      ctx.moveTo(pxp - 5, Y - 5);
      ctx.lineTo(pxp + 5, Y + 5);
      ctx.moveTo(pxp + 5, Y - 5);
      ctx.lineTo(pxp - 5, Y + 5);
      ctx.stroke();
    });
    if (sigma < 0) {
      ctx.strokeStyle = p.mint;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pxp, cy - size / 2);
      ctx.lineTo(pxp, cy + size / 2);
      ctx.stroke();
    }

    // --- h(t) ---
    const rx = cx + size / 2 + 16;
    const rw = w - rx - 10;
    const hTop = 16;
    const hMid = h * 0.46;
    const hBot = hMid + 10;
    const hAmp = (hMid - hTop) / 2;

    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(rx, hMid);
    ctx.lineTo(w - 10, hMid);
    ctx.stroke();

    let peak = 0.0001;
    const vals = [];
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * 6;
      const v = Math.exp(sigma * t) * Math.sin(Math.abs(w0) * t + 0.0001);
      vals.push(v);
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    ctx.strokeStyle = p.violet;
    ctx.lineWidth = 2;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const X = rx + (i / 160) * rw;
      const Y = hMid - (v / peak) * hAmp * 0.9;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.stroke();
    this.label(ctx, 'h(t)', rx, hTop + 2, p.violet, 10);

    // --- |H(jω)| ---
    const bTop = hBot + 12;
    const bBot = h - 20;
    let hmax = 0.0001;
    const mags = [];
    for (let i = 0; i <= 200; i++) {
      const wv = (i / 200) * 6 + 0.001;
      const d1 = sigma * sigma + (wv - w0) * (wv - w0);
      const d2 = sigma * sigma + (wv + w0) * (wv + w0);
      const m = 1 / Math.sqrt(d1 * d2);
      mags.push(m);
      if (m > hmax && m < 1e6) hmax = m;
    }
    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(rx, bBot);
    ctx.lineTo(w - 10, bBot);
    ctx.stroke();
    ctx.strokeStyle = p.blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    mags.forEach((m, i) => {
      const X = rx + (i / 200) * rw;
      const ratio = Math.min(m / hmax, 1);
      const Y = bBot - ratio * (bBot - bTop);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.stroke();
    this.label(ctx, '|H(jω)|', rx, bTop - 4, p.blue, 10);
    this.label(ctx, 'ω→', w - 10, bBot + 10, p.ink3, 9, 'right');
  },

  // ---------- ④ 采样 ----------
  calcSamp() {
    const { f0, fs } = this.data;
    const k = Math.round(f0 / fs);
    const alias = Math.abs(f0 - k * fs);
    this.setData({
      aliasF: alias.toFixed(2),
      aliased: fs < 2 * f0,
    });
  },

  drawSamp() {
    const c = this._cv.cvSamp;
    if (!c) return;
    const { ctx, w, h } = c;
    const p = this.pal();
    const { f0, fs } = this.data;
    this.clear(ctx, w, h, p);

    const padL = 30;
    const padR = 12;
    const top = 16;
    const mid = h * 0.5;
    const amp = (mid - top) / 2 - 4;
    const zero = (top + mid) / 2;
    const px = (t) => padL + t * (w - padL - padR);
    const T = 1;

    // 轴
    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(padL, zero);
    ctx.lineTo(w - padR, zero);
    ctx.stroke();

    // 连续信号
    ctx.strokeStyle = p.blue;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * T;
      const Y = zero - Math.sin(2 * Math.PI * f0 * t) * amp * 0.86;
      const X = px(t);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();
    this.label(ctx, '原信号 ' + f0 + ' Hz', padL, top + 2, p.blue, 10);

    // 采样点
    const n = Math.floor(fs * T);
    ctx.strokeStyle = p.primary;
    ctx.fillStyle = p.primary;
    ctx.lineWidth = 1.4;
    for (let i = 0; i <= n; i++) {
      const t = i / fs;
      const v = Math.sin(2 * Math.PI * f0 * t);
      const X = px(t);
      const Y = zero - v * amp * 0.86;
      ctx.beginPath();
      ctx.moveTo(X, zero);
      ctx.lineTo(X, Y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X, Y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    this.label(ctx, 'fs = ' + fs + ' Hz，共 ' + (n + 1) + ' 点', w - padR, top + 2, p.primary, 10, 'right');

    // 重建（混叠）信号
    const kk = Math.round(f0 / fs);
    const alias = Math.abs(f0 - kk * fs);
    const bTop = mid + 16;
    const bBot = h - 20;
    const bZero = (bTop + bBot) / 2;
    const bAmp = (bBot - bTop) / 2 - 4;

    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(padL, bZero);
    ctx.lineTo(w - padR, bZero);
    ctx.stroke();

    const freq = alias > 0.001 ? alias : f0;
    ctx.strokeStyle = alias > 0.001 && Math.abs(alias - f0) > 0.01 ? p.primary : p.mint;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * T;
      const Y = bZero - Math.sin(2 * Math.PI * freq * t) * bAmp * 0.86;
      const X = px(t);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    const msg = fs < 2 * f0 ? '重建出 ' + freq.toFixed(2) + ' Hz（混叠！）' : '重建 ≈ ' + freq.toFixed(2) + ' Hz（正常）';
    this.label(ctx, msg, padL, bTop + 2, fs < 2 * f0 ? p.primary : p.mint, 10.5);
    this.label(ctx, '2f₀ = ' + (2 * f0) + ' Hz', w - padR, bTop + 2, p.ink3, 10, 'right');
  },

  // ---------- ⑤ 声波 + 实时 FFT ----------
  // 采样率固定 16k、FFT 点数 1024：分辨率约 15.6Hz，频谱画到 4kHz
  fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < len / 2; k++) {
          const wr = Math.cos(ang * k);
          const wi = Math.sin(ang * k);
          const ar = re[i + k];
          const ai = im[i + k];
          const br = re[i + k + len / 2];
          const bi = im[i + k + len / 2];
          const tr = br * wr - bi * wi;
          const ti = br * wi + bi * wr;
          re[i + k] = ar + tr;
          im[i + k] = ai + ti;
          re[i + k + len / 2] = ar - tr;
          im[i + k + len / 2] = ai - ti;
        }
      }
    }
  },

  // 汉宁窗：不加窗时强信号会把旁瓣抬得很高，看不出真实谱形
  win() {
    if (this._win) return this._win;
    const n = FFT_N;
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    this._win = w;
    return w;
  },

  // 喂一帧样本 -> FFT -> 平滑 -> 更新峰值读数
  feed(samples) {
    const n = FFT_N;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    const w = this.win();
    for (let i = 0; i < n; i++) re[i] = samples[i] * w[i];
    this.fft(re, im);

    const half = n / 2;
    const mag = new Float32Array(half);
    for (let i = 1; i < half; i++) {
      mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    }

    if (!this._spec) {
      this._spec = { wave: new Float32Array(n), mag: new Float32Array(half), peakHz: 0 };
    }
    const s = this._spec;
    if (s.mag.length !== half) s.mag = new Float32Array(half);
    // 指数平滑：谱图不抖，峰值也稳
    for (let i = 0; i < half; i++) s.mag[i] = s.mag[i] * 0.55 + mag[i] * 0.45;
    s.wave.set(samples);

    let peak = 0;
    let pi = 0;
    for (let i = 2; i < half; i++) {
      if (s.mag[i] > peak) {
        peak = s.mag[i];
        pi = i;
      }
    }
    const hz = (pi * SR) / n;
    s.peakHz = hz;
    s.peakAmp = peak;

    // setData 4 帧同步一次，避免读数闪成一片
    this._fc = (this._fc || 0) + 1;
    if (this._fc % 4 === 0) {
      this.setData({
        peakHz: hz >= 1000 ? (hz / 1000).toFixed(2) + ' kHz' : Math.round(hz) + ' Hz',
        peakNote: hz > 0 ? '主频已锁定' : '没有明显峰值',
      });
    }
  },

  // 内置测试信号（不依赖麦克风，任何机型都能演示）
  simFrame() {
    const kind = this.data.simKind;
    const n = FFT_N;
    const dt = 1 / SR;
    const out = new Float32Array(n);
    let t = this._simT || 0;
    let ph = this._simPh || 0;
    for (let i = 0; i < n; i++) {
      const tt = t + i * dt;
      let v = 0;
      if (kind === 'chord') {
        // A4 + C#5 + E5：大三和弦，频谱上三根等间距的峰
        v = 0.3 * (Math.sin(2 * Math.PI * 440 * tt) + Math.sin(2 * Math.PI * 554.37 * tt) + Math.sin(2 * Math.PI * 659.25 * tt));
      } else if (kind === 'sweep') {
        // 0.3k -> 3.2k 慢扫，频率随时间抬升
        const f = 300 + 2900 * (0.5 - 0.5 * Math.cos((2 * Math.PI * tt) / 6));
        ph += 2 * Math.PI * f * dt;
        v = 0.45 * Math.sin(ph);
      } else {
        // 口哨：2.6kHz 基波 + 微弱二次谐波 + 气声，带 5Hz 颤音
        v =
          0.52 * Math.sin(2 * Math.PI * 2600 * tt) +
          0.16 * Math.sin(2 * Math.PI * 5200 * tt) +
          0.05 * (Math.random() - 0.5);
        v *= 0.9 + 0.1 * Math.sin(2 * Math.PI * 5 * tt);
      }
      out[i] = v;
    }
    this._simT = t + n * dt;
    this._simPh = ph;
    this.feed(out);
    this.drawSpec();
  },

  startSim(kind) {
    this.stopMic(); this.stopAccel(); this.stopSimAccel();
    this.stopSim();
    const k = kind || this.data.simKind;
    this._simT = 0;
    this._simPh = 0;
    this._spec = null;
    this.setData({
      simKind: k,
      specHint: k === 'chord' ? '内置和弦 A4+C#5+E5，频谱上三根峰' : k === 'sweep' ? '内置扫频 0.3→3.2kHz，峰在缓慢移动' : '内置口哨 2.6kHz，看基波与二次谐波',
    });
    this._simI = setInterval(() => this.simFrame(), 90);
    setTimeout(() => this.simFrame(), 30);
  },

  stopSim() {
    if (this._simI) {
      clearInterval(this._simI);
      this._simI = null;
    }
  },

  tapSim(e) {
    this.startSim(e.currentTarget.dataset.k);
  },

  // 麦克风：录 PCM 帧 -> 直接送 FFT
  startMic() {
    const self = this;
    if (this.data.micOn) return;
    const fail = (msg) => self.setData({ specHint: msg || '无法启动录音，请检查麦克风权限' });

    const go = () => {
      try {
        const rec = wx.getRecorderManager();
        if (!rec) {
          fail();
          return;
        }
        self.rec = rec;
        self._gotFrame = false;
        rec.onFrameRecorded((r) => self.onFrame(r));
        rec.onError((e) => {
          self.stopMic();
          fail('录音出错：' + ((e && e.errMsg) || '未知') + '，可先用内置测试信号');
        });
        rec.start({
          duration: 600000,
          sampleRate: SR,
          numberOfChannels: 1,
          format: 'PCM',
          frameSize: 4,
        });
        self.stopSim();
        self._spec = null;
        self.setData({ micOn: true, specHint: '正在采集…对着麦克风吹口哨或说话' });
        // 3 秒内没有任何帧：说明这台机型不支持 format: PCM 的实时帧
        self._micT = setTimeout(() => {
          if (self._gotFrame) return;
          self.stopMic();
          self.setData({ specHint: '这台设备没返回实时音频帧（PCM 实时帧受限），已切到内置测试信号' });
          self.startSim('whistle');
        }, 3000);
      } catch (e) {
        fail();
      }
    };

    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.record'] === false) {
          wx.showModal({
            title: '需要麦克风权限',
            content: '打开「麦克风」后才能实时看声波频谱。也可以直接用内置测试信号。',
            confirmText: '去设置',
            success(r) {
              if (r.confirm) wx.openSetting();
            },
          });
          return;
        }
        wx.authorize({ scope: 'scope.record', success: go, fail: go });
      },
      fail: go,
    });
  },

  onFrame(r) {
    this._gotFrame = true;
    try {
      const buf = r && r.frameBuffer;
      if (!buf) return;
      const view = new Int16Array(buf);
      if (view.length < FFT_N) return;
      const off = view.length - FFT_N;
      const s = new Float32Array(FFT_N);
      for (let i = 0; i < FFT_N; i++) s[i] = view[off + i] / 32768;
      this.feed(s);
      this.drawSpec();
    } catch (e) {}
  },

  stopMic() {
    if (this._micT) {
      clearTimeout(this._micT);
      this._micT = null;
    }
    try {
      if (this.rec) this.rec.stop();
    } catch (e) {}
    this.rec = null;
    if (this.data.micOn) this.setData({ micOn: false });
  },

  drawSpec() {
    const c = this._cv.cvSpec;
    if (!c) return;
    const { ctx, w, h } = c;
    const p = this.pal();
    const s = this._spec;
    this.clear(ctx, w, h, p);

    const padL = 34;
    const padR = 12;

    if (!s) {
      this.label(ctx, '点下方「开麦克风」，或选一个内置测试信号', padL, h / 2, p.ink3, 12);
      return;
    }

    // ---- 上：时域波形 ----
    const mid = h * 0.44;
    const zero = mid / 2 + 6;
    const amp = mid / 2 - 18;
    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(padL, zero);
    ctx.lineTo(w - padR, zero);
    ctx.stroke();

    // 自适应窗口：按主频取 8 个周期左右，既看得到波形形状，又不至于挤成一条实心带
    const n = FFT_N;
    const period = SR / (s.peakHz > 40 ? s.peakHz : 1000);
    let showN = Math.round(period * 8);
    if (showN < 64) showN = 64;
    if (showN > 512) showN = 512;
    const from = Math.max(0, n - showN);

    ctx.strokeStyle = p.blue;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = from; i < n; i++) {
      const x = padL + ((i - from) / (showN - 1)) * (w - padL - padR);
      const y = zero - Math.max(-1, Math.min(1, s.wave[i])) * amp * 0.9;
      if (i === from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const ms = Math.round((showN / SR) * 1000);
    this.label(ctx, '时域 f(t) · 最近 ' + (ms < 1 ? '1' : ms) + ' ms', padL, 14, p.blue, 10.5, 'left', true);

    // ---- 下：频谱 ----
    const top = mid + 18;
    const bot = h - 22;
    const fMax = 4000;
    const half = s.mag.length;
    const binHz = SR / n;
    const bins = Math.min(half - 1, Math.round(fMax / binHz));

    let mx = 0;
    for (let i = 2; i <= bins; i++) if (s.mag[i] > mx) mx = s.mag[i];
    if (mx <= 0) mx = 1;

    // 网格
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    for (let f = 1000; f <= fMax; f += 1000) {
      const x = Math.round(padL + (f / fMax) * (w - padL - padR)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
      this.label(ctx, f / 1000 + 'k', x, bot + 9, p.ink3, 9.5, 'center');
    }
    this.label(ctx, '0', padL, bot + 9, p.ink3, 9.5, 'center');

    // 柱状谱
    const bw = (w - padL - padR) / bins;
    for (let i = 1; i <= bins; i++) {
      const v = Math.min(1, s.mag[i] / mx);
      const bh = Math.max(0, v * (bot - top - 4));
      if (bh < 0.6) continue;
      const x = padL + (i - 1) * bw;
      ctx.fillStyle = p.primary;
      ctx.globalAlpha = 0.35 + 0.6 * v;
      ctx.fillRect(x, bot - bh, Math.max(1, bw - 0.6), bh);
    }
    ctx.globalAlpha = 1;

    // 峰值标记
    if (s.peakHz > 0) {
      const px = padL + Math.min(1, s.peakHz / fMax) * (w - padL - padR);
      ctx.strokeStyle = p.butter;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bot);
      ctx.stroke();
      const txt = s.peakHz >= 1000 ? (s.peakHz / 1000).toFixed(2) + ' kHz' : Math.round(s.peakHz) + ' Hz';
      const anchor = px > w * 0.6 ? 'right' : 'left';
      this.label(ctx, '峰值 ' + txt, anchor === 'right' ? px - 6 : px + 6, top + 8, p.butter, 10.5, anchor, true);
    }
    this.label(ctx, '|F(jω)| 幅度谱', padL, top - 4, p.ink2, 10.5, 'left', true);
    this.label(ctx, '0 – 4 kHz · 分辨率 ' + binHz.toFixed(1) + ' Hz', w - padR, top - 4, p.ink3, 9.5, 'right');
  },

  // ---------- ⑥ 手绘自定义波形 x(t) ----------
  // 流程：手指在画布上滑动 -> 逐列栅格化成 x[k] -> 松手（拖动中每 90ms 也算一次）
  // 立即做 256 点离散卷积 + 1024 点补零 FFT，下方两条曲线同步刷新
  ensureD(cols) {
    const n = Math.max(8, Math.round(cols));
    if (!this._d || this._d.length !== n) this._d = new Float32Array(n);
    return this._d;
  },

  // 手绘区几何：绘制与触摸共用一套映射，笔迹才不会和手指错位
  dGeom(w, h) {
    const padL = 34;
    const padR = 14;
    const aw = w - padL - padR;
    const gTop = 10;
    const gBot = Math.round(h * 0.4);
    return {
      padL: padL,
      padR: padR,
      aw: aw,
      gTop: gTop,
      gBot: gBot,
      base: (gTop + gBot) / 2 + 2,
      amp: (gBot - gTop) / 2 - 8,
    };
  },

  // 把一个触摸点写进列数组（手指快划时两列之间线性补齐，不断线）
  paint(e) {
    const c = this._cv.cvDraw;
    if (!c) return;
    const a = this.dGeom(c.w, c.h);
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!t) return;
    const x = t.x !== undefined ? t.x : t.clientX;
    const y = t.y !== undefined ? t.y : t.clientY;
    // 只有落在手绘区才吃笔，避免手指滑到下方结果区时把波形画成满幅方波
    if (y < a.gTop - 8 || y > a.gBot + 8) return;
    const d = this.ensureD(a.aw);
    const cols = d.length;
    let ci = Math.round(((x - a.padL) / Math.max(1, a.aw)) * (cols - 1));
    if (ci < 0) ci = 0;
    if (ci > cols - 1) ci = cols - 1;
    let v = (a.base - y) / Math.max(1, a.amp);
    if (v > 1) v = 1;
    if (v < -1) v = -1;

    if (this._lastCi !== null && this._lastCi !== undefined && Math.abs(ci - this._lastCi) > 1) {
      const s = this._lastCi;
      const sv = this._lastV;
      const step = ci > s ? 1 : -1;
      for (let k = s; k !== ci; k += step) {
        d[k] = sv + (v - sv) * ((k - s) / (ci - s));
      }
    }
    d[ci] = v;
    this._lastCi = ci;
    this._lastV = v;
    this._ink = true;
  },

  onDrawStart(e) {
    if (!this._cv.cvDraw) return;
    this._drawing = true;
    this._lastCi = null;
    this._lastV = 0;
    this.paint(e);
    this.recalcDraw(1);
  },

  onDrawMove(e) {
    if (!this._drawing) return;
    this.paint(e);
    const now = Date.now();
    // 每 90ms 真算一次，拖动过程中下方曲线就在跟着动；其余帧只刷笔迹
    if (now - (this._lastCalc || 0) >= 90) {
      this._lastCalc = now;
      this.recalcDraw(1);
    } else {
      this.drawDraw();
    }
  },

  onDrawEnd(e) {
    if (!this._drawing) return;
    this.paint(e);
    this._drawing = false;
    this._lastCi = null;
    this._lastCalc = 0;
    this.recalcDraw(0);
  },

  // 列数组 -> 256 点等间隔采样（P 越大卷积越慢，256 点足够看出形状）
  resampleD(P) {
    const out = new Float32Array(P);
    const d = this._d;
    if (!d || !d.length) return out;
    const cols = d.length;
    for (let i = 0; i < P; i++) {
      const f = (i / (P - 1)) * (cols - 1);
      const a = Math.floor(f);
      const b = Math.min(cols - 1, a + 1);
      out[i] = d[a] + (d[b] - d[a]) * (f - a);
    }
    return out;
  },

  // 冲激响应：统一归一化成"单位面积"，这样 y(t) 的幅度与 x(t) 同量级，好比较
  kernelD(P, dt) {
    const hk = this.data.hk;
    const b = this.data.b;
    const h = new Float32Array(P);
    if (hk === 'exp') {
      const tau = Math.max(0.015, b / 5);
      let s = 0;
      for (let n = 0; n < P; n++) {
        h[n] = Math.exp(-(n * dt) / tau);
        s += h[n] * dt;
      }
      if (s > 0) for (let n = 0; n < P; n++) h[n] /= s;
      return h;
    }
    const L = Math.max(1, Math.round(Math.min(P, (b / 5) * P)));
    if (hk === 'tri') {
      const half = (L - 1) / 2;
      for (let n = 0; n < L; n++) h[n] = half > 0 ? 1 - Math.abs(n - half) / half : 1;
    } else {
      for (let n = 0; n < L; n++) h[n] = 1;
    }
    let s = 0;
    for (let n = 0; n < L; n++) s += h[n] * dt;
    if (s > 0) for (let n = 0; n < L; n++) h[n] /= s;
    return h;
  },

  convolveD(x, h, dt) {
    const n = x.length;
    const y = new Float32Array(2 * n - 1);
    for (let k = 0; k < y.length; k++) {
      const lo = k - n + 1 < 0 ? 0 : k - n + 1;
      const hi = k < n - 1 ? k : n - 1;
      let s = 0;
      for (let i = lo; i <= hi; i++) s += x[i] * h[k - i];
      y[k] = s * dt;
    }
    return y;
  },

  // 补零到 1024 点做 FFT：连续谱的谱线更密，主瓣/旁瓣形状才看得出
  specD(x) {
    const N = FFT_N;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    const m = Math.min(N, x.length);
    for (let i = 0; i < m; i++) re[i] = x[i];
    this.fft(re, im);
    const half = N / 2;
    const mag = new Float32Array(half);
    for (let i = 0; i < half; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    return mag;
  },

  recalcDraw(soft) {
    const c = this._cv.cvDraw;
    if (!c || !this._d) return;
    const P = 256;
    const dt = 1 / P;
    const x = this.resampleD(P);
    const h = this.kernelD(P, dt);
    const y = this.convolveD(x, h, dt);
    const mag = this.specD(x);

    this._dx = x;
    this._dh = h;
    this._dy = y;
    this._dmag = mag;

    let area = 0;
    for (let i = 0; i < P; i++) area += x[i] * dt;
    let ypk = 0;
    for (let i = 1; i < y.length - 1; i++) {
      if (Math.abs(y[i]) > Math.abs(ypk)) ypk = y[i];
    }

    // 主瓣宽度：从峰值往右找第一个谷（要掉到峰值 30% 以下才算真谷），再乘 2 得对称主瓣
    const fbin = P / FFT_N;
    let pi = 1;
    for (let i = 2; i < mag.length; i++) if (mag[i] > mag[pi]) pi = i;
    let zero = 0;
    for (let i = pi + 1; i < mag.length - 1; i++) {
      if (mag[i] <= mag[i - 1] && mag[i] <= mag[i + 1] && mag[i] < mag[pi] * 0.3) {
        zero = i;
        break;
      }
    }
    const bw = zero ? 2 * zero * fbin : 0;

    this.drawDraw();
    if (soft) return;
    this.setData({
      drawn: true,
      dPeak: ypk.toFixed(2),
      dArea: area.toFixed(2),
      dBw: bw ? bw.toFixed(1) + ' /T' : '—',
    });
  },

  drawDraw() {
    const c = this._cv.cvDraw;
    if (!c) return;
    const { ctx, w, h } = c;
    const p = this.pal();
    this.clear(ctx, w, h, p);

    const a = this.dGeom(w, h);
    const d = this.ensureD(a.aw);
    const cols = d.length;

    // 分享还原：只有量到 canvas 宽度才知道列数，所以铺回动作放在这里做一次
    if (this._pendingD) {
      const arr = String(this._pendingD).split(',').map((s) => Number(s) || 0);
      const K = arr.length;
      if (K > 1) {
        for (let i = 0; i < cols; i++) {
          const f = (i / (cols - 1)) * (K - 1);
          const i0 = Math.floor(f);
          const i1 = Math.min(K - 1, i0 + 1);
          d[i] = (arr[i0] + (arr[i1] - arr[i0]) * (f - i0)) / 9;
        }
        this._ink = true;
      }
      this._pendingD = null;
      this._needCalc = true;
    }

    // ---------- 手绘区 ----------
    ctx.fillStyle = p.panel;
    ctx.fillRect(a.padL, a.gTop, a.aw, a.gBot - a.gTop);

    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    // 四等分网格就够定位，密了像表格反而压住笔迹
    for (let i = 1; i < 4; i++) {
      const X = Math.round(a.padL + (a.aw * i) / 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, a.gTop);
      ctx.lineTo(X, a.gBot);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(a.padL, Math.round(a.base) + 0.5);
    ctx.lineTo(a.padL + a.aw, Math.round(a.base) + 0.5);
    ctx.stroke();

    // 可绘制区域描个淡蓝边，告诉用户"就是这块能画"
    ctx.save();
    ctx.strokeStyle = p.blue;
    ctx.globalAlpha = 0.3;
    ctx.strokeRect(a.padL + 0.5, a.gTop + 0.5, a.aw - 1, a.gBot - a.gTop - 1);
    ctx.restore();

    const DX = (i) => a.padL + (i / Math.max(1, cols - 1)) * a.aw;
    const DY = (v) => a.base - v * a.amp;

    // 面积填充 + 轮廓
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(DX(0), a.base);
    for (let i = 0; i < cols; i++) ctx.lineTo(DX(i), DY(d[i]));
    ctx.lineTo(DX(cols - 1), a.base);
    ctx.closePath();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = p.blue;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = p.blue;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < cols; i++) {
      const X = DX(i);
      const Y = DY(d[i]);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    this.label(ctx, 'x(t)', a.padL - 4, a.gTop + 6, p.blue, 11, 'right', true);
    if (!this._ink) {
      this.label(ctx, '✍️ 用手指在这块区域画任意波形', a.padL + 9, a.gTop + 16, p.ink3, 11);
      this.label(ctx, '左右 = 时间，上下 = 幅度', a.padL + 9, a.gTop + 33, p.ink3, 10);
    }

    // ---------- 卷积结果 y(t) ----------
    const cTop = Math.round(h * 0.5);
    const cBot = Math.round(h * 0.7);
    this.label(ctx, 'y(t) = x(t) * h(t)', a.padL, cTop - 3, p.primary, 10.5, 'left', true);
    // 顺手把当前 h(t) 的规格标出来，不然用户只看到一条橙线，不知道核有多宽
    const hw = (this.data.b / 5).toFixed(2) + 'T';
    this.label(
      ctx,
      'h(t) ' + this.hShort() + (this.data.hk === 'exp' ? ' τ=' : ' 宽 ') + hw,
      a.padL + a.aw,
      cTop - 3,
      p.mint,
      9,
      'right'
    );

    const y = this._dy;
    if (y && y.length) {
      let mn = 0;
      let mx = 0;
      for (let i = 0; i < y.length; i++) {
        if (y[i] < mn) mn = y[i];
        if (y[i] > mx) mx = y[i];
      }
      const span = Math.max(mx - mn, 1e-6);
      const HH = cBot - cTop - 16;
      const YY = (v) => cBot - 5 - ((v - mn) / span) * HH;
      const n = y.length;
      const XX = (i) => a.padL + (i / (n - 1)) * a.aw;

      ctx.save();
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(a.padL, YY(0));
      ctx.lineTo(a.padL + a.aw, YY(0));
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(XX(0), YY(0));
      for (let i = 0; i < n; i++) ctx.lineTo(XX(i), YY(y[i]));
      ctx.lineTo(XX(n - 1), YY(0));
      ctx.closePath();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = p.primary;
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = p.primary;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const X = XX(i);
        const Y = YY(y[i]);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();

      // 时间刻度：卷积结果长度为 2T（x 与 h 各占 1T）
      for (let k = 0; k <= 4; k++) {
        const X = a.padL + (k / 4) * a.aw;
        const txt = k === 0 ? '0' : k === 4 ? '2T' : k / 2 + 'T';
        this.label(ctx, txt, X, cBot + 1, p.ink3, 9, k === 0 ? 'left' : k === 4 ? 'right' : 'center');
      }
    } else {
      this.label(ctx, '画完松手，这里出现卷积输出', a.padL + 4, cBot - 10, p.ink3, 10);
    }

    // ---------- 幅度谱 |X(jω)| ----------
    const sTop = Math.round(h * 0.77);
    const sBot = h - 14;
    this.label(ctx, '|X(jω)| 幅度谱', a.padL, sTop - 3, p.ink2, 10.5, 'left', true);
    this.label(ctx, 'f·T', a.padL + a.aw, sTop - 3, p.ink3, 9, 'right');

    const mag = this._dmag;
    if (mag && mag.length) {
      const fbin = 256 / FFT_N; // 0.25 条/T
      const fMax = 32;
      const bins = Math.min(mag.length - 2, Math.round(fMax / fbin));
      let mmax = 0;
      for (let i = 1; i <= bins; i++) if (mag[i] > mmax) mmax = mag[i];
      if (mmax <= 0) mmax = 1;
      const FX = (f) => a.padL + (f / fMax) * a.aw;

      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1;
      for (let f = 8; f <= fMax; f += 8) {
        const X = Math.round(FX(f)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(X, sTop);
        ctx.lineTo(X, sBot);
        ctx.stroke();
        this.label(ctx, String(f), X, sBot + 7, p.ink3, 9, 'center');
      }
      this.label(ctx, '0', a.padL, sBot + 7, p.ink3, 9, 'center');
      ctx.beginPath();
      ctx.moveTo(a.padL, sBot);
      ctx.lineTo(a.padL + a.aw, sBot);
      ctx.stroke();

      ctx.strokeStyle = p.violet;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i <= bins; i++) {
        const X = FX(i * fbin);
        const Y = sBot - Math.min(1, mag[i] / mmax) * (sBot - sTop - 4);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.stroke();
    }

    if (this._needCalc) {
      this._needCalc = false;
      this.recalcDraw(0);
    }
  },

  setDrawMode(e) {
    const on = Number(e.currentTarget.dataset.v) === 1;
    if (on === this.data.drawMode) return;
    this.setData({ drawMode: on });
    setTimeout(() => this.mount(), 50);
  },

  setHk(e) {
    const k = e.currentTarget.dataset.k;
    if (k === this.data.hk) return;
    this.setData({ hk: k });
    if (this._ink) this.recalcDraw(0);
    else this.drawDraw();
  },

  clearDraw() {
    const c = this._cv.cvDraw;
    const cols = c ? this.dGeom(c.w, c.h).aw : 260;
    this._d = new Float32Array(Math.max(8, Math.round(cols)));
    this._ink = false;
    this._dx = this._dh = this._dy = this._dmag = null;
    this._pendingD = null;
    this.setData({ drawn: false, dPeak: '0', dArea: '0', dBw: '0' });
    this.drawDraw();
    util.toast('已清空，重新画一条');
  },

  // 交互 ----------
  setTab(e) {
    const tab = Number(e.currentTarget.dataset.k);
    if (tab === this.data.tab) return;
    // 离开频谱台就把麦克风/定时器放掉，避免后台一直录
    if (this.data.tab === 5) { this.stopAccel(); this.stopSimAccel(); }
    if (this.data.tab === 4) {
      this.stopMic(); this.stopAccel(); this.stopSimAccel();
      this.stopSim();
    }
    this.setData({ tab });
    setTimeout(() => this.mount(), 50);
  },

  onSlide(e) {
    const key = e.currentTarget.dataset.k;
    const v = Number(e.detail.value);
    const patch = {};
    patch[key] = v;
    this.setData(patch);
    if (key === 'a' || key === 'b' || key === 'tau') {
      if (this.data.tab === 0 && this.data.drawMode) {
        // 手绘模式下 b 是 h(t) 的宽度/时间常数，改它要重算卷积
        if (this._ink) this.recalcDraw(0);
        else this.drawDraw();
      } else {
        this.calcConv();
        this.drawConv();
      }
    } else if (key === 'N' || key === 'wave') {
      this.calcHarm();
      this.drawHarm();
    } else if (key === 'r' || key === 'ang') {
      this.calcPole();
      this.drawPole();
    } else if (key === 'accelAlpha' || key === 'accelWin') {
      this.recalcAccelFilter();
      this.drawAccel();
    } else if (key === 'f0' || key === 'fs') {
      this.calcSamp();
      this.drawSamp();
    }
  },

  setWave(e) {
    const v = Number(e.currentTarget.dataset.v);
    this.setData({ wave: v });
    this.calcHarm();
    this.drawHarm();
  },

  // 一键复位
  reset() {
    const tab = this.data.tab;
    if (tab === 0 && this.data.drawMode) {
      this.setData({ b: 1.6, hk: 'box' });
      this.clearDraw();
      return;
    }
    if (tab === 0) this.setData({ a: 2.0, b: 1.6, tau: 1.2 });
    if (tab === 1) this.setData({ wave: 0, N: 5 });
    if (tab === 2) this.setData({ r: 0.8, ang: 60 });
    if (tab === 3) this.setData({ f0: 3, fs: 8 });
    if (tab === 5) {
      this.stopAccel();
      this.stopSimAccel();
      this._accelRaw = null;
      this._accelFilt = null;
      this.setData({
        filterType: 'iir',
        accelAlpha: 0.15,
        accelWin: 9,
        accelPeakHz: '0.0',
        accelRms: '0.00',
        accelRed: '0%',
        accelStatus: '未开始',
        accelHint: '点「开加速度计」摇晃手机，或在电脑上点「模拟手摇」',
      });
    }
    if (tab === 4) {
      this.stopMic(); this.stopAccel(); this.stopSimAccel();
      this.stopSim();
      this._spec = null;
      this.setData({ peakHz: '0', peakNote: '未开始', specHint: '点「开麦克风」吹个口哨，或直接用内置测试信号' });
    }
    this.calcConv();
    this.calcHarm();
    this.calcPole();
    this.calcSamp();
    setTimeout(() => this.draw(), 30);
    util.toast('已复位参数');
  },

  goChapter() {
    const tab = this.data.tab;
    const ch = ['ch3', 'ch4', 'ch7', 'ch6', 'ch4', 'ch3'][tab];
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=' + ch });
  },

  // 当前参数打包成分享 query，好友点开就是同一组波形
  shareQuery() {
    const d = this.data;
    if (d.tab === 0) {
      if (d.drawMode) {
        return 'tab=0&mode=draw&hk=' + d.hk + '&b=' + d.b + '&d=' + this.packD();
      }
      return 'tab=0&a=' + d.a + '&b=' + d.b + '&tau=' + d.tau;
    }
    if (d.tab === 1) return 'tab=1&wave=' + d.wave + '&N=' + d.N;
    if (d.tab === 2) return 'tab=2&r=' + d.r + '&ang=' + d.ang;
    if (d.tab === 3) return 'tab=3&f0=' + d.f0 + '&fs=' + d.fs;
    if (d.tab === 5) return 'tab=5&filterType=' + d.filterType + '&accelAlpha=' + d.accelAlpha;
    return 'tab=4';
  },

  // 手绘波形没法直接塞进 query，压成 14 段、每段 -9..9 的整数就够还原形状了
  packD() {
    if (!this._d || !this._ink) return '';
    const K = 14;
    const cols = this._d.length;
    const out = [];
    for (let i = 0; i < K; i++) {
      const f = (i / (K - 1)) * (cols - 1);
      const a = Math.floor(f);
      const b = Math.min(cols - 1, a + 1);
      const v = this._d[a] + (this._d[b] - this._d[a]) * (f - a);
      out.push(Math.round(v * 9));
    }
    return out.join(',');
  },

  hShort() {
    const k = this.data.hk;
    return k === 'exp' ? '指数' : k === 'tri' ? '三角' : '矩形';
  },

  hName() {
    const k = this.data.hk;
    return k === 'exp' ? '指数衰减的 h(t)' : k === 'tri' ? '三角 h(t)' : '矩形 h(t)';
  },

  shareTitle() {
    const d = this.data;
    if (d.tab === 0 && d.drawMode) {
      if (!d.drawn) return '仿真实验室的卷积台能手指画任意 x(t)，卷出来长什么样？';
      return '我手绘了一段 x(t)，它和 ' + this.hName() + ' 卷出来的波形是这样';
    }
    if (d.tab === 0) return '我把 a=' + d.a + '、b=' + d.b + ' 的卷积拖到了 t=' + d.tau + '，你来看看重叠面积';
    if (d.tab === 1) return 'N=' + d.N + ' 项谐波叠出来的' + d.waves[d.wave] + '，跳变处还有振铃';
    if (d.tab === 2) return '极点 σ=' + d.poleSigma + '、ω=' + d.poleOmega + '，这个系统' + (d.poleStable ? '稳定' : '已经不稳定了');
    if (d.tab === 3) return 'f₀=' + d.f0 + 'Hz、fs=' + d.fs + 'Hz，' + (d.aliased ? '这里已经混叠了' : '刚好满足采样定理');
    if (d.tab === 5) return '手机加速度计实时测振：用低通滤波把手抖毛刺完全抹平';
    return '麦克风实时 FFT：吹个口哨看主频落在哪';
  },

  onShareAppMessage() {
    return {
      title: this.shareTitle(),
      path: '/pages/lab/lab?' + this.shareQuery(),
    };
  },

  // ---------- ⑥ 震动滤波（手机加速度计实时测振与滤波） ----------
  initAccelBuffer() {
    const N = 150; // 约 3 秒（50Hz 采样）
    if (!this._accelRaw || this._accelRaw.length !== N) {
      this._accelRaw = new Float32Array(N);
      this._accelFilt = new Float32Array(N);
      this._accelIdx = 0;
      this._lastFiltY = 0;
    }
  },

  setFilterType(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.filterType) return;
    this.setData({ filterType: type });
    this.recalcAccelFilter();
    this.drawAccel();
  },

  toggleAccel() {
    if (this.data.accelOn) this.stopAccel();
    else this.startAccel();
  },

  startAccel() {
    this.stopSimAccel();
    this.initAccelBuffer();
    this.setData({ accelOn: true, accelStatus: '采集中 (50Hz)', accelHint: '保持握持手机，轻轻来回晃动或敲击桌面' });
    this._lastAccelDraw = 0;
    this._accelLastSampleT = Date.now();

    const self = this;
    if (wx.startAccelerometer) {
      wx.startAccelerometer({
        interval: 'game', // 20ms
        success: () => {
          wx.onAccelerometerChange(self.onAccelSample.bind(self));
        },
        fail: () => {
          util.toast('加速度计未就绪，切换到模拟手摇模式');
          self.stopAccel();
          self.startSimAccel();
        },
      });
    } else {
      util.toast('当前环境不支持传感器，已开启模拟手摇');
      this.startSimAccel();
    }
  },

  stopAccel() {
    if (wx.stopAccelerometer) {
      try {
        wx.stopAccelerometer();
      } catch (e) {}
    }
    if (this.data.accelOn) this.setData({ accelOn: false, accelStatus: '已暂停' });
  },

  toggleSimAccel() {
    if (this.data.accelSim) this.stopSimAccel();
    else this.startSimAccel();
  },

  startSimAccel() {
    this.stopAccel();
    this.initAccelBuffer();
    this.setData({ accelSim: true, accelStatus: '模拟中 (50Hz)', accelHint: '模拟 1.8Hz 手摇轨迹 + 13.5Hz 肌肉手抖高频毛刺' });

    let t = 0;
    if (this._simAccelTimer) clearInterval(this._simAccelTimer);
    this._simAccelTimer = setInterval(() => {
      t += 0.02;
      // 真实手摇仿真：1.8Hz 晃动主频 + 13.5Hz 肌肉震颤 + 高斯毛刺
      const mainShake = 0.92 * Math.sin(2 * Math.PI * 1.8 * t);
      const muscleTremor = 0.38 * Math.sin(2 * Math.PI * 13.5 * t);
      const noise = (Math.random() - 0.5) * 0.22;
      const raw = mainShake + muscleTremor + noise;
      this.feedAccel(raw);
    }, 20);
  },

  stopSimAccel() {
    if (this._simAccelTimer) {
      clearInterval(this._simAccelTimer);
      this._simAccelTimer = null;
    }
    if (this.data.accelSim) this.setData({ accelSim: false, accelStatus: '已暂停' });
  },

  onAccelSample(res) {
    if (!this.data.accelOn) return;
    // 综合加速度模长并减去 1g 重力：静态静止时约为 0
    const mag = Math.sqrt(res.x * res.x + res.y * res.y + res.z * res.z) - 1.0;
    this.feedAccel(mag);
  },

  feedAccel(val) {
    this.initAccelBuffer();
    const raw = this._accelRaw;
    const filt = this._accelFilt;
    const N = raw.length;

    // 移位推入新采样
    for (let i = 0; i < N - 1; i++) {
      raw[i] = raw[i + 1];
      filt[i] = filt[i + 1];
    }
    raw[N - 1] = val;

    // 滤波计算
    let y = 0;
    if (this.data.filterType === 'iir') {
      const alpha = this.data.accelAlpha;
      y = alpha * val + (1 - alpha) * (filt[N - 2] || 0);
    } else {
      // 滑动均值 (MA)
      const W = Math.min(N, Math.max(1, this.data.accelWin));
      let sum = 0;
      for (let i = N - W; i < N; i++) sum += raw[i];
      y = sum / W;
    }
    filt[N - 1] = y;

    // 节流刷新画面与统计指标 (约 25fps)
    const now = Date.now();
    if (now - (this._lastAccelDraw || 0) > 38) {
      this._lastAccelDraw = now;
      this.calcAccelStats();
      this.drawAccel();
    }
  },

  recalcAccelFilter() {
    if (!this._accelRaw) return;
    const raw = this._accelRaw;
    const filt = this._accelFilt;
    const N = raw.length;
    const isIIR = this.data.filterType === 'iir';
    const alpha = this.data.accelAlpha;
    const W = Math.min(N, Math.max(1, this.data.accelWin));

    let prevY = raw[0];
    for (let i = 0; i < N; i++) {
      if (isIIR) {
        prevY = alpha * raw[i] + (1 - alpha) * prevY;
        filt[i] = prevY;
      } else {
        const start = Math.max(0, i - W + 1);
        let s = 0;
        for (let j = start; j <= i; j++) s += raw[j];
        filt[i] = s / (i - start + 1);
      }
    }
    this.calcAccelStats();
  },

  calcAccelStats() {
    const raw = this._accelRaw;
    const filt = this._accelFilt;
    if (!raw || !filt) return;
    const N = raw.length;

    // RMS
    let sumRawSq = 0;
    let sumNoiseSq = 0;
    for (let i = 0; i < N; i++) {
      sumRawSq += raw[i] * raw[i];
      const noise = raw[i] - filt[i];
      sumNoiseSq += noise * noise;
    }
    const rms = Math.sqrt(sumRawSq / N);
    const noiseRms = Math.sqrt(sumNoiseSq / N);
    const red = rms > 0.05 ? Math.min(98, Math.max(0, Math.round((noiseRms / rms) * 100))) : 0;

    // 估算晃动主频（通过平滑后的零交叉检测）
    let crosses = 0;
    for (let i = 1; i < N; i++) {
      if ((filt[i - 1] < 0 && filt[i] >= 0) || (filt[i - 1] > 0 && filt[i] <= 0)) {
        crosses++;
      }
    }
    // 150 个样点在 50Hz 下跨越 3 秒
    const timeSpanSec = N * 0.02;
    const hz = crosses > 0 ? (crosses / (2 * timeSpanSec)).toFixed(1) : '0.0';

    this.setData({
      accelPeakHz: hz,
      accelRms: rms.toFixed(2),
      accelRed: red + '%',
    });
  },

  drawAccel() {
    const c = this._cv.cvAccel;
    if (!c) return;
    const { ctx, w, h } = c;
    const p = this.pal();
    const raw = this._accelRaw;
    const filt = this._accelFilt;
    this.clear(ctx, w, h, p);

    const padL = 36;
    const padR = 14;
    const top = 26;
    const bot = h - 24;
    const plotH = bot - top;
    const zeroY = top + plotH / 2;
    const aw = w - padL - padR;

    // 坐标与参考网格 (±1.5g 范围)
    const gMax = 1.6;
    const toY = (v) => zeroY - (Math.max(-gMax, Math.min(gMax, v)) / gMax) * (plotH / 2);

    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;

    // +1g 线
    ctx.beginPath();
    ctx.moveTo(padL, toY(1.0));
    ctx.lineTo(w - padR, toY(1.0));
    ctx.stroke();
    this.label(ctx, '+1.0g', padL - 4, toY(1.0) + 4, p.ink3, 9, 'right');

    // 0g 中线
    ctx.strokeStyle = p.ink3;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(w - padR, zeroY);
    ctx.stroke();
    this.label(ctx, ' 0.0g', padL - 4, zeroY + 4, p.ink3, 9, 'right');

    // -1g 线
    ctx.strokeStyle = p.line;
    ctx.beginPath();
    ctx.moveTo(padL, toY(-1.0));
    ctx.lineTo(w - padR, toY(-1.0));
    ctx.stroke();
    this.label(ctx, '-1.0g', padL - 4, toY(-1.0) + 4, p.ink3, 9, 'right');

    // 时间标尺
    for (let k = 0; k <= 3; k++) {
      const X = padL + (k / 3) * aw;
      const tLabel = (3 - k) === 0 ? '现在' : '-' + (3 - k) + 's';
      this.label(ctx, tLabel, X, bot + 14, p.ink3, 9, k === 0 ? 'left' : k === 3 ? 'right' : 'center');
    }

    if (!raw || (!this.data.accelOn && !this.data.accelSim && this.data.accelStatus === '未开始')) {
      this.label(ctx, '点击下方「开加速度计」摇晃手机，观察毛刺被低通抹平', w / 2, zeroY - 8, p.ink3, 11, 'center');
      return;
    }

    const N = raw.length;

    // ① 画原始含噪波形 a(t) (珊瑚橙色)
    ctx.strokeStyle = 'rgba(242, 105, 75, 0.45)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = padL + (i / (N - 1)) * aw;
      const y = toY(raw[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // ② 画滤波输出波形 y(t) (薄荷绿色加粗)
    ctx.strokeStyle = '#1FA97C';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = padL + (i / (N - 1)) * aw;
      const y = toY(filt[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 图例
    this.label(ctx, '🟠 原始含噪 a(t)', padL, 14, '#F2694B', 10, 'left', true);
    this.label(ctx, '🟢 滤波输出 y(t)', padL + 110, 14, '#1FA97C', 10, 'left', true);
  },

  onHide() {
    this.stopMic(); this.stopAccel(); this.stopSimAccel();
    this.stopSim();
    if (this.data.back) this.setData({ back: null });
  },

  onUnload() {
    this.stopMic(); this.stopAccel(); this.stopSimAccel();
    this.stopSim();
  },
});
