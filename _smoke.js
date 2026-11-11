// 离线烟测：用假的 wx / canvas 把改动过的页面跑一遍，抓运行时异常与 NaN 坐标
const path = require('path');
const ROOT = 'D:/xiaochengxu2/signals-pro/';

let nanHits = [];
function makeCtx() {
  const guard = (name) => (...a) => {
    a.forEach((v) => {
      if (typeof v === 'number' && !isFinite(v)) nanHits.push(name + '(' + a.join(',') + ')');
    });
  };
  const ctx = {};
  ['moveTo', 'lineTo', 'arc', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'setLineDash', 'rect', 'quadraticCurveTo', 'bezierCurveTo', 'translate', 'scale', 'save', 'restore', 'beginPath', 'closePath', 'stroke', 'fill'].forEach((m) => {
    ctx[m] = guard(m);
  });
  ctx.measureText = () => ({ width: 20 });
  return ctx;
}

let store = {};
const wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 44, pixelRatio: 3 }),
  getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 375, windowHeight: 812 }),
  showToast: () => {},
  showModal: () => {},
  showActionSheet: (o) => { if (o && o.success) o.success({ tapIndex: 0 }); },
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  vibrateShort: () => {},
  createOffscreenCanvas: () => null,
  chooseMedia: () => {},
  getRecorderManager: () => ({ onFrameRecorded() {}, onError() {}, start() {}, stop() {} }),
  getSetting: () => {},
  authorize: () => {},
  createSelectorQuery: () => ({
    in() { return this; },
    select() { return this; },
    fields() { return this; },
    exec(cb) { cb([{ node: { width: 300, height: 200, getContext: () => makeCtx() }, width: 300, height: 200 }]); },
  }),
};
global.wx = wx;
global.getApp = () => ({
  globalData: { theme: 'light', ctx: null, user: null, statusBarHeight: 44 },
  account: () => '__guest__',
});

function loadPage(file) {
  let cfg = null;
  global.Page = (o) => { cfg = o; };
  global.Component = (o) => { cfg = o; };
  delete require.cache[require.resolve(ROOT + file)];
  require(ROOT + file);
  cfg.setData = function (o) { Object.assign(this.data, o); };
  return cfg;
}

// ---------- me 页 ----------
const me = loadPage('pages/me/me.js');
me.data = JSON.parse(JSON.stringify(me.data));
me.onLoad({});
me.onShow();
console.log('[me] 排行榜行数', me.data.rankList.length, '| 我的名次', me.data.rankMe && me.data.rankMe.rank, '| 状态', me.data.syncText);
me.syncNow();
console.log('[me] syncNow 后', me.data.syncText);
me.toggleDark();
console.log('[me] 深色切换', me.data.theme);

// ---------- lab 页 ----------
const lab = loadPage('pages/lab/lab.js');
lab.data = JSON.parse(JSON.stringify(lab.data));
lab._cv = {};
lab.onLoad({ tab: '2', r: '1.2', ang: '45' });
console.log('[lab] 分享复原: tab=', lab.data.tab, 'r=', lab.data.r, 'ang=', lab.data.ang, 'shared=', lab.data.shared);

// 用假 canvas 逐台绘制
['cvConv', 'cvHarm', 'cvPole', 'cvSamp', 'cvSpec'].forEach((id) => {
  lab._cv[id] = { ctx: makeCtx(), w: 340, h: 300 };
});
lab.data.tab = 0; lab.draw();
lab.data.tab = 1; lab.draw();
lab.data.tab = 2; lab.draw();
lab.data.tab = 3; lab.draw();

// 第 5 台：喂合成的口哨与和弦帧
const SR = 16000, N = 1024;
function frame(a, b, c) {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    out[i] = 0.3 * Math.sin(2 * Math.PI * a * t) + 0.2 * Math.sin(2 * Math.PI * b * t) + 0.15 * Math.sin(2 * Math.PI * c * t);
  }
  return out;
}
lab._spec = null;
for (let i = 0; i < 8; i++) lab.feed(frame(2600, 5200, 0.0001));
lab.data.tab = 4;
lab.drawSpec();
console.log('[lab] 口哨主频', lab.data.peakHz, '| 峰值标注', lab._spec.peakHz.toFixed(0), 'Hz');

lab._spec = null;
for (let i = 0; i < 8; i++) lab.feed(frame(440, 554.37, 659.25));
lab.drawSpec();
console.log('[lab] 和弦主频', lab.data.peakHz);

// 空信号 / 静音也不能崩
lab._spec = null;
lab.feed(new Float32Array(N));
lab.drawSpec();
console.log('[lab] 静音帧 ok');

// 内置测试信号
lab.startSim('chord');
setTimeout(() => {
  console.log('[lab] 内置和弦跑起来，主频', lab.data.peakHz);
  lab.stopSim();
  lab.stopMic();

  // 分享参数
  lab.data.tab = 3;
  const s = lab.onShareAppMessage();
  console.log('[lab] 分享路径', s.path);
  lab.data.tab = 4;
  console.log('[lab] 第5台分享', lab.onShareAppMessage().path);

  // ---------- quiz 分享 ----------
  const quiz = loadPage('pages/quiz/quiz.js');
  quiz.data = JSON.parse(JSON.stringify(quiz.data));
  quiz.onLoad({ qid: 'q01' });
  console.log('[quiz] 分享卡进入 -> mode=', quiz.data.mode, '题目数', quiz.data.totalN, '| 标题', quiz.data.exam.title);
  const sh = quiz.onShareAppMessage();
  console.log('[quiz] 分享', sh.path, '|', sh.title.slice(0, 20));

  // ---------- 助教组件：批改链路 ----------
  const asst = loadPage('components/assistant/assistant.js');
  const m = asst.methods;
  const self = {
    data: Object.assign({}, asst.data, { msgs: [] }),
    sid: 'c1',
    setData(o) { Object.assign(this.data, o); },
    reload() {},
    scrollBottom() {},
    setMood() {},
    refreshCtx() {},
    loadMsgs() {},
  };
  const rep = require(ROOT + 'utils/vision.js').build(
    require(ROOT + 'utils/vision.js').PAPERS[0],
    { inkRatio: 0.05, contrast: 0.2, bands: 6, maxBand: 3, longRun: 4, edgeRatio: 0.1 },
    ''
  );
  const blocks = m.reportBlocks.call(self, rep);
  console.log('[asst] 批改块数', blocks.length);
  blocks.slice(0, 4).forEach((b) => console.log('   -', b.type, '|', String(b.text).slice(0, 60).replace(/\n/g, ' / ')));

  console.log('NaN 坐标命中:', nanHits.length ? nanHits.slice(0, 6) : '无');
}, 400);
