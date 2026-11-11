// 跨 tab 返回机制验证
//
// switchTab 会清空页面栈，从「我的 → 收藏」跳公式库后没有 navigateBack。
// 这里验证 crossTab 记下的来源能被目标页读到、点返回能切回去、离开后自动作废。
const ROOT = 'D:/xiaochengxu2/signals-pro/';

const gData = { theme: 'light', user: null, tabNow: undefined, back: null, ctx: null };
const switched = [];
let stack = [];

global.getApp = () => ({ globalData: gData });
global.getCurrentPages = () => stack;
global.wx = {
  switchTab: (o) => switched.push(o.url),
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {},
  showToast: () => {},
  showModal: () => {},
  navigateTo: () => {},
  vibrateShort: () => {},
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  createSelectorQuery: () => ({ in() { return this; }, select() { return this; }, fields() { return this; }, exec(cb) { cb([]); } }),
};

const util = require(ROOT + 'utils/util.js');
const store = require(ROOT + 'utils/store.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
}

const T = { index: 0, chapters: 1, lab: 2, formulas: 3, me: 4 };

// ---------- 1. tabNow 记录 ----------
util.setTabBar({}, T.me, 'light');
ok('setTabBar 记住当前 tab', gData.tabNow === T.me, gData.tabNow);
ok('没有 getTabBar 不报错', true);

// ---------- 2. 同 tab 跳转不记录来源 ----------
switched.length = 0;
util.crossTab(T.me);
ok('同 tab 跳转不算跨 tab', gData.back === null, gData.back);
ok('仍然会 switchTab', switched[0] === '/pages/me/me', switched);

// ---------- 3. 跨 tab 记录来源 ----------
gData.back = null;
util.setTabBar({}, T.me, 'light');
switched.length = 0;
util.crossTab(T.formulas, { hint: '只看收藏' });
ok('跳转地址正确', switched[0] === '/pages/formulas/formulas', switched);
ok('来源记为「我的」', gData.back && gData.back.index === T.me, gData.back);
ok('来源标签正确', gData.back.label === '我的', gData.back.label);
ok('提示透传', gData.back.hint === '只看收藏', gData.back.hint);
ok('目标页读得到', util.backInfo() === gData.back);

// ---------- 4. 点返回切回来源 ----------
switched.length = 0;
ok('goBackTab 返回 true', util.goBackTab() === true);
ok('切回来源 tab', switched[0] === '/pages/me/me', switched);
ok('返回后来源清空', gData.back === null, gData.back);
ok('再点返回不跳', util.goBackTab() === false && switched.length === 1);

// ---------- 5. 页面栈优先于 tabNow ----------
// 场景：我的 → 记录(navigateTo) → 点「去章节」。栈底的 tab 才是真正能回去的
gData.tabNow = T.me;
stack = [{ route: 'pages/me/me' }, { route: 'pages/records/records' }];
switched.length = 0;
util.crossTab(T.chapters, { hint: '从记录看章节' });
ok('栈底 tab 作为来源', gData.back && gData.back.index === T.me, gData.back);
ok('来源标签取自栈底 tab', gData.back.label === '我的', gData.back.label);
util.clearBack();

// 首页 → 专题 → 专题跳实验室
stack = [{ route: 'pages/index/index' }, { route: 'pages/topic/topic' }];
util.crossTab(T.lab, { hint: '本章实验' });
ok('多层栈也能推断来源', gData.back && gData.back.index === T.index && gData.back.label === '首页', gData.back);
util.clearBack();

// 栈里没有 tab 页时退回 tabNow
stack = [{ route: 'pages/topic/topic' }];
gData.tabNow = T.chapters;
util.crossTab(T.lab);
ok('栈里无 tab 时退回 tabNow', gData.back && gData.back.index === T.chapters, gData.back);
util.clearBack();
stack = [];

// ---------- 6. clearBack / 无效 index ----------
util.setTabBar({}, T.formulas, 'light');
util.crossTab(T.lab);
ok('clearBack 后 backInfo 为空', (util.clearBack(), util.backInfo() === null));
switched.length = 0;
ok('越界 index 不跳不报错', (util.crossTab(99), switched.length === 0));
ok('负数 index 不跳不报错', (util.crossTab(-1), switched.length === 0));

// ---------- 7. 页面层接线 ----------
// appref 自己包了一层 getApp()，这里不用再 mock，真实依赖都能本地加载
const pageOf = (path) => {
  let captured = null;
  global.Page = (o) => { captured = o; };
  const full = ROOT + path;
  delete require.cache[require.resolve(full)];
  require(full);
  const p = Object.assign({}, captured);
  p.data = JSON.parse(JSON.stringify(captured.data || {}));
  p.setData = (patch) => {
    Object.keys(patch).forEach((k) => {
      const parts = k.split('.');
      let t = p.data;
      for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]] || (t[parts[i]] = {});
      t[parts[parts.length - 1]] = patch[k];
    });
  };
  return p;
};

// 关键时序：wx.switchTab 的顺序是「源页 onHide -> 目标页 onShow」。
// 第一版把 clearBack 放在 onHide，等于返回条刚记下就被源页删了，永远不显示。
gData.user = null;
gData.tabNow = undefined;
stack = [{ route: 'pages/me/me' }];
switched.length = 0;
util.crossTab(T.formulas, { hint: '只看收藏' });
ok('跨 tab 后来源已记下', !!util.backInfo(), gData.back);
// 源页 onHide：旧实现会在这里 util.clearBack()，新实现不该碰 globalData
const fp = pageOf('pages/formulas/formulas.js');
fp.onShow();
ok('时序：目标页仍读得到来源', fp.data.back && fp.data.back.label === '我的', fp.data.back);
ok('提示带过来', fp.data.back && fp.data.back.hint === '只看收藏', fp.data.back);
ok('读完即清，globalData 不残留', util.backInfo() === null, util.backInfo());
ok('公式页有 goBackTab', typeof fp.goBackTab === 'function');

// 切走再回来：不该还挂着「返回我的」
fp.onHide();
ok('切走后本页返回条清空', fp.data.back === null, fp.data.back);
const fp2 = pageOf('pages/formulas/formulas.js');
fp2.onShow();
ok('直接从 tabbar 进不显示返回条', fp2.data.back === null, fp2.data.back);
stack = [];

const lp = pageOf('pages/lab/lab.js');
ok('实验室页有返回条字段', 'back' in lp.data);
ok('实验室页有 goBackTab', typeof lp.goBackTab === 'function');

const ip = pageOf('pages/index/index.js');
ok('首页有返回条字段', 'back' in ip.data);
const mp = pageOf('pages/me/me.js');
ok('我的页有返回条字段', 'back' in mp.data);
const cp = pageOf('pages/chapters/chapters.js');
ok('章节页有返回条字段', 'back' in cp.data);

// 全套 onShow 都会在读完后清 globalData，别把来源带到下一个页面
gData.back = { index: T.me, label: '我的', hint: '' };
ip.onShow();
ok('首页 onShow 也读完即清', util.backInfo() === null, util.backInfo());
ok('首页读到了来源', ip.data.back && ip.data.back.label === '我的', ip.data.back);

console.log('\n跨 tab 返回机制：' + pass + ' 通过，' + fail + ' 失败');
if (fail) process.exit(1);
