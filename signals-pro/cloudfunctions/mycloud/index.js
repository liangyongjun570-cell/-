// 云函数 mycloud —— 免登录身份 + 学习档案读写 + 排行榜 + 教材切片检索
//
// 部署：微信开发者工具 -> 右键 cloudfunctions/mycloud -> 上传并部署（云端安装依赖）
// 集合：study_profiles（学习档案 / 排行榜）、textbook_chunks（教材知识切片，可选）
//
// 权限建议：两个集合都设为「仅创建者可读写」。
// 本函数用服务端身份读写，不受该权限限制；客户端只用 rank 这一个只读出口。

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const COL_PROFILE = 'study_profiles';
const COL_CHUNK = 'textbook_chunks';
const COL_ROOM = 'pk_rooms';

const LIMITS = {
  notes: 120,
  wrong: 300,
  learned: 400,
  visits: 400,
  chats: 10,
  chatMsgs: 30,
  text: 600,
  title: 40,
};

function arr(a, max) {
  if (!Array.isArray(a)) return [];
  return a.slice(0, max).map((x) => (typeof x === 'string' ? x.slice(0, 80) : x));
}

function str(s, max) {
  return String(s == null ? '' : s).slice(0, max);
}

// ---------- 大模型中转（action: chat） ----------
// 小程序直连 api.xiaomimimo.com 会被 request 合法域名白名单拦（开发工具/真机都可能），
// 走云函数中转完全不受白名单限制：cloud.callFunction 走微信自己的通道。
// 模型 Key 只存在这里（服务端），不进小程序代码包，用户也拿不到。
const https = require('https');
// Key 放在 mimo.key.js（不进 git 仓库，仓库里只有 mimo.key.example.js 模板）。
// 文件缺失时 chat 中转返回 no-key 错误，其余 action 不受影响。
const MIMO_KEY = (function () {
  try {
    return require('./mimo.key.js').MIMO_KEY || '';
  } catch (e) {
    return '';
  }
})();
const MIMO_HOST = 'api.xiaomimimo.com';
const MIMO_PATH = '/v1/chat/completions';

function chatProxy(event) {
  if (!MIMO_KEY) return { ok: false, err: 'no-key', msg: 'mimo.key.js 缺失或为空，中转不可用' };
  const rawModel = String((event && event.model) || '');
  const model = /^[a-zA-Z0-9._-]{1,40}$/.test(rawModel) ? rawModel : 'mimo-v2.6-flash';
  const msgs = (Array.isArray(event && event.messages) ? event.messages : [])
    .slice(0, 8)
    .map((m) => ({
      role: m && (m.role === 'system' || m.role === 'assistant') ? m.role : 'user',
      content: str(m && m.content, 2000),
    }))
    .filter((m) => m.content);
  if (!msgs.length) return { ok: false, err: 'empty', msg: 'no-messages' };

  const body = JSON.stringify({ model: model, temperature: 0.5, max_tokens: 800, messages: msgs });
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let req;
    try {
      req = https.request(
        {
          host: MIMO_HOST,
          path: MIMO_PATH,
          method: 'POST',
          timeout: 18000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + MIMO_KEY,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (d) => (raw += d));
          res.on('end', () => {
            try {
            let data = null;
            try {
              data = JSON.parse(raw);
            } catch (e) {}
            const code = res.statusCode;
            const detail = (data && data.error && data.error.message) || (data && data.msg) || '';
            if (code === 401 || code === 403) return done({ ok: false, err: 'key', msg: str(detail, 120) });
            if (code === 429) return done({ ok: false, err: 'quota', msg: str(detail, 120) });
            if (code === 404 || (code === 400 && /model/i.test(String(detail))))
              return done({ ok: false, err: 'model', msg: str(detail, 120) });
            if (code !== 200) return done({ ok: false, err: code === 400 ? 'badreq' : 'net', msg: str(detail, 120) });
            let text = '';
            try {
              const ch = data && data.choices && data.choices[0];
              text = (ch && ch.message && ch.message.content) || '';
            } catch (e) {}
            text = String(text || '').trim();
            if (!text) return done({ ok: false, err: 'empty', msg: '' });
            done({ ok: true, text: str(text, 4000) });
            } catch (e2) {
              done({ ok: false, err: 'net', msg: 'resp-crash:' + String((e2 && e2.message) || e2).slice(0, 120) });
            }
          });
        }
      );
    } catch (e) {
      return done({ ok: false, err: 'net', msg: String((e && e.message) || e) });
    }
    req.on('timeout', () => {
      try {
        req.destroy();
      } catch (e) {}
      done({ ok: false, err: 'timeout', msg: '' });
    });
    req.on('error', (e) => done({ ok: false, err: 'net', msg: String((e && e.message) || e) }));
    req.write(body);
    req.end();
  });
}

