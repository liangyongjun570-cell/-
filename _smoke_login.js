// 登录链路离线烟测：注册 / 登录 / 记住我 / 退出 / 密保找回 / 字段级校验
const path = require('path');
const ROOT = 'D:/xiaochengxu2/signals-pro/';

let store = {};
const calls = { toast: [], switchTab: [], modal: [], vibrate: 0 };

global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showToast: (o) => calls.toast.push(o.title),
  showModal: (o) => calls.modal.push(o.title),
  switchTab: (o) => calls.switchTab.push(o.url),
  navigateTo: () => {},
  vibrateShort: () => { calls.vibrate++; },
  createSelectorQuery: () => ({
    in() { return this; },
    select() { return this; },
    fields() { return this; },
    exec(cb) { cb([]); },
  }),
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
};

const appObj = {
  globalData: { theme: 'light', user: null, ctx: null, statusBarHeight: 44 },
  account() { return (this.globalData.user && this.globalData.user.account) || '__guest__'; },
  afterLogin(u) { this.globalData.user = u; },
  afterLogout() { this.globalData.user = null; },
};
global.getApp = () => appObj;

// setTimeout 同步执行，避免测试里等真实时间
const realTimeout = global.setTimeout;
global.setTimeout = (fn) => { try { fn(); } catch (e) { console.log('timer throw:', e.message); } return 0; };

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
}

function fresh(file) {
  let cfg = null;
  global.Page = (o) => { cfg = o; };
  delete require.cache[require.resolve(ROOT + file)];
  require(ROOT + file);
  cfg.data = JSON.parse(JSON.stringify(cfg.data));
  cfg.setData = function (o) {
    Object.keys(o).forEach((k) => {
      if (k.indexOf('.') === -1) { this.data[k] = o[k]; return; }
      const parts = k.split('.');
      let p = this.data;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!p[parts[i]] || typeof p[parts[i]] !== 'object') p[parts[i]] = {};
        p = p[parts[i]];
      }
      p[parts[parts.length - 1]] = o[k];
    });
  };
  return cfg;
}

// ---------------- auth 层 ----------------
const auth = require(ROOT + 'utils/auth.js');

console.log('=== auth ===');
ok('弱账号被拒', !auth.validateAccount('ab'));
ok('合法账号通过', auth.validateAccount('Li_2024'));
ok('弱密码被拒', !auth.validatePwd('12345678'));
ok('含空格被拒', !auth.validatePwd('abc 12345'));

let r = auth.register('alice_01', 'abc12345', 'abc12345', { sq: 2, sa: '  GuanZhou ' });
ok('注册成功', r.ok, r);
ok('注册后能查到', auth.exists('ALICE_01'));
ok('账号归一化小写', !!auth.exists('alice_01'));

r = auth.register('alice_01', 'abc12345', 'abc12345');
ok('重复注册被拒', !r.ok && /已在本机注册/.test(r.msg), r);

r = auth.register('bob_02', 'abc12345', 'abc12345');
ok('无密保账号也能注册', r.ok, r);

r = auth.login('alice_01', 'wrong1234');
ok('错密码被拒', !r.ok && /不正确/.test(r.msg), r);

r = auth.login('alice_01', 'abc12345', { remember: true });
ok('登录成功', r.ok && r.user.account === 'alice_01', r);
ok('登录带 hasSq', r.user.hasSq === true, r.user);
const sess = wx.getStorageSync('ssp_session');
ok('会话写入且 remember=true', sess && sess.remember === true, sess);
ok('lastAccount 记录', auth.lastAccount() === 'alice_01', auth.lastAccount());
ok('restoreSession 可用', !!auth.restoreSession());

// 记住我 = false → 24h 过期
auth.login('alice_01', 'abc12345', { remember: false });
store.ssp_session.at = Date.now() - 25 * 3600 * 1000;
ok('未勾选记住我 25h 后过期', auth.restoreSession() === null);
// 勾选 → 30 天有效，且滑动续期
auth.login('alice_01', 'abc12345', { remember: true });
store.ssp_session.at = Date.now() - 25 * 3600 * 1000;
const restored = auth.restoreSession();
ok('勾选记住我 25h 后仍有效', !!restored, restored);
ok('会话滑动续期', Date.now() - wx.getStorageSync('ssp_session').at < 5000);

