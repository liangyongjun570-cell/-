// 1v1 信号擂台：段位、伪随机、AI 陪练行为模型、计分与 RP 结算
//
// 设计要点：
// 1) 全离线可用。对局只依赖本地题库 + 确定性 PRNG，云没开通也能完整打完一局。
// 2) 同一房间码 = 同一 seed = 同一套题 + 同一个"影子对手"。好友点开邀请卡片，
//    拿到的是完全一致的对局，两边分数才可比（这是没有实时通道时最诚实的做法）。
// 3) AI 不是"随机错几题"，而是按难度、分差、自己段位调正确率与答题耗时，
//    该抢时会抢，该犹豫时会犹豫，读起来像真的在和你对答。

const D = require('../data/index');

const LIMIT_MS = 10000; // 每题 10 秒
const N_Q = 5; // 每局 5 题
const HP_MAX = 100;

// ---------- 段位 ----------
// 名字必须带上信号与系统的"形状"：阶跃、斜坡、正弦、傅里叶、拉普拉斯、冲激
const TIERS = [
  { i: 0, name: '青铜 · 阶跃', short: '青铜阶跃', sub: '阶跃', icon: '🥉', color: '#B08D57', min: 0, max: 200 },
  { i: 1, name: '白银 · 斜坡', short: '白银斜坡', sub: '斜坡', icon: '🥈', color: '#9AA5B1', min: 200, max: 500 },
  { i: 2, name: '黄金 · 正弦', short: '黄金正弦', sub: '正弦', icon: '🥇', color: '#E0A81E', min: 500, max: 900 },
  { i: 3, name: '铂金 · 傅里叶', short: '铂金傅里叶', sub: '傅里叶', icon: '💎', color: '#4FB3A9', min: 900, max: 1400 },
  { i: 4, name: '钻石 · 拉普拉斯', short: '钻石拉普拉斯', sub: '拉普拉斯', icon: '👑', color: '#5B8DEF', min: 1400, max: 2000 },
  { i: 5, name: '最强 · 冲激王者', short: '冲激王者', sub: 'δ(t)', icon: '⚡', color: '#E8563F', min: 2000, max: 9999 },
];

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function tierOf(rp) {
  const v = Math.max(0, Math.round(Number(rp) || 0));
  let t = TIERS[0];
  for (let i = 0; i < TIERS.length; i++) {
    if (v >= TIERS[i].min) t = TIERS[i];
  }
  const span = Math.max(1, t.max - t.min);
  return {
    i: t.i,
    name: t.name,
    short: t.short,
    sub: t.sub,
    icon: t.icon,
    color: t.color,
    min: t.min,
    max: t.max,
    rp: v,
    progress: t.i >= TIERS.length - 1 ? 1 : clamp((v - t.min) / span, 0, 1),
    toNext: t.i >= TIERS.length - 1 ? 0 : Math.max(0, t.max - v),
    nextName: t.i >= TIERS.length - 1 ? '已是顶点' : TIERS[t.i + 1].name,
  };
}

