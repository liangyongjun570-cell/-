// 用真实云端记录做一次「换设备还原」离线验证
//
// 场景：手机 B 首次登录 → pull 到云端文档 → mergeInto → 页面读取。
// 云端文档内容照抄 2026-10-29 15:14 那条真实记录，避免用构造数据自我验证。
const ROOT = 'D:/xiaochengxu2/signals-pro/';

const mem = {};
let cloudDoc = null;
let pushes = 0;
let failNext = false;
global.wx = {
  getStorageSync: (k) => (k in mem ? mem[k] : ''),
  setStorageSync: (k, v) => { mem[k] = v; },
  removeStorageSync: (k) => { delete mem[k]; },
  showToast: () => {},
  showModal: (o) => { if (o && o.success) o.success({ confirm: true }); },
  switchTab: () => {},
  navigateTo: () => {},
  vibrateShort: () => {},
  createSelectorQuery: () => ({
    in() { return this; }, select() { return this; }, fields() { return this; },
    exec(cb) { cb([]); },
  }),
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  // 假云：pull 返回这条真实文档，push 记录最后一次快照。
  // 注意 cloud.call() 走的是 success/fail 回调，不是 Promise，两者都要给。
  cloud: {
    init: () => {},
    callFunction: (o) => {
      const a = o.data.action;
      if (failNext && (a === 'push' || a === 'login')) {
        failNext = false;
        if (o.fail) setTimeout(() => o.fail({ errCode: -1, errMsg: 'request:fail timeout' }), 0);
        return Promise.resolve();
      }
      const r = a === 'login' ? { ok: true, openid: 'owYn5xVPKWb4FzTaZmyUyCpb7tHc' }
        : a === 'pull' ? { ok: true, data: cloudDoc }
        : a === 'push' ? (pushes++, cloudDoc = o.data.profile, { ok: true, score: o.data.profile.score })
        : { ok: false };
      const p = Promise.resolve({ result: r });
      if (o.success) { setTimeout(() => o.success({ result: r }), 0); return p; }
      return p;
    },
  },
};
global.getApp = () => ({ globalData: { theme: 'light', user: null }, account() { return '__guest__'; }, afterLogin() {}, afterLogout() {} });

const auth = require(ROOT + 'utils/auth.js');
const store = require(ROOT + 'utils/store.js');
const sync = require(ROOT + 'utils/sync.js');
const D = require(ROOT + 'data/index.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
}

// 真实云端文档（字段与顺序照抄）
const REMOTE = {
  _id: 'owYn5xVPKWb4FzTaZmyUyCpb7tHc',
  answered: 5,
  chDone: 0,
  chats: [],
  correct: 2,
  fav: { courses: [], formulas: ['f01'] },
  learned: { examples: [], formulas: [], topics: [] },
  nickname: '微信用户63d3',
  notes: {},
  // 擂台段位（云函数 sanitize 会保留 rp / wins / losses / streak / best，不带 history）
  pk: { rp: 320, wins: 3, losses: 1, streak: 0, best: 2 },
  percent: 0,
  score: 89,
  syncedAt: 1793258040616,
  updatedAt: '2026-10-29T07:14:00.000Z',
  visits: ['2026-10-29'],
};

console.log('=== 新设备首次登录 ===');
const openid = REMOTE._id;
const acc = auth.wxAccountOf(openid);
auth.registerWx(acc, {});
cloudDoc = Object.assign({}, REMOTE);