// 退出登录
auth.logout();
ok('退出后无会话', !wx.getStorageSync('ssp_session'));
ok('退出后 restoreSession 为空', auth.restoreSession() === null);
ok('退出保留上次账号', auth.lastAccount() === 'alice_01', auth.lastAccount());

// 账号列表
const list = auth.listAccounts();
ok('账号列表 2 个', list.length === 2, list);
ok('有密保标记', list.filter((x) => x.account === 'alice_01')[0].hasSq === true);

// 找回密码
const s1 = auth.securityOf('alice_01');
ok('securityOf 有密保', s1.exists && s1.hasSq && s1.sqText === auth.SECURITY_QUESTIONS[2], s1);
const s2 = auth.securityOf('bob_02');
ok('无密保账号 hasSq=false', s2.exists && !s2.hasSq, s2);
ok('不存在账号 exists=false', !auth.securityOf('nobody').exists);

r = auth.resetPwd('alice_01', ' GUANZHOU ', 'newpass123', 'newpass123');
ok('答案大小写/空格不敏感，重置成功', r.ok, r);
ok('旧密码失效', !auth.login('alice_01', 'abc12345').ok);
ok('新密码可用', auth.login('alice_01', 'newpass123').ok);
r = auth.resetPwd('bob_02', 'x', 'newpass123', 'newpass123');
ok('无密保不可重置', !r.ok && /无法找回/.test(r.msg), r);
r = auth.resetPwd('alice_01', 'wrong', 'newpass123', 'newpass123');
ok('答案错拒绝重置', !r.ok && /答案不正确/.test(r.msg), r);
r = auth.resetPwd('alice_01', 'guanzhou', 'short', 'short');
ok('新密码不合规拒绝', !r.ok && /8–32/.test(r.msg), r);
auth.logout();

// ---------------- 页面层 ----------------
console.log('=== page ===');
store = {};
delete require.cache[require.resolve(ROOT + 'utils/auth.js')];
const page = fresh('pages/login/login.js');
page.onLoad();
ok('无会话时留在登录页', page.data.mode === 'login');
ok('首次进入无上次账号', page.data.account === '');

// 注册：未勾协议
page.switchMode({ currentTarget: { dataset: { m: 'register' } } });
ok('切到注册', page.data.mode === 'register');
page.onAccount({ detail: { value: 'carol_03' } });
page.onPwd({ detail: { value: 'abc12345' } });
ok('强度计算', page.data.strength.lv >= 2, page.data.strength);
page.onPwd2({ detail: { value: 'abc12345' } });
page.submit();
ok('未勾协议被拦', /勾选/.test(page.data.err), page.data.err);

// 协议勾选后提交
page.toggleAgree();
page.submit();
ok('注册成功跳首页', calls.switchTab.indexOf('/pages/index/index') >= 0, calls.switchTab);
ok('afterLogin 生效', appObj.globalData.user && appObj.globalData.user.account === 'carol_03', appObj.globalData.user);
ok('注册后记录上次账号', page.data.last === 'carol_03');

// 字段级错误
appObj.globalData.user = null;   // 模拟已退出登录后再进登录页
const p2 = fresh('pages/login/login.js');
p2.onLoad();
ok('预填上次账号', p2.data.account === 'carol_03', p2.data.account);
p2.setData({ account: '' });
p2.submit();
ok('空账号给字段错误', p2.data.bad.account === '请输入账号' && !!p2.data.err, p2.data.bad);
p2.onAccount({ detail: { value: 'carol_03' } });
ok('输入即清错误', !p2.data.bad.account && !p2.data.err);
p2.setData({ pwd: 'wrong1234' });
p2.submit();
ok('错密码提示', /不正确/.test(p2.data.err), p2.data.err);
p2.onPwd({ detail: { value: 'abc12345' } });
ok('登录前可切忘记密码', true);

// 忘记密码
p2.goReset();
ok('进入找回', p2.data.mode === 'reset' && p2.data.resetStep === 1);
p2.setData({ resetAcc: 'ghost' });
p2.resetQuery();
ok('不存在账号提示', /没有这个账号/.test(p2.data.err), p2.data.err);
p2.onResetAcc({ detail: { value: 'carol_03' } });
p2.resetQuery();
ok('无密保账号提示无法找回', /没有设置密保/.test(p2.data.err), p2.data.err);

