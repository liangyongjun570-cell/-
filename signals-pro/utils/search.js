// 全局搜索：77 个入口（8 章 + 36 专题 + 28 公式 + 5 例题）
const D = require('../data/index');

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七'];

function norm(s) {
  return String(s == null ? '' : s)
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function bodyOfTopic(t) {
  const parts = [t.intro || t.desc || ''];
  (t.sections || []).forEach((s) => {
    if (s.h) parts.push(s.h);
    (s.p || []).forEach((p) => parts.push(p));
    (s.list || []).forEach((p) => parts.push(p));
  });
  if (t.example) {
    parts.push(t.example.title || '', t.example.stem || '', t.example.answer || '');
  }
  if (t.case) parts.push(t.case.title || '', t.case.desc || '');
  return parts.join(' ');
}

let INDEX = null;

function build() {
  if (INDEX) return INDEX;
  const items = [];
  D.chapters.forEach((ch) => {
    const chAliases = ['ch' + ch.num, '第' + ch.num + '章', '第' + CN_NUM[ch.num] + '章', ch.en, ch.name];
    items.push({
      type: 'chapter',
      id: ch.id,
      title: ch.name,
      ch: ch.num,
      chName: ch.name,
      summary: ch.summary,
      aliases: chAliases,
      body: [ch.summary, ch.tagline, (ch.keyPoints || []).join(' '), (ch.goals || []).join(' ')].join(' '),
      payload: { chId: ch.id },
    });

    (ch.topics || []).forEach((t) => {
      items.push({
        type: 'topic',
        id: t.id,
        title: t.name,
        ch: ch.num,
        chName: ch.name,
        summary: t.intro || t.desc || '',
        aliases: [].concat(t.aliases || [], t.abbr ? [t.abbr] : [], t.short ? [t.short] : []),
        body: bodyOfTopic(t),
        payload: { topicId: t.id, chId: ch.id },
      });
    });
  });

  D.formulas.forEach((f) => {
    items.push({
      type: 'formula',
      id: f.id,
      title: f.name,
      ch: f.ch,
      chName: (D.chapters[f.ch] || {}).name || '',
      summary: f.desc,
      aliases: [].concat(f.aliases || [], [f.cat, f.text]),
      body: [f.desc, f.cond, f.tip, f.text].join(' '),
      payload: { formulaId: f.id },
    });
  });

  const ch0 = D.chapters[0];
  (ch0.examples || []).forEach((e) => {
    items.push({
      type: 'example',
      id: e.id,
      title: e.title,
      ch: 0,
      chName: ch0.name,
      summary: e.stem,
      aliases: [e.tag || '', '例题', '例' + e.no],
      body: [e.stem, e.answer, (e.steps || []).map((s) => s.h + s.t).join(' ')],
      payload: { exampleId: e.id, chId: 'ch0' },
    });
  });

  INDEX = items;
  return INDEX;
}

function scoreItem(item, q, tokens) {
  const title = norm(item.title);
  const aliasList = (item.aliases || []).map(norm).filter(Boolean);
  const sum = norm(item.summary);
  const body = norm(item.body);

  // 多关键词：全部需要命中
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (
      title.indexOf(tk) < 0 &&
      aliasList.join(' ').indexOf(tk) < 0 &&
      sum.indexOf(tk) < 0 &&
      body.indexOf(tk) < 0
    ) {
      return 0;
    }
  }

  let s = 0;
  if (title === q) s += 100;
  else if (title.indexOf(q) === 0) s += 80;
  else if (title.indexOf(q) >= 0) s += 60;

  aliasList.forEach((a) => {
    if (a === q) s += 50;
    else if (a.indexOf(q) >= 0) s += 40;
  });

  if (sum.indexOf(q) >= 0) s += 22;
  if (body.indexOf(q) >= 0) s += 10;

  tokens.forEach((tk) => {
    if (title.indexOf(tk) >= 0) s += 8;
    if (aliasList.join(' ').indexOf(tk) >= 0) s += 6;
    if (sum.indexOf(tk) >= 0) s += 3;
    if (body.indexOf(tk) >= 0) s += 1;
  });

  // 类型加权：章节/知识点优先于公式
  if (item.type === 'chapter') s += 6;
  if (item.type === 'topic') s += 4;
  return s;
}

function chapterFilter(q) {
  const m = /^(?:ch|chapter)?\s*([0-7])$/.exec(q);
  if (m) return parseInt(m[1], 10);
  const m2 = /^第([0-7一二三四五六七零])章$/.exec(q);
  if (m2) {
    const v = m2[1];
    if (/[0-9]/.test(v)) return parseInt(v, 10);
    return CN_NUM.indexOf(v);
  }
  return null;
}

