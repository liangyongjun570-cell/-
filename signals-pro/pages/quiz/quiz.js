const app = require('../../utils/appref');
const store = require('../../utils/store');
const D = require('../../data/index');
const util = require('../../utils/util');
const T = require('../../data/theme');

const LETTERS = ['A', 'B', 'C', 'D'];

// 原地打散（Fisher-Yates）
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

Page({
  data: {
    theme: 'light',
    mode: 'home',
    letters: LETTERS,
    // 首页统计
    total: 130,
    // 擂台入口（只读展示，点击进 pk 页）
    pkTier: '青铜阶跃',
    pkRp: 0,
    stats: { answered: 0, correct: 0, rate: 0, wrong: 0 },
    chList: [],
    difList: [],
    // 答题
    idx: 0,
    totalN: 0,
    exam: null,
    cur: null,
    picked: -1,
    submitted: false,
    showHint: false,
    // 结果
    result: null,
    // 错题回顾
    review: null,
  },

  onLoad(q) {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    this.q = q || {};
    this.refreshHome();
    // 从同学分享的卡片进来：直接开这一道题
    if (this.q.qid) {
      const qq = D.questions.find((x) => x.id === this.q.qid);
      if (qq) {
        this.begin([qq.id], '同学分享的一道题');
        return;
      }
      util.toast('这道题不在题库里了，给你随机来一组');
    }
    if (this.q.ch !== undefined) this.startByCh(Number(this.q.ch));
    else if (this.q.topic) this.startByTopic(this.q.topic);
    else if (this.q.mode === 'wrong') this.startWrong();
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    if (this.data.mode === 'home') this.refreshHome();
  },

  refreshHome() {
    const acc = app.account();
    const data = store.load(acc);
    const quiz = data.quiz || { answered: 0, correct: 0 };
    const chList = D.chapters.map((c) => {
      const n = D.questions.filter((q) => q.ch === c.num).length;
      return { num: c.num, name: c.name, count: n, color: c.color };
    }).filter((c) => c.count > 0);

    const difs = ['基础概念', '期末考研核心', '工程综合'];
    const difList = difs.map((d) => ({
      name: d,
      count: D.questions.filter((q) => q.difficulty === d).length,
    }));

    const pkData = data.pk || {};
    let pkTier = '青铜阶跃';
    try {
      pkTier = require('../../utils/pk').tierOf(pkData.rp || 0).short;
    } catch (e) {}

    this.setData({
      total: D.questions.length,
      chList,
      difList,
      pkTier,
      pkRp: pkData.rp || 0,
      stats: {
        answered: quiz.answered || 0,
        correct: quiz.correct || 0,
        rate: quiz.answered ? Math.round((quiz.correct / quiz.answered) * 100) : 0,
        wrong: data.wrong.length,
      },
    });
  },

  // ---------- 组卷 ----------
  setIdle() {
    this.setData({ mode: 'home' });
    this.refreshHome();
  },

  startByCh(num) {
    const list = D.questions.filter((q) => q.ch === num).map((q) => q.id);
    if (!list.length) {
      util.toast('本章暂无题目');
      return;
    }
    this.begin(list, 'ch' + num + ' 专项练习');
  },

  tapCh(e) {
    this.startByCh(Number(e.currentTarget.dataset.num));
  },

  startRandom() {
    const all = shuffled(D.questions.map((q) => q.id));
    const sizes = [10, 20, 30].filter((n) => n < all.length);
    sizes.push(all.length);
    wx.showActionSheet({
      itemList: sizes.map((n) => (n === all.length ? '全题库 ' + n + ' 题（长考）' : '随机 ' + n + ' 题')),
      success: (res) => {
        const n = sizes[res.tapIndex] || 10;
        const title = n === all.length ? '随机模考 · 全卷 ' + n + ' 题' : '随机模考 ' + n + ' 题';
        this.begin(all.slice(0, n), title);
      },
      fail: () => {},
    });
  },

  // 难度专项：把某一难度层的题打散抽一组，适合考前只刷"期末考研核心"
  startByDiff(e) {
    const d = e.currentTarget.dataset.d;
    if (!d) return;
    const list = shuffled(D.questions.filter((q) => q.difficulty === d).map((q) => q.id));
    if (!list.length) {
      util.toast('该难度暂无题目');
      return;
    }
    const n = Math.min(15, list.length);
    this.begin(list.slice(0, n), d + ' 专项 · ' + n + ' 题');
  },

  goPk() {
    wx.navigateTo({ url: '/pages/pk/pk' });
  },

  startWrong() {
    const acc = app.account();
    const data = store.load(acc);
    const ids = (data.wrong || []).filter((id) => id.indexOf('q') === 0);
    if (!ids.length) {
      util.toast('错题本是空的，先做几题吧');
      return;
    }
    this.begin(ids.slice(0, 20), '错题攻坚');
  },

  startByTopic(topicId) {
    const t = D.getTopic(topicId);
    if (!t) return;
    // 用本章题目代替（题库按章组织）
    const list = D.questions.filter((q) => q.ch === t.chapterNum).map((q) => q.id);
    this.begin(list.slice(0, 8), t.name + ' 相关题');
  },

  begin(ids, title) {
    const exam = {
      title,
      ids,
      i: 0,
      picks: {},
      submitted: {},
      hints: {},
      t0: Date.now(),
    };
    this.setData({ mode: 'run', exam, result: null });
    this.loadCur();
  },

  loadCur() {
    const exam = this.data.exam;
    if (!exam) return;
    const id = exam.ids[exam.i];
    const q = D.questions.find((x) => x.id === id);
    if (!q) return;
    const submitted = !!exam.submitted[id];
    this.setData({
      cur: {
        id: q.id,
        ch: q.ch,
        difficulty: q.difficulty,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        hint: q.hint,
        explanation: q.explanation,
        formulaRef: q.formulaRef,
        chName: (D.chapters[q.ch] || {}).name || '',
      },
      picked: exam.picks[id] === undefined ? -1 : exam.picks[id],
      submitted,
      showHint: !!exam.hints[id],
      idx: exam.i + 1,
      totalN: exam.ids.length,
    });
  },

  pick(e) {
    if (this.data.submitted) return;
    const i = Number(e.currentTarget.dataset.i);
    const exam = this.data.exam;
    exam.picks[this.data.cur.id] = i;
    this.setData({ picked: i, exam });
  },

  toggleHint() {
    const exam = this.data.exam;
    exam.hints[this.data.cur.id] = !this.data.showHint;
    this.setData({ showHint: !this.data.showHint, exam });
  },

  submit() {
    if (this.data.picked < 0) {
      util.toast('先选一个答案');
      return;
    }
    const cur = this.data.cur;
    const exam = this.data.exam;
    const correct = this.data.picked === cur.answer;
    exam.submitted[cur.id] = true;
    const acc = app.account();
    store.recordAnswer(acc, correct);
    if (!correct) store.addWrong(acc, cur.id);
    util.vibrate();
    this.setData({ submitted: true, exam });
  },

  nextQuestion() {
    const exam = this.data.exam;
    if (exam.i < exam.ids.length - 1) {
      exam.i += 1;
      this.setData({ exam });
      this.loadCur();
    } else {
      this.finish();
    }
  },

  prevQuestion() {
    const exam = this.data.exam;
    if (exam.i > 0) {
      exam.i -= 1;
      this.setData({ exam });
      this.loadCur();
    }
  },

  finish() {
    const exam = this.data.exam;
    const acc = app.account();
    let right = 0;
    const wrongList = [];
    const detail = exam.ids.map((id) => {
      const q = D.questions.find((x) => x.id === id);
      const pick = exam.picks[id];
      const ok = pick === q.answer;
      if (ok) right += 1;
      else wrongList.push({ id: q.id, stem: q.stem, answer: q.answer, pick, explanation: q.explanation, options: q.options });
      return { id, ok, pick, answer: q.answer };
    });
    const totalN = exam.ids.length;
    const rate = Math.round((right / totalN) * 100);
    const secs = Math.round((Date.now() - exam.t0) / 1000);

    store.recordExam(acc, {
      title: exam.title,
      total: totalN,
      right,
      rate,
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    });

    let sticker = T.stickers.quizBad;
    let word = '再练一轮';
    if (rate === 100) {
      sticker = T.stickers.quizPerfect;
      word = '全对，稳！';
    } else if (rate >= 80) {
      sticker = T.stickers.quizGood;
      word = '不错，就差一点';
    } else if (rate >= 60) {
      sticker = T.stickers.quizGood;
      word = '基础有了，细节要抠';
    }

    this.setData({
      mode: 'result',
      letters: LETTERS,
      result: {
        title: exam.title,
        total: totalN,
        right,
        rate,
        secs,
        sticker,
        word,
        wrongList: wrongList.map((w) => Object.assign({}, w, { letter: LETTERS[w.answer] })),
      },
    });
  },

  restart() {
    const exam = this.data.exam;
    if (!exam) return this.setIdle();
    this.begin(exam.ids.slice(), exam.title);
  },

  redoWrong() {
    const r = this.data.result;
    if (!r || !r.wrongList.length) return;
    this.begin(r.wrongList.map((w) => w.id), '错题重做');
  },

  openReview(e) {
    const id = e.currentTarget.dataset.id;
    const q = D.questions.find((x) => x.id === id);
    if (!q) return;
    this.setData({
      review: Object.assign({}, q, {
        chName: (D.chapters[q.ch] || {}).name || '',
        letter: LETTERS[q.answer],
      }),
    });
  },

  closeReview() {
    this.setData({ review: null });
  },

  openFormula(e) {
    const id = e.currentTarget.dataset.id;
    if (!id || id === 'undefined') return;
    const f = D.getFormula(id);
    if (!f) return;
    wx.navigateTo({ url: '/pages/chapter/chapter?chId=ch' + f.ch + '&tab=formulas' });
  },

  goMistakes() {
    wx.navigateTo({ url: '/pages/mistakes/mistakes' });
  },

  onShareAppMessage() {
    const cur = this.data.cur;
    const rv = this.data.review;
    // 正在做题/看解析：把当前这道题带参数发出去，好友点开直接做同一题
    if (this.data.mode === 'run' && cur) {
      return {
        title: '这道《信号与系统》题你能做对吗：' + String(cur.stem).slice(0, 16) + '…',
        path: '/pages/quiz/quiz?qid=' + cur.id,
      };
    }
    if (rv) {
      return {
        title: '一道易错的《信号与系统》题：' + String(rv.stem).slice(0, 16) + '…',
        path: '/pages/quiz/quiz?qid=' + rv.id,
      };
    }
    if (this.q && this.q.ch !== undefined) {
      return {
        title: 'ch' + this.q.ch + ' 专项练习 · 信号与系统题库',
        path: '/pages/quiz/quiz?ch=' + this.q.ch,
      };
    }
    return { title: '信号与系统 · ' + D.questions.length + ' 道期末考研核心题', path: '/pages/quiz/quiz' };
  },
});
