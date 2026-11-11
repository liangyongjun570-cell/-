// 昵称口径离线烟测
//
// 背景：云端 push 时昵称为空会被兜底成统一的 "同学"，排行榜全员重名。
// 这里验证「展示名」这条链路：派生规则、云端占位名不回流、本地优先不被覆盖。
const ROOT = 'D:/xiaochengxu2/signals-pro/';

let store = {};
const calls = { toast: [] };
let fsCalls = [];
let fsFail = false;
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showToast: (o) => calls.toast.push(o.title),
  showModal: () => {},
  switchTab: () => {},
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
  // chooseAvatar 拿到的临时路径要经 FileSystemManager 拷进用户目录
  env: { USER_DATA_PATH: '/usr' },
  getFileSystemManager: () => ({
    copyFile: (o) => {
      fsCalls.push({ src: o.srcPath, dest: o.destPath });
      if (fsFail) {
        if (o.fail) o.fail(new Error('mock-fail'));
      } else if (o.success) o.success();
    },
  }),
};
global.getApp = () => ({
  globalData: { theme: 'light', user: null },
  account() { return '__guest__'; },
  afterLogin() {},
  afterLogout() {},
});

const auth = require(ROOT + 'utils/auth.js');
const store2 = require(ROOT + 'utils/store.js');
const sync = require(ROOT + 'utils/sync.js');

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); }
}

// ---------------- 1. 派生规则 ----------------
console.log('=== 派生规则 ===');
ok('微信账号派生带后缀', store2.autoName('wx_a1b2c3d4e5f6') === '微信用户e5f6', store2.autoName('wx_a1b2c3d4e5f6'));
ok('同一账号派生稳定', store2.autoName('wx_a1b2c3d4e5f6') === store2.autoName('wx_a1b2c3d4e5f6'));
ok('不同账号派生不同', store2.autoName('wx_a1b2c3d4e5f6') !== store2.autoName('wx_a1b2c3d4e5ff'));
ok('本机账号用账号名', store2.autoName('alice_01') === 'alice_01');
ok('游客回退为同学', store2.autoName('__guest__') === '同学');
ok('空账号不抛异常', store2.autoName('') === '同学');
ok('派生名长度可入云端字段', store2.autoName('wx_a1b2c3d4e5f6').length <= 16);

// ---------------- 2. 云端占位名识别 ----------------
console.log('=== 占位名 ===');
ok('同学 视为占位', store2.isPlaceholder('同学') === true);
ok('空串视为无昵称', store2.isPlaceholder('') === true);
ok('undefined 视为无昵称', store2.isPlaceholder(undefined) === true);
ok('正常昵称不算占位', store2.isPlaceholder('小明') === false);
ok('带后缀的同学 不算占位', store2.isPlaceholder('同学2') === false);

// ---------------- 3. 空昵称账号推上云端要有具体名字 ----------------
console.log('=== 推送快照 ===');
const openid = 'owYn5xVPKWb4FzTaZmyUyCpb7tHc';
const acc = auth.wxAccountOf(openid);
auth.registerWx(acc, {});
const snap = sync.snapshot(acc);
ok('快照昵称非空', !!snap.nickname, snap.nickname);
ok('快照昵称不是统一的同学', snap.nickname !== '同学', snap.nickname);
ok('快照昵称与账号派生一致', snap.nickname === '微信用户' + acc.slice(-4), snap.nickname);
// 后缀取账号 id 尾号（= hash(openid) 的一段）而不是 openid 明文，避免把身份片段写进可展示字段
ok('昵称后缀是 4 位十六进制', /^微信用户[0-9a-f]{4}$/.test(snap.nickname), snap.nickname);

// ---------------- 4. 云端旧占位名不回流本地 ----------------
console.log('=== 合并 ===');
const acc2 = auth.wxAccountOf('oTEST_onlyplaceholder_0001');
auth.registerWx(acc2, {});
const m1 = sync.mergeInto(acc2, {
  nickname: '同学',
  learned: { topics: ['t1'], formulas: [], examples: [] },
  fav: { formulas: [], courses: [] },
  notes: {},
  wrong: [],
  quiz: { answered: 3, correct: 2 },
  visits: ['2026-10-29'],
});
ok('合并执行成功', m1 === true);
ok('占位名没被写进本地', store2.load(acc2).nickname === '', store2.load(acc2).nickname);
ok('合并后展示名仍是派生名', store2.displayName(acc2) === '微信用户' + acc2.slice(-4), store2.displayName(acc2));
ok('合并的数据本身没丢', store2.load(acc2).learned.topics.length === 1);
ok('合并后答题数正确', store2.load(acc2).quiz.answered === 3);

// 云端有真昵称 → 首次登录应继承
const acc3 = auth.wxAccountOf('oTEST_realnick_0002');
auth.registerWx(acc3, {});
sync.mergeInto(acc3, { nickname: '老王', learned: {}, fav: {}, notes: {}, wrong: [], quiz: {}, visits: [] });
ok('云端真昵称会被继承', store2.load(acc3).nickname === '老王', store2.load(acc3).nickname);
ok('继承后展示名就是它', store2.displayName(acc3) === '老王');

