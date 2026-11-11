// 助教会话存储：多会话 + 历史消息，按账号隔离
// 小程序无 localStorage，统一走 wx.setStorageSync（与 store.js 同源策略）

const store = require('./store');

const PREFIX = 'ssp_chat_';
const MAX_SESSIONS = 30;
const MAX_MSGS = 200;
const MAX_TITLE = 24;

function keyOf(acc) {
  return PREFIX + (acc || store.GUEST);
}

function emptyBox() {
  return { sessions: [], currentId: '' };
}

function load(acc) {
  try {
    const raw = wx.getStorageSync(keyOf(acc));
    if (!raw || typeof raw !== 'object') return emptyBox();
    const sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return {
      sessions: sessions.filter((s) => s && s.id),
      currentId: raw.currentId || '',
    };
  } catch (e) {
    return emptyBox();
  }
}

function save(acc, box) {
  try {
    const sessions = (box.sessions || []).slice(0, MAX_SESSIONS).map((s) => {
      const msgs = (s.msgs || []).slice(-MAX_MSGS);
      return {
        id: s.id,
        title: s.title || '新对话',
        ts: s.ts || Date.now(),
        msgs,
      };
    });
    wx.setStorageSync(keyOf(acc), { sessions, currentId: box.currentId || '' });
    // 助手会话也要进云端档案：延迟 require 避免与 sync -> chat 的循环依赖
    try {
      const sync = require('./sync');
      if (sync && typeof sync.schedule === 'function') sync.schedule(acc);
    } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}

let seq = 0;
function newId() {
  seq += 1;
  return 'c' + Date.now().toString(36) + '_' + seq;
}

function create(acc, title) {
  const box = load(acc);
  const now = Date.now();
  const s = {
    id: newId(),
    title: String(title || '新对话').slice(0, MAX_TITLE),
    ts: now,
    msgs: [],
  };
  box.sessions.unshift(s);
  if (box.sessions.length > MAX_SESSIONS) box.sessions = box.sessions.slice(0, MAX_SESSIONS);
  box.currentId = s.id;
  save(acc, box);
  return s;
}

// 取当前会话；没有就建一个
function current(acc) {
  const box = load(acc);
  let s = null;
  for (let i = 0; i < box.sessions.length; i++) {
    if (box.sessions[i].id === box.currentId) {
      s = box.sessions[i];
      break;
    }
  }
  if (!s) {
    if (box.sessions.length) {
      s = box.sessions[0];
      box.currentId = s.id;
      save(acc, box);
    } else {
      s = create(acc);
    }
  }
  return s;
}

function select(acc, id) {
  const box = load(acc);
  let hit = null;
  box.sessions.forEach((s) => {
    if (s.id === id) hit = s;
  });
  if (!hit) return null;
  box.currentId = id;
  save(acc, box);
  return hit;
}

function append(acc, sid, msg) {
  const box = load(acc);
  let target = null;
  box.sessions.forEach((s) => {
    if (s.id === sid) target = s;
  });
  if (!target) target = box.sessions[0];
  if (!target) {
    target = create(acc);
    const box2 = load(acc);
    box2.sessions.forEach((s) => {
      if (s.id === target.id) s.msgs.push(msg);
    });
    save(acc, box2);
    return target;
  }
  target.msgs.push(msg);
  if (target.msgs.length > MAX_MSGS) target.msgs = target.msgs.slice(-MAX_MSGS);
  target.ts = Date.now();
  // 首条用户提问自动作标题
  if (msg.role === 'user' && (!target.title || target.title === '新对话')) {
    target.title = String(msg.text || '').replace(/\s+/g, ' ').slice(0, MAX_TITLE) || '新对话';
  }
  box.currentId = target.id;
  save(acc, box);
  return target;
}

// 用新内容替换最后一条助手消息（切换回答风格时用）
function replaceLast(acc, sid, msg) {
  const box = load(acc);
  let target = null;
  box.sessions.forEach((s) => {
    if (s.id === sid) target = s;
  });
  if (!target) return null;
  for (let i = target.msgs.length - 1; i >= 0; i--) {
    if (target.msgs[i].role === 'assistant') {
      target.msgs[i] = msg;
      break;
    }
  }
  target.ts = Date.now();
  save(acc, box);
  return target;
}

function remove(acc, id) {
  const box = load(acc);
  box.sessions = box.sessions.filter((s) => s.id !== id);
  if (box.currentId === id) {
    box.currentId = box.sessions.length ? box.sessions[0].id : '';
  }
  save(acc, box);
  return box.sessions;
}

function clearAll(acc) {
  try {
    wx.removeStorageSync(keyOf(acc));
  } catch (e) {}
  return emptyBox();
}

function list(acc) {
  const box = load(acc);
  return box.sessions.map((s) => ({
    id: s.id,
    title: s.title || '新对话',
    ts: s.ts || 0,
    count: (s.msgs || []).length,
    current: s.id === box.currentId,
    last: (s.msgs || []).length ? (s.msgs[s.msgs.length - 1].text || '') : '',
  }));
}

module.exports = {
  PREFIX,
  load,
  save,
  create,
  current,
  select,
  append,
  replaceLast,
  remove,
  clearAll,
  list,
  keyOf,
};