// 造一个有密保的账号再找回
auth.register('dave_04', 'abc12345', 'abc12345', { sq: 0, sa: 'wang' });
p2.onResetAcc({ detail: { value: 'dave_04' } });
p2.resetQuery();
ok('进入第二步并带出问题', p2.data.resetStep === 2 && p2.data.resetQ === auth.SECURITY_QUESTIONS[0], p2.data.resetQ);
p2.onResetAnswer({ detail: { value: 'WRONG' } });
p2.onResetPwd1({ detail: { value: 'newpass123' } });
p2.onResetPwd2({ detail: { value: 'newpass123' } });
p2.submitReset();
ok('答案错拒绝', /答案不正确/.test(p2.data.err), p2.data.err);
p2.onResetAnswer({ detail: { value: 'Wang' } });
p2.submitReset();
ok('重置成功回到登录', p2.data.mode === 'login' && p2.data.account === 'dave_04', p2.data.mode + '/' + p2.data.account);
ok('重置后提示', calls.toast.indexOf('密码已重置') >= 0);
ok('新密码可直接登录', auth.login('dave_04', 'newpass123').ok);

// 键盘流转
const p3 = fresh('pages/login/login.js');
p3.onLoad();
p3.onConfirm({ currentTarget: { dataset: { k: 'account' } } });
ok('账号回车 → 密码聚焦', p3.data.focus === 'pwd', p3.data.focus);

// 游客
const before = calls.switchTab.length;
p3.guest();
ok('游客进入首页', calls.switchTab.length === before + 1);

// 条款弹层
p3.openDoc({ currentTarget: { dataset: { k: 'privacy' } } });
ok('隐私说明可打开', p3.data.docOpen && /隐私/.test(p3.data.docTitle) && p3.data.docBody.length > 200);
p3.closeDoc();
ok('弹层可关闭', !p3.data.docOpen);

// 退出登录后重启不复活（模拟 app.onLaunch 的 restoreSession）
auth.logout();
ok('退出后重启仍是游客', auth.restoreSession() === null);

// ---------------- 微信一键登录 ----------------
// 这一段落要真实跑 Promise 链，把被劫持的 setTimeout 换回真的
global.setTimeout = realTimeout;

const S = require(ROOT + 'utils/store.js');
const cloud = require(ROOT + 'utils/cloud.js');

let openid = 'oXyZ_OpenId_001';
let cloudDown = false;
wx.cloud = {
  init: () => {},
  callFunction: (o) => {
    if (cloudDown) return o.fail && o.fail({ errMsg: 'cloud not deployed' });
    if (o.success) o.success({ result: { ok: true, openid } });
  },
};

const wait = (ms) => new Promise((r) => realTimeout(r, ms));

