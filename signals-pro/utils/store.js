// 学习数据：按账号分别保存在本机存储
const GUEST = '__guest__';
const PREFIX = 'ssp_user_';
const MAX_RECORDS = 30;
const MAX_SEARCHES = 8;

function defaults() {
  return {
    learned: { topics: [], formulas: [], examples: [] },
    fav: { formulas: [], courses: [] },
    notes: {},
    records: [],
    searches: [],
    wrong: [],
    quiz: { answered: 0, correct: 0, exams: [] },
    // 1v1 擂台档案：段位分、战绩、连胜与最近对局
    pk: { rp: 0, wins: 0, losses: 0, streak: 0, best: 0, history: [] },
    visits: [],
    nickname: '',
    // 用户自选头像（chooseAvatar 拿到后拷进用户目录的持久路径），空 = 用主题贴纸
    avatar: '',
    theme: 'light',
  };
}

function key(acc) {
  return PREFIX + (acc || GUEST);
}

// 擂台档案纠偏：老存档没有 pk 字段，坏数据也不能让页面算出 NaN
function normPk(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const num = (v) => {
    const n = Math.round(Number(v) || 0);
    return n > 0 ? n : 0;
  };
  return {
    rp: Math.min(9999, num(p.rp)),
    wins: num(p.wins),
    losses: num(p.losses),
    streak: num(p.streak),
    best: num(p.best),
    history: Array.isArray(p.history) ? p.history.slice(0, 20) : [],
  };
}

function load(acc) {
  try {
    const raw = wx.getStorageSync(key(acc));
    if (!raw || typeof raw !== 'object') return defaults();
    const d = defaults();
    return {
      learned: Object.assign(d.learned, raw.learned || {}),
      fav: Object.assign(d.fav, raw.fav || {}),
      notes: raw.notes || {},
      records: Array.isArray(raw.records) ? raw.records : [],
      searches: Array.isArray(raw.searches) ? raw.searches : [],
      wrong: Array.isArray(raw.wrong) ? raw.wrong : [],
      quiz: Object.assign(d.quiz, raw.quiz || {}),
      pk: normPk(raw.pk),
      visits: Array.isArray(raw.visits) ? raw.visits : [],
      nickname: raw.nickname || '',
      avatar: raw.avatar || '',
      theme: raw.theme || 'light',
    };
  } catch (e) {
    return defaults();
  }
}

function save(acc, data) {
  try {
    wx.setStorageSync(key(acc), data);
    maybeSync(acc);
    return true;
  } catch (e) {
    return false;
  }
}

// 任何一次数据落盘后都顺手排一次云端同步（防抖 2s，云未开通时是空操作）
// 延迟 require：sync.js 依赖本模块，写在函数里可以避免循环依赖在加载期就报错
function maybeSync(acc) {
  try {
    const sync = require('./sync');
    if (sync && typeof sync.schedule === 'function') sync.schedule(acc);
  } catch (e) {}
}

function update(acc, fn) {
  const d = load(acc);
  const next = fn(d) || d;
  save(acc, next);
  return next;
}

function getTheme(acc) {
  return load(acc).theme || 'light';
}

function setTheme(acc, theme) {
  update(acc, (d) => {
    d.theme = theme;
    return d;
  });
}

function getNickname(acc) {
  return load(acc).nickname || '';
}

function setNickname(acc, name) {
  update(acc, (d) => {
    d.nickname = String(name || '').slice(0, 16);
    return d;
  });
}

function getAvatar(acc) {
  return load(acc).avatar || '';
}

function setAvatar(acc, path) {
  update(acc, (d) => {
    d.avatar = String(path || '').slice(0, 200);
    return d;
  });
}

// ---------- 展示名 ----------
// 没设昵称时按账号派生一个稳定默认名。不能留空：留空会被云函数兜底成统一的
// "同学"，排行榜上所有人重名，分不出谁是谁。派生规则必须纯函数，同一账号
// 在任何设备算出来一致，否则换机后云端名字会跳。
function autoName(acc) {
  const a = String(acc || '');
  if (!a || a === GUEST) return '同学';
  if (a.indexOf('wx_') === 0) return '微信用户' + a.slice(-4);
  return a;
}

