// 学习档案同步层
//
// 本地永远是 source of truth 的一份完整副本；云端只做"跨设备镜像"。
// 未开通云开发时所有函数都返回 { ok:false, off:true }，页面据此显示本地状态。
//
// 同步内容：已学专题/公式/例题、收藏、随堂笔记、错题本、答题统计、学习天数、
//          章节完成数、AI 助教会话（最近 10 个会话、每会话最近 30 条）。

const cloud = require('./cloud');
const store = require('./store');
const chat = require('./chat');
const D = require('../data/index');

const MAX_CHATS = 10;
const MAX_CHAT_MSGS = 30;
const PUSH_GAP = 2000; // 两次推送最小间隔，避免连续操作打爆云函数

let _timer = null;
let _busy = false;
let _dirty = false;
let _lastAt = 0;
let _lastOk = false;

// ---------- 快照 ----------
function snapshot(acc) {
  const d = store.load(acc);
  const box = chat.load(acc);
  const ov = D.overall(d.learned);
  // 空会话（点开过但一句没聊）不上传：纯噪音，还会挤掉真正有用的会话名额
  const chats = box.sessions
    .filter((s) => (s.msgs || []).length)
    .slice(0, MAX_CHATS)
    .map((s) => ({
      id: s.id,
      title: s.title || '新对话',
      ts: s.ts || 0,
      msgs: (s.msgs || []).slice(-MAX_CHAT_MSGS).map((m) => ({
        role: m.role,
        text: String(m.text || '').slice(0, 600),
        ts: m.ts || 0,
      })),
    }));

  const snap = {
    learned: d.learned,
    fav: d.fav,
    notes: d.notes,
    wrong: d.wrong,
    quiz: { answered: d.quiz.answered || 0, correct: d.quiz.correct || 0 },
    // 段位随账号走：换设备后 rp 归零会让人以为"段位丢了"，history 太大不上传
    pk: {
      rp: (d.pk || {}).rp || 0,
      wins: (d.pk || {}).wins || 0,
      losses: (d.pk || {}).losses || 0,
      streak: (d.pk || {}).streak || 0,
      best: (d.pk || {}).best || 0,
    },
    visits: d.visits,
    // 昵称必须落成具体名字：留空会被云函数兜底成 "同学"，排行榜全员重名
    nickname: store.displayName(acc, d),
    chDone: ov.chaptersDone,
    percent: ov.percent,
    chats: chats,
  };
  snap.score = cloud.scoreOf(snap);
  return snap;
}

// ---------- 合并（云端 -> 本地，取并集，本地优先） ----------
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

function mergeInto(acc, remote) {
  if (!remote || typeof remote !== 'object') return false;
  const local = store.load(acc);
  const rl = remote.learned || {};
  const rf = remote.fav || {};
  // 云函数 sanitize() 把 quiz 拍平成顶层的 answered / correct，而本地快照发的是
  // 嵌套结构。两种都要认，否则从真实云端文档合并回来答题数永远是 0。
  const rq = remote.quiz && typeof remote.quiz === 'object' ? remote.quiz : {};
  const cnt = (v) => Math.max(0, Math.round(Number(v) || 0));
  const rAnswered = Math.max(cnt(rq.answered), cnt(remote.answered));
  const rCorrect = Math.max(cnt(rq.correct), cnt(remote.correct));
  const rp = remote.pk && typeof remote.pk === 'object' ? remote.pk : {};
  const lp = local.pk || {};

  const next = store.defaults();
  next.learned = {
    topics: uniq((local.learned.topics || []).concat(rl.topics || [])),
    formulas: uniq((local.learned.formulas || []).concat(rl.formulas || [])),
    examples: uniq((local.learned.examples || []).concat(rl.examples || [])),
  };
  next.fav = {
    formulas: uniq((local.fav.formulas || []).concat(rf.formulas || [])),
    courses: uniq((local.fav.courses || []).concat(rf.courses || [])),
  };
  next.notes = Object.assign({}, remote.notes || {}, local.notes || {});
  next.wrong = uniq((local.wrong || []).concat(remote.wrong || []));
  next.quiz = {
    answered: Math.max(local.quiz.answered || 0, rAnswered),
    correct: Math.max(local.quiz.correct || 0, rCorrect),
    exams: local.quiz.exams || [],
  };
  // 段位取两边较大值：rp 只增不减（掉段保护也只掉到段位下限），
  // 连胜属于"当前状态"，用本机的，避免把别的设备的连胜算到自己头上
  next.pk = {
    rp: Math.max(lp.rp || 0, cnt(rp.rp)),
    wins: Math.max(lp.wins || 0, cnt(rp.wins)),
    losses: Math.max(lp.losses || 0, cnt(rp.losses)),
    streak: lp.streak || 0,
    best: Math.max(lp.best || 0, cnt(rp.best)),
    history: Array.isArray(lp.history) ? lp.history : [],
  };
  next.visits = uniq((local.visits || []).concat(remote.visits || []));
  next.records = local.records;
  next.searches = local.searches;
  // 云端那个统一兜底名不能合并回本地，否则本机也被钉死成 "同学"
  const rn = store.isPlaceholder(remote.nickname) ? '' : String(remote.nickname).slice(0, 16);
  next.nickname = local.nickname || rn;
  // 头像是本机 USER_DATA_PATH 里的文件，路径跨设备无效，不进快照、合并时保住本机值
  next.avatar = local.avatar || '';
  next.theme = local.theme || 'light';

  store.save(acc, next);
  return true;
}

