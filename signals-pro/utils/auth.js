// 本机账号系统：仅存储于当前设备，不接入微信授权或服务端
//
// 设计取舍：
//   1. 没有服务端，密码只做轻量散列（防肩窥/防明文存储，不承诺抗暴破）。
//   2. 没有服务端就"发不了验证码"，所以找回密码只能走注册时自选的密保问题；
//      没设密保的老账号，如实告知无法找回，不假装能重置。
//   3. 会话支持"记住我"：勾选 30 天，不勾选 24 小时；每次启动滑动续期。

const ACCOUNTS_KEY = 'ssp_accounts';
const SESSION_KEY = 'ssp_session';
const LAST_KEY = 'ssp_last_account';

const TTL_REMEMBER = 30 * 24 * 3600 * 1000;
const TTL_SESSION = 24 * 3600 * 1000;

// 固定密保题库：避免用户自己写问题写得太随意（"我是谁"）
const SECURITY_QUESTIONS = [
  '我的小学班主任姓什么',
  '我最喜欢的一门课',
  '我第一次上网所在的城市',
  '我给自己起的第一个网名',
  '我最想去的城市',
];

function normAccount(a) {
  return String(a == null ? '' : a).trim().toLowerCase();
}

function normAnswer(a) {
  return String(a == null ? '' : a).trim().toLowerCase().replace(/\s+/g, '');
}

function validateAccount(a) {
  return /^[a-z0-9_]{4,20}$/.test(normAccount(a));
}

// 8–32 位，必须同时含字母与数字，不允许空格
function validatePwd(p) {
  if (typeof p !== 'string') return false;
  if (p.length < 8 || p.length > 32) return false;
  if (/\s/.test(p)) return false;
  if (!/[a-zA-Z]/.test(p)) return false;
  if (!/[0-9]/.test(p)) return false;
  return true;
}

// 本机演示用轻量散列（非加密承诺）
function hash(s) {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 16777619) >>> 0;
    h2 = (h2 + c * (i + 7) + ((h2 << 5) >>> 0)) >>> 0;
  }
  return h1.toString(16) + h2.toString(16) + s.length.toString(16);
}

function readAccounts() {
  try {
    const v = wx.getStorageSync(ACCOUNTS_KEY);
    return v && typeof v === 'object' ? v : {};
  } catch (e) {
    return {};
  }
}

function saveAccounts(map) {
  try {
    wx.setStorageSync(ACCOUNTS_KEY, map);
    return true;
  } catch (e) {
    return false;
  }
}

function userOf(acc, rec) {
  return {
    account: acc,
    joined: (rec && rec.created) || Date.now(),
    hasSq: !!(rec && rec.sa),
    wx: !!(rec && rec.wx),
    nickname: (rec && rec.nickname) || '',
  };
}

// ---------- 微信身份 ----------
// 小程序不允许静默拿昵称头像，但可以静默拿到 OPENID（云函数 getWXContext）。
// 这里不把 openid 明文落到 storage：用哈希派生一个稳定的本机账号 id，
// 换设备只要还是同一个微信号 + 同一个云环境，算出来的 id 就一样。
function wxAccountOf(openid) {
  const id = String(openid == null ? '' : openid);
  if (!id) return '';
  return 'wx_' + hash(id).slice(0, 12);
}

function registerWx(account, opt) {
  const acc = String(account == null ? '' : account);
  if (!acc) return { ok: false, msg: '微信身份无效，请重试' };
  const map = readAccounts();
  if (map[acc]) {
    map[acc].lastAt = Date.now();
    saveAccounts(map);
    return { ok: true, msg: '已存在', account: acc, fresh: false };
  }
  map[acc] = {
    wx: true,
    created: Date.now(),
    lastAt: Date.now(),
    nickname: (opt && opt.nickname) || '',
  };
  if (!saveAccounts(map)) {
    return { ok: false, msg: '本机存储失败，请稍后重试' };
  }
  return { ok: true, msg: '已创建微信账号', account: acc, fresh: true };
}