// 只保留白名单字段，防止客户端塞进任意结构
function sanitize(p) {
  const src = p && typeof p === 'object' ? p : {};
  const q = src.quiz || {};
  const learned = src.learned || {};
  const fav = src.fav || {};
  const pk = src.pk && typeof src.pk === 'object' ? src.pk : {};
  const int = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

  const notes = {};
  const rawNotes = src.notes && typeof src.notes === 'object' ? src.notes : {};
  const nk = Object.keys(rawNotes).slice(0, LIMITS.notes);
  nk.forEach((k) => {
    notes[str(k, 40)] = str(rawNotes[k], 800);
  });

  const chats = (Array.isArray(src.chats) ? src.chats : []).slice(0, LIMITS.chats).map((s) => ({
    id: str(s && s.id, 40),
    title: str(s && s.title, LIMITS.title),
    ts: Number(s && s.ts) || 0,
    msgs: (Array.isArray(s && s.msgs) ? s.msgs : []).slice(-LIMITS.chatMsgs).map((m) => ({
      role: m && m.role === 'user' ? 'user' : 'assistant',
      text: str(m && m.text, LIMITS.text),
      ts: Number(m && m.ts) || 0,
    })),
  }));

  return {
    nickname: str(src.nickname, 16),
    score: Math.max(0, Math.min(999999, Math.round(Number(src.score) || 0))),
    chDone: Math.max(0, Math.min(99, Math.round(Number(src.chDone) || 0))),
    percent: Math.max(0, Math.min(100, Math.round(Number(src.percent) || 0))),
    answered: Math.max(0, Math.min(99999, Math.round(Number(q.answered) || 0))),
    correct: Math.max(0, Math.min(99999, Math.round(Number(q.correct) || 0))),
    learned: {
      topics: arr(learned.topics, LIMITS.learned),
      formulas: arr(learned.formulas, LIMITS.learned),
      examples: arr(learned.examples, LIMITS.learned),
    },
    fav: {
      formulas: arr(fav.formulas, LIMITS.learned),
      courses: arr(fav.courses, LIMITS.learned),
    },
    notes: notes,
    wrong: arr(src.wrong, LIMITS.wrong),
    // 擂台段位：只存数字，history 不上云（20 局明细既大又没用）
    pk: {
      rp: int(pk.rp, 9999),
      wins: int(pk.wins, 99999),
      losses: int(pk.losses, 99999),
      streak: int(pk.streak, 9999),
      best: int(pk.best, 9999),
    },
    visits: arr(src.visits, LIMITS.visits),
    chats: chats,
    syncedAt: Date.now(),
    updatedAt: db.serverDate(),
  };
}

// 排行榜只回公开字段，绝不带 notes / wrong / chats
function publicRow(r, i) {
  return {
    rank: i + 1,
    // 老记录里可能存着统一兜底名 "同学"，排行榜上给个位次后缀区分开
    nickname: !r.nickname || r.nickname === '同学' ? '同学' + (i + 1) : r.nickname,
    score: r.score || 0,
    answered: r.answered || 0,
    correct: r.correct || 0,
    rate: r.answered ? Math.round(((r.correct || 0) / r.answered) * 100) : 0,
    chDone: r.chDone || 0,
    avatar: 'wave',
  };
}