// 云函数早期版本的统一兜底名，从云端读回来时要当空值，否则会被合并进本地
const PLACEHOLDER = ['同学'];

function isPlaceholder(v) {
  return !v || PLACEHOLDER.indexOf(String(v).trim()) >= 0;
}

function displayName(acc, data) {
  const n = String(((data || load(acc) || {}).nickname) || '').trim();
  if (n && !isPlaceholder(n)) return n;
  return autoName(acc);
}

// ---------- 已学标记 ----------
function isLearned(data, type, id) {
  const arr = (data.learned && data.learned[type]) || [];
  return arr.indexOf(id) >= 0;
}

function setLearned(acc, type, id, on) {
  return update(acc, (d) => {
    if (!d.learned[type]) d.learned[type] = [];
    const arr = d.learned[type];
    const i = arr.indexOf(id);
    if (on && i < 0) arr.push(id);
    if (!on && i >= 0) arr.splice(i, 1);
    return d;
  });
}

// ---------- 收藏 ----------
function toggleFavFormula(acc, id) {
  let added = false;
  update(acc, (d) => {
    const arr = d.fav.formulas;
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else {
      arr.unshift(id);
      added = true;
    }
    return d;
  });
  return added;
}

function toggleFavCourse(acc, id) {
  let added = false;
  update(acc, (d) => {
    const arr = d.fav.courses;
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else {
      arr.unshift(id);
      added = true;
    }
    return d;
  });
  return added;
}

// ---------- 笔记 ----------
function setNote(acc, topicId, text) {
  return update(acc, (d) => {
    const t = String(text || '').trim();
    if (t) d.notes[topicId] = t;
    else delete d.notes[topicId];
    return d;
  });
}

// ---------- 学习记录（最多 30 条，去重靠 type+id） ----------
function addRecord(acc, item) {
  const date = item.date || new Date().toISOString().slice(0, 10);
  return update(acc, (d) => {
    const id = item.type + ':' + item.id;
    d.records = d.records.filter((r) => r.type + ':' + r.id !== id);
    d.records.unshift({
      type: item.type,
      id: item.id,
      name: item.name,
      ch: item.ch,
      date,
      key: id,
    });
    if (d.records.length > MAX_RECORDS) d.records.length = MAX_RECORDS;
    return d;
  });
}

// ---------- 搜索历史（最多 8 条） ----------
function normTerm(t) {
  return String(t || '')
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, ' ')
    .trim();
}

function addSearch(acc, term) {
  const t = normTerm(term);
  if (!t) return;
  update(acc, (d) => {
    const lower = t.toLowerCase();
    d.searches = d.searches.filter((x) => x.toLowerCase() !== lower);
    d.searches.unshift(t);
    if (d.searches.length > MAX_SEARCHES) d.searches.length = MAX_SEARCHES;
    return d;
  });
}

function clearSearches(acc) {
  update(acc, (d) => {
    d.searches = [];
    return d;
  });
}

// ---------- 错题本 ----------
function addWrong(acc, qid) {
  update(acc, (d) => {
    if (d.wrong.indexOf(qid) < 0) d.wrong.unshift(qid);
    return d;
  });
}

function removeWrong(acc, qid) {
  update(acc, (d) => {
    d.wrong = d.wrong.filter((x) => x !== qid);
    return d;
  });
}

// ---------- 答题统计 ----------
function recordAnswer(acc, correct) {
  update(acc, (d) => {
    d.quiz.answered += 1;
    if (correct) d.quiz.correct += 1;
    return d;
  });
}

function recordExam(acc, exam) {
  update(acc, (d) => {
    d.quiz.exams.unshift(exam);
    if (d.quiz.exams.length > 20) d.quiz.exams.length = 20;
    return d;
  });
}

