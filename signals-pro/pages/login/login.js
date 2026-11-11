const app = require('../../utils/appref');
const auth = require('../../utils/auth');
const store = require('../../utils/store');
const cloud = require('../../utils/cloud');
const util = require('../../utils/util');

// 条款正文放在页面内，避免为两段文字新建页面（也省包体）
const DOCS = {
  terms: {
    title: '用户协议',
    body:
      '一、服务说明\n' +
      '「工程信号与系统 Pro」是一款面向信号与系统课程的学习辅助工具，提供知识专题、公式速查、仿真实验、智能题库、答疑助手与对战擂台等功能。\n\n' +
      '二、账号说明\n' +
      '1. 本应用的账号为「本机账号」，注册信息只写入当前设备的本地存储，不会上传到任何服务器。\n' +
      '2. 同一台设备可以注册多个账号，各账号的学习数据相互隔离。\n' +
      '3. 由于没有服务端，账号密码无法通过手机号或邮箱找回；注册时设置的密保问题是唯一的找回途径。\n\n' +
      '三、数据与备份\n' +
      '1. 学习进度、错题、笔记、收藏、对战段位等数据均保存在本机。\n' +
      '2. 清理小程序缓存、卸载重装或更换设备可能导致数据丢失，建议在「我的 — 数据备份」中定期导出。\n' +
      '3. 若管理员开通了云开发环境，数据会额外同步一份到云端用于跨设备恢复，此时可在「我的」中查看同步状态。\n\n' +
      '四、使用规范\n' +
      '请勿利用本应用从事任何违反法律法规或侵害他人权益的行为。题库内容仅供课程学习参考，不构成任何考试承诺。\n\n' +
      '五、免责\n' +
      '仿真实验结果基于理想化数学模型，与真实电路/器件存在偏差，请勿直接用于工程设计与安全攸关场景。',
  },
  privacy: {
    title: '隐私说明',
    body:
      '我们只收集为了让你正常使用本应用所必需的最少信息，并且优先保存在你自己的手机上。\n\n' +
      '一、我们保存什么\n' +
      '· 你注册的账号名（你自己设定）与密码散列值；密码本身不会被保存。\n' +
      '· 你的学习记录：已学专题、收藏、笔记、答题统计、错题、对战段位。\n' +
      '· 你主动设置的昵称与主题偏好。\n\n' +
      '二、我们不收集什么\n' +
      '· 不读取你的微信昵称、头像、手机号、通讯录。\n' +
      '· 不获取你的地理位置。\n' +
      '· 不做任何广告投放与用户画像。\n\n' +
      '三、会用到系统权限的地方\n' +
      '· 相册（仅写入）：保存对战战报图片时使用，由你点击「保存」才会触发。\n' +
      '· 摄像头 / 相册（选择）：拍照识题、手写批改时使用。云同步开启时图片会短暂上传到微信云开发做文字识别，识别完成后立即删除；云同步关闭则完全在本机处理。\n' +
      '· 麦克风：实验室的录音频谱功能使用，音频不会离开设备。\n' +
      '以上权限都可以在使用时拒绝，拒绝后对应功能不可用，但不影响其他功能。\n\n' +
      '四、数据如何流转\n' +
      '默认情况下，所有数据只存在本机，不产生任何网络请求。仅当你所在的版本开通了云开发，才会把学习档案同步到对应云环境，用于换设备后恢复。\n\n' +
      '五、你的控制权\n' +
      '你可以在「我的」中随时清空学习数据、退出登录或删除账号信息；这些操作立即生效且不可撤销。',
  },
};

function strengthOf(p) {
  if (!p) return { lv: 0, text: '' };
  let kinds = 0;
  if (/[a-z]/.test(p)) kinds++;
  if (/[A-Z]/.test(p)) kinds++;
  if (/[0-9]/.test(p)) kinds++;
  if (/[^a-zA-Z0-9]/.test(p)) kinds++;
  const long = p.length >= 8;
  let lv = 1;
  if (long && kinds >= 2) lv = 2;
  if (long && kinds >= 3 && p.length >= 10) lv = 3;
  return { lv, text: ['', '强度：偏弱', '强度：一般', '强度：很强'][lv] };
}

