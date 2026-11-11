// 惰性获取 App 实例：避免页面模块加载早于 App 注册时 getApp() 返回 undefined
// 同时把全局数据读写都包一层，任何取不到的情况都退化为安全默认值，绝不让页面启动抛错。
const GUEST = '__guest__';

function instance() {
  try {
    return getApp() || null;
  } catch (e) {
    return null;
  }
}

// 兜底用的稳定对象：即使 getApp() 不可用，写 globalData 也不会丢失
const SAFE = { theme: 'light', user: null, ctx: null, statusBarHeight: 20, appName: '' };

const app = {
  get globalData() {
    const a = instance();
    if (a && a.globalData) return a.globalData;
    return SAFE;
  },

  account() {
    const a = instance();
    if (a && typeof a.account === 'function') {
      try {
        return a.account() || GUEST;
      } catch (e) {
        return GUEST;
      }
    }
    return GUEST;
  },

  setTheme(theme) {
    const a = instance();
    if (a && typeof a.setTheme === 'function') {
      try {
        a.setTheme(theme);
      } catch (e) {}
    }
  },

  afterLogin(user) {
    const a = instance();
    if (a && typeof a.afterLogin === 'function') {
      try {
        a.afterLogin(user);
      } catch (e) {}
    }
  },

  afterLogout() {
    const a = instance();
    if (a && typeof a.afterLogout === 'function') {
      try {
        a.afterLogout();
      } catch (e) {}
    }
  },
};

module.exports = app;