exports.main = async (event) => {
  const wx = cloud.getWXContext();
  const openid = wx.OPENID || '';
  const action = (event && event.action) || '';

  if (!openid) return { ok: false, msg: 'no-openid' };

  if (action === 'login') {
    return { ok: true, openid: openid, env: wx.ENV || '' };
  }

  if (action === 'pull') {
    try {
      const res = await db.collection(COL_PROFILE).doc(openid).get();
      return { ok: true, data: res.data || null };
    } catch (e) {
      // 第一次同步时文档不存在，属于正常情况
      return { ok: true, data: null };
    }
  }

  if (action === 'push') {
    const doc = sanitize(event.profile);
    // 昵称兜底不能用固定词：全部落成 "同学" 后排行榜分不出谁是谁。
    // 用 openid 尾部派生一个稳定后缀，至少同名也不会完全一样。
    if (!doc.nickname) doc.nickname = '用户' + String(openid || '').slice(-4);
    const ref = db.collection(COL_PROFILE).doc(openid);
    try {
      await ref.set({ data: doc });
    } catch (e) {
      return { ok: false, msg: 'write-fail' };
    }
    return { ok: true, score: doc.score, syncedAt: doc.syncedAt };
  }

  if (action === 'rank') {
    try {
      const res = await db
        .collection(COL_PROFILE)
        .orderBy('score', 'desc')
        .orderBy('syncedAt', 'asc')
        .limit(100)
        .field({
          nickname: true,
          score: true,
          answered: true,
          correct: true,
          chDone: true,
        })
        .get();
      const rows = res.data || [];
      let me = null;
      for (let i = 0; i < rows.length; i++) {
        if (rows[i]._id === openid) {
          me = publicRow(rows[i], i);
          me.self = true;
          break;
        }
      }
      if (!me) {
        // 没进前 100：单查自己，名次 = 比我高的人数 + 1
        try {
          const mine = await db.collection(COL_PROFILE).doc(openid).field({ score: true }).get();
          const myScore = (mine.data && mine.data.score) || 0;
          const cnt = await db
            .collection(COL_PROFILE)
            .where({ score: _.gt(myScore) })
            .count();
          me = {
            rank: (cnt.total || 0) + 1,
            nickname: '我',
            score: myScore,
            self: true,
          };
        } catch (e) {
          me = null;
        }
      }
      return { ok: true, list: rows.map(publicRow), me: me };
    } catch (e) {
      return { ok: false, msg: 'rank-fail' };
    }
  }

  // 教材切片检索：给 AI 做轻量 RAG。集合不存在就返回空，不影响主流程
  if (action === 'rag') {
    const kws = (Array.isArray(event.keywords) ? event.keywords : [])
      .map((k) => str(k, 12))
      .filter((k) => k && k.length >= 2)
      .slice(0, 4);
    if (!kws.length) return { ok: true, list: [] };
    const re = kws.join('|');
    try {
      const res = await db
        .collection(COL_CHUNK)
        .where({ text: db.RegExp({ regexp: re, options: 'i' }) })
        .limit(3)
        .field({ text: true, ch: true, title: true })
        .get();
      return { ok: true, list: res.data || [] };
    } catch (e) {
      return { ok: true, list: [] };
    }
  }

  // 大模型中转：直连被白名单拦时从这里走（实现见文件头 chatProxy）
  // 必须包 try/catch + catch 拒绝：云函数一旦抛异常，客户端只会看到
  // "cloud.callFunction:fail Error: err" 这种糊掉的信息，真实报错只在日志里
  if (action === 'chat') {
    try {
      return await chatProxy(event);
    } catch (e) {
      return { ok: false, err: 'net', msg: 'chat-crash:' + String((e && e.message) || e).slice(0, 120) };
    }
  }

  // 拍照识题：云存储 fileID -> 临时链接 -> 微信 OCR（云调用）
  // 需在本目录 config.json 的 permissions.openapi 里声明 ocr.printedText / ocr.handwriting
  // （已声明；改权限后重新上传部署，配置有 10 分钟缓存，报 -604101 稍等再试）。
  // 每日免费额度 100 次；未开通/超限时返回 ok:false，小程序端自动退回本地像素分析 + 规则检查表。
  if (action === 'ocr') {
    const fileID = str(event.fileID, 200);
    if (!fileID) return { ok: false, msg: 'no-file' };
    try {
      const urls = await cloud.getTempFileURL({ fileList: [fileID] });
      const url = urls && urls.fileList && urls.fileList[0] && urls.fileList[0].tempFileURL;
      if (!url) return { ok: false, msg: 'no-url' };
      let text = '';
      try {
        const r = await cloud.openapi.ocr.printedText({ type: 'photo', imgUrl: url });
        text = (r && r.items ? r.items : [])
          .map((it) => (it.text || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join('\n');
      } catch (e1) {
        // 手写体走 handwriting 接口再试一次
        try {
          const r2 = await cloud.openapi.ocr.handwriting({ imgUrl: url });
          text = (r2 && r2.items ? r2.items : [])
            .map((it) => (it.text || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .join('\n');
        } catch (e2) {
          return { ok: false, msg: 'ocr-denied' };
        }
      }
      return { ok: !!text, text: text, msg: text ? '' : 'empty' };
    } catch (e) {
      return { ok: false, msg: 'ocr-fail' };
    }
  }

  // 擂台房间：同一房间每人只留最新一条成绩，好友打完能读到真人对面数据。
  // 集合 pk_rooms 建议设为「仅管理员可读写」，只经本云函数出入。
  const room = String((event && event.room) || '').toUpperCase();
  const roomOk = /^[A-Z2-9]{6}$/.test(room);

  if (action === 'pksave') {
    if (!roomOk) return { ok: false, msg: 'bad-room' };
    const doc = {
      room: room,
      openid: openid,
      name: str(event.name, 16) || '同学',
      score: Math.max(0, Math.min(99999, Math.round(Number(event.score) || 0))),
      rp: Math.max(0, Math.min(9999, Math.round(Number(event.rp) || 0))),
      at: Date.now(),
    };
    try {
      await db.collection(COL_ROOM).doc(room + '_' + openid).set({ data: doc });
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: 'save-fail' };
    }
  }

  if (action === 'pkget') {
    if (!roomOk) return { ok: false, msg: 'bad-room' };
    try {
      const res = await db
        .collection(COL_ROOM)
        .where({ room: room })
        .orderBy('score', 'desc')
        .limit(10)
        .get();
      // 只回昵称与分数，openid 不外泄
      const list = (res.data || []).map((r) => ({
        name: r.name || '同学',
        score: r.score || 0,
        rp: r.rp || 0,
        self: r.openid === openid,
      }));
      return { ok: true, list: list };
    } catch (e) {
      return { ok: true, list: [] };
    }
  }

  return { ok: false, msg: 'unknown-action' };
};