// 本地已有昵称 → 不被云端覆盖
store2.setNickname(acc3, '小明');
sync.mergeInto(acc3, { nickname: '老王', learned: {}, fav: {}, notes: {}, wrong: [], quiz: {}, visits: [] });
ok('本地昵称优先', store2.load(acc3).nickname === '小明', store2.load(acc3).nickname);

// --------- 5. 老存档（完全没有 nickname 字段） ---------
console.log('=== 老存档 ===');
const acc4 = 'olduser';
store['ssp_user_' + acc4] = { learned: { topics: ['t1'], formulas: [], examples: [] }, quiz: { answered: 1 } };
ok('老存档不抛异常', !!store2.displayName(acc4));
ok('老存档本机账号显示账号名', store2.displayName(acc4) === 'olduser', store2.displayName(acc4));
ok('老存档快照昵称非空', sync.snapshot(acc4).nickname === 'olduser');

// --------- 6. 我的页口径 ---------
console.log('=== 我的页 ===');
let cfg = null;
global.Page = (o) => { cfg = o; };
global.getApp = () => ({
  globalData: { theme: 'light', user: { account: acc } },
  account() { return acc; },
  afterLogin() {},
  afterLogout() {},
});
delete require.cache[require.resolve(ROOT + 'pages/me/me.js')];
require(ROOT + 'pages/me/me.js');
cfg.data = JSON.parse(JSON.stringify(cfg.data));
cfg.setData = function (o) { Object.keys(o).forEach((k) => { this.data[k] = o[k]; }); };
cfg.onLoad();
cfg.refresh();
ok('我的页显示派生名', cfg.data.nickname === '微信用户' + acc.slice(-4), cfg.data.nickname);
ok('我的页账号名仍是微信账号', cfg.data.account === '微信账号', cfg.data.account);
ok('我的页仍打微信标', cfg.data.isWx === true);

// --------- 7. 头像（chooseAvatar → 拷进用户目录 → 落盘） ---------
console.log('=== 头像 ===');
ok('默认无头像，头像位用主题贴纸', cfg.data.avatarSrc === '/assets/theme/' + cfg.data.sticker + '.jpg', cfg.data.avatarSrc);

cfg.openNick();
ok('弹层打开带上当前昵称', cfg.data.nOpen === true && cfg.data.nVal === cfg.data.nickname);

// chooseAvatar 成功路径：临时路径被拷进 USER_DATA_PATH
fsCalls = [];
fsFail = false;
cfg.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp/av1' } });
ok('头像被拷进用户目录', fsCalls.length === 1 && fsCalls[0].dest === '/usr/avatar.jpg', fsCalls);
ok('拷贝成功后展示持久路径', cfg.data.nAvatar === '/usr/avatar.jpg', cfg.data.nAvatar);

// chooseAvatar 失败路径：也要给用户看得见的预览（临时路径兜底）
fsCalls = [];
fsFail = true;
cfg.onChooseAvatar({ detail: { avatarUrl: 'wxfile://tmp/av2' } });
ok('拷贝失败仍展示临时路径', cfg.data.nAvatar === 'wxfile://tmp/av2', cfg.data.nAvatar);
fsFail = false;

// 保存：昵称 + 头像一起落盘，头像位换图
cfg.data.nVal = '头像哥';
cfg.data.nAvatar = '/usr/avatar.jpg';
cfg.saveNick();
ok('头像落盘', store2.getAvatar(acc) === '/usr/avatar.jpg', store2.getAvatar(acc));
ok('昵称与头像一并保存', store2.getNickname(acc) === '头像哥', store2.getNickname(acc));
ok('保存后档案头换上头像', cfg.data.avatarSrc === '/usr/avatar.jpg', cfg.data.avatarSrc);

// 云端合并：头像是本机文件路径，跨设备无效 → 不上快照、合并时保住本机值
const accAv = 'wx_av_merge_0001';
store2.setAvatar(accAv, '/usr/mine.jpg');
sync.mergeInto(accAv, { nickname: '云端名', avatar: '/cloud/av.jpg', learned: {}, fav: {}, notes: {}, wrong: [], quiz: {}, visits: [] });
ok('合并后本机头像不丢', store2.getAvatar(accAv) === '/usr/mine.jpg', store2.getAvatar(accAv));
ok('合并后昵称走本地优先', store2.getNickname(accAv) === '云端名', store2.getNickname(accAv));
const accAv2 = 'wx_av_merge_0002';
store2.setAvatar(accAv2, '/usr/mine2.jpg');
sync.mergeInto(accAv2, { learned: {}, fav: {}, notes: {}, wrong: [], quiz: {}, visits: [] });
ok('云端无头像时本机头像仍在', store2.getAvatar(accAv2) === '/usr/mine2.jpg', store2.getAvatar(accAv2));
ok('头像不进快照（本机路径跨设备无效）', sync.snapshot(accAv).avatar === undefined, sync.snapshot(accAv).avatar);

console.log('\n=== 结果 ===');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
