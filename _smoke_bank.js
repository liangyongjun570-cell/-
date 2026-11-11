// 题库扩容后的端到端烟测：首页统计 / 四种组卷入口 / 130 题全量过一遍 / 分享文案
const ROOT = 'D:/xiaochengxu2/signals-pro/';
const D = require(ROOT + 'data/index');

let store = {};
let sheetIndex = 0;
const wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 44, pixelRatio: 3 }),
  getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 375, windowHeight: 812 }),
  showToast: (o) => console.log('  [toast]', o && o.title),
  showModal: () => {},
  showActionSheet: (o) => { if (o && o.success) o.success({ tapIndex: sheetIndex }); },
  navigateTo: (o) => console.log('  [nav]', o.url),
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  vibrateShort: () => {},
};
global.wx = wx;
global.getApp = () => ({
  globalData: { theme: 'light', ctx: null, user: null, statusBarHeight: 44 },
  account: () => '__guest__',
});

function loadPage(file) {
  let cfg = null;
  global.Page = (o) => { cfg = o; };
  delete require.cache[require.resolve(ROOT + file)];
  require(ROOT + file);
  cfg.setData = function (o) { Object.assign(this.data, o); };
  return cfg;
}

let fail = 0;
function ok(cond, msg, extra) {
  if (cond) console.log('  ✓ ' + msg + (extra === undefined ? '' : '  ' + extra));
  else { fail += 1; console.log('  ✗ ' + msg + (extra === undefined ? '' : '  ' + extra)); }
}

const quiz = loadPage('pages/quiz/quiz.js');
quiz.onLoad({});

console.log('\n== 首页统计 ==');
ok(quiz.data.total === D.questions.length, 'total = ' + quiz.data.total);
const chSum = quiz.data.chList.reduce((s, c) => s + c.count, 0);
ok(chSum === quiz.data.total, '各章题数之和 = total', chSum);
ok(quiz.data.chList.length === 8, '章节数 8', quiz.data.chList.map((c) => 'ch' + c.num + ':' + c.count).join(' '));
const dSum = quiz.data.difList.reduce((s, d) => s + d.count, 0);
ok(dSum === quiz.data.total, '各难度题数之和 = total', quiz.data.difList.map((d) => d.name + ':' + d.count).join(' '));

console.log('\n== 随机模考（4 个档位）==');
[0, 1, 2, 3].forEach((i) => {
  sheetIndex = i;
  quiz.startRandom();
  const n = quiz.data.exam.ids.length;
  console.log('  档位' + i + ' → ' + quiz.data.exam.title + '，实际 ' + n + ' 题');
  ok(n === (i < 3 ? [10, 20, 30][i] : D.questions.length), '题量正确', n);
});

console.log('\n== 难度专项 ==');
quiz.data.difList.forEach((d) => {
  quiz.startByDiff({ currentTarget: { dataset: { d: d.name } } });
  const n = quiz.data.exam.ids.length;
  const allMatch = quiz.data.exam.ids.every((id) => D.questions.find((q) => q.id === id).difficulty === d.name);
  ok(allMatch && n === Math.min(15, d.count), d.name + ' 抽题正确（' + n + ' 题，全同难度 ' + allMatch + '）');
});

console.log('\n== 按章专项 ==');
D.chapters.forEach((c) => {
  const cnt = D.questions.filter((q) => q.ch === c.num).length;
  if (!cnt) return;
  quiz.startByCh(c.num);
  ok(quiz.data.exam.ids.length === cnt, 'ch' + c.num + ' 抽到 ' + cnt + ' 题');
});

console.log('\n== 130 题全量走一遍（选正确答案 / 提交 / 下一题）==');
quiz.begin(D.questions.map((q) => q.id), '全量回归');
let bad = 0;
let maxStem = 0;
let maxOpt = 0;
for (let i = 0; i < D.questions.length; i++) {
  const cur = quiz.data.cur;
  const q = D.questions.find((x) => x.id === cur.id);
  if (!q) { bad += 1; console.log('  ✗ 找不到题 ' + cur.id); break; }
  if (cur.options.length !== 4) { bad += 1; console.log('  ✗ 选项数异常 ' + cur.id); }
  if (cur.explanation !== q.explanation) { bad += 1; console.log('  ✗ 解析不一致 ' + cur.id); }
  maxStem = Math.max(maxStem, String(cur.stem).length);
  cur.options.forEach((o) => { maxOpt = Math.max(maxOpt, String(o).length); });
  quiz.pick({ currentTarget: { dataset: { i: q.answer } } });
  quiz.submit();
  if (!quiz.data.submitted) { bad += 1; console.log('  ✗ 提交失败 ' + cur.id); }
  quiz.nextQuestion();
}
ok(bad === 0, '130 题全部可作答（异常 ' + bad + ' 处）');
ok(quiz.data.mode === 'result', '走到结果页');
ok(quiz.data.result.right === D.questions.length, '全选对 → ' + quiz.data.result.right + '/' + quiz.data.result.total + '，正确率 ' + quiz.data.result.rate + '%');
console.log('  最长题干 ' + maxStem + ' 字，最长选项 ' + maxOpt + ' 字');

console.log('\n== 错题链路（故意选错）==');
quiz.setIdle();
const wrongIds = ['q01', 'q63'];
quiz.begin(wrongIds, '错题测试');
wrongIds.forEach((id) => {
  const q = D.questions.find((x) => x.id === id);
  const wrong = (quiz.data.cur.answer + 1) % 4;
  quiz.pick({ currentTarget: { dataset: { i: wrong } } });
  quiz.submit();
  quiz.nextQuestion();
  ok(quiz.data.result === null || true, '作答 ' + id + '（正确项在 ' + 'ABCD'[q.answer] + '）');
});
ok(quiz.data.result.right === 0, '两题全错 → right = 0');
ok(quiz.data.result.wrongList.length === 2, '错题列表 2 条');
const first = quiz.data.result.wrongList[0];
ok(['A', 'B', 'C', 'D'].indexOf(first.letter) >= 0, '错题回顾带正确字母 ' + first.letter);
quiz.openReview({ currentTarget: { dataset: { id: first.id } } });
ok(quiz.data.review && quiz.data.review.answer === D.questions.find((q) => q.id === first.id).answer, '回顾弹层答案一致');
quiz.closeReview();

console.log('\n== 分享文案 ==');
const sh = quiz.onShareAppMessage();
ok(sh.path === '/pages/quiz/quiz' && String(sh.title).indexOf(String(D.questions.length)) > 0, '首页分享带题量', sh.title);

console.log('\n== 选项顺序稳定性（两次独立加载）==');
function snapshot() {
  delete require.cache[require.resolve(ROOT + 'data/questions.js')];
  return JSON.stringify(require(ROOT + 'data/questions.js').map((q) => q.id + ':' + q.options.join('|') + '#' + q.answer));
}
ok(snapshot() === snapshot(), '同一 id 两次加载顺序一致（PK 双方公平）');

console.log('\n' + (fail ? '❌ 失败 ' + fail + ' 项' : '✅ 全部通过'));
process.exit(fail ? 1 : 0);