// ---------- 擂台战绩 ----------
// 结算后一次性写入：新的 RP、胜负、连胜与最近对局（只留 20 条）
function recordPk(acc, rec) {
  const r = rec || {};
  return update(acc, (d) => {
    const p = normPk(d.pk);
    p.rp = Math.min(9999, Math.max(0, Math.round(Number(r.rp) || 0)));
    if (r.win) {
      p.wins += 1;
      p.streak += 1;
      if (p.streak > p.best) p.best = p.streak;
    } else {
      p.losses += 1;
      p.streak = 0;
    }
    p.history.unshift({
      at: r.at || new Date().toISOString().slice(0, 16).replace('T', ' '),
      win: !!r.win,
      my: Math.round(Number(r.my) || 0),
      foe: Math.round(Number(r.foe) || 0),
      foeName: String(r.foeName || '对手').slice(0, 16),
      foeTier: String(r.foeTier || ''),
      delta: Math.round(Number(r.delta) || 0),
      room: String(r.room || ''),
      ko: !!r.ko,
    });
    if (p.history.length > 20) p.history.length = 20;
    d.pk = p;
    return d;
  });
}

// ---------- 学习天数 ----------
function markVisit(acc) {
  const today = new Date().toISOString().slice(0, 10);
  update(acc, (d) => {
    if (d.visits.indexOf(today) < 0) {
      d.visits.push(today);
      if (d.visits.length > 400) d.visits.shift();
    }
    return d;
  });
}

// ---------- 游客数据：计数与并入 ----------
// 去重保序。sync.js 里有一份同名的，但那边依赖本模块，反向 require 会成环，
// 所以这里各自留一份实现（两边语义必须一致）。
function uniq(a) {
  const seen = {};
  const out = [];
  (a || []).forEach((x) => {
    if (x == null) return;
    const k = String(x);
    if (seen[k]) return;
    seen[k] = 1;
    out.push(x);
  });
  return out;
}

// 统一口径：一个"项"= 用户主动产生的一条学习痕迹。登录页的提示数字、

// 「我的」页入口的提示数字都从这里取，避免两处对不上。
function guestCount(acc) {
  const d = load(acc === undefined ? GUEST : acc);
  return (
    d.learned.topics.length +
    d.learned.formulas.length +
    d.learned.examples.length +
    d.fav.formulas.length +
    d.fav.courses.length +
    d.wrong.length +
    Object.keys(d.notes || {}).length +
    (d.quiz.answered || 0) +
    (d.visits || []).length
  );
}