Page({
  data: {
    theme: 'light',
    mode: 'login', // login | register | reset
    account: '',
    pwd: '',
    pwd2: '',
    showPwd: false,
    showPwd2: false,
    focus: '',
    bad: {},
    err: '',
    busy: false,
    busyText: '',
    shake: false,
    remember: true,
    agree: false,
    strength: { lv: 0, text: '' },
    last: '',
    // 微信一键登录
    wxBusy: false,
    wxReady: false,
    wxHint: '',
    // 密保（注册时选填）
    sqOpen: false,
    sqList: auth.SECURITY_QUESTIONS,
    sqIndex: 0,
    sqAnswer: '',
    // 找回密码
    resetStep: 1,
    resetAcc: '',
    resetQ: '',
    resetAnswer: '',
    resetPwd1: '',
    resetPwd2: '',
    resetShow: false,
    // 条款弹层
    docOpen: false,
    docTitle: '',
    docBody: '',
  },

  onLoad() {
    const theme = app.globalData.theme || 'light';
    util.applyTheme(theme);
    if (app.globalData.user) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }
    const last = auth.lastAccount();
    // 每次进登录页都重新探一次云环境：刚部署完云函数不必重启小程序
    let ready = false;
    try {
      cloud.reset();
      ready = cloud.available();
    } catch (e) {
      ready = false;
    }
    this.setData({
      theme,
      last,
      account: auth.isWx(last) ? '' : last,
      wxReady: ready,
      wxHint: ready ? '首次登录自动创建账号，学习记录同步到云端' : this._offHint(),
    });
    // init 过不等于云端真能用：测试号就是 init 成功、调用全挂。
    // 所以异步再打一次真调用，确认后才让按钮保持绿色。
    if (ready) this._probe();
  },

  // 云端真实可用性探活，失败就把按钮切成不可用态并给出具体原因
  _probe() {
    cloud
      .probe()
      .then((ok) => {
        if (this.data.wxReady === !!ok) return;
        this.setData({
          wxReady: !!ok,
          wxHint: ok ? '首次登录自动创建账号，学习记录同步到云端' : this._offHint(),
        });
      })
      .catch(() => {
        this.setData({ wxReady: false, wxHint: this._offHint() });
      });
  },

  // 按具体失败原因给提示，别让用户面对一句"云开发未就绪"猜
  _offHint() {
    const r = cloud.reason();
    if (r === 'test') return '测试号不支持云开发 · 点这里看怎么换 AppID';
    if (r === 'no-fn') return '云函数未部署 · 点这里看步骤';
    if (r === 'no-env') return '云开发环境未开通 · 点这里看步骤';
    if (r === 'perm') return '没有云开发权限 · 点这里看步骤';
    if (r === 'net') return '云服务连接失败 · 点这里看步骤';
    return '云开发未就绪 · 开通后可跨设备同步（点这里看步骤）';
  },

  onShow() {
    const theme = app.globalData.theme || 'light';
    this.setData({ theme });
    util.applyTheme(theme);
  },

  onUnload() {
    this.clearTimers();
  },

  onHide() {
    this.clearTimers();
  },

  clearTimers() {
    if (this._t1) clearTimeout(this._t1);
    if (this._t2) clearTimeout(this._t2);
    if (this._t3) clearTimeout(this._t3);
    this._t1 = this._t2 = this._t3 = null;
  },

  // ---------- 输入 ----------
  onAccount(e) {
    const v = e.detail.value;
    this.setData({ account: v, err: '', 'bad.account': '', 'bad.pwd': '' });
  },
  onPwd(e) {
    const v = e.detail.value;
    this.setData({
      pwd: v,
      err: '',
      'bad.pwd': '',
      strength: this.data.mode === 'register' ? strengthOf(v) : this.data.strength,
    });
  },
  onPwd2(e) {
    this.setData({ pwd2: e.detail.value, err: '', 'bad.pwd2': '' });
  },
  onFocus(e) {
    this.setData({ focus: e.currentTarget.dataset.k || '' });
  },
  onBlur() {
    this.setData({ focus: '' });
  },
  clearAcc() {
    this.setData({ account: '', 'bad.account': '', err: '' });
  },
  togglePwd() {
    this.setData({ showPwd: !this.data.showPwd });
  },
  togglePwd2() {
    this.setData({ showPwd2: !this.data.showPwd2 });
  },
  toggleRemember() {
    this.setData({ remember: !this.data.remember });
  },
  toggleAgree() {
    this.setData({ agree: !this.data.agree, err: '' });
  },

  // 键盘「下一项 / 完成」：按当前所在字段往下推，最后一项直接提交
  onConfirm(e) {
    const k = e.currentTarget.dataset.k;
    const mode = this.data.mode;
    if (mode === 'reset') return this.submitReset();
    if (k === 'account') {
      this.setData({ focus: '' });
      this._t1 = setTimeout(() => this.setData({ focus: 'pwd' }), 60);
      return;
    }
    if (mode === 'register' && k === 'pwd') {
      this.setData({ focus: '' });
      this._t2 = setTimeout(() => this.setData({ focus: 'pwd2' }), 60);
      return;
    }
    this.submit();
  },
  focusPwd() {
    this.setData({ focus: '' });
    this._t1 = setTimeout(() => this.setData({ focus: 'pwd' }), 60);
  },

  switchMode(e) {
    const m = e.currentTarget.dataset.m;
    if (!m || m === this.data.mode) return;
    this.setData({
      mode: m,
      err: '',
      bad: {},
      pwd: '',
      pwd2: '',
      showPwd: false,
      showPwd2: false,
      focus: '',
      strength: { lv: 0, text: '' },
      resetStep: 1,
      resetAcc: '',
      resetQ: '',
      resetAnswer: '',
      resetPwd1: '',
      resetPwd2: '',
    });
  },

  // ---------- 密保 ----------
  toggleSq() {
    this.setData({ sqOpen: !this.data.sqOpen, err: '' });
  },
  onSq(e) {
    this.setData({ sqIndex: Number(e.detail.value) || 0 });
  },
  onSqAnswer(e) {
    this.setData({ sqAnswer: e.detail.value });
  },

  // ---------- 条款 ----------
  openDoc(e) {
    const k = e.currentTarget.dataset.k;
    const d = DOCS[k];
    if (!d) return;
    this.setData({ docOpen: true, docTitle: d.title, docBody: d.body });
  },
  closeDoc() {
    this.setData({ docOpen: false });
  },
  noop() {},

  // ---------- 找回密码 ----------
  goReset() {
    this.setData({
      mode: 'reset',
      resetStep: 1,
      resetAcc: this.data.account,
      resetQ: '',
      resetAnswer: '',
      resetPwd1: '',
      resetPwd2: '',
      resetShow: false,
      err: '',
      bad: {},
      focus: '',
    });
  },
  backToLogin() {
    this.setData({
      mode: 'login',
      resetStep: 1,
      resetQ: '',
      resetAnswer: '',
      resetPwd1: '',
      resetPwd2: '',
      err: '',
      bad: {},
      focus: '',
    });
  },
  onResetAcc(e) {
    this.setData({ resetAcc: e.detail.value, err: '', 'bad.account': '' });
  },
  onResetAnswer(e) {
    this.setData({ resetAnswer: e.detail.value, err: '', 'bad.answer': '' });
  },
  onResetPwd1(e) {
    this.setData({ resetPwd1: e.detail.value, err: '', 'bad.pwd': '' });
  },
  onResetPwd2(e) {
    this.setData({ resetPwd2: e.detail.value, err: '', 'bad.pwd2': '' });
  },
  toggleResetShow() {
    this.setData({ resetShow: !this.data.resetShow });
  },

  // 第一步：确认账号与密保可用性
  resetQuery() {
    const acc = String(this.data.resetAcc || '').trim();
    if (!acc) return this.fail('请输入要找回的账号', { account: '请输入账号' });
    const s = auth.securityOf(acc);
    if (!s.exists) return this.fail('本机没有这个账号，请检查拼写或直接注册');
    if (!s.hasSq) {
      return this.fail('这个账号注册时没有设置密保问题，本机没有其他找回途径。可换其他账号登录，或用游客模式继续学习。');
    }
    this.setData({
      resetStep: 2,
      resetQ: s.sqText,
      account: auth.normAccount(acc),
      err: '',
      bad: {},
      focus: '',
    });
  },

  // 第二步：校验答案并重置
  submitReset() {
    if (this.data.busy) return;
    const { resetAcc, resetQ, resetAnswer, resetPwd1, resetPwd2 } = this.data;
    if (!resetAnswer.trim()) return this.fail('请填写密保答案', { answer: '请填写答案' });
    if (!resetPwd1) return this.fail('请设置新密码', { pwd: '请输入新密码' });
    if (!auth.validatePwd(resetPwd1)) {
      return this.fail('密码需 8–32 位，同时包含字母和数字，且不含空格', { pwd: '格式不符合要求' });
    }
    if (resetPwd1 !== resetPwd2) return this.fail('两次输入的新密码不一致', { pwd2: '两次输入不一致' });

    this.setData({ busy: true, busyText: '正在重置…' });
    this._t1 = setTimeout(() => {
      const r = auth.resetPwd(resetAcc, resetAnswer, resetPwd1, resetPwd2);
      if (!r.ok) {
        this.setData({ busy: false, busyText: '', err: r.msg });
        this.warn();
        return;
      }
      const acc = auth.normAccount(resetAcc);
      this.setData({
        busy: false,
        busyText: '',
        mode: 'login',
        account: acc,
        pwd: '',
        pwd2: '',
        resetStep: 1,
        strength: { lv: 0, text: '' },
        err: '',
        bad: {},
        last: acc,
      });
      wx.showToast({ title: '密码已重置', icon: 'success' });
      this._t2 = setTimeout(() => this.setData({ focus: 'pwd' }), 320);
    }, 300);
  },

  // ---------- 登录 / 注册 ----------
  submit() {
    if (this.data.busy) return;
    const mode = this.data.mode;
    if (mode === 'reset') return this.submitReset();

    const accRaw = String(this.data.account || '').trim();
    const pwd = this.data.pwd;
    const pwd2 = this.data.pwd2;

    if (!accRaw) return this.fail('请输入账号', { account: '请输入账号' });
    if (mode === 'register' && !auth.validateAccount(accRaw)) {
      return this.fail('账号需为 4–20 位字母、数字或下划线', { account: '仅字母 / 数字 / 下划线，4–20 位' });
    }
    if (!pwd) return this.fail('请输入密码', { pwd: '请输入密码' });
    if (mode === 'register' && !auth.validatePwd(pwd)) {
      return this.fail('密码需 8–32 位，同时包含字母和数字', { pwd: '至少 8 位，含字母和数字' });
    }
    if (mode === 'register') {
      if (!pwd2) return this.fail('请再次输入密码', { pwd2: '请再次输入密码' });
      if (pwd2 !== pwd) return this.fail('两次输入的密码不一致', { pwd2: '两次输入不一致' });
      if (!this.data.agree) return this.fail('请先阅读并勾选同意《用户协议》与《隐私说明》');
      if (this.data.sqOpen && !String(this.data.sqAnswer || '').trim()) {
        return this.fail('密保问题已展开，请填写答案或收起后再继续');
      }
    }

    this.setData({
      busy: true,
      busyText: mode === 'login' ? '正在登录…' : '正在注册…',
      err: '',
      bad: {},
      focus: '',
    });

    this._t1 = setTimeout(() => {
      let r;
      if (mode === 'register') {
        r = auth.register(
          accRaw,
          pwd,
          pwd2,
          this.data.sqOpen ? { sq: this.data.sqIndex, sa: this.data.sqAnswer } : null
        );
        if (!r.ok) return this.stopWithError(r.msg);
        r = auth.login(accRaw, pwd, { remember: this.data.remember });
      } else {
        r = auth.login(accRaw, pwd, { remember: this.data.remember });
      }
      if (!r.ok) return this.stopWithError(r.msg);
      this.done(r.user, mode === 'login' ? '登录成功' : '注册成功');
    }, 280);
  },

  stopWithError(msg) {
    this.setData({ busy: false, busyText: '', err: msg });
    this.warn();
  },

  done(user, title) {
    app.afterLogin(user);
    this.setData({ busy: false, busyText: '', last: user.account, focus: '' });
    wx.showToast({ title: title, icon: 'success', duration: 1000 });
    this._t2 = setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 560);
  },

  // 表单校验失败：抖动 + 轻震动
  fail(msg, bad) {
    this.setData({ err: msg, bad: bad || {}, shake: true });
    this.warn();
    this._t3 = setTimeout(() => this.setData({ shake: false }), 420);
  },

  warn() {
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (e) {}
  },

  // ---------- 微信一键登录 ----------
  // 微信不允许静默拿昵称头像，但可以静默拿 OPENID。
  // 这里的"一键"= wx.login 的云端身份（云函数 getWXContext），不弹任何授权框。
  wxLogin() {
    if (this.data.busy || this.data.wxBusy) return;
    if (!this.data.wxReady && !cloud.available()) return this.wxHelp();

    this.setData({ wxBusy: true, err: '', bad: {}, focus: '' });

    cloud
      .login(true)
      .then((openid) => {
        if (!openid) throw new Error('no-openid');
        const acc = auth.wxAccountOf(openid);
        if (!acc) throw new Error('bad-openid');
        const r = auth.registerWx(acc);
        if (!r.ok) throw new Error(r.msg);

        // 本机还有游客数据时就问一句要不要并进来。
        // 不限于新账号：上次点了「不用」的，这次登录是补回来的唯一机会，
        // 否则那些记录会永远留在 __guest__ 里，用户再也看不到。
        const n = store.guestCount(store.GUEST);
        if (!n) return this.finishWx(acc, !!r.fresh, false);
        this.askCarry(acc, !!r.fresh, n);
      })
      .catch((e) => {
        this.setData({ wxBusy: false, wxReady: false });
        const msg = e && e.message && e.message !== 'no-openid' && e.message !== 'bad-openid' ? e.message : '';
        if (msg) return this.fail(msg);
        this.wxHelp();
      });
  },

  // 迁移确认。新账号说"带走"，老账号说"补并"，两种情况都不能让用户以为
  // 点「不用」等于删除——数据原地保留，下次登录还会再问。
  askCarry(acc, isNew, n) {
    wx.showModal({
      title: isNew ? '把学习记录一起带走？' : '还有游客记录没并进来',
      content: isNew
        ? '这台设备上还有 ' + n + ' 项游客学习记录，可以一并归到微信账号下。归过去后游客身份就清空了。'
        : '上次没把游客记录带上，本机还留着 ' + n + ' 项。现在可以并进当前账号，已有的学习数据不会被覆盖。',
      confirmText: '一起带走',
      // 不用「不用」：那像是在拒绝一次性的机会。数据其实原地保留，
      // 「我的」页也留了入口，下次登录还会再问。
      cancelText: '稍后再说',
      confirmColor: '#07C160',
      success: (m) => this.finishWx(acc, isNew, !!m.confirm),
      fail: () => this.finishWx(acc, isNew, false),
    });
  },

  finishWx(acc, isNew, carryGuest) {
    // 迁移必须发生在 afterLogin 触发同步之前，否则推上云的还是空档案
    let carried = 0;
    if (carryGuest) {
      try {
        const m = store.mergeGuestInto(acc);
        carried = m.count || 0;
      } catch (e) {}
    }
    const r = auth.loginWx(acc, { remember: this.data.remember });
    if (!r.ok) {
      this.setData({ wxBusy: false });
      return this.fail(r.msg);
    }
    // 没昵称时给一个能区分的默认名。
    // 否则云端会兜底成统一的"同学"，排行榜上所有人都重名，分不出谁是谁。
    try {
      if (!store.getNickname(acc)) {
        store.setNickname(acc, '微信用户' + String(acc).slice(-4));
      }
    } catch (e) {}
    app.afterLogin(r.user);
    this.setData({ wxBusy: false, last: acc, account: '' });
    // 并进来多少项要说清楚：数字对不上时用户才知道不是"丢了"，是本来就没并。
    // 带 icon 的 toast 只显示 7 个汉字，长文案必须用 icon:'none'。
    if (carried) {
      wx.showToast({ title: '已并入 ' + carried + ' 项游客记录', icon: 'none', duration: 1600 });
    } else {
      wx.showToast({ title: isNew ? '微信账号已创建' : '登录成功', icon: 'success' });
    }
    this._t2 = setTimeout(() => {
      wx.switchTab({ url: '/pages/index/index' });
    }, 560);
  },

  // 云环境没准备好时的说明：给出可操作的步骤，而不是一句"失败"
  wxHelp() {
    this.setData({ wxBusy: false });
    const r = cloud.reason();
    let title = '微信登录暂不可用';
    let body =
      '微信一键登录需要云开发提供身份服务：\n' +
      '① 开发者工具点「云开发」开通环境\n' +
      '② 右键 cloudfunctions/mycloud →「上传并部署」\n' +
      '③ 回到本页再点一次\n\n' +
      '没开通也不影响使用，本机账号功能完全一样。';

    if (r === 'test') {
      title = '当前是测试号，不能使用云开发';
      body =
        '开发者工具把项目当成「测试号」在跑。测试号不支持云开发，所以拿不到微信身份。\n\n' +
        '① 到 mp.weixin.qq.com 注册小程序（个人主体免费），拿到 AppID\n' +
        '② 工具右上角「详情 → 基本信息 → AppID」改成它，重新编译\n' +
        '③ 点「云开发」开通环境，右键 cloudfunctions/mycloud 上传部署\n\n' +
        '不换 AppID 也能用：本机账号注册登录，功能完全一样，只是不能跨设备同步。';
    } else if (r === 'no-env') {
      title = '云开发环境还没开通';
      body =
        '① 开发者工具点「云开发」，按引导开通（免费额度够用）\n' +
        '② 确认它是默认环境，不用改代码\n' +
        '③ 右键 cloudfunctions/mycloud →「上传并部署：云端安装依赖」\n' +
        '④ 回本页再点一次\n\n' +
        '没开通也不影响使用，本机账号功能完全一样。';
    } else if (r === 'no-fn') {
      title = '云函数 mycloud 还没部署';
      body =
        '云环境已就绪，但缺少处理登录的云函数。\n\n' +
        '① 右键 cloudfunctions/mycloud →「上传并部署：云端安装依赖」\n' +
        '② 控制台 → 数据库 → 新建集合 study_profiles\n' +
        '③ 回本页再点一次\n\n' +
        '没部署也不影响使用，本机账号功能完全一样。';
    } else if (r === 'perm') {
      title = '没有云开发权限';
      body =
        '当前微信号不是该小程序的管理员/开发者，或云开发尚未授权。\n\n' +
        '① 到 mp.weixin.qq.com → 管理 → 成员管理，把自己的微信号加为开发者\n' +
        '② 重新打开开发者工具\n\n' +
        '也可以先用本机账号，功能完全一样。';
    }

    wx.showModal({
      title: title,
      content: body,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  guest() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage() {
    return { title: '信号与系统 Pro · 一章一图，把公式画出来', path: '/pages/index/index' };
  },
});