// 微信账号没有密码，登录只认 openid 派生出的 account
function loginWx(account, opt) {
  const acc = String(account == null ? '' : account);
  const map = readAccounts();
  const rec = map[acc];
  if (!rec || !rec.wx) return { ok: false, msg: '微信账号不存在，请重试' };
  const o = opt || {};
  const remember = o.remember !== false;
  try {
    wx.setStorageSync(SESSION_KEY, { account: acc, at: Date.now(), remember, wx: true });
    wx.setStorageSync(LAST_KEY, acc);
  } catch (e) {
    return { ok: false, msg: '本机存储失败，请稍后重试' };
  }
  return { ok: true, msg: '登录成功', user: userOf(acc, rec) };
}

function isWx(account) {
  const rec = readAccounts()[normAccount(account)];
  return !!(rec && rec.wx);
}

// 给微信账号补一个昵称（排行榜 / 战报要用）
function setWxNickname(account, nickname) {
  const acc = normAccount(account);
  const map = readAccounts();
  if (!map[acc] || !map[acc].wx) return false;
  map[acc].nickname = String(nickname || '').slice(0, 16);
  return saveAccounts(map);
}

// 账密注册；opt 里带上密保即可一并写入（二者都为空则视为不设密保）
function register(account, pwd, confirm, opt) {
  const acc = normAccount(account);
  if (!validateAccount(acc)) {
    return { ok: false, msg: '账号需为 4–20 位字母、数字或下划线' };
  }
  if (!validatePwd(pwd)) {
    return { ok: false, msg: '密码需 8–32 位，同时包含字母和数字，且不含空格' };
  }
  if (confirm !== undefined && confirm !== null && pwd !== confirm) {
    return { ok: false, msg: '两次输入的密码不一致' };
  }
  const map = readAccounts();
  if (map[acc]) {
    return { ok: false, msg: '该账号已在本机注册，请直接登录' };
  }
  const rec = { pwd: hash(pwd), created: Date.now() };
  const q = opt || {};
  const ans = normAnswer(q.sa);
  if (ans) {
    const idx = Number(q.sq);
    rec.sq = isFinite(idx) && idx >= 0 && idx < SECURITY_QUESTIONS.length ? idx : 0;
    rec.sa = hash(ans);
  }
  map[acc] = rec;
  if (!saveAccounts(map)) {
    return { ok: false, msg: '本机存储失败，请稍后重试' };
  }
  return { ok: true, msg: '注册成功', account: acc };
}

// opt.remember 默认 true；false 时会话只在 24 小时内有效
function login(account, pwd, opt) {
  const acc = normAccount(account);
  if (!acc) return { ok: false, msg: '请输入账号' };
  if (!pwd) return { ok: false, msg: '请输入密码' };
  const map = readAccounts();
  const rec = map[acc];
  if (!rec) return { ok: false, msg: '账号或密码不正确，请重试' };
  if (rec.wx) return { ok: false, msg: '这是微信登录账号，不需要密码，请点「微信一键登录」' };
  if (rec.pwd !== hash(pwd)) return { ok: false, msg: '账号或密码不正确，请重试' };
  const o = opt || {};
  const remember = o.remember !== false;
  try {
    wx.setStorageSync(SESSION_KEY, { account: acc, at: Date.now(), remember });
    wx.setStorageSync(LAST_KEY, acc);
  } catch (e) {
    return { ok: false, msg: '本机存储失败，请稍后重试' };
  }
  return { ok: true, msg: '登录成功', user: userOf(acc, rec) };
}

function restoreSession() {
  try {
    const s = wx.getStorageSync(SESSION_KEY);
    if (!s || !s.account || !s.at) return null;
    const remember = s.remember !== false;
    const ttl = remember ? TTL_REMEMBER : TTL_SESSION;
    if (Date.now() - s.at > ttl) {
      wx.removeStorageSync(SESSION_KEY);
      return null;
    }
    const map = readAccounts();
    const rec = map[s.account];
    if (!rec) {
      wx.removeStorageSync(SESSION_KEY);
      return null;
    }
    // 滑动续期：只要还在用，会话就不会无故过期
    try {
      wx.setStorageSync(SESSION_KEY, { account: s.account, at: Date.now(), remember });
    } catch (e) {}
    return userOf(s.account, rec);
  } catch (e) {
    return null;
  }
}

