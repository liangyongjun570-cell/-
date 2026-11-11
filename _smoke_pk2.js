// 擂台补充烟测：入口字段、邀请房间、KO 流程、老存档迁移、深色战报
const ROOT = 'D:/xiaochengxu2/signals-pro/';
let nan = [];
function makeCtx() {
  const guard = (n) => (...a) => a.forEach((v) => { if (typeof v === 'number' && !isFinite(v)) nan.push(n); });
  const c = {};
  ['moveTo', 'lineTo', 'arc', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'setLineDash', 'rect', 'translate', 'scale', 'save', 'restore', 'beginPath', 'closePath', 'stroke', 'fill'].forEach((m) => { c[m] = guard(m); });
  c.measureText = () => ({ width: 20 });
  c.createLinearGradient = () => ({ addColorStop() {} });
  return c;
}
const store = {};
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
  removeStorageSync: (k) => { delete store[k]; },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 44, pixelRatio: 3 }),
  getWindowInfo: () => ({ pixelRatio: 3 }),
  showToast: () => {},
  showModal: () => {},
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  vibrateShort: () => {},
  setClipboardData: (o) => o.success && o.success(),
  createSelectorQuery: () => ({ in() { return this; }, select() { return this; }, fields() { return this; }, exec(cb) { cb([{ node: { width: 320, height: 430, getContext: () => makeCtx() }, width: 320, height: 430 }]); } }),
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1) 老存档没有 pk 字段，不能崩、不能算出 NaN
  store['ssp_user___guest__'] = { nickname: '老用户', quiz: { answered: 5, correct: 3 } };
  const pkStore = require(ROOT + 'utils/store.js');
  const d0 = pkStore.load('__guest__');
  console.log('[migrate] 老存档 pk =', JSON.stringify(d0.pk));

  // 2) quiz 首页入口
  const quiz = loadPage('pages/quiz/quiz.js');
  quiz.onLoad({});
  console.log('[quiz] 擂台入口:', quiz.data.pkTier, quiz.data.pkRp, '| goPk 存在', typeof quiz.goPk === 'function');

  // 3) me 页入口
  const me = loadPage('pages/me/me.js');
  me.onLoad({});
  me.onShow();
  console.log('[me] 擂台入口:', me.data.pkTier, me.data.pkRp, me.data.pkMatches);

  // 4) 好友从邀请卡片进来
  const lab = loadPage('pages/pk/pk.js');
  lab.onLoad({ room: 'ABC234', seed: '987654', nick: encodeURIComponent('张三') });
  console.log('[invite] room', lab.room, '| seed', lab.seed, '| fromInvite', lab.data.fromInvite);
  console.log('[invite] 提示:', lab.data.inviteTip);
  lab.acceptInvite();
  console.log('[invite] 开打后模式', lab.data.mode);
  await sleep(2300);
  console.log('[invite] 题目数', lab.qs.length, '| 对手', lab.data.foe.name);

  // 5) KO：连错 5 题，血量应清零并提前结束
  let guard = 0;
  while (lab.data.mode === 'run' && guard < 12) {
    guard++;
    const i = lab.data.idx - 1;
    const q = lab.qs[i];
    const wrong = (q.answer + 1) % 4;
    lab.pick({ currentTarget: { dataset: { i: wrong } } });
    await sleep(1250);
    if (lab.data.mode !== 'run') break;
  }
  console.log('[ko] 打了', guard, '题后模式 =', lab.data.mode, '| 我的血', lab.data.me.hp, '| KO', lab.data.result && lab.data.result.ko);
  if (lab.data.result) {
    console.log('[ko] 比分', lab.data.result.my + ':' + lab.data.result.foe, '| 胜负', lab.data.result.win ? '胜' : '负');
  }

  // 6) 深色主题下重绘战报
  lab.setData({ theme: 'dark' });
  lab.paintReport(makeCtx(), 320, 430, lab.data.result);
  console.log('[dark] 深色战报绘制 ok');

  // 7) 段位边界
  const pk = require(ROOT + 'utils/pk.js');
  [0, 199, 200, 2000, 9999, -5].forEach((v) => {
    const t = pk.tierOf(v);
    console.log('  rp', v, '->', t.name, '| 进度', t.progress.toFixed(2), '| 距下一段', t.toNext);
  });

  // 8) 房间码校验
  console.log('[room] validRoom 小写', pk.validRoom('abc234'), '| 含 0/O', pk.validRoom('ABC0O1'), '| 长度错', pk.validRoom('ABC23'));

  console.log('NaN 命中:', nan.length ? nan.slice(0, 5) : '无');
  process.exit(0);
})();
