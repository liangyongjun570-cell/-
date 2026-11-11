// 云开发守卫层
//
// 设计原则：所有云能力都从这里出去，任何一步不满足就安静地降级到本地，
// 绝不让页面因为"没开云开发"而报错白屏。
//
// 判定链：
//   1) wx.cloud 存在且 wx.cloud.init 是函数
//   2) wx.cloud.init() 不抛异常
//   3) 云函数 mycloud 调用成功（拿到 result.ok）
// 任意一步失败 -> available = false，调用方走 wx.getStorageSync / 离线模拟数据。
//
// 注意 1) 2) 只能证明"本地有这套 API"，证明不了云端真的能用。
// 典型反例：用「测试号」appid 运行时，init() 照样不抛异常，但任何 callFunction
// 都会失败（errCode -601059 测试号不能使用云服务）。所以真正可靠的判定是
// probe()：打一次 login 云函数看是否真通。available() 只用于同步兜底渲染。

// 留空 = 使用开发者工具里绑定的默认云环境；有多个环境时填环境 ID，例如
// const ENV = 'signalspro-3g8kx2abc12345';
const ENV = '';

const FN = 'mycloud';

let _state = 'idle'; // idle | on | off
let _openid = '';
let _loginTried = false;
let _rankCache = null;
let _rankAt = 0;
// 具体失败原因，用来给用户看"人话"而不是一句失败
// '' | 'test' | 'no-env' | 'no-fn' | 'perm' | 'net'
let _reason = '';
let _probe = null; // 探活 Promise 缓存，避免多个页面同时打

// 把微信云的 errCode / errMsg 归类。各版本文案不一致，所以数字和关键字都匹配。
// 注意 -501000 是笼统的"调用失败"码，既可能是函数不存在也可能是环境不存在，
// 因此先按 errMsg 里的关键词细分，最后才用它兜底。
function classify(err) {
  const code = String((err && err.errCode) || '');
  const msg = String((err && (err.errMsg || err.message)) || '');
  const s = code + ' ' + msg;
  // 测试号：-601059 测试号不能使用云服务
  if (s.indexOf('601059') >= 0 || s.indexOf('测试号') >= 0) return 'test';
  // 环境不存在 / 未开通（优先于函数不存在，因为同一个码两种含义）
  if (s.indexOf('ENV_NOT_EXIST') >= 0 || s.indexOf('INVALID_ENV') >= 0) return 'no-env';
  if (s.indexOf('env') >= 0 && (s.indexOf('invalid') >= 0 || s.indexOf('not exist') >= 0 || s.indexOf('not found') >= 0)) {
    return 'no-env';
  }
  // 云函数不存在：FunctionName parameter could not be found
  if (s.indexOf('FunctionName') >= 0 || s.indexOf('FUNCTION_NOT_FOUND') >= 0 || s.indexOf('501000') >= 0) {
    return 'no-fn';
  }
  // 权限（非管理员、未授权）
  if (s.indexOf('PERMISSION') >= 0 || s.indexOf('permission') >= 0 || s.indexOf('没有权限') >= 0) return 'perm';
  return 'net';
}

// 失败原因的中文说明（不含结尾的"本机存储"，调用方自己拼）
function reasonText() {
  if (_reason === 'test') return '测试号不支持云开发';
  if (_reason === 'no-fn') return '云函数 mycloud 未部署';
  if (_reason === 'no-env') return '云开发环境未开通';
  if (_reason === 'perm') return '没有云开发权限';
  if (_reason === 'net') return '云服务连接失败';
  return '';
}

function available() {
  if (_state !== 'idle') return _state === 'on';
  _state = 'off';
  try {
    if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.init !== 'function') return false;
    const opt = { traceUser: false };
    if (ENV) opt.env = ENV;
    wx.cloud.init(opt);
    _state = 'on';
  } catch (e) {
    _state = 'off';
  }
  return _state === 'on';
}

// 统一云函数调用：action + payload，返回 { ok, data, msg }
function call(action, payload) {
  return new Promise((resolve) => {
    if (!available()) {
      resolve({ ok: false, reason: 'off' });
      return;
    }
    try {
      wx.cloud.callFunction({
        name: FN,
        data: Object.assign({ action: action }, payload || {}),
        success: (res) => {
          const r = (res && res.result) || {};
          if (r.ok) {
            if (r.openid) _openid = r.openid;
            resolve(r);
          } else {
            resolve({ ok: false, reason: r.msg || 'bad-result' });
          }
        },
        fail: (err) => {
          // 只有"硬失败"（测试号 / 环境未开 / 函数未部署 / 无权限）才把云能力整个关掉。
          // 网络抖动归到 net，不能永久降级：否则地铁里断一次网，回到有网环境后
          // 整个会话的同步都是死的，只能重启小程序才恢复。
          const kind = classify(err);
          if (!_reason) _reason = kind;
          if (kind !== 'net') _state = 'off';
          resolve({ ok: false, reason: 'call-fail', code: kind });
        },
      });
    } catch (e) {
      resolve({ ok: false, reason: 'call-throw' });
    }
  });
}

// 静默登录：拿 OPENID（云函数 mycloud 里 cloud.getWXContext()）
function login(force) {
  if (_openid) return Promise.resolve(_openid);
  if (_loginTried && !force) return Promise.resolve('');
  _loginTried = true;
  return call('login').then((r) => (r.ok ? _openid : ''));
}