// 把游客档案并进目标账号。
// 合并规则刻意与 sync.mergeInto 完全一致（并集 + 取大），否则"迁移"和"同步"
// 会算出两种结果：同步后再迁移，数字会往回跳。
// 合并成功后清空游客档案，否则下次登录会再一次提示"还有 N 项"，越并越多。
function mergeGuestInto(acc) {
  const target = String(acc || '');
  if (!target || target === GUEST) return { ok: false, msg: '当前没有可并入的账号', count: 0 };
  const g = load(GUEST);
  const count = guestCount(GUEST);
  if (!count) return { ok: true, msg: '没有游客记录', count: 0 };

  const cur = load(target);
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  const d = defaults();
  d.learned = {
    topics: uniq(cur.learned.topics.concat(g.learned.topics)),
    formulas: uniq(cur.learned.formulas.concat(g.learned.formulas)),
    examples: uniq(cur.learned.examples.concat(g.learned.examples)),
  };
  d.fav = {
    formulas: uniq(cur.fav.formulas.concat(g.fav.formulas)),
    courses: uniq(cur.fav.courses.concat(g.fav.courses)),
  };
  // 同一道题两边都写过笔记时以当前账号为准，账号里没写过的才用游客的
  d.notes = Object.assign({}, g.notes || {}, cur.notes || {});
  // 记录按 type+id 去重（与 addRecord 同一口径），账号自己的排在前面
  const seen = {};
  d.records = (cur.records || [])
    .concat(g.records || [])
    .filter((r) => {
      if (!r) return false;
      const k = r.type + ':' + r.id;
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    })
    .slice(0, MAX_RECORDS);
  d.searches = uniq((cur.searches || []).concat(g.searches || [])).slice(0, MAX_SEARCHES);
  d.wrong = uniq((cur.wrong || []).concat(g.wrong || []));
  // 答题数取大不取和：同一道题游客答过、账号也答过，相加会算两遍
  d.quiz = {
    answered: Math.max(num(cur.quiz.answered), num(g.quiz.answered)),
    correct: Math.max(num(cur.quiz.correct), num(g.quiz.correct)),
    exams: (cur.quiz.exams || []).concat(g.quiz.exams || []).slice(0, 20),
  };
  const cp = cur.pk || {};
  const gp = g.pk || {};
  d.pk = {
    rp: Math.max(num(cp.rp), num(gp.rp)),
    wins: Math.max(num(cp.wins), num(gp.wins)),
    losses: Math.max(num(cp.losses), num(gp.losses)),
    // 连胜是"当前状态"，只认当前账号的
    streak: num(cp.streak),
    best: Math.max(num(cp.best), num(gp.best)),
    history: Array.isArray(cp.history) ? cp.history : [],
  };
  d.visits = uniq((cur.visits || []).concat(g.visits || [])).sort();
  d.nickname = cur.nickname || g.nickname || '';
  d.avatar = cur.avatar || g.avatar || '';
  d.theme = cur.theme || g.theme || 'light';
  save(target, d);

  // 游客档案清空，主题保留（否则明暗模式会跳一下）
  const blank = defaults();
  blank.theme = g.theme || 'light';
  save(GUEST, blank);
  return { ok: true, msg: '已并入 ' + count + ' 项游客记录', count: count };
}

// ---------- 导出 / 导入 / 清空 ----------
function exportAll(acc) {
  return {
    app: 'signals-systems-pro',
    version: 1,
    account: acc,
    exportedAt: new Date().toISOString(),
    data: load(acc),
  };
}

function importAll(acc, payload) {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    return { ok: false, msg: '备份内容无法识别' };
  }
  const src = payload.data;
  if (!src.learned && !src.fav && !src.notes) {
    return { ok: false, msg: '备份内容缺少学习数据' };
  }
  const cur = load(acc);
  const d = defaults();
  d.learned = Object.assign(d.learned, src.learned || {});
  d.fav = Object.assign(d.fav, src.fav || {});
  d.notes = src.notes || {};
  d.records = Array.isArray(src.records) ? src.records.slice(0, MAX_RECORDS) : [];
  d.searches = Array.isArray(src.searches) ? src.searches.slice(0, MAX_SEARCHES) : [];
  d.wrong = Array.isArray(src.wrong) ? src.wrong : [];
  d.quiz = Object.assign(d.quiz, src.quiz || {});
  d.pk = normPk(src.pk);
  d.visits = Array.isArray(src.visits) ? src.visits : [];
  d.nickname = src.nickname || cur.nickname;
  d.avatar = src.avatar || cur.avatar;
  d.theme = src.theme || cur.theme;
  save(acc, d);
  return { ok: true, msg: '已恢复学习数据' };
}

// 清空学习数据：保留本机账号本身
function clearStudy(acc) {
  const d = defaults();
  d.theme = load(acc).theme || 'light';
  save(acc, d);
  return d;
}

module.exports = {
  GUEST,
  defaults,
  load,
  save,
  update,
  getTheme,
  setTheme,
  getNickname,
  setNickname,
  getAvatar,
  setAvatar,
  autoName,
  isPlaceholder,
  displayName,
  isLearned,
  setLearned,
  toggleFavFormula,
  toggleFavCourse,
  setNote,
  addRecord,
  addSearch,
  clearSearches,
  normTerm,
  addWrong,
  removeWrong,
  recordAnswer,
  recordExam,
  recordPk,
  markVisit,
  exportAll,
  importAll,
  guestCount,
  mergeGuestInto,
  clearStudy,
};
