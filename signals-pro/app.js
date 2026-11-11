const auth = require('./utils/auth');
const store = require('./utils/store');
const cloud = require('./utils/cloud');
const sync = require('./utils/sync');

App({
  globalData: {
    appName: '工程信号与系统 Pro',
    theme: 'light',
    user: null,
    statusBarHeight: 20,
    // 页面间一次性上下文（如"从搜索进入专题"）
    ctx: null,
  },

  onLaunch() {
    try {
      const info = wx.getSystemInfoSync();
      this.globalData.statusBarHeight = info.statusBarHeight || 20;
    } catch (e) {
      this.globalData.statusBarHeight = 20;
    }
    // 本机会话恢复：有有效会话则直接恢复该账号数据，否则以游客身份进入
    const session = auth.restoreSession();
    this.globalData.user = session || null;
    const acc = session ? session.account : store.GUEST;
    this.globalData.theme = store.getTheme(acc) || 'light';

    // 云开发可用时，启动后静默拉一次档案（换手机登录同一个微信即可接着学）。
    // 未开通云开发时 sync.syncAll 会立刻返回 { off:true }，不产生任何网络请求。
    setTimeout(() => {
      try {
        sync.syncAll(acc);
      } catch (e) {}
    }, 600);
  },

  afterLogin(user) {
    this.globalData.user = user;
    this.globalData.theme = store.getTheme(user.account) || 'light';
    if (cloud.available()) {
      try {
        sync.syncAll(user.account);
      } catch (e) {}
    }
  },

  afterLogout() {
    this.globalData.user = null;
    this.globalData.theme = store.getTheme(store.GUEST) || 'light';
  },

  setTheme(theme) {
    this.globalData.theme = theme;
    store.setTheme(this.account(), theme);
  },

  account() {
    return (this.globalData.user && this.globalData.user.account) || store.GUEST;
  },
});
