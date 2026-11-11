// 擂台离线烟测：假 wx + 假 canvas，跑完整一局（匹配 → 5 题抢答 → 结算 → 战报）
const ROOT = 'D:/xiaochengxu2/signals-pro/';
let nanHits = [];
function makeCtx() {
  const guard = (name) => (...a) => {
    a.forEach((v) => {
      if (typeof v === 'number' && !isFinite(v)) nanHits.push(name + '(' + a.join(',') + ')');
    });
  };
  const ctx = {};
  [
    'moveTo', 'lineTo', 'arc', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
    'setLineDash', 'rect', 'translate', 'scale', 'save', 'restore', 'beginPath', 'closePath',
    'stroke', 'fill',
  ].forEach((m) => {
    ctx[m] = guard(m);
  });
  ctx.measureText = () => ({ width: 20 });
  ctx.createLinearGradient = () => ({ addColorStop() {} });
  return ctx;
}

const store = {};
const wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => {
    store[k] = JSON.parse(JSON.stringify(v));
  },
  removeStorageSync: (k) => {
    delete store[k];
  },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 44, pixelRatio: 3 }),
  getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 375, windowHeight: 812 }),
  showToast: () => {},
  showModal: () => {},
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  vibrateShort: () => {},
  setClipboardData: (o) => o && o.success && o.success(),
  canvasToTempFilePath: (o) => o && o.success && o.success({ tempFilePath: '/tmp/x.png' }),
  createSelectorQuery: () => ({
    in() {
      return this;
    },
    select() {
      return this;
    },
    fields() {
      return this;
    },
    exec(cb) {
      cb([{ node: { width: 300, height: 400, getContext: () => makeCtx() }, width: 300, height: 400 }]);
    },
  }),
};
wx.cloud = undefined;
global.wx = wx;
global.getApp = () => ({
  globalData: { theme: 'light', ctx: null, statusBarHeight: 44 },
  account: () => '__guest__',
});

let cfg = null;
global.Page = (o) => {
  cfg = o;
};
require(ROOT + 'pages/pk/pk.js');
cfg.data = JSON.parse(JSON.stringify(cfg.data));
cfg.setData = function (o) {
  Object.assign(this.data, o);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  cfg.onLoad({});
  console.log('[lobby] 段位', cfg.data.tier.name, '| rp', cfg.data.rp, '| 场次', cfg.data.matches);

  // 1) 随机匹配
  cfg.tapRandom();
  console.log('[match] seed', cfg.seed, '| 房间', cfg.room, '| 模式', cfg.data.mode);
  await sleep(2300);
  console.log('[match] 对手', cfg.data.foe.name, cfg.data.foe.tierName, '| rp', cfg.data.foe.rp, '| 模式', cfg.data.mode);
  console.log('[run] 题数', cfg.qs.length, '| 对手计划', JSON.stringify(cfg.plans.map((p) => (p.ok ? '对' : '错') + '@' + p.at + 's')));

  // 2) 逐题作答：前 3 题故意答对（抢快），第 4 题答错，第 5 题答对
  const myPicks = [];
  for (let i = 0; i < cfg.qs.length; i++) {
    if (cfg.data.mode !== 'run') break;
    const q = cfg.qs[i];
    let pick = q.answer;
    if (i === 3) pick = (q.answer + 1) % 4; // 故意选错
    myPicks.push(pick);
    await sleep(4700 + i * 200); // 模拟普通学生读一道信号题：约 5 秒
    console.log(
      '  第' + (i + 1) + '题 [' + q.difficulty + '] 我选' + 'ABCD'[pick] + ' 正确' + 'ABCD'[q.answer] +
        ' | 我 ' + cfg.data.me.score + ' 血 ' + cfg.data.me.hp + ' | 对手 ' + cfg.data.foe.score + ' 血 ' + cfg.data.foe.hp +
        ' | combo ' + cfg.data.combo
    );
    cfg.pick({ currentTarget: { dataset: { i: pick } } });
    await sleep(1200);
  }

  console.log('[result] 模式', cfg.data.mode);
  const r = cfg.data.result;
  console.log(
    '[result] ' + (r.win ? '胜' : r.draw ? '平' : '负') + ' ' + r.my + ':' + r.foe +
      ' | 答对 ' + r.myCorrect + '/' + r.total + ' | 最长连击 x' + r.maxCombo +
      ' | 最快 ' + r.fastest + ' | KO ' + r.ko
  );
  console.log('[rp] ' + cfg.data.rpDelta + ' -> ' + cfg.data.rp + ' | ' + cfg.data.tier.name +
    ' | 升段 ' + cfg.data.tierUp + ' 掉段 ' + cfg.data.tierDown);
  console.log('[result] 评语:', r.word);

  const acc = '__guest__';
  const saved = store['ssp_user_' + acc];
  console.log('[store] 落库 rp', saved.pk.rp, '| 胜', saved.pk.wins, '| 负', saved.pk.losses, '| 连胜', saved.pk.streak, '| 历史', saved.pk.history.length);
  console.log('[store] 最近一局', JSON.stringify(saved.pk.history[0]));

  // 3) 战报绘制
  cfg.drawReport();
  await sleep(200);
  console.log('[report] canvas 已画, 路径缓存', cfg._reportPath || '（未生成）');
  cfg.paintReport(new (function () { return makeCtx(); })(), 320, 420, r);
  console.log('[report] 直接重绘一次 ok');

  // 4) 分享
  const sh = cfg.onShareAppMessage();
  console.log('[share] 结果页', sh.title.slice(0, 40), '|', sh.path.slice(0, 60));
  cfg.setData({ mode: 'lobby' });
  const sh2 = cfg.onShareAppMessage();
  console.log('[share] 大厅', sh2.path);

  // 5) 好友从邀请进来：同 room 同 seed 必须拿到同一套题
  const room = cfg.room;
  const seed = cfg.seed;
  const pk = require(ROOT + 'utils/pk.js');
  const a = pk.pickQuestions(pk.mulberry32(seed), 5).map((q) => q.id).join();
  const b = pk.pickQuestions(pk.mulberry32(seed), 5).map((q) => q.id).join();
  console.log('[room] 同 seed 题序一致:', a === b, '|', a);

  // 6) 连续跑 40 局，看 RP 是否会跑飞 / 段位是否单调可控
  let rp = 0;
  let win = 0;
  for (let i = 0; i < 40; i++) {
    const rival = pk.makeRival(pk.hashStr('S' + i), rp);
    const w = Math.random() < 0.55;
    rp = pk.applyRp(rp, pk.rpDelta(w, rp, rival.rp, false));
    if (w) win++;
  }
  console.log('[sim] 40 局胜率模型 0.55 → 实际', win, '| rp 落点', rp, '→', pk.tierOf(rp).name);

  console.log('NaN 坐标命中:', nanHits.length ? nanHits.slice(0, 5) : '无');
  process.exit(0);
})();
