const app = require('../../utils/appref');
const store = require('../../utils/store');
const cloud = require('../../utils/cloud');
const sync = require('../../utils/sync');
const auth = require('../../utils/auth');
const D = require('../../data/index');
const util = require('../../utils/util');
const T = require('../../data/theme');

const PAL = {
  light: { bg: '#FFFFFF', grid: '#F1E2D6', ink3: '#A89384', primary: '#F2694B', fill: 'rgba(242,105,75,0.18)' },
  dark: { bg: '#221A15', grid: '#3A2C23', ink3: '#8E7A6C', primary: '#FF8B6B', fill: 'rgba(255,139,107,0.22)' },
};

Page({
  data: {
    theme: 'light',
    dark: false,
    account: '',
    isGuest: true,
    isWx: false,
    nickname: '',
    avatarSrc: '',
    days: 0,
    overall: { done: 0, total: 66, percent: 0, chaptersDone: 0 },
    stats: {},
    qn: D.questions.length,
    radar: [],
    sticker: T.stickers.hero,
    nOpen: false,
    nVal: '',
    nAvatar: '',
    // 排行榜
    rankList: [],
    rankMe: null,
    rankMock: true,
    rankNote: '',
    cloudOn: false,
    syncText: '',
    syncing: false,
    // 本机还留着的游客记录条数（0 = 不显示并入入口）
    guestLeft: 0,
    // 跨 tab 跳进来的来源（null = 不显示返回条）
    back: null,
  },

  onLoad() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme, dark: theme === 'dark' });
    util.applyTheme(theme);
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme, dark: theme === 'dark' });
    util.applyTheme(theme);
    util.setTabBar(this, 4, theme);
    // 从首页「账号」入口跨 tab 进来时顶部给一条回路。
    // 读完立刻清，否则源页 onHide 会先于本页 onShow 把它删掉
    this.setData({ back: util.backInfo() });
    util.clearBack();
    this.refresh();
  },

  onHide() {
    if (this.data.back) this.setData({ back: null });
  },

  goBackTab() {
    util.goBackTab();
  },

  refresh() {
    const acc = app.account();
    const data = store.load(acc);
    const radar = D.radar(data.learned);
    let wxAcc = false;
    try {
      wxAcc = acc !== store.GUEST && auth.isWx(acc);
    } catch (e) {
      wxAcc = false;
    }
    this.setData({
      account: acc === store.GUEST ? '游客模式' : wxAcc ? '微信账号' : acc,
      isGuest: acc === store.GUEST,
      isWx: wxAcc,
      // 只有登录态才需要这个入口：游客自己就是游客，没有"并入"这回事
      guestLeft: acc === store.GUEST ? 0 : store.guestCount(store.GUEST),
      // 与云端同一口径：没设昵称时按账号派生，不要只在前端显示一个云端没有的名字
      nickname: store.displayName(acc, data),
      // 头像：用户选过的优先，否则用主题贴纸
      avatarSrc: data.avatar || '/assets/theme/' + this.data.sticker + '.jpg',
      days: util.daysBetween(data.visits),
      overall: D.overall(data.learned),
      radar,
      // 擂台战绩（PK 页单独维护，这里只读展示）
      pkTier: (function () {
        try {
          return require('../../utils/pk').tierOf((data.pk || {}).rp || 0).short;
        } catch (e) {
          return '青铜阶跃';
        }
      })(),
      pkRp: (data.pk || {}).rp || 0,
      pkMatches: ((data.pk || {}).wins || 0) + ((data.pk || {}).losses || 0),
      stats: {
        topics: data.learned.topics.length,
        formulas: data.learned.formulas.length,
        examples: data.learned.examples.length,
        notes: Object.keys(data.notes || {}).length,
        fav: data.fav.formulas.length + data.fav.courses.length,
        wrong: data.wrong.length,
        answered: data.quiz.answered || 0,
        rate: data.quiz.answered ? Math.round((data.quiz.correct / data.quiz.answered) * 100) : 0,
        exams: (data.quiz.exams || []).length,
        searches: data.searches.length,
      },
    });
    setTimeout(() => this.drawRadar(radar), 60);
    this.loadRank();
  },

  goPk() {
    wx.navigateTo({ url: '/pages/pk/pk' });
  },

  // ---------- 排行榜（云端优先，未开通云开发用本地示例榜单） ----------
  loadRank() {
    const acc = app.account();
    const snap = sync.snapshot(acc);
    const me = {
      nickname: this.data.nickname || (this.data.isGuest ? '我（游客）' : this.data.isWx ? '微信用户' : '我'),
      score: snap.score || 0,
      answered: snap.quiz.answered || 0,
      correct: snap.quiz.correct || 0,
      rate: snap.quiz.answered ? Math.round((snap.quiz.correct / snap.quiz.answered) * 100) : 0,
      chDone: snap.chDone || 0,
      avatar: 'love',
      self: true,
    };

    // 先渲染本地兜底，保证进页面立刻有内容
    const local = cloud.localRank(me);
    this.setData({
      rankList: local.list,
      rankMe: local.me,
      rankMock: true,
      rankNote: '示例数据',
    });

    if (!cloud.available()) {
      this.setData({ cloudOn: false, syncText: cloud.statusText() });
      return;
    }

    this.setData({ cloudOn: true, syncText: '正在同步…' });
    sync
      .pushNow(acc)
      .then(() => cloud.rank(true))
      .then((box) => {
        if (!box) {
          // 云函数没部署 / 环境未开通 / 测试号：退回本地示例榜单，并说清是哪一种
          this.setData({
            cloudOn: false,
            rankMock: true,
            rankNote: '云端暂不可用',
            syncText: cloud.statusText(),
          });
          return;
        }
        if (!box.list.length) {
          this.setData({ syncText: '已连接 · 还没有同学上榜', rankNote: '云端 · 仅你一人' });
          return;
        }
        const d = new Date();
        const at = util.pad(d.getHours()) + ':' + util.pad(d.getMinutes());
        this.setData({
          rankList: box.list.slice(0, 10),
          rankMe: box.me || me,
          rankMock: false,
          rankNote: '云端 · ' + box.list.length + ' 人',
          syncText: '已同步 ' + at,
        });
      });
  },

  syncNow() {
    const acc = app.account();
    if (!cloud.available()) {
      wx.showModal({
        title: '云开发还没开通',
        content:
          '当前所有学习数据都保存在本机（wx 本地存储），换设备请用「导出 / 导入」。\n\n要启用云同步：开发者工具里点工具栏「云开发」开通环境，再把 cloudfunctions/mycloud 右键上传部署，最后把 utils/cloud.js 里的 ENV 填成你的环境 ID。',
        showCancel: false,
        confirmText: '知道了',
      });
      return;
    }
    if (this.data.syncing) return;
    this.setData({ syncing: true, syncText: '同步中…' });
    sync.syncAll(acc).then((r) => {
      this.setData({ syncing: false });
      if (r.ok) {
        util.toast('已同步到云端');
      } else {
        util.toast('同步失败，稍后再试');
      }
      this.refresh();
    });
  },

  // ---------- 雷达图 ----------
  drawRadar(radar) {
    wx.createSelectorQuery()
      .in(this)
      .select('#cvRadar')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const node = res[0].node;
        const w = res[0].width;
        const h = res[0].height;
        if (!w || !h) return;
        let dpr = 2;
        try {
          dpr = wx.getWindowInfo().pixelRatio || 2;
        } catch (e) {
          dpr = 2;
        }
        node.width = Math.round(w * dpr);
        node.height = Math.round(h * dpr);
        const ctx = node.getContext('2d');
        ctx.scale(dpr, dpr);

        const p = PAL[this.data.theme === 'dark' ? 'dark' : 'light'];
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2 + 4;
        const R = Math.min(w, h) / 2 - 34;
        const n = radar.length || 5;
        const pt = (i, r) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        };

        // 网格
        [0.25, 0.5, 0.75, 1].forEach((k) => {
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const [x, y] = pt(i, R * k);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = p.grid;
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        // 轴线
        for (let i = 0; i < n; i++) {
          const [x, y] = pt(i, R);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(x, y);
          ctx.strokeStyle = p.grid;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 数据面
        ctx.beginPath();
        radar.forEach((d, i) => {
          const [x, y] = pt(i, (R * Math.max(d.value, 3)) / 100);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = p.fill;
        ctx.fill();
        ctx.strokeStyle = p.primary;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 顶点
        radar.forEach((d, i) => {
          const [x, y] = pt(i, (R * Math.max(d.value, 3)) / 100);
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fillStyle = p.primary;
          ctx.fill();
        });

        // 标签
        ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
        ctx.fillStyle = p.ink3;
        ctx.textBaseline = 'middle';
        radar.forEach((d, i) => {
          const [x, y] = pt(i, R + 18);
          ctx.textAlign = Math.abs(x - cx) < 6 ? 'center' : x > cx ? 'left' : 'right';
          ctx.fillText(d.name, x, y);
        });
      });
  },

  // ---------- 昵称 / 头像（微信官方「头像昵称填写」） ----------
  openNick() {
    const acc = app.account();
    this.setData({ nOpen: true, nVal: this.data.nickname, nAvatar: store.getAvatar(acc) });
  },

  closeNick() {
    this.setData({ nOpen: false });
  },

  onNick(e) {
    this.setData({ nVal: e.detail.value });
  },

  // chooseAvatar 回调：拿到的是临时路径，重启即失效，
  // 必须拷进用户目录（USER_DATA_PATH）才能长期用
  onChooseAvatar(e) {
    const tmp = (e.detail && e.detail.avatarUrl) || '';
    if (!tmp) return;
    try {
      const fs = wx.getFileSystemManager();
      const dir = wx.env.USER_DATA_PATH;
      const dest = dir + '/avatar.jpg';
      fs.copyFile({
        srcPath: tmp,
        destPath: dest,
        success: () => this.setData({ nAvatar: dest }),
        // 拷贝失败也先展示临时路径，别让点击没反应
        fail: () => this.setData({ nAvatar: tmp }),
      });
    } catch (err) {
      this.setData({ nAvatar: tmp });
    }
  },

  saveNick() {
    const acc = app.account();
    store.setNickname(acc, this.data.nVal);
    if (this.data.nAvatar) store.setAvatar(acc, this.data.nAvatar);
    util.toast('资料已更新');
    this.setData({ nOpen: false });
    this.refresh();
  },

  // ---------- 深色模式 ----------
  toggleDark() {
    const next = this.data.dark ? 'light' : 'dark';
    const acc = app.account();
    store.setTheme(acc, next);
    app.setTheme(next);
    this.setData({ theme: next, dark: next === 'dark' });
    util.applyTheme(next);
    util.setTabBar(this, 4, next);
    setTimeout(() => this.drawRadar(this.data.radar), 60);
  },

  // ---------- 跳转 ----------
  go(e) {
    const k = e.currentTarget.dataset.k;
    if (k === 'records') return wx.navigateTo({ url: '/pages/records/records' });
    if (k === 'mistakes') return wx.navigateTo({ url: '/pages/mistakes/mistakes' });
    if (k === 'quiz') return wx.navigateTo({ url: '/pages/quiz/quiz' });
    if (k === 'tutor') return wx.navigateTo({ url: '/pages/tutor/tutor' });
    if (k === 'fav') {
      app.globalData.ctx = { favOnly: true };
      // 用 crossTab 而不直接 switchTab：这里留一条来源，公式库顶部才有「返回我的」
      return util.crossTab(3, { hint: '只看收藏' });
    }
    if (k === 'login') return wx.navigateTo({ url: '/pages/login/login' });
  },

  // ---------- 数据备份 ----------
  exportData() {
    const acc = app.account();
    const payload = store.exportAll(acc);
    const txt = JSON.stringify(payload);
    wx.setClipboardData({
      data: txt,
      success: () => {
        wx.showModal({
          title: '已复制备份到剪贴板',
          content: '共 ' + txt.length + ' 字符。请粘贴到备忘录或聊天窗口保存，导入时整段复制回来即可。',
          showCancel: false,
          confirmText: '知道了',
        });
      },
    });
  },

  importData() {
    wx.getClipboardData({
      success: (res) => {
        let payload = null;
        try {
          payload = JSON.parse(res.data);
        } catch (e) {
          payload = null;
        }
        if (!payload) {
          util.toast('剪贴板里没有可用的备份');
          return;
        }
        const r = store.importAll(app.account(), payload);
        util.toast(r.msg);
        if (r.ok) this.refresh();
      },
      fail: () => util.toast('读取剪贴板失败'),
    });
  },

  // 把本机残留的游客记录并进当前账号。
  // 场景：微信一键登录时点了「不用」，那些记录既不在当前账号里、也再没有入口能看到。
  mergeGuest() {
    const acc = app.account();
    const n = store.guestCount(store.GUEST);
    if (!n) {
      util.toast('没有游客记录');
      this.refresh();
      return;
    }
    wx.showModal({
      title: '并入游客记录',
      content:
        '本机还有 ' + n + ' 项游客学习记录，可以并到当前账号下。已有的学习数据不会被覆盖，同一条记录只算一次。\n\n并完后游客身份会清空。',
      confirmText: '并入',
      confirmColor: '#F2694B',
      success: (res) => {
        if (!res.confirm) return;
        const r = store.mergeGuestInto(acc);
        util.toast(r.msg);
        this.refresh();
        // 本机数据变了要立刻推一次，否则云端还是旧的，换设备拉不回来
        if (r.ok && r.count) {
          sync.pushNow(acc).then((x) => {
            if (!x.ok && !x.off) util.toast('云端未同步，联网后点「立即同步」');
          });
        }
      },
    });
  },

  clearData() {
    // 云同步开着时云端也会被覆盖空，这一点必须提前说，否则用户以为只清本机
    const on = cloud.available();
    wx.showModal({
      title: '清空学习数据',
      content:
        '将清除已学标记、收藏、笔记、记录、错题与答题统计。账号本身与主题设置会保留，此操作不可恢复。' +
        (on ? '\n\n云端备份会一并清空，其他设备下次同步也会变空。' : ''),
      confirmText: '确认清空',
      confirmColor: '#F2694B',
      success: (res) => {
        if (!res.confirm) return;
        store.clearStudy(app.account());
        util.toast('学习数据已清空');
        this.refresh();
        // 立刻把空档案推上去：只靠 2s 防抖的话，离线时云端还留着旧数据，
        // 下次同步 mergeInto 会把旧数据原样拉回来，变成"清了又回来"
        sync.pushNow(app.account()).then((r) => {
          if (!r.ok && !r.off) util.toast('云端未同步，联网后点「立即同步」');
        });
      },
    });
  },

  logout() {
    const wxAcc = this.data.isWx;
    wx.showModal({
      title: '退出登录',
      content: wxAcc
        ? '退出后回到游客模式，学习数据仍保留在本机，重新点「微信一键登录」即可继续。'
        : '退出后回到游客模式，学习数据仍保留在本机，重新登录同一账号即可继续。',
      confirmText: '退出',
      confirmColor: '#F2694B',
      success: (res) => {
        if (!res.confirm) return;
        // 退出前把最后状态推一次：2s 防抖窗口内的改动否则只留在本机，
        // 换设备登录时看不到（游客不推云，所以只对登录态做）
        if (!this.data.isGuest) sync.pushNow(app.account());
        // 必须清掉会话，否则下次启动 restoreSession() 会把人又登回去
        auth.logout();
        app.afterLogout();
        util.toast('已退出登录');
        this.refresh();
      },
    });
  },

  onShareAppMessage() {
    return { title: '信号与系统 Pro · 我的学习档案', path: '/pages/index/index' };
  },
});
