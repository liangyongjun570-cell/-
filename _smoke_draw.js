// 手绘自定义波形 x(t) 的离线烟测：假 wx + 假 canvas，模拟手指画一个矩形脉冲，
// 检查卷积输出、幅度谱、主瓣宽度读数，以及带参分享能否完整复原波形
const ROOT = 'D:/xiaochengxu2/signals-pro/';
let nanHits = [];
function makeCtx() {
  const guard = (name) => (...a) => {
    a.forEach((v) => {
      if (typeof v === 'number' && !isFinite(v)) nanHits.push(name + '(' + a.join(',') + ')');
    });
  };
  const ctx = {};
  ['moveTo', 'lineTo', 'arc', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'setLineDash', 'rect', 'translate', 'scale', 'save', 'restore', 'beginPath', 'closePath', 'stroke', 'fill'].forEach((m) => {
    ctx[m] = guard(m);
  });
  ctx.measureText = () => ({ width: 20 });
  return ctx;
}
const store = {};
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 44, pixelRatio: 3 }),
  getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 375, windowHeight: 812 }),
  showToast: () => {},
  showModal: () => {},
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  vibrateShort: () => {},
  createSelectorQuery: () => ({ in() { return this; }, select() { return this; }, fields() { return this; }, exec() {} }),
};
global.getApp = () => ({ globalData: { theme: 'light', ctx: null }, account: () => '__guest__' });

function loadPage(file) {
  let cfg = null;
  global.Page = (o) => { cfg = o; };
  delete require.cache[require.resolve(ROOT + file)];
  require(ROOT + file);
  cfg.data = JSON.parse(JSON.stringify(cfg.data));
  cfg.setData = function (o) { Object.assign(this.data, o); };
  return cfg;
}

const W = 340;
const H = 300;
function attach(p) {
  p._cv = { cvDraw: { ctx: makeCtx(), w: W, h: H } };
  return p;
}
const ev = (x, y) => ({ touches: [{ x, y }], changedTouches: [{ x, y }] });

const lab = loadPage('pages/lab/lab.js');
lab.onLoad({});
attach(lab);
lab.setData({ drawMode: true, tab: 0 });
const a = lab.dGeom(W, H);
console.log('[geom] padL=' + a.padL + ' aw=' + a.aw.toFixed(1) + ' base=' + a.base + ' amp=' + a.amp);

// 画一个矩形脉冲：左沿 x=60 起笔，抬到 base-45，平推到 x=160，再落回基线
const yTop = a.base - 45;
lab.onDrawStart(ev(60, a.base));
lab.onDrawMove(ev(60, yTop));
for (let x = 64; x <= 160; x += 4) lab.onDrawMove(ev(x, yTop));
lab.onDrawMove(ev(160, a.base));
lab.onDrawEnd(ev(160, a.base));

console.log('[draw] 列数', lab._d.length, '| 有笔迹', lab._ink, '| drawn', lab.data.drawn);
console.log('[draw] 面积', lab.data.dArea, '| y 峰值', lab.data.dPeak, '| 主瓣', lab.data.dBw);
let yMax = 0;
for (let i = 0; i < lab._dy.length; i++) if (lab._dy[i] > yMax) yMax = lab._dy[i];
console.log('[draw] 卷积长度', lab._dy.length, '(应为 511) | yMax', yMax.toFixed(3));

// h 换成指数衰减 / 三角，输出应拖尾 / 变平滑
['exp', 'tri', 'box'].forEach((k) => {
  lab.setHk({ currentTarget: { dataset: { k } } });
  let peak = 0;
  let at = 0;
  for (let i = 0; i < lab._dy.length; i++) if (lab._dy[i] > peak) { peak = lab._dy[i]; at = i; }
  console.log('[h=' + k + '] 峰值 ' + peak.toFixed(3) + ' @ i=' + at + ' | 主瓣 ' + lab.data.dBw);
});

// 滑块调 b 也要重算（走 onSlide）
lab.onSlide({ currentTarget: { dataset: { k: 'b' } }, detail: { value: 2.4 } });
console.log('[slide b=2.4] y 峰值', lab.data.dPeak, '| 主瓣', lab.data.dBw);

// 分享 -> 复原
lab.data.tab = 0;
const sh = lab.onShareAppMessage();
const qs = sh.path.split('?')[1];
const q = {};
qs.split('&').forEach((kv) => { const p = kv.split('='); q[p[0]] = p.slice(1).join('='); });
console.log('[share] 标题', sh.title);
console.log('[share] query 长度', qs.length, '| d =', q.d);

const lab2 = loadPage('pages/lab/lab.js');
lab2.onLoad(q);
attach(lab2);
console.log('[restore] drawMode', lab2.data.drawMode, '| hk', lab2.data.hk, '| b', lab2.data.b);
lab2.drawDraw();
console.log('[restore] 铺回列数', lab2._d.length, '| 面积', lab2.data.dArea, '| 峰值', lab2.data.dPeak, '| 主瓣', lab2.data.dBw);

// 复原后的波形应与原始接近（14 段量化，允许一定误差）
let err = 0;
const K = 14;
for (let i = 0; i < K; i++) {
  const f1 = (i / (K - 1)) * (lab._d.length - 1);
  const f2 = (i / (K - 1)) * (lab2._d.length - 1);
  const v1 = lab._d[Math.round(f1)];
  const v2 = lab2._d[Math.round(f2)];
  err = Math.max(err, Math.abs(v1 - v2));
}
console.log('[restore] 形状最大偏差', err.toFixed(3), '(量化误差应 < 0.06)');

// 清空
lab2.clearDraw();
console.log('[clear] drawn', lab2.data.drawn, '| 面积', lab2.data.dArea);

// 空画布直接算：不能崩
lab2.recalcDraw(0);
console.log('[empty] 空白画布重算 ok');

// 手绘模式下 reset 应清空而不是复位滑块
lab2.data.drawn = true;
lab2.reset();
console.log('[reset] drawn', lab2.data.drawn, '| b', lab2.data.b);

console.log('NaN 坐标命中:', nanHits.length ? nanHits.slice(0, 6) : '无');
