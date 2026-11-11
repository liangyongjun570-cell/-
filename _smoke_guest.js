// 游客数据隔离 + 并入规则验证
//
// 覆盖三件事：
// 1) 游客档案绝不推云（云端按 openid 索引，推一次就会覆盖账号档案）
// 2) 并入是并集 + 取大，不覆盖账号已有数据
// 3) 并入后游客清空，不会下次再提示「还有 N 项」
const ROOT = 'D:/xiaochengxu2/signals-pro/';

const mem = {};
const calls = [];
let cloudDoc = null;

global.wx = {
  getStorageSync: (k) => (k in mem ? mem[k] : ''),
  setStorageSync: (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); },
  removeStorageSync: (k) => { delete mem[k]; },
  showToast: () => {},
  showModal: () => {},
  switchTab: () => {},
  navigateTo: () => {},
  vibrateShort: () => {},
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  createSelectorQuery: () => ({
    in() { return this; }, select() { return this; }, fields() { return this; }, exec(cb) { cb([]); },
  }),
  cloud: {
    init: () => {},
    callFunction: (o) => {
      const a = o.data.action;
      calls.push(a);
      const r = a === 'login' ? { ok: true, openid: 'owYn5xVPKWb4FzTaZmyUyCpb7tHc' }
        : a === 'pull' ? { ok: true, data: cloudDoc }
        : a === 'push' ? (cloudDoc = o.data.profile, { ok: true })
        : { ok: true, list: [], me: null };
      if (o.success) { setTimeout(() => o.success({ result: r }), 0); return; }
      return Promise.resolve({ result: r });
    },
  },
};
global.getApp = () => ({ globalData: { theme: 'light', user: null }, account() { return '__guest__'; }, afterLogin() {}, afterLogout() {} });

const store = require(ROOT + 'utils/store.js');
const sync = require(ROOT + 'utils/sync.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
}

const ACC = 'wx_test000001';
const G = store.GUEST;

function seedGuest() {
  store.save(G, {
    learned: { topics: ['ch1'], formulas: ['f02'], examples: [] },
    fav: { formulas: ['f09'], courses: [] },
    notes: { f09: '游客写的笔记', ch1: '游客专题笔记' },
    records: [
      { type: 'topic', id: 'ch1', name: '信号与系统概述', date: '2026-10-29', key: 'topic:ch1' },
      { type: 'formula', id: 'f02', name: '傅里叶变换', date: '2026-10-28', key: 'formula:f02' },
    ],
    searches: ['傅里叶'],
    wrong: ['q1', 'q2'],
    quiz: { answered: 4, correct: 3, exams: [] },
    pk: { rp: 180, wins: 2, losses: 1, streak: 2, best: 2, history: [] },
    visits: ['2026-10-28', '2026-10-29'],
    nickname: '',
    theme: 'dark',
  });
}

function seedAcc() {
  store.save(ACC, {
    learned: { topics: ['ch3'], formulas: ['f01'], examples: ['e1'] },
    fav: { formulas: ['f01'], courses: ['c2'] },
    notes: { f01: '账号自己的笔记' },
    records: [{ type: 'formula', id: 'f01', name: '单位冲激', date: '2026-10-27', key: 'formula:f01' }],
    searches: ['拉普拉斯'],
    wrong: ['q2', 'q7'],
    quiz: { answered: 5, correct: 2, exams: [{ id: 'x1' }] },
    pk: { rp: 320, wins: 3, losses: 1, streak: 0, best: 2, history: [{ r: 'w' }] },
    visits: ['2026-10-29'],
    nickname: '微信用户63d3',
    theme: 'light',
  });
}

// ---------- 1. 计数口径 ----------
seedGuest();
// 专题1 + 公式1 + 例题0 + 收藏公式1 + 收藏课程0 + 错题2 + 笔记2 + 答题4 + 天数2
ok('guestCount 计入已学/收藏/错题/笔记/答题/天数',
  store.guestCount(G) === 13, store.guestCount(G));
ok('空档案计数为 0', store.guestCount('__nobody__') === 0, store.guestCount('__nobody__'));

