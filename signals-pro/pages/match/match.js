const app = require('../../utils/appref');
const util = require('../../utils/util');
const ALL_PAIRS = require('../../data/pairs');

const GAME_TIME = 40; // 初始 40 秒

// 打散数组
function shuffle(arr) {
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
    score: 0,
    timeLeft: GAME_TIME,
    timePct: 100,
    wave: 1,
    combo: 0,
    maxCombo: 0,
    matchedPairs: 0,
    cards: [],
    bestScore: 0,
    isNewBest: false,
    floatMsg: '',
    gameOver: false,
    resTier: { icon: '🥉', name: '时域学徒', desc: '刚入门，还需多加巩固' },
    reviewedPairs: [],
  },

  onLoad() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
    const best = Number(wx.getStorageSync('ssp_match_best')) || 0;
    this.setData({ bestScore: best });
    this.usedPairIds = new Set();
    this.restartGame();
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    if (theme !== this.data.theme) {
      this.setData({ theme });
      util.applyTheme(theme);
    }
  },

  onHide() {
    this.stopClock();
  },

  onUnload() {
    this.stopClock();
  },

  // ---------- 游戏初始化与波次 ----------
  restartGame() {
    this.stopClock();
    this.firstCardIdx = -1;
    this.lockInput = false;
    this.usedPairIds.clear();

    const best = Number(wx.getStorageSync('ssp_match_best')) || 0;
    this.setData({
      score: 0,
      timeLeft: GAME_TIME,
      timePct: 100,
      wave: 1,
      combo: 0,
      maxCombo: 0,
      matchedPairs: 0,
      gameOver: false,
      isNewBest: false,
      floatMsg: '',
      bestScore: best,
    });

    this.spawnWave(1);
    this.startClock();
  },

  spawnWave(waveNum) {
    this.firstCardIdx = -1;
    this.lockInput = false;

    // 随机抽取 6 个变换对
    const shuffledPairs = shuffle(ALL_PAIRS);
    const selectedPairs = shuffledPairs.slice(0, 6);

    selectedPairs.forEach((p) => this.usedPairIds.add(p.id));

    // 生成 12 张单卡（6 张时域 + 6 张频域）
    const cards = [];
    selectedPairs.forEach((p) => {
      cards.push({
        cardId: p.id + '_time',
        pairId: p.id,
        domain: 'time',
        name: p.timeName,
        math: p.time,
        selected: false,
        matched: false,
        wrong: false,
      });
      cards.push({
        cardId: p.id + '_freq',
        pairId: p.id,
        domain: 'freq',
        name: p.freqName,
        math: p.freq,
        selected: false,
        matched: false,
        wrong: false,
      });
    });

    // 打乱 12 张卡牌顺序
    this.setData({
      cards: shuffle(cards),
      wave: waveNum,
    });
  },

  // ---------- 倒计时控制 ----------
  startClock() {
    this.stopClock();
    this._clockTimer = setInterval(() => {
      let t = this.data.timeLeft - 1;
      if (t <= 0) {
        t = 0;
        this.setData({ timeLeft: 0, timePct: 0 });
        this.endGame();
      } else {
        const pct = Math.min(100, Math.round((t / GAME_TIME) * 100));
        this.setData({ timeLeft: t, timePct: pct });
      }
    }, 1000);
  },

  stopClock() {
    if (this._clockTimer) {
      clearInterval(this._clockTimer);
      this._clockTimer = null;
    }
  },

  // ---------- 点击卡牌交互 ----------
  onCardTap(e) {
    if (this.lockInput || this.data.gameOver) return;
    const idx = e.currentTarget.dataset.idx;
    const cards = this.data.cards;
    const card = cards[idx];

    if (!card || card.matched || card.selected) return;

    // 第 1 张卡
    if (this.firstCardIdx < 0) {
      this.firstCardIdx = idx;
      cards[idx].selected = true;
      this.setData({ cards });
      try {
        wx.vibrateShort({ type: 'light' });
      } catch (err) {}
      return;
    }

    // 第 2 张卡
    const firstIdx = this.firstCardIdx;
    const firstCard = cards[firstIdx];
    this.firstCardIdx = -1; // 消费掉

    cards[idx].selected = true;
    this.setData({ cards });

    // 判断是否匹配：相同 pairId 且分属不同领域 (时域 vs 频域)
    const isMatch = firstCard.pairId === card.pairId && firstCard.domain !== card.domain;

    if (isMatch) {
      // 匹配成功！
      try {
        wx.vibrateShort({ type: 'medium' });
      } catch (err) {}

      const nextCombo = this.data.combo + 1;
      const maxCombo = Math.max(this.data.maxCombo, nextCombo);
      const addScore = 100 + (nextCombo - 1) * 30; // 连击加成
      const newScore = this.data.score + addScore;
      const newMatched = this.data.matchedPairs + 1;

      // 奖励时间 3s
      const newTime = Math.min(GAME_TIME, this.data.timeLeft + 3);

      cards[firstIdx].matched = true;
      cards[firstIdx].selected = false;
      cards[idx].matched = true;
      cards[idx].selected = false;

      this.showFloat('+' + addScore + (nextCombo > 1 ? ' 🔥 ' + nextCombo + '连击' : ''));

      this.setData({
        cards,
        score: newScore,
        combo: nextCombo,
        maxCombo,
        matchedPairs: newMatched,
        timeLeft: newTime,
        timePct: Math.min(100, Math.round((newTime / GAME_TIME) * 100)),
      });

      // 检查本波 12 张卡是否全部消完
      const allDone = cards.every((c) => c.matched);
      if (allDone) {
        this.lockInput = true;
        setTimeout(() => {
          this.showFloat('🎉 第 ' + this.data.wave + ' 波全清！时间 +6s');
          const bonusTime = Math.min(GAME_TIME, this.data.timeLeft + 6);
          this.setData({
            timeLeft: bonusTime,
            timePct: Math.min(100, Math.round((bonusTime / GAME_TIME) * 100)),
          });
          this.spawnWave(this.data.wave + 1);
        }, 500);
      }
    } else {
      // 匹配错误
      try {
        wx.vibrateShort({ type: 'heavy' });
      } catch (err) {}

      this.lockInput = true;
      cards[firstIdx].wrong = true;
      cards[idx].wrong = true;
      this.setData({ cards, combo: 0 });

      // 扣罚 2 秒
      const penaltyTime = Math.max(0, this.data.timeLeft - 2);
      this.setData({
        timeLeft: penaltyTime,
        timePct: Math.min(100, Math.round((penaltyTime / GAME_TIME) * 100)),
      });

      if (penaltyTime <= 0) {
        this.endGame();
        return;
      }

      setTimeout(() => {
        cards[firstIdx].selected = false;
        cards[firstIdx].wrong = false;
        cards[idx].selected = false;
        cards[idx].wrong = false;
        this.lockInput = false;
        this.setData({ cards });
      }, 450);
    }
  },

  // 浮动通知动画
  showFloat(msg) {
    this.setData({ floatMsg: msg });
    if (this._floatTimer) clearTimeout(this._floatTimer);
    this._floatTimer = setTimeout(() => {
      this.setData({ floatMsg: '' });
    }, 1100);
  },

  // ---------- 游戏结束结算 ----------
  endGame() {
    this.stopClock();
    const score = this.data.score;
    const oldBest = Number(wx.getStorageSync('ssp_match_best')) || 0;
    const isNewBest = score > oldBest;
    if (isNewBest) {
      wx.setStorageSync('ssp_match_best', score);
    }

    // 评价段位
    let resTier = { icon: '🥉', name: '时域学徒', desc: '刚起步，公式记忆还需加深' };
    if (score >= 1800) {
      resTier = { icon: '⚡', name: '冲激王者 · 频域瞬杀', desc: '手速与知识双巅峰！无可挑剔的时频大师' };
    } else if (score >= 1300) {
      resTier = { icon: '👑', name: '傅里叶大师 · 洞察本质', desc: '对时频变换已经形成肌肉记忆！' };
    } else if (score >= 800) {
      resTier = { icon: '🥇', name: '频域猎手 · 熟能生巧', desc: '变换对基本掌握，再快一步即成大师' };
    } else if (score >= 400) {
      resTier = { icon: '🥈', name: '进阶学者 · 稳扎稳打', desc: '基础良好，注意连击速度能拿更高分' };
    }

    // 汇总本局涉及的知识对
    const reviewed = ALL_PAIRS.filter((p) => this.usedPairIds.has(p.id));

    this.setData({
      gameOver: true,
      bestScore: Math.max(score, oldBest),
      isNewBest,
      resTier,
      reviewedPairs: reviewed,
    });
  },

  goFormulas() {
    wx.switchTab({ url: '/pages/formulas/formulas' });
  },

  onShareAppMessage() {
    return {
      title: '我在「变换对对碰」中打出 ' + this.data.score + ' 分！时域频域你认得清吗？',
      path: '/pages/match/match',
    };
  },
});
