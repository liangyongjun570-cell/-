// 数据聚合 + 进度计算
const ch0 = require('./ch0');
const ch1 = require('./ch1');
const ch2 = require('./ch2');
const ch3 = require('./ch3');
const ch4 = require('./ch4');
const ch5 = require('./ch5');
const ch6 = require('./ch6');
const ch7 = require('./ch7');
const formulas = require('./formulas');
const questions = require('./questions');

const chapters = [ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7];

const formulaMap = {};
formulas.forEach((f) => {
  formulaMap[f.id] = f;
});

const topicMap = {};
const chapterTopicIndex = {};
chapters.forEach((ch) => {
  chapterTopicIndex[ch.id] = [];
  (ch.topics || []).forEach((t) => {
    topicMap[t.id] = Object.assign({}, t, { chapterId: ch.id, chapterNum: ch.num, chapterName: ch.name });
    chapterTopicIndex[ch.id].push(t.id);
  });
});

function getChapter(id) {
  return chapters.find((c) => c.id === id) || null;
}

function getTopic(id) {
  return topicMap[id] || null;
}

function getFormula(id) {
  return formulaMap[id] || null;
}

function formulasOfChapter(num) {
  return formulas.filter((f) => f.ch === num);
}

// 每章计入进度的单元数：ch0 = 8 专题 + 5 例题；ch1–ch7 = 专题 + 本章公式
function unitsOf(ch) {
  if (ch.num === 0) return (ch.topics ? ch.topics.length : 0) + (ch.examples ? ch.examples.length : 0);
  return (ch.topics ? ch.topics.length : 0) + formulasOfChapter(ch.num).length;
}

function totalUnits() {
  return chapters.reduce((s, ch) => s + unitsOf(ch), 0);
}

// learned: {topics:[], formulas:[], examples:[]}
function chapterProgress(learned, ch) {
  const L = learned || { topics: [], formulas: [], examples: [] };
  let done = 0;
  (ch.topics || []).forEach((t) => {
    if (L.topics.indexOf(t.id) >= 0) done += 1;
  });
  formulasOfChapter(ch.num).forEach((f) => {
    if (L.formulas.indexOf(f.id) >= 0) done += 1;
  });
  if (ch.num === 0) {
    (ch.examples || []).forEach((e) => {
      if (L.examples.indexOf(e.id) >= 0) done += 1;
    });
  }
  const total = unitsOf(ch);
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    learnedTopics: (ch.topics || []).filter((t) => L.topics.indexOf(t.id) >= 0).length,
    totalTopics: (ch.topics || []).length,
    learnedFormulas: formulasOfChapter(ch.num).filter((f) => L.formulas.indexOf(f.id) >= 0).length,
    totalFormulas: formulasOfChapter(ch.num).length,
  };
}

function overall(learned) {
  let done = 0;
  let total = 0;
  let chaptersDone = 0;
  chapters.forEach((ch) => {
    const p = chapterProgress(learned, ch);
    done += p.done;
    total += p.total;
    if (p.total > 0 && p.done >= p.total) chaptersDone += 1;
  });
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    chaptersDone,
    chaptersTotal: chapters.length,
  };
}

function nextTopic(learned) {
  const L = learned || { topics: [], formulas: [], examples: [] };
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    for (let j = 0; j < (ch.topics || []).length; j++) {
      const t = ch.topics[j];
      if (L.topics.indexOf(t.id) < 0) return { ch, topic: t };
    }
  }
  return null;
}

// 五维掌握度：时域 / 频域 / 复频域 / 系统特性 / 数学基础（按公式分类 + 已学比例）
const DIMS = [
  { key: 'time', name: '时域分析', cats: ['基本信号', '时域分析'] },
  { key: 'freq', name: '频域分析', cats: ['傅里叶分析'] },
  { key: 'complex', name: '复频域', cats: ['变换域分析'] },
  { key: 'system', name: '系统特性', cats: ['系统特性', '采样理论'] },
  { key: 'math', name: '数学基础', cats: ['数学基础'] },
];

function radar(learned) {
  const L = learned || { formulas: [] };
  return DIMS.map((d) => {
    const list = formulas.filter((f) => d.cats.indexOf(f.cat) >= 0);
    const done = list.filter((f) => L.formulas.indexOf(f.id) >= 0).length;
    return {
      key: d.key,
      name: d.name,
      done,
      total: list.length,
      value: list.length ? Math.round((done / list.length) * 100) : 0,
    };
  });
}

module.exports = {
  chapters,
  formulas,
  questions,
  topicMap,
  chapterTopicIndex,
  getChapter,
  getTopic,
  getFormula,
  formulasOfChapter,
  unitsOf,
  totalUnits,
  chapterProgress,
  overall,
  nextTopic,
  radar,
  DIMS,
};