sync.syncAll(acc).then(() => {
  const d = store.load(acc);
  console.log('=== 还原结果 ===');
  ok('昵称沿用云端真名', d.nickname === '微信用户63d3', d.nickname);
  ok('收藏公式还原', d.fav.formulas.length === 1 && d.fav.formulas[0] === 'f01', d.fav.formulas);
  ok('答题数还原', d.quiz.answered === 5, d.quiz.answered);
  ok('答对数还原', d.quiz.correct === 2, d.quiz.correct);
  ok('学习天数还原', d.visits.length === 1 && d.visits[0] === '2026-10-29', d.visits);
  ok('已学专题为空是云端真实状态', d.learned.topics.length === 0);
  ok('段位分还原', d.pk.rp === 320, d.pk.rp);
  ok('战绩还原', d.pk.wins === 3 && d.pk.losses === 1, [d.pk.wins, d.pk.losses]);
  ok('最高连胜还原', d.pk.best === 2, d.pk.best);
  ok('对局明细不占云端字段', d.pk.history.length === 0, d.pk.history.length);

  const ov = D.overall(d.learned);
  ok('完成度与云端一致', ov.percent === REMOTE.percent, ov.percent + ' vs ' + REMOTE.percent);
  ok('章节完成数与云端一致', ov.chaptersDone === REMOTE.chDone, ov.chaptersDone);

  console.log('=== 回推 ===');
  const snap = sync.snapshot(acc);
  ok('回推昵称不被改写', snap.nickname === '微信用户63d3', snap.nickname);
  ok('回推分数与云端一致', snap.score === REMOTE.score, snap.score + ' vs ' + REMOTE.score);
  ok('空会话不再上传', Array.isArray(snap.chats) && snap.chats.length === 0, snap.chats.length);
  ok('回推笔记结构完整', snap.notes && typeof snap.notes === 'object');
  ok('回推含 fav 嵌套对象', !!snap.fav && Array.isArray(snap.fav.formulas));
  ok('回推带上段位', snap.pk && snap.pk.rp === 320, snap.pk);
  ok('回推段位不带 history', snap.pk.history === undefined, Object.keys(snap.pk));
  ok('两次同步不产生重复数据', d.fav.formulas.length === 1 && d.visits.length === 1);

  // 本机再操作一次，合并不能把云端旧值盖回来
  console.log('=== 本机新增后 ===');
  store.toggleFavFormula(acc, 'f07');
  store.recordAnswer(acc, true);
  const d2 = store.load(acc);
  ok('本机新增收藏保留', d2.fav.formulas.indexOf('f07') >= 0, d2.fav.formulas);
  ok('本机答题数累加', d2.quiz.answered === 6, d2.quiz.answered);

  const m = sync.mergeInto(acc, REMOTE);
  const d3 = store.load(acc);
  ok('再合并后本机收藏没丢', d3.fav.formulas.indexOf('f07') >= 0, d3.fav.formulas);
  ok('再合并后答题数不回退', d3.quiz.answered === 6, d3.quiz.answered);
  ok('再合并后昵称不变', d3.nickname === '微信用户63d3', d3.nickname);
  ok('合并返回值正常', m === true);

  // 段位合并：取两边较大值，不能被另一台设备的低段位拉回去
  console.log('=== 段位合并 ===');
  store.update(acc, (x) => { x.pk.rp = 500; x.pk.wins = 5; return x; });
  sync.mergeInto(acc, REMOTE);
  ok('本机高段位不被云端低值覆盖', store.load(acc).pk.rp === 500, store.load(acc).pk.rp);
  ok('胜场取较大值', store.load(acc).pk.wins === 5, store.load(acc).pk.wins);

  // 云端老文档没有 pk 字段，也不能把本机段位清零
  const noPk = Object.assign({}, REMOTE);
  delete noPk.pk;
  sync.mergeInto(acc, noPk);
  ok('云端无 pk 字段时本机段位保留', store.load(acc).pk.rp === 500, store.load(acc).pk.rp);
  ok('云端无 pk 字段时写入 0 而不是 NaN', typeof store.load(acc).pk.best === 'number', store.load(acc).pk.best);

  // ---------- 清空数据：云端必须立刻跟着空，否则下次同步会把旧数据拉回来 ----------
  console.log('=== 清空数据 ===');
  global.getApp = () => ({
    globalData: { theme: 'light', user: { account: acc } },
    account() { return acc; },
    afterLogin() {},
    afterLogout() {},
  });
  let cfg = null;
  global.Page = (o) => { cfg = o; };
  delete require.cache[require.resolve(ROOT + 'pages/me/me.js')];
  require(ROOT + 'pages/me/me.js');
  cfg.data = JSON.parse(JSON.stringify(cfg.data));
  cfg.setData = function (o) { Object.keys(o).forEach((k) => { this.data[k] = o[k]; }); };
  cfg.onLoad();
  cfg.refresh();
  cfg.clearData();

  // 等 1.5s：清空时若正好有一次推送在飞，sync 会把这次标成 dirty 并在 800ms 后补推，
  // 所以要跨过这个补推窗口再断言（这正是"清了又回来"最容易出现的时序）
  return new Promise((res) => setTimeout(res, 1500)).then(async () => {
    const d4 = store.load(acc);
    ok('清空后本机答题数归零', d4.quiz.answered === 0, d4.quiz.answered);
    ok('清空后本机收藏归零', d4.fav.formulas.length === 0, d4.fav.formulas);
    ok('清空后本机段位归零', d4.pk.rp === 0, d4.pk.rp);
    ok('清空后云端被推空', cloudDoc.quiz && cloudDoc.quiz.answered === 0, cloudDoc.quiz);
    ok('清空后云端段位归零', cloudDoc.pk && cloudDoc.pk.rp === 0, cloudDoc.pk);
    ok('清空过程未产生多余推送', pushes <= 4, pushes);
    ok('清空后云端仍是这个名字', cloudDoc.nickname === '微信用户63d3', cloudDoc.nickname);

    // ---------- 网络抖动后同步要能自愈 ----------
    console.log('=== 推送失败后自愈 ===');
    failNext = true;
    const r1 = await sync.pushNow(acc);
    ok('单次网络失败不抛异常', r1 && r1.ok === false, r1);
    const r2 = await sync.pushNow(acc);
    ok('网络失败后不会永久卡死', r2 && r2.ok === true, r2);
    ok('恢复后还能推上去', cloudDoc && cloudDoc.quiz && cloudDoc.quiz.answered === 0, cloudDoc && cloudDoc.quiz);

    console.log('\n=== 结果 ===');
    console.log('通过 ' + pass + ' / 失败 ' + fail);
    process.exit(fail ? 1 : 0);
  });
});
