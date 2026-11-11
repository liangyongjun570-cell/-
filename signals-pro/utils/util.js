function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function nowHM() {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

// 问候语：按时间段
function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了，注意休息';
  if (h < 11) return '早上好，同学';
  if (h < 14) return '中午好，同学';
  if (h < 18) return '下午好，同学';
  return '晚上好，同学';
}

function dateLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!m || !d) return iso;
  return m.replace(/^0/, '') + '月' + d.replace(/^0/, '') + '日';
}

function daysBetween(list) {
  if (!list || !list.length) return 0;
  const set = {};
  list.forEach((d) => {
    set[d] = true;
  });
  return Object.keys(set).length;
}

function toast(title, icon) {
  try {
    wx.showToast({ title: String(title || ''), icon: icon || 'none', duration: 1600 });
  } catch (e) {}
}

function vibrate() {
  try {
    wx.vibrateShort({ type: 'light' });
  } catch (e) {}
}

// 统一处理导航栏 / 背景色随主题切换
function applyTheme(theme) {
  const dark = theme === 'dark';
  try {
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#17120F' : '#FFF8F2',
      animation: { duration: 150 },
    });
  } catch (e) {}
  try {
    wx.setBackgroundColor({
      backgroundColor: dark ? '#17120F' : '#FFF8F2',
      backgroundColorTop: dark ? '#17120F' : '#FFF8F2',
      backgroundColorBottom: dark ? '#17120F' : '#FFF8F2',
    });
  } catch (e) {}
}

// ---------- 跨 tab 跳转的返回机制 ----------
// switchTab 会清空页面栈，跳过去之后没有 navigateBack 可用，用户只能自己点底部
// tabbar 找回去。带语境跳转时这尤其糟：「我的 → 收藏」跳到公式库，页面停在只
// 剩 1 条的被筛状态，看起来像走进死路。
// 做法：跳转前把来源 tab 记在 globalData.back，目标页 onShow 读出来显示一条返回条。
// 不用页面栈是因为 switchTab 之后栈里只剩目标页，拿不到上一个 tab。
const TABS = [
  { path: '/pages/index/index', label: '首页' },
  { path: '/pages/chapters/chapters', label: '章节' },
  { path: '/pages/lab/lab', label: '实验室' },
  { path: '/pages/formulas/formulas', label: '公式库' },
  { path: '/pages/me/me', label: '我的' },
];

// 当前停在哪个 tab：各 tab 页 onShow 都会调 setTabBar，在那里顺手记下
function currentTab() {
  try {
    const app = getApp();
    const g = (app && app.globalData) || {};
    return typeof g.tabNow === 'number' ? g.tabNow : -1;
  } catch (e) {
    return -1;
  }
}

// 推断"从哪来"：优先看页面栈，栈里找最靠栈底的 tab 页 —— 那是点返回条时
// 真正能回去的位置（switchTab 之后栈里只剩目标页，所以必须在跳之前读）。
// 栈里没有 tab 页（异常情况）就退回 tabNow，最后退回"不显示"。
function detectFrom() {
  try {
    const pages = getCurrentPages();
    if (pages && pages.length) {
      for (let i = 0; i < pages.length; i++) {
        const p = '/' + (pages[i].route || '');
        for (let j = 0; j < TABS.length; j++) {
          if (TABS[j].path === p) return j;
        }
      }
    }
  } catch (e) {}
  return currentTab();
}

// 跳 tab 页请一律走这里（opt.hint 是返回条右侧的说明，比如「只看收藏」）。
//
// 时序注意：wx.switchTab 之后是「源页 onHide -> 目标页 onShow」。所以来源必须在
// 目标页 onShow 里读完就清，不能放进 onHide 清——那样会在目标页读到之前就被删掉，
// 返回条永远不显示（这就是第一版的 bug）。
function crossTab(index, opt) {
  const to = TABS[index];
  if (!to) return;
  const from = detectFrom();
  const src = TABS[from];
  try {
    const app = getApp();
    if (app && app.globalData) {
      // 在 tabbar 上点当前项是同 tab 内的事，不该显示「返回自己」
      app.globalData.back = src && from !== index
        ? { index: from, label: src.label, hint: (opt && opt.hint) || '' }
        : null;
    }
  } catch (e) {}
  wx.switchTab({ url: to.path });
}

// 目标页 onShow 调用，返回 null 表示不是跨 tab 进来的
function backInfo() {
  try {
    const app = getApp();
    return ((app && app.globalData) || {}).back || null;
  } catch (e) {
    return null;
  }
}

function clearBack() {
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.back = null;
  } catch (e) {}
}

// 点返回条：切回来源 tab
function goBackTab() {
  const b = backInfo();
  clearBack();
  if (!b) return false;
  wx.switchTab({ url: TABS[b.index].path });
  return true;
}

function setTabBar(page, index, theme) {
  // 记下当前 tab，crossTab 靠它推断来源（必须放在可能 return 的分支之前）
  try {
    const app = getApp();
    if (app && app.globalData) app.globalData.tabNow = index;
  } catch (e) {}
  if (!page || typeof page.getTabBar !== 'function') return;
  const bar = page.getTabBar();
  if (!bar) return;
  bar.setData({ selected: index, theme: theme || 'light' });
}

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha == null ? 1 : alpha) + ')';
}

// 复制文本到剪贴板（统一提示）
function copy(text, tip) {
  const s = String(text || '');
  if (!s) {
    toast('没有可复制的内容');
    return;
  }
  try {
    wx.setClipboardData({
      data: s,
      success() {
        toast(tip || '已复制');
      },
      fail() {
        toast('复制失败，请长按选择');
      },
    });
  } catch (e) {
    toast('复制失败');
  }
}

module.exports = {
  pad,
  today,
  nowHM,
  greeting,
  dateLabel,
  daysBetween,
  toast,
  vibrate,
  copy,
  applyTheme,
  setTabBar,
  crossTab,
  backInfo,
  clearBack,
  goBackTab,
  clamp,
  hexToRgba,
};