// 云端会话只在本地完全没有对话时导入，避免覆盖本机正在用的会话
function mergeChats(acc, remoteChats) {
  if (!Array.isArray(remoteChats) || !remoteChats.length) return false;
  const box = chat.load(acc);
  const hasLocal = box.sessions.some((s) => (s.msgs || []).length > 0);
  if (hasLocal) return false;
  const sessions = remoteChats
    .filter((s) => s && s.id && Array.isArray(s.msgs) && s.msgs.length)
    .map((s) => ({
      id: 'r' + s.id,
      title: s.title || '新对话',
      ts: s.ts || Date.now(),
      msgs: s.msgs.map((m, i) => ({
        id: 'rm' + i,
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.text || '',
        ts: m.ts || Date.now(),
      })),
    }));
  if (!sessions.length) return false;
  chat.save(acc, { sessions: sessions, currentId: sessions[0].id });
  return true;
}

// ---------- 推送 ----------
// 游客档案永远不推云。云端文档按 openid 索引、不带账号维度，游客态推一次就会
// 把该微信账号的档案覆盖成游客那点数据，之后登录反而"越同步越少"。
// 游客数据只留在本机，切换到账号时由 store.mergeGuestInto 显式并入。
function isGuest(acc) {
  return !acc || acc === store.GUEST;
}

function pushNow(acc) {
  if (isGuest(acc)) return Promise.resolve({ ok: false, off: true });
  if (!cloud.available()) return Promise.resolve({ ok: false, off: true });
  if (_busy) {
    _dirty = true;
    return Promise.resolve({ ok: false, busy: true });
  }
  _busy = true;
  _dirty = false;
  let task;
  try {
    task = cloud.push(snapshot(acc));
  } catch (e) {
    // 快照或调用同步抛异常：必须把锁放开，否则 _busy 会永久卡住、同步彻底死掉
    _busy = false;
    return Promise.resolve({ ok: false, err: 'push-throw' });
  }
  return task
    .then(
      (ok) => ok,
      () => false // reject 也当成一次失败，绝不让 _busy 挂在 true 上
    )
    .then((ok) => {
      _busy = false;
      _lastAt = Date.now();
      _lastOk = !!ok;
      // 有排队的变更就立刻补推，不走 2s 防抖：
      // 清空数据 / 退出登录这类操作要求云端"马上"跟着变，晚 2s 就可能被用户杀进程
      if (_dirty) {
        _dirty = false;
        pushNow(acc);
      }
      return { ok: !!ok, at: _lastAt };
    });
}

// 防抖推送：页面里任何一次数据变更都可以直接调用，不必等结果
function schedule(acc, delay) {
  if (isGuest(acc)) return;
  if (!cloud.available()) return;
  if (_timer) clearTimeout(_timer);
  const gap = Math.max(delay || 0, PUSH_GAP - (Date.now() - _lastAt));
  _timer = setTimeout(() => {
    _timer = null;
    pushNow(acc);
  }, Math.max(300, gap));
}

// ---------- 全量同步：先拉后合并，再推 ----------
function syncAll(acc) {
  if (isGuest(acc)) return Promise.resolve({ ok: false, off: true, guest: true });
  if (!cloud.available()) return Promise.resolve({ ok: false, off: true });
  return cloud.pull().then((remote) => {
    let merged = false;
    if (remote) {
      merged = mergeInto(acc, remote);
      mergeChats(acc, remote.chats);
    }
    return pushNow(acc).then((r) => ({ ok: r.ok, merged: merged, remote: !!remote }));
  });
}

function lastSync() {
  return { at: _lastAt, ok: _lastOk };
}

module.exports = {
  snapshot,
  mergeInto,
  mergeChats,
  pushNow,
  schedule,
  syncAll,
  lastSync,
};