// 真实探活：打一次 login，确认云端真能用（而不是"本地有 wx.cloud 对象"）
// 返回 Promise<boolean>；结果缓存，避免多个页面各打一次
function probe() {
  if (_openid) return Promise.resolve(true);
  if (_probe) return _probe;
  if (!available()) return Promise.resolve(false);
  _probe = call('login').then((r) => {
    if (r.ok) return true;
    _state = 'off';
    return false;
  });
  return _probe;
}

// 重新探测：登录页每次进入都调一次，刚部署完云函数不必重启小程序
function reset() {
  _state = 'idle';
  _loginTried = false;
  _openid = '';
  _rankCache = null;
  _rankAt = 0;
  _reason = '';
  _probe = null;
}

function openid() {
  return _openid;
}

// 拉取云端档案
function pull() {
  return login().then((id) => {
    if (!id) return null;
    return call('pull').then((r) => (r.ok ? r.data || null : null));
  });
}

// 推送档案（云端 upsert，服务端写 study_profiles）
function push(profile) {
  return login().then((id) => {
    if (!id) return false;
    return call('push', { profile: profile }).then((r) => !!r.ok);
  });
}

// 排行榜：前 100 名 + 我的名次
function rank(force) {
  const now = Date.now();
  if (!force && _rankCache && now - _rankAt < 30000) return Promise.resolve(_rankCache);
  return login().then((id) => {
    if (!id) return null;
    return call('rank').then((r) => {
      if (!r.ok) return null;
      const list = Array.isArray(r.list) ? r.list : [];
      list.forEach((it, i) => {
        it.rank = i + 1;
      });
      const box = { list: list, me: r.me || null };
      _rankCache = box;
      _rankAt = now;
      return box;
    });
  });
}

// ---------- 本地示例榜单（云不可用时的兜底，纯离线模拟数据） ----------
const MOCK_RANK = [
  { nickname: '傅里叶本叶', score: 5240, answered: 30, correct: 27, streak: 9, chDone: 8, avatar: 'wave', rate: 90 },
  { nickname: '卷积之王', score: 4980, answered: 30, correct: 25, streak: 14, chDone: 8, avatar: 'love', rate: 83 },
  { nickname: '拉氏变换怪', score: 4650, answered: 29, correct: 24, streak: 6, chDone: 8, avatar: 'cheer', rate: 83 },
  { nickname: 'Sa 函数推手', score: 4410, answered: 28, correct: 22, streak: 4, chDone: 7, avatar: 'sleepy', rate: 79 },
  { nickname: '采样不混叠', score: 4120, answered: 27, correct: 21, streak: 3, chDone: 7, avatar: 'surprise', rate: 78 },
  { nickname: '零极点稳了', score: 3980, answered: 26, correct: 20, streak: 5, chDone: 7, avatar: 'wave', rate: 77 },
  { nickname: '冲激响应侠', score: 3560, answered: 24, correct: 18, streak: 2, chDone: 6, avatar: 'confused', rate: 75 },
  { nickname: '欧拉最帅', score: 3210, answered: 22, correct: 16, streak: 3, chDone: 6, avatar: 'love', rate: 73 },
  { nickname: '时频双重奏', score: 2870, answered: 19, correct: 14, streak: 1, chDone: 5, avatar: 'sleepy', rate: 74 },
  { nickname: '系统函数手', score: 2540, answered: 17, correct: 12, streak: 2, chDone: 5, avatar: 'wave', rate: 71 },
];

// 分数：把本地学习数据折算成一个可比的整数分，便于和榜单同台
function scoreOf(snap) {
  const s = snap || {};
  const q = s.quiz || {};
  // 云函数存的文档把答题数拍平在顶层，快照传的是嵌套的 quiz，两种都认
  const answered = q.answered || s.answered || 0;
  const correct = q.correct || s.correct || 0;
  const chDone = s.chDone || 0;
  const topics = (s.learned && s.learned.topics ? s.learned.topics.length : 0) || 0;
  const formulas = (s.learned && s.learned.formulas ? s.learned.formulas.length : 0) || 0;
  const notes = s.notes ? Object.keys(s.notes).length : 0;
  const days = (s.visits || []).length;
  return Math.round(
    answered * 8 + correct * 12 + chDone * 180 + topics * 30 + formulas * 20 + notes * 10 + days * 25
  );
}

// 本地兜底榜单：示例数据 + 我自己，按分数排序后回填名次
function localRank(me) {
  const rows = MOCK_RANK.map((r) => Object.assign({}, r));
  // 名次卡永远要有内容，哪怕今天还没开始刷题（score = 0）
  if (me) rows.push(Object.assign({}, me, { self: true }));
  rows.sort((a, b) => (b.score || 0) - (a.score || 0));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  const self = rows.filter((r) => r.self)[0] || null;
  return { list: rows.slice(0, 10), me: self, mock: true };
}

function statusText() {
  if (available()) return '云同步已连接';
  const r = reasonText();
  return r ? r + ' · 本机存储' : '未开通云开发 · 本机存储';
}

module.exports = {
  ENV,
  available,
  probe,
  reason: () => _reason,
  reasonText,
  reset,
  call,
  login,
  openid,
  pull,
  push,
  rank,
  scoreOf,
  localRank,
  statusText,
  MOCK_RANK,
};