// ---------- 确定性伪随机（mulberry32） ----------
function mulberry32(a) {
  let s = (a | 0) || 1;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  const str = String(s || '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 6 位房间码：不用 0/O/1/I，念起来不打结
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRoom() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
  return s;
}

function validRoom(r) {
  const s = String(r || '').toUpperCase();
  if (s.length !== 6) return '';
  for (let i = 0; i < 6; i++) if (ROOM_CHARS.indexOf(s.charAt(i)) < 0) return '';
  return s;
}

// ---------- 抽题 ----------
// 5 题按 2 基础 + 2 核心 + 1 综合配比；某一档不够就从剩下的补，保证永远出满 5 题
function pickQuestions(rng, n) {
  const want = n || N_Q;
  const buckets = {
    基础概念: [],
    期末考研核心: [],
    工程综合: [],
  };
  const rest = [];
  D.questions.forEach((q) => {
    if (buckets[q.difficulty]) buckets[q.difficulty].push(q);
    else rest.push(q);
  });

  function take(list, k) {
    const out = [];
    const pool = list.slice();
    while (out.length < k && pool.length) {
      const i = Math.floor(rng() * pool.length);
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  const plan = [
    [buckets['基础概念'], 2],
    [buckets['期末考研核心'], 2],
    [buckets['工程综合'], 1],
  ];
  let picked = [];
  plan.forEach((p) => {
    picked = picked.concat(take(p[0], p[1]));
  });
  if (picked.length < want) {
    const used = {};
    picked.forEach((q) => {
      used[q.id] = true;
    });
    const left = D.questions.filter((q) => !used[q.id]).concat(rest);
    picked = picked.concat(take(left, want - picked.length));
  }
  // 打散顺序：否则永远是"基础、基础、核心、核心、综合"，玩家第三局就摸清套路
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = picked[i];
    picked[i] = picked[j];
    picked[j] = t;
  }
  return picked.slice(0, want);
}

// ---------- AI 对手 ----------
const NAMES = [
  '傅里叶本叶',
  '卷积之王',
  '拉氏变换怪',
  'Sa 函数推手',
  '采样不混叠',
  '零极点稳了',
  '冲激响应侠',
  '欧拉最帅',
  '时频双重奏',
  '系统函数手',
  '帕塞瓦尔信徒',
  '奈奎斯特的门徒',
  '吉布斯振铃',
  '因果系统',
  '稳定判据',
  '全通滤波器',
  '带宽守恒',
  '频域搬移工',
];

const AVATARS = ['wave', 'love', 'cheer', 'sleepy', 'surprise', 'confused'];

const TAUNTS = [
  '这题我做过',
  '太熟了，直接秒',
  '先抢一分',
  '这题有坑，但我记得',
  '稳',
  '手比脑子快',
];
const MISS = ['啊，差一点', '手滑了', '选项看混了', '这题真忘了', '再想想'];

// 按实力生成对手：rp 越接近自己越有来有回，偶尔遇到碾压局或送分局
function makeRival(seed, myRp) {
  const rng = mulberry32(seed);
  const base = Math.max(0, Number(myRp) || 0);
  const swing = rng() < 0.18 ? (rng() < 0.5 ? -340 : 340) : 0; // 少数局面实力差距明显
  const rp = Math.round(clamp(base + (rng() - 0.5) * 420 + swing, 0, 3200));
  const t = tierOf(rp);

  // 正确率与反应速度随段位上升；再叠一点个体差异（有人准但慢，有人快但毛躁）
  const steady = 0.5 + rng() * 0.5; // 稳定性个体差
  const speed = 0.5 + rng() * 0.5; // 手速个体差
  const accuracy = clamp(0.5 + t.i * 0.062 + steady * 0.16, 0.4, 0.88);
  const meanSec = clamp(6.8 - t.i * 0.72 - speed * 1.5, 2.6, 7.4);

  return {
    name: NAMES[Math.floor(rng() * NAMES.length)],
    avatar: AVATARS[Math.floor(rng() * AVATARS.length)],
    rp: rp,
    tier: t,
    params: {
      accuracy: accuracy,
      meanSec: meanSec,
      steady: steady,
      speed: speed,
    },
  };
}

// 每题给 AI 排一次作答计划：答不答对、用多久、连对累计到几
// lead：我的分数 - 对手分数（AI 落后会紧张提速，领先会松一点，让局面别一边倒）
function planAnswer(rng, q, params, lead) {
  const diff = q.difficulty;
  const penalty = diff === '工程综合' ? 0.2 : diff === '期末考研核心' ? 0.08 : 0;
  // 落后 200 分时 +0.06 命中率、-0.8s；领先 200 分时反过来
  const tilt = clamp(-lead / 3200, -0.09, 0.09);
  const p = clamp(params.accuracy - penalty + tilt, 0.12, 0.97);
  const ok = rng() < p;

  let sec;
  if (ok) {
    // 答对：命中率高的人手更快，但总留一点反应时间
    sec = params.meanSec * (0.5 + rng() * 0.72) * (1 - tilt * 1.4);
  } else {
    // 答错：通常是在两个选项之间纠结到了后面，但别让他每题都拖到超时
    sec = params.meanSec * (1.05 + rng() * 0.85);
  }
  sec = clamp(sec, 1.2, 9.2);

  return {
    ok: ok,
    at: Math.round(sec * 10) / 10,
    // 选错时落到哪个选项（只用于战报里"你选了 B 他选了 C"这类细节）
    miss: ok ? -1 : Math.floor(rng() * 4),
    tip: ok ? TAUNTS[Math.floor(rng() * TAUNTS.length)] : MISS[Math.floor(rng() * MISS.length)],
  };
}

// ---------- 计分 ----------
// 答对基础 100 分，剩余时间最多再加 60 分（抢答权重），连对每级 +20%，最高 2 倍
function scoreOf(correct, leftMs, combo) {
  if (!correct) return 0;
  const ratio = clamp(leftMs / LIMIT_MS, 0, 1);
  const base = 100 + Math.round(60 * ratio);
  const mul = 1 + 0.2 * Math.min(Math.max(combo - 1, 0), 5);
  return Math.round(base * mul);
}

// ---------- RP 结算 ----------
// 简化 Elo：赢强手多加分，输给弱手多扣分，避免"刷新手村"。
function rpDelta(win, myRp, rivalRp, ko) {
  const diff = (Number(rivalRp) || 0) - (Number(myRp) || 0);
  let d;
  if (win) d = Math.round(clamp(30 + diff / 70, 18, 52));
  else d = -Math.round(clamp(12 - diff / 150, 5, 24));
  if (ko) d += win ? 6 : -4;
  return d;
}

// 掉段保护：结算后不低于当前段位下限 30 分，避免刚升段就被打回原形
function applyRp(rp, delta) {
  const cur = Math.max(0, Math.round(Number(rp) || 0));
  const t = tierOf(cur);
  let next = cur + delta;
  if (delta < 0 && cur >= t.min) next = Math.max(next, t.min);
  return Math.max(0, Math.min(9999, next));
}

function hpOf(correct, timeout) {
  if (correct) return 8;
  return timeout ? -26 : -22;
}

// 战报短句
function verdict(win, me, foe, ko) {
  if (ko && !win) return '血条清零，被对手终结了';
  if (ko && win) return 'KO！把对手打到没血了';
  if (win) return foe.score === me.score ? '同分，靠血条险胜' : '抢答更快，拿下了';
  if (me.score === foe.score) return '同分同血，算平手';
  return '差一点，下局抢快半步';
}

module.exports = {
  LIMIT_MS,
  N_Q,
  HP_MAX,
  TIERS,
  tierOf,
  clamp,
  mulberry32,
  hashStr,
  makeRoom,
  validRoom,
  pickQuestions,
  makeRival,
  planAnswer,
  scoreOf,
  rpDelta,
  applyRp,
  hpOf,
  verdict,
  NAMES,
  AVATARS,
};
