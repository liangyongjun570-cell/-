// 云环境探测烟测：错误归类 / probe 缓存 / 登录页降级文案
//
// 重点覆盖真实踩到的场景：用「测试号」AppID 跑项目时，
// wx.cloud.init() 不抛异常（旧的 available() 会误判成可用），
// 但任何 callFunction 都返回 -601059，必须能识别并给出针对性提示。
const ROOT = 'D:/xiaochengxu2/signals-pro/';

let store = {};
const calls = { modal: [], toast: [], switchTab: [] };
let failPayload = null; // 非 null 时 callFunction 走 fail 分支
let callCount = 0;

global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showToast: (o) => calls.toast.push(o.title),
  showModal: (o) => calls.modal.push(o.title),
  switchTab: (o) => calls.switchTab.push(o.url),
  navigateTo: () => {},
  vibrateShort: () => {},
  createSelectorQuery: () => ({
    in() { return this; },
    select() { return this; },
    fields() { return this; },
    exec(cb) { cb([]); },
  }),
  setNavigationBarColor: () => {},
  setBackgroundColor: () => {},
  cloud: {
    init: () => {},
    callFunction: (o) => {
      callCount++;
      if (failPayload) return o.fail && o.fail(failPayload);
      if (o.success) o.success({ result: { ok: true, openid: 'oTestOpenid' } });
    },
  },
};

const appObj = {
  globalData: { theme: 'light', user: null, ctx: null, statusBarHeight: 44 },
  account() { return (this.globalData.user && this.globalData.user.account) || '__guest__'; },
  afterLogin(u) { this.globalData.user = u; },
  afterLogout() { this.globalData.user = null; },
};
global.getApp = () => appObj;

const realTimeout = global.setTimeout;
global.setTimeout = (fn) => { try { fn(); } catch (e) {} return 0; };

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++;
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

const cloud = require(ROOT + 'utils/cloud.js');

(async () => {
  const wait = (ms) => new Promise((r) => realTimeout(r, ms));
  const run = (p) => Promise.race([p, wait(200)]);

  console.log('=== 错误归类 ===');

  // 1) 测试号：本轮真实报错 -601059
  const CASES = [
    ['测试号', { errCode: -601059, errMsg: 'cloud.callFunction:fail 测试号不能使用云服务' }, 'test',
      '测试号不支持云开发'],
    ['云函数未部署', { errMsg: 'cloud.callFunction:fail Error: errCode: -501000 | errMsg: FunctionName parameter could not be found.' }, 'no-fn',
      '云函数 mycloud 未部署'],
    ['环境不存在', { errCode: -501000, errMsg: 'env check invalid: env not exists' }, 'no-env',
      '云开发环境未开通'],
    ['无权限', { errCode: -601012, errMsg: 'PERMISSION_DENIED' }, 'perm', '没有云开发权限'],
    ['网络/未知', { errMsg: 'network timeout' }, 'net', '云服务连接失败'],
  ];

  for (const [label, payload, wantReason, wantText] of CASES) {
    failPayload = payload;
    cloud.reset();
    const before = cloud.available();
    ok(label + '：init 阶段仍判可用（模拟旧逻辑的坑）', before === true);
    const alive = await run(cloud.probe());
    ok(label + '：probe 返回不可用', alive === false, alive);
    ok(label + '：available 转为 false', cloud.available() === false);
    ok(label + '：原因归类正确', cloud.reason() === wantReason, cloud.reason());
    ok(label + '：文案正确', cloud.reasonText() === wantText, cloud.reasonText());
    ok(label + '：statusText 带原因', cloud.statusText() === wantText + ' · 本机存储', cloud.statusText());
  }

  console.log('=== 正常可用 ===');
  failPayload = null;
  cloud.reset();
  const aliveOk = await run(cloud.probe());
  ok('云正常时 probe 返回 true', aliveOk === true, aliveOk);
  ok('云正常时 available 保持 true', cloud.available() === true);
  ok('云正常时无失败原因', cloud.reason() === '');
  ok('云正常时状态文案', cloud.statusText() === '云同步已连接', cloud.statusText());

  console.log('=== probe 缓存 ===');
  cloud.reset();
  failPayload = { errCode: -601059, errMsg: '测试号不能使用云服务' };
  callCount = 0;
  const p1 = cloud.probe();
  const p2 = cloud.probe();
  await run(p1);
  await run(p2);
  ok('并发 probe 只打一次云函数', callCount === 1, callCount);

  console.log('=== reset 清空状态 ===');
  ok('reset 后 reason 清空', (cloud.reset(), cloud.reason() === ''));
  ok('reset 后 available 重新为 true', cloud.available() === true);

  console.log('=== 登录页文案 ===');

  // 测试号场景下进登录页：按钮必须立刻显示不可用，提示指向 AppID
  failPayload = { errCode: -601059, errMsg: 'cloud.callFunction:fail 测试号不能使用云服务' };
  cloud.reset();
  appObj.globalData.user = null;
  const p = fresh('pages/login/login.js');
  p.onLoad();
  ok('测试号下按钮初始按 available 显示可点（异步会纠正）', p.data.wxReady === true);
  await wait(80);
  ok('探活后按钮转为不可用', p.data.wxReady === false, p.data.wxReady);
  ok('提示文案指向测试号/AppID', p.data.wxHint.indexOf('测试号') >= 0, p.data.wxHint);

  calls.modal.length = 0;
  p.wxHelp();
  ok('帮助弹窗标题点明测试号', calls.modal.indexOf('当前是测试号，不能使用云开发') >= 0, calls.modal);

  // 云函数未部署场景
  failPayload = { errMsg: 'cloud.callFunction:fail Error: errCode: -501000 | errMsg: FunctionName parameter could not be found.' };
  cloud.reset();
  const pg = fresh('pages/login/login.js');
  pg.onLoad();
  await wait(80);
  ok('未部署时提示指向云函数', pg.data.wxHint.indexOf('云函数') >= 0, pg.data.wxHint);
  calls.modal.length = 0;
  pg.wxHelp();
  ok('未部署时弹窗标题正确', calls.modal.indexOf('云函数 mycloud 还没部署') >= 0, calls.modal);

  // 正常场景：不该弹任何提示
  failPayload = null;
  cloud.reset();
  const pg2 = fresh('pages/login/login.js');
  pg2.onLoad();
  await wait(80);
  ok('云正常时按钮可点', pg2.data.wxReady === true);
  ok('云正常时提示为同步文案', pg2.data.wxHint.indexOf('同步到云端') >= 0, pg2.data.wxHint);

  console.log('\n=== 结果 ===');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  global.setTimeout = realTimeout;
  process.exit(fail ? 1 : 0);
})();