(async () => {
  console.log('=== 微信 ===');

  const acc1 = auth.wxAccountOf(openid);
  ok('openid 派生账号带 wx_ 前缀', /^wx_[0-9a-f]{12}$/.test(acc1), acc1);
  ok('同一 openid 派生稳定', auth.wxAccountOf(openid) === acc1);
  ok('不同 openid 不撞号', auth.wxAccountOf('oOther') !== acc1);
  ok('空 openid 不派生', auth.wxAccountOf('') === '');

  // 1) 云可用：一键登录建号
  cloud.reset();
  appObj.globalData.user = null;
  const p4 = fresh('pages/login/login.js');
  p4.onLoad();
  ok('登录页探测到云可用', p4.data.wxReady === true, p4.data.wxReady);

  const n0 = calls.switchTab.length;
  p4.wxLogin();
  await wait(700);
  ok('微信登录拿到会话', !!wx.getStorageSync('ssp_session'), wx.getStorageSync('ssp_session'));
  ok('会话标记为微信', (wx.getStorageSync('ssp_session') || {}).wx === true);
  ok('afterLogin 生效', appObj.globalData.user && appObj.globalData.user.wx === true, appObj.globalData.user);
  ok('账号 = openid 派生值', appObj.globalData.user.account === acc1);
  ok('微信账号落到本地表', auth.isWx(acc1));
  ok('跳转首页', calls.switchTab.length > n0);

  // 2) 二次登录不重复建号
  const cnt1 = auth.listAccounts().length;
  const p5 = fresh('pages/login/login.js');
  appObj.globalData.user = null;
  p5.onLoad();
  p5.wxLogin();
  await wait(60);
  ok('二次登录不重复建号', auth.listAccounts().length === cnt1, auth.listAccounts().length + ' vs ' + cnt1);

  // 3) 微信账号不能走密码登录 / 密保找回
  const rPwd = auth.login(acc1, 'abc12345');
  ok('微信账号拒绝密码登录', !rPwd.ok && /微信一键登录/.test(rPwd.msg), rPwd.msg);
  ok('securityOf 标记 wx', auth.securityOf(acc1).wx === true);
  const rReset = auth.resetPwd(acc1, 'x', 'abc12345', 'abc12345');
  ok('微信账号拒绝密保重置', !rReset.ok && /微信账号/.test(rReset.msg), rReset.msg);
  ok('微信账号拒绝设密保', !auth.setSecurity(acc1, 'x', 0, 'y').ok);

  // 4) 新微信号首次登录时，可把游客记录带过去
  const data = S.defaults();
  data.learned.topics = ['t01', 't02', 't03'];
  data.wrong = ['q01', 'q02'];
  data.quiz.answered = 12;
  S.save(S.GUEST, data);
  const guestScore = S.guestCount(S.GUEST);
  ok('能数出游客记录数', guestScore === 17, guestScore);

  let askedCarry = false;
  wx.showModal = (o) => {
    calls.modal.push(o.title);
    if (/带走/.test(o.title)) askedCarry = true;
    if (o.success) o.success({ confirm: true });
  };
  openid = 'oBrand_New_User_777';
  cloud.reset();
  appObj.globalData.user = null;
  const p6 = fresh('pages/login/login.js');
  p6.onLoad();
  p6.wxLogin();
  await wait(80);
  ok('新号会问要不要带走游客记录', askedCarry);
  const acc2 = auth.wxAccountOf(openid);
  const moved = S.load(acc2);
  ok('游客专题已迁移', moved.learned.topics.length === 3, moved.learned.topics);
  ok('游客错题已迁移', moved.wrong.length === 2, moved.wrong);
  ok('游客答题数已迁移', moved.quiz.answered === 12, moved.quiz.answered);
  ok('迁移后登录的是新微信账号', appObj.globalData.user.account === acc2);

  // 4.5) 老账号 + 残留游客数据：上次点了「不用」，这次登录必须还能补并
  const g2 = S.defaults();
  g2.wrong = ['q90', 'q91'];
  g2.quiz.answered = 3;
  S.save(S.GUEST, g2);
  let title2 = '';
  wx.showModal = (o) => {
    calls.modal.push(o.title);
    title2 = o.title;
    if (o.success) o.success({ confirm: false }); // 这次点「不用」
  };
  appObj.globalData.user = null;
  const p8 = fresh('pages/login/login.js');
  p8.onLoad();
  p8.wxLogin(); // 同一个 openid → 账号已存在，fresh = false
  await wait(80);
  ok('老账号也会提示补并游客记录', /没并进来/.test(title2), title2);
  ok('点「不用」后游客数据原地保留', S.guestCount(S.GUEST) === 5, S.guestCount(S.GUEST));
  ok('点「不用」不影响账号已有数据', S.load(acc2).quiz.answered === 12, S.load(acc2).quiz.answered);

  // 5) 云不可用：给可操作提示，不抛异常
  auth.logout();
  wx.cloud = null;
  cloud.reset();
  wx.showModal = (o) => {
    calls.modal.push(o.title);
    if (o.success) o.success({ confirm: true });
  };
  appObj.globalData.user = null;
  const p7 = fresh('pages/login/login.js');
  p7.onLoad();
  ok('无云环境时按钮降级', p7.data.wxReady === false);
  p7.wxLogin();
  await wait(40);
  ok('无云时给出步骤指引', calls.modal.indexOf('微信登录暂不可用') >= 0, calls.modal.slice(-3));
  ok('无云时不会写会话', !wx.getStorageSync('ssp_session'));

  // 6) 我的页对微信账号的显示
  appObj.globalData.user = { account: acc1, wx: true };
  const mePage = fresh('pages/me/me.js');
  mePage.data = JSON.parse(JSON.stringify(mePage.data));
  mePage.onLoad();
  mePage.onShow();
  ok('我的页显示「微信账号」', mePage.data.account === '微信账号', mePage.data.account);
  ok('我的页打上微信标记', mePage.data.isWx === true);
  ok('微信账号昵称带可区分后缀', /^微信用户[0-9a-f]{4}$/.test(mePage.data.nickname), mePage.data.nickname);

  console.log('\n=== 结果 ===');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();