// 退出登录：清会话，但保留"上次账号"，方便下次自动回填
function logout() {
  try {
    wx.removeStorageSync(SESSION_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- 上次登录账号 ----------
function lastAccount() {
  try {
    const acc = normAccount(wx.getStorageSync(LAST_KEY));
    if (!acc) return '';
    const map = readAccounts();
    return map[acc] ? acc : '';
  } catch (e) {
    return '';
  }
}

function clearLast() {
  try {
    wx.removeStorageSync(LAST_KEY);
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- 账号查询 ----------
function listAccounts() {
  const map = readAccounts();
  return Object.keys(map)
    .map((acc) => ({
      account: acc,
      created: map[acc].created || 0,
      hasSq: !!map[acc].sa,
      wx: !!map[acc].wx,
    }))
    .sort((a, b) => b.created - a.created);
}

function exists(account) {
  const acc = normAccount(account);
  return !!readAccounts()[acc];
}

// 找回密码第一步：这个账号在本机是否存在、有没有密保
function securityOf(account) {
  const acc = normAccount(account);
  const rec = readAccounts()[acc];
  if (!rec) return { exists: false, hasSq: false, sq: -1, sqText: '', wx: false };
  const idx = typeof rec.sq === 'number' ? rec.sq : -1;
  return {
    exists: true,
    hasSq: !!rec.sa,
    sq: idx,
    sqText: rec.sa ? SECURITY_QUESTIONS[idx] || SECURITY_QUESTIONS[0] : '',
    wx: !!rec.wx,
  };
}

// 凭密保答案重置密码
function resetPwd(account, answer, pwd, confirm) {
  const acc = normAccount(account);
  const map = readAccounts();
  const rec = map[acc];
  if (!rec) return { ok: false, msg: '该账号不存在' };
  if (rec.wx) return { ok: false, msg: '微信账号不需要密码，直接点「微信一键登录」即可' };
  if (!rec.sa) return { ok: false, msg: '该账号注册时没有设置密保问题，本机无法找回密码' };
  if (!normAnswer(answer)) return { ok: false, msg: '请输入密保答案' };
  if (hash(normAnswer(answer)) !== rec.sa) return { ok: false, msg: '密保答案不正确' };
  if (!validatePwd(pwd)) return { ok: false, msg: '密码需 8–32 位，同时包含字母和数字，且不含空格' };
  if (confirm !== undefined && confirm !== null && pwd !== confirm) {
    return { ok: false, msg: '两次输入的密码不一致' };
  }
  rec.pwd = hash(pwd);
  rec.resetAt = Date.now();
  if (!saveAccounts(map)) return { ok: false, msg: '本机存储失败，请稍后重试' };
  return { ok: true, msg: '密码已重置，请用新密码登录' };
}

// 登录后补设密保（需校验旧密码）
function setSecurity(account, pwd, sq, answer) {
  const acc = normAccount(account);
  const map = readAccounts();
  const rec = map[acc];
  if (!rec) return { ok: false, msg: '该账号不存在' };
  if (rec.wx) return { ok: false, msg: '微信账号不需要密码，也无需密保' };
  if (rec.pwd !== hash(String(pwd || ''))) return { ok: false, msg: '当前密码不正确' };
  const ans = normAnswer(answer);
  if (!ans) return { ok: false, msg: '请填写密保答案' };
  const idx = Number(sq);
  rec.sq = isFinite(idx) && idx >= 0 && idx < SECURITY_QUESTIONS.length ? idx : 0;
  rec.sa = hash(ans);
  if (!saveAccounts(map)) return { ok: false, msg: '本机存储失败，请稍后重试' };
  return { ok: true, msg: '密保已设置' };
}

module.exports = {
  SECURITY_QUESTIONS,
  normAccount,
  normAnswer,
  validateAccount,
  validatePwd,
  register,
  login,
  restoreSession,
  logout,
  lastAccount,
  clearLast,
  listAccounts,
  exists,
  securityOf,
  resetPwd,
  setSecurity,
  // 微信身份
  wxAccountOf,
  registerWx,
  loginWx,
  isWx,
  setWxNickname,
};