function query(raw) {
  const q = norm(raw);
  if (!q) return { q: '', items: [], counts: emptyCounts(), total: 0, chapterOnly: null };

  const all = build();

  // 纯章节检索：ch3 / CH 3 / 第三章
  const onlyCh = chapterFilter(q);
  if (onlyCh != null) {
    const list = all.filter((i) => i.ch === onlyCh);
    return { q: raw, items: list, counts: countByType(list), total: list.length, chapterOnly: onlyCh };
  }

  const tokens = q.split(' ').filter(Boolean);
  const hits = [];
  all.forEach((item) => {
    const s = scoreItem(item, q, tokens);
    if (s > 0) hits.push({ item, score: s });
  });
  hits.sort((a, b) => b.score - a.score || a.item.ch - b.item.ch);
  const items = hits.map((h) => h.item);
  return { q: raw, items, counts: countByType(items), total: items.length, chapterOnly: null };
}

function emptyCounts() {
  return { all: 0, chapter: 0, topic: 0, formula: 0, example: 0 };
}

function countByType(items) {
  const c = { all: items.length, chapter: 0, topic: 0, formula: 0, example: 0 };
  items.forEach((i) => {
    c[i.type] = (c[i.type] || 0) + 1;
  });
  return c;
}

// 按类型筛选
function filterByType(items, type) {
  if (!type || type === 'all') return items;
  return items.filter((i) => i.type === type);
}

// 摘要：最长约 90 字
function summaryOf(item) {
  const raw = norm(item.summary) ? item.summary : '';
  const s = String(raw || '').replace(/\s+/g, ' ');
  return s.length > 90 ? s.slice(0, 90) + '…' : s;
}

// ---------- 拍照搜题：OCR 文字 → 匹配题库原题 ----------
// 中文友好的字符二元组 Dice 相似度：对 OCR 错字 / 漏字比"精确包含"稳得多。
function cram(s) {
  return String(s == null ? '' : s)
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function bigrams(s) {
  const m = {};
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m[g] = (m[g] || 0) + 1;
  }
  return m;
}

function dice(a, b) {
  if (a.length < 2 || b.length < 2) return a && a === b ? 1 : 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let inter = 0;
  let na = 0;
  let nb = 0;
  Object.keys(ga).forEach((k) => {
    na += ga[k];
    if (gb[k]) inter += Math.min(ga[k], gb[k]);
  });
  Object.keys(gb).forEach((k) => {
    nb += gb[k];
  });
  return (2 * inter) / (na + nb);
}

// rawText：OCR 或内置文字稿；limit：最多返回几道（按相似度降序）
// 只认题库里的原题（选择题），手写推导 / 作业大题搜不到属正常，宁缺毋滥。
function matchQuestions(rawText, limit) {
  const L = limit || 3;
  const raw = String(rawText || '');
  const whole = cram(raw);
  const lines = raw
    .split(/[\n。；;！？!?\r、]+/)
    .map(cram)
    .filter((s) => s.length >= 6);
  if (whole.length < 6) return [];

  const hits = [];
  D.questions.forEach((q) => {
    const stem = cram(q.stem || '');
    if (stem.length < 6) return;
    // 题干对整段和逐行各比一次，取最好的（整段会稀释，逐行更准）
    let best = dice(stem, whole) * 0.92;
    lines.forEach((ln) => {
      const s = dice(stem, ln);
      if (s > best) best = s;
    });
    // 整题拍照时选项是强特征，每个命中选项小幅加分
    (q.options || []).forEach((o) => {
      const on = cram(o);
      if (on.length >= 2 && whole.indexOf(on) >= 0) best += 0.05;
    });
    if (best > 1) best = 1;
    if (best >= 0.4) {
      hits.push({
        id: q.id,
        score: Math.round(best * 100) / 100,
        stem: q.stem,
        options: q.options || [],
        answer: q.answer,
        hint: q.hint || '',
        explanation: q.explanation || '',
        difficulty: q.difficulty || '',
        ch: q.ch,
      });
    }
  });
  hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  return hits.slice(0, L);
}

const RECOMMEND = ['LTI 系统', '傅里叶变换', '卷积', '拉普拉斯变换', '周期信号', '采样'];
const EXAMPLES = ['ch3', 'FT', 'LTI 稳定'];
const TYPE_LABEL = { chapter: '章节', topic: '知识点', formula: '公式', example: '例题' };

module.exports = { query, filterByType, summaryOf, build, matchQuestions, RECOMMEND, EXAMPLES, TYPE_LABEL, countByType };