// ---------- 2. 游客不推云 ----------
(async () => {
  const before = calls.length;
  await sync.pushNow(G);
  await new Promise((r) => setTimeout(r, 20));
  ok('游客 pushNow 不调用云函数', calls.length === before, calls.slice(before));
  ok('游客 pushNow 返回 off', (await sync.pushNow(G)).off === true);

  const b2 = calls.length;
  sync.schedule(G, 0);
  await new Promise((r) => setTimeout(r, 60));
  ok('游客 schedule 不触发推送', calls.length === b2, calls.slice(b2));

  const r3 = await sync.syncAll(G);
  ok('游客 syncAll 直接返回 off', r3.ok === false && r3.off === true, r3);

  // 游客写数据（store.save 会走 maybeSync）也不应产生 push
  const pushBefore = calls.filter((x) => x === 'push').length;
  const docBefore = JSON.stringify(cloudDoc);
  store.addWrong(G, 'q9');
  store.recordAnswer(G, true);
  await new Promise((r) => setTimeout(r, 60));
  ok('游客落盘不引发推送', calls.filter((x) => x === 'push').length === pushBefore, calls.slice(-4));
  ok('游客落盘不改动云端文档', JSON.stringify(cloudDoc) === docBefore);

  // ---------- 3. 并入：并集 + 取大 ----------
  seedGuest();
  seedAcc();
  const m = store.mergeGuestInto(ACC);
  ok('并入返回条数', m.ok === true && m.count > 0, m);

  const d = store.load(ACC);
  ok('已学专题取并集', d.learned.topics.indexOf('ch3') >= 0 && d.learned.topics.indexOf('ch1') >= 0, d.learned.topics);
  ok('已学公式取并集', d.learned.formulas.length === 2, d.learned.formulas);
  ok('收藏取并集', d.fav.formulas.indexOf('f01') >= 0 && d.fav.formulas.indexOf('f09') >= 0, d.fav.formulas);
  ok('账号原有课程收藏不丢', d.fav.courses.indexOf('c2') >= 0, d.fav.courses);
  ok('笔记：两边都有时以账号为准', d.notes.f01 === '账号自己的笔记', d.notes.f01);
  ok('笔记：账号没写过的用游客的', d.notes.f09 === '游客写的笔记', d.notes.f09);
  ok('错题取并集且去重', d.wrong.length === 3 && d.wrong.indexOf('q2') === d.wrong.lastIndexOf('q2'), d.wrong);
  ok('答题数取大不求和', d.quiz.answered === 5, d.quiz.answered);
  ok('正确数取大不求和', d.quiz.correct === 3, d.quiz.correct);
  ok('账号原有考试记录保留', (d.quiz.exams || []).length === 1, d.quiz.exams);
  ok('段位取大', d.pk.rp === 320, d.pk.rp);
  ok('胜场取大', d.pk.wins === 3, d.pk.wins);
  ok('连胜只认账号自己的', d.pk.streak === 0, d.pk.streak);
  ok('对局历史只认账号自己的', d.pk.history.length === 1, d.pk.history);
  ok('学习天数取并集', d.visits.length === 2 && d.visits.indexOf('2026-10-28') >= 0, d.visits);
  ok('昵称以账号为准', d.nickname === '微信用户63d3', d.nickname);
  ok('主题以账号为准', d.theme === 'light', d.theme);
  ok('记录按 type+id 去重', d.records.length === 3, d.records.map((r) => r.type + ':' + r.id));
  ok('记录顺序：账号的排前面', d.records[0].id === 'f01', d.records[0]);

  // ---------- 4. 并入后游客清空 ----------
  ok('并入后游客计数归零', store.guestCount(G) === 0, store.guestCount(G));
  ok('并入后游客主题保留', store.load(G).theme === 'dark', store.load(G).theme);

  const m2 = store.mergeGuestInto(ACC);
  ok('再次并入不重复计数', m2.count === 0, m2);

  // ---------- 5. 边界 ----------
  ok('合并不进游客自己', store.mergeGuestInto(G).ok === false);
  ok('合并空账号被拒', store.mergeGuestInto('').ok === false);
  const d2 = store.load(ACC);
  ok('异常入参不改动账号数据', d2.quiz.answered === 5 && d2.wrong.length === 3, d2.quiz);

  // ---------- 6. 登录后仍能推云（回归：别把账号一起禁了） ----------
  const b4 = calls.length;
  await sync.pushNow(ACC);
  await new Promise((r) => setTimeout(r, 30));
  ok('账号 pushNow 仍然推云', calls.slice(b4).indexOf('push') >= 0, calls.slice(b4));
  ok('云端收到的是账号数据', cloudDoc && cloudDoc.quiz && cloudDoc.quiz.answered === 5, cloudDoc && cloudDoc.quiz);
  ok('云端昵称是具体名字', cloudDoc && cloudDoc.nickname === '微信用户63d3', cloudDoc && cloudDoc.nickname);

  console.log('\n游客隔离/并入：' + pass + ' 通过，' + fail + ' 失败');
  if (fail) process.exit(1);
})();
