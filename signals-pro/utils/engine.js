// 离线信号教授引擎：把内置题库 + 现有 tutor 主题，按三种风格组装成可渲染的 blocks
// 不联网、零配置；若用户填了自定义大模型 Key，由页面层负责远程请求，本文件只做离线兜底

const A = require('../data/assistant');
const TU = require('../data/tutor');
const D = require('../data/index');

const STYLE_IDS = ['intuition', 'rigorous', 'code'];

function styleOf(id) {
  let hit = A.STYLES[0];
  A.STYLES.forEach((s) => {
    if (s.id === id) hit = s;
  });
  return hit;
}

// 把 HARD 条目按风格展开
function fromHard(q, style) {
  const blocks = [];
  const refs = {
    ch: q.ch || '',
    topic: q.topic || '',
    lab: typeof q.lab === 'number' ? q.lab : -1,
  };

  if (style === 'intuition') {
    blocks.push({ type: 'p', text: '先用最直白的话说清楚：' });
    (q.intuition || []).forEach((p) => blocks.push({ type: 'p', text: p }));
    if (q.tip) blocks.push({ type: 'tip', text: q.tip });
    if (q.formulas && q.formulas.length) {
      blocks.push({ type: 'formula', ids: q.formulas.slice(0, 2) });
    }
    return { title: q.title, blocks, refs };
  }

  if (style === 'rigorous') {
    blocks.push({ type: 'p', text: '按定义出发，逐步推下去：' });
    (q.steps || []).forEach((s, i) => blocks.push({ type: 'step', index: i + 1, text: s }));
    if (q.formulas && q.formulas.length) {
      blocks.push({ type: 'formula', ids: q.formulas });
    }
    if (q.pitfall) blocks.push({ type: 'tip', text: '易错点：' + q.pitfall });
    return { title: q.title, blocks, refs };
  }

  // code
  blocks.push({ type: 'p', text: '直接上代码，跑一遍比看十遍公式有用：' });
  const codes = q.code || [];
  if (!codes.length) {
    blocks.push({ type: 'p', text: '这一条暂时只有推导，没有配套代码。切成「📐 严谨推导」看完整过程。' });
  } else {
    codes.forEach((c) => blocks.push({ type: 'code', lang: c.lang, text: c.text }));
  }
  if (q.tip) blocks.push({ type: 'tip', text: q.tip });
  if (q.formulas && q.formulas.length) {
    blocks.push({ type: 'formula', ids: q.formulas.slice(0, 1) });
  }
  return { title: q.title, blocks, refs };
}

// tutor 主题按风格映射到 compose 的 mode
function modeFor(style) {
  if (style === 'rigorous') return 'derive';
  if (style === 'code') return 'method';
  return 'concept';
}

function fromTheme(theme, style) {
  let mode = modeFor(style);
  const out = TU.compose(theme, mode);
  if (!out) return null;
  const blocks = [];
  (out.blocks || []).forEach((b) => {
    if (b.type === 'p') blocks.push({ type: 'p', text: b.text });
    else if (b.type === 'step') blocks.push({ type: 'step', index: b.index, text: b.text });
    else if (b.type === 'quote') blocks.push({ type: 'quote', text: b.text });
    else if (b.type === 'answer') blocks.push({ type: 'answer', text: b.text });
    else if (b.type === 'tip') blocks.push({ type: 'tip', text: b.text });
    else if (b.type === 'formula') blocks.push({ type: 'formula', ids: b.ids || [] });
  });
  if (style === 'code') {
    blocks.push({
      type: 'p',
      text: '离线库里这条还没有配代码。要现成代码的话，可以直接问：「用 MATLAB 演示' + theme.title + '」或者切到题库里的代码条目。',
    });
  }
  return {
    title: out.title,
    blocks,
    refs: { ch: '', topic: '', lab: -1 },
  };
}

function fallback(text, ctx) {
  const blocks = [];
  blocks.push({ type: 'p', text: A.FALLBACK.intro });
  A.FALLBACK.points.forEach((p) => blocks.push({ type: 'p', text: p }));
  if (ctx && ctx.chapter) {
    const qs = A.quickOf(ctx.chapter);
    if (qs.length) {
      blocks.push({ type: 'p', text: '顺手可以把这几个问题弄清楚，它们覆盖了这一章的主干：' });
      qs.forEach((q, i) => blocks.push({ type: 'step', index: i + 1, text: q }));
    }
  }
  blocks.push({ type: 'tip', text: '换个说法再问一次也可以，比如把「' + String(text || '').slice(0, 12) + '」换成具体信号名或公式名。' });
  return { title: '换个角度问', blocks, refs: { ch: ctx ? ctx.chapter : '', topic: '', lab: -1 } };
}

// 主入口（同步）
function answer(text, style, ctx) {
  const s = STYLE_IDS.indexOf(style) >= 0 ? style : 'intuition';
  const q = String(text || '').trim();
  if (!q) return fallback(q, ctx);

  const hard = A.findHard(q);
  if (hard) return fromHard(hard, s);

  const theme = TU.match(q);
  if (theme) {
    const r = fromTheme(theme, s);
    if (r) return r;
  }
  return fallback(q, ctx);
}

// 供页面组装"公式对象"用
function formulaList(ids) {
  return (ids || [])
    .map((id) => D.getFormula(id))
    .filter((x) => !!x);
}

module.exports = {
  STYLE_IDS,
  styleOf,
  answer,
  fromHard,
  formulaList,
};
