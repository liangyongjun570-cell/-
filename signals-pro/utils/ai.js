// 云端 AI 流式问答（含轻量 RAG，未开通云开发时返回 false 由调用方回退离线引擎）
//
// 依赖：wx.cloud.extend.AI（基础库 3.x + 云开发环境已开通「AI+」）
//   const model = wx.cloud.extend.AI.createModel('deepseek')  // 返回文本流
//
// 设计要点：
//   1) 流式：textStream 逐块吐字，onDelta 收到的是"到目前为止的完整文本"，
//      调用方直接 setData 覆盖一条占位消息即可，不用做增量拼接。
//   2) RAG：先用问题里的专业词去云数据库 textbook_chunks 模糊匹配 3 条教材切片，
//      拼进 system prompt；集合不存在就静默跳过，不影响回答。
//   3) 降级：任何一步失败都回调 onDone({ok:false})，调用方接离线引擎。

const cloud = require('./cloud');
const D = require('../data/index');

const FIRST_TIMEOUT = 12000; // 首字超时：超过就认为云端不可用
const MAX_CHARS = 2400;

const STYLE_HINT = {
  intuition: '用生活类比和物理直觉讲清楚，先给一句人话结论，再补最短的解释。避免长公式。',
  rigorous: '从定义出发严格推导，每一步都写清依据，公式用纯文本表示（如 F(jω)=∫f(t)e^(-jωt)dt），可直接抄进答题纸。',
  code: '给出可直接运行的 MATLAB 与 Python 代码，并用一句话点明关键函数；代码用 ``` 包起来。',
};

const SYS = [
  '你是《信号与系统》课程的助教，服务对象是中国本科生。',
  '符号必须与教材（2017，上海交通大学出版社）一致：输入 f(t)、输出 y(t)、频谱 F(jω)、抽样函数 Sa(t)=sin t/t、单边拉普拉斯变换积分下限 0⁻、周期信号级数系数 Cₙ。',
  '回答用简体中文，分点、简洁，不超过 320 字；不要编造教材页码。',
  '涉及稳定性的结论必须说明依据（极点位置 / ROC 是否含虚轴或单位圆）。',
  '公式用纯文本表示（如 F(jω)=∫f(t)e^(-jωt)dt），不要输出 LaTeX、Markdown 标记或 $$ 符号。',
].join('\n');

// ---------- RAG 关键词 ----------
// 从公式名、别名、章节名里建词表，命中即作为检索词，避免中文分词依赖
let _dict = null;
function dict() {
  if (_dict) return _dict;
  const set = {};
  const push = (s) => {
    const t = String(s || '').trim();
    if (t.length >= 2 && t.length <= 12) set[t] = 1;
  };
  D.formulas.forEach((f) => {
    push(f.name);
    (f.aliases || []).forEach(push);
  });
  D.chapters.forEach((c) => {
    push(c.name);
    (c.topics || []).forEach((t) => push(t.name));
  });
  ['卷积', '傅里叶', '拉普拉斯', 'z变换', '采样', '混叠', '极点', '零点', '稳定', '冲激', '阶跃', '频谱', '带宽', '系统函数'].forEach(push);
  _dict = Object.keys(set);
  return _dict;
}

function keywords(q) {
  const s = String(q || '');
  const hits = [];
  dict().forEach((k) => {
    if (s.indexOf(k) >= 0) hits.push(k);
  });
  // 长词优先（"离散时间傅里叶变换" 比 "傅里叶" 更准）
  hits.sort((a, b) => b.length - a.length);
  return hits.slice(0, 4);
}

function rag(q) {
  const kws = keywords(q);
  if (!kws.length || !cloud.available()) return Promise.resolve([]);
  return cloud.call('rag', { keywords: kws }).then((r) => (r.ok && Array.isArray(r.list) ? r.list : []));
}

// ---------- 能力探测 ----------
function hasCloudAI() {
  try {
    if (!cloud.available()) return false;
    const ext = wx.cloud && wx.cloud.extend;
    return !!(ext && ext.AI && typeof ext.AI.createModel === 'function');
  } catch (e) {
    return false;
  }
}

// ---------- 文本 -> 消息块（与离线引擎的块结构保持一致） ----------
// 模型爱吐 Markdown，聊天气泡里 # ** 都是噪音：成对的 ** 和行首标题符号直接抹平
function plain(s) {
  return String(s || '')
    .split('\n')
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, ''))
    .join('\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1');
}

function toBlocks(text) {
  const out = [];
  const src = String(text || '');
  const parts = src.split(/\n{2,}/);
  parts.forEach((p) => {
    const t = p.trim();
    if (!t) return;
    const m = t.match(/^```([a-zA-Z0-9+#]*)\s*\n([\s\S]*?)```$/);
    if (m) {
      out.push({ type: 'code', lang: m[1] || '', text: m[2].replace(/\s+$/, '') });
      return;
    }
    // 行内代码块（模型有时不给空行）
    if (t.indexOf('```') === 0 && t.lastIndexOf('```') > 3) {
      const body = t.replace(/^```[a-zA-Z0-9+#]*\s*/, '').replace(/```$/, '');
      out.push({ type: 'code', lang: '', text: body.replace(/\s+$/, '') });
      return;
    }
    const clean = plain(t);
    out.push({ type: 'p', text: clean.length > 900 ? clean.slice(0, 900) + '…' : clean });
  });
  if (!out.length) out.push({ type: 'p', text: plain(src).slice(0, 300) });
  return out;
}

// 手动泵流：避免 for-await 在低版本基础库上的兼容问题
function pump(stream, onChunk, onEnd) {
  let it = null;
  try {
    if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
      it = stream[Symbol.asyncIterator]();
    } else if (stream && typeof stream.next === 'function') {
      it = stream;
    }
  } catch (e) {
    it = null;
  }
  if (!it) {
    onEnd(false);
    return;
  }
  let stop = false;
  const step = () => {
    if (stop) return;
    let p = null;
    try {
      p = it.next();
    } catch (e) {
      stop = true;
      onEnd(false);
      return;
    }
    if (!p || typeof p.then !== 'function') {
      stop = true;
      onEnd(false);
      return;
    }
    p.then((r) => {
      if (stop) return;
      if (r && r.done) {
        stop = true;
        onEnd(true);
        return;
      }
      const v = r ? r.value : '';
      if (v) onChunk(v);
      step();
    }).catch(() => {
      stop = true;
      onEnd(false);
    });
  };
  step();
}

// 主入口
// opts = { q, style, ctx, history, onDelta(text), onDone({ok,text,blocks,refs}) }
// 返回 true = 已接管（结果走回调）；false = 云端不可用，调用方自行降级
function stream(opts) {
  if (!hasCloudAI()) return false;

  const q = String(opts.q || '').trim();
  if (!q) return false;

  let finished = false;
  let acc = '';
  let timer = null;

  const finish = (ok, reason) => {
    if (finished) return;
    finished = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const text = acc.trim();
    if (ok && text) {
      opts.onDone({
        ok: true,
        text: text,
        blocks: toBlocks(text),
        refs: { ch: (opts.ctx && opts.ctx.chapter) || '', lab: -1 },
        source: 'cloud',
      });
    } else {
      opts.onDone({ ok: false, reason: reason || 'empty' });
    }
  };

  timer = setTimeout(() => {
    finish(false, 'timeout');
  }, FIRST_TIMEOUT);

  rag(q).then((chunks) => {
    if (finished) return;
    let sys = SYS;
    if (opts.ctx && opts.ctx.label) sys += '\n当前页面：' + opts.ctx.label + '。';
    if (STYLE_HINT[opts.style]) sys += '\n回答风格要求：' + STYLE_HINT[opts.style];
    if (chunks.length) {
      sys +=
        '\n\n以下是教材原文切片，回答优先依据这些内容，不要与之矛盾：\n' +
        chunks
          .map((c, i) => '[切片' + (i + 1) + (c.ch ? ' · ' + c.ch : '') + '] ' + String(c.text || '').slice(0, 400))
          .join('\n');
    }

    const msgs = [{ role: 'system', content: sys }];
    (opts.history || []).slice(-4).forEach((h) => {
      if (h && h.role && h.text) msgs.push({ role: h.role, content: String(h.text).slice(0, 400) });
    });
    msgs.push({ role: 'user', content: q });

    let model = null;
    try {
      model = wx.cloud.extend.AI.createModel('deepseek');
    } catch (e) {
      finish(false, 'model');
      return;
    }
    if (!model || typeof model.streamText !== 'function') {
      finish(false, 'model');
      return;
    }

    let ret = null;
    try {
      ret = model.streamText({
        data: {
          model: 'deepseek-v3',
          messages: msgs,
          temperature: 0.6,
        },
      });
    } catch (e) {
      finish(false, 'call');
      return;
    }

    const consume = (res) => {
      if (finished) return;
      // 有的版本直接返回整段字符串
      if (typeof res === 'string') {
        acc = res;
        if (opts.onDelta) opts.onDelta(acc);
        finish(true);
        return;
      }
      const st = res && (res.textStream || res.stream || res);
      if (!st) {
        finish(false, 'no-stream');
        return;
      }
      pump(
        st,
        (piece) => {
          if (finished) return;
          // 首字到了就撤掉超时保护，否则长回答会在 12s 处被误杀
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          acc += String(piece);
          if (acc.length > MAX_CHARS) acc = acc.slice(0, MAX_CHARS);
          if (opts.onDelta) opts.onDelta(acc);
        },
        (ok) => {
          // 流异常中断但已经拿到一段可用内容时，仍然按成功处理
          finish(ok || acc.trim().length > 40);
        }
      );
    };

    if (ret && typeof ret.then === 'function') {
      ret.then(consume).catch(() => finish(false, 'stream-fail'));
    } else {
      consume(ret);
    }
  });

  return true;
}

// ---------- 自定义模型（OpenAI 兼容接口，Key 只存本机不进上传包之外的位置） ----------
const CFG_KEY = 'ssp_api_cfg';
const DEFAULT_BASE = 'https://api.xiaomimimo.com/v1';
const DEFAULT_MODEL = 'mimo-v2.6-flash';
// 预置 Key：方便这台设备开箱即用。Key 放在 ai.key.local.js（不进 git 仓库，
// 仓库里只有 ai.key.example.js 模板）——代码包是能被反编译的，Key 不该跟着包走，
// 更不能进 GitHub。文件不存在时留空：链路不会断，无 Key 自动走云函数中转
// （Key 在服务端 mycloud 里），用户想直连再在「模型设置」里自填。
const PRESET_KEY = (function () {
  try {
    return require('./ai.key.local.js').KEY || '';
  } catch (e) {
    return '';
  }
})();

function defaultCfg() {
  return {
    // 始终默认启用：没填 Key 时 remote() 自动改走云函数中转（服务端持 Key），
    // 所以发布前清掉 PRESET_KEY 不会把整条模型链关掉，用户开箱即用、扒包也扒不到 Key。
    enabled: true,
    baseUrl: DEFAULT_BASE,
    key: PRESET_KEY,
    model: DEFAULT_MODEL,
  };
}

function readCfg() {
  try {
    const raw = wx.getStorageSync(CFG_KEY);
    if (raw && typeof raw === 'object') {
      return {
        enabled: !!raw.enabled,
        baseUrl: raw.baseUrl || DEFAULT_BASE,
        key: raw.key || '',
        model: raw.model || DEFAULT_MODEL,
      };
    }
  } catch (e) {}
  return defaultCfg();
}

function saveCfg(cfg) {
  const c = {
    enabled: !!(cfg && cfg.enabled),
    key: (cfg && cfg.key) || '',
    baseUrl: (cfg && cfg.baseUrl) || DEFAULT_BASE,
    model: (cfg && cfg.model) || DEFAULT_MODEL,
  };
  try {
    wx.setStorageSync(CFG_KEY, c);
  } catch (e) {}
  return c;
}

// err -> 用户能看懂的一句话（detail 是接口原话，追在后面方便定位）
function errText(err, detail) {
  const map = {
    'no-url': '接口地址是空的',
    key: 'API Key 无效或额度不足',
    model: '模型名不存在或不受支持',
    badreq: '请求不被模型接口接受',
    quota: '额度不足或请求太频繁',
    empty: '模型返回了空内容',
    domain: '接口域名没进「request 合法域名」白名单（开发工具请勾选「不校验合法域名」）',
    net: '网络不通',
    timeout: '请求超时，模型太慢或网络太差',
    'stream-fail': '模型流中断',
    model2: '当前环境不支持云开发 AI 能力',
  };
  const base = map[err] || '模型未响应';
  return detail ? base + '：' + String(detail).slice(0, 80) : base;
}

// 走一次用户配置的模型。opts = {q, style, ctx, history}
// resolve({ok:true,title,blocks}) 或 {ok:false,err}
// 经云函数中转调模型：cloud.callFunction 走微信通道，不受 request 合法域名白名单限制，
// 开发工具与真机都能调。Key 存在云函数（服务端），客户端不用带也不怕被扒包。
function viaCloud(cfg, msgs, q) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, err: 'timeout', msg: '云函数中转超时' });
      }
    }, 32000);
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    let call = null;
    try {
      call = wx.cloud && wx.cloud.callFunction ? wx.cloud.callFunction.bind(wx.cloud) : null;
    } catch (e) {}
    if (!call) {
      done({ ok: false, err: 'net', msg: '云开发不可用（mycloud 未就绪）' });
      return;
    }
    try {
      call({
        name: 'mycloud',
        data: {
          action: 'chat',
          model: (cfg && cfg.model) || DEFAULT_MODEL,
          messages: msgs,
        },
        success: (res) => {
          const r = res && res.result;
          if (r && r.ok && r.text) {
            const text = String(r.text);
            done({ ok: true, title: String(q || '').slice(0, 20), blocks: toBlocks(text), text: text, via: 'cloud' });
          } else if (r && r.msg === 'unknown-action') {
            // 云端跑的还是旧版 mycloud（没有 chat 动作）
            done({ ok: false, err: 'net', msg: '云端 mycloud 是旧版本，请右键 cloudfunctions/mycloud → 上传并部署：云端安装依赖' });
          } else {
            done({ ok: false, err: (r && r.err) || 'net', msg: (r && r.msg) || '' });
          }
        },
        // callFunction 框架级失败（如 "Error: err"）真实原因只在云函数日志里，
        // 提示里直接给排查路径，别让用户对着一句糊话猜
        fail: (e) =>
          done({
            ok: false,
            err: 'net',
            msg:
              ((e && e.errMsg) || 'callFunction 失败') +
              '（排查：① 右键 mycloud 上传并部署了吗；② 云开发控制台→云函数→mycloud→配置→超时时间调到 20 秒；③ 看 mycloud 日志里的真实报错）',
          }),
      });
    } catch (e) {
      done({ ok: false, err: 'net', msg: String((e && e.message) || e) });
    }
  });
}

function remote(cfg, opts) {
  return new Promise((resolve) => {
    const c = cfg || readCfg();
    let url = String(c.baseUrl || '').replace(/\/+$/, '');
    const q = String((opts && opts.q) || '').trim();
    if (!q) {
      resolve({ ok: false, err: 'empty' });
      return;
    }
    let sys = SYS;
    if (opts && opts.ctx && opts.ctx.label) sys += '\n当前页面：' + opts.ctx.label + '。';
    if (opts && STYLE_HINT[opts.style]) sys += '\n回答风格要求：' + STYLE_HINT[opts.style];
    const msgs = [{ role: 'system', content: sys }];
    ((opts && opts.history) || []).slice(-4).forEach((h) => {
      if (h && h.role && h.text) msgs.push({ role: h.role, content: String(h.text).slice(0, 400) });
    });
    msgs.push({ role: 'user', content: q });

    // 没配 Key 或地址：不直连，直接走云函数中转（Key 在服务端，白名单也拦不住）
    if (!url || !c.key) {
      viaCloud(c, msgs, q).then((r) => {
        // 中转通道本身断了才补语境；模型侧的 key/model 等错误保持原样交给 errText
        if (r.ok || (r.err !== 'net' && r.err !== 'timeout')) return resolve(r);
        resolve({ ok: false, err: r.err, msg: '云函数中转不可用：' + (r.msg || '') });
      });
      return;
    }
    if (url.indexOf('/chat/completions') < 0) url += '/chat/completions';

    wx.request({
      url,
      method: 'POST',
      timeout: 30000,
      header: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + c.key,
      },
      data: {
        model: c.model || DEFAULT_MODEL,
        temperature: 0.5,
        max_tokens: 800,
        messages: msgs,
      },
      success: (res) => {
        const code = res && res.statusCode;
        // MiMo / OpenAI 兼容接口的错误正文里带原因，比如 400 "Unsupported model xxx"
        let detail = '';
        try {
          detail = (res.data && res.data.error && res.data.error.message) || res.data && res.data.msg || '';
        } catch (e) {}
        if (code === 401 || code === 403) {
          resolve({ ok: false, err: 'key', msg: detail });
          return;
        }
        if (code === 429) {
          resolve({ ok: false, err: 'quota', msg: detail });
          return;
        }
        if (code === 404 || (code === 400 && /model/i.test(String(detail)))) {
          resolve({ ok: false, err: 'model', msg: detail });
          return;
        }
        if (code !== 200) {
          resolve({ ok: false, err: code === 400 ? 'badreq' : 'net', msg: detail });
          return;
        }
        let text = '';
        try {
          const ch = res.data && res.data.choices && res.data.choices[0];
          text = (ch && ch.message && ch.message.content) || '';
        } catch (e) {}
        text = String(text || '').trim();
        if (!text) {
          resolve({ ok: false, err: 'empty' });
          return;
        }
        resolve({ ok: true, title: q.slice(0, 20), blocks: toBlocks(text), text: text });
      },
      fail: (e) => {
        // fail 的 errMsg 里带着真因，别一律糊成「网络不通」：
        // 「url not in domain list」= 域名没进白名单（最常见），「timeout」= 超时
        const msg = (e && e.errMsg) || '';
        let err = 'net';
        if (msg.indexOf('timeout') >= 0) err = 'timeout';
        else if (/domain/i.test(msg)) err = 'domain';
        // 直连被拦/不通时改走云函数中转（不受 request 域名白名单限制）再试一次
        viaCloud(c, msgs, q).then((r2) => {
          if (r2.ok) return resolve(r2);
          resolve({ ok: false, err: err, msg: msg + (r2.msg ? '；云函数中转也不可用：' + r2.msg : '') });
        });
      },
    });
  });
}

// 连通性自检：先打 /models，不行再用最小对话兜着，让用户当场知道配置对不对
function ping(cfg) {
  return new Promise((resolve) => {
    const c = cfg || readCfg();
    let base = String(c.baseUrl || '').replace(/\/+$/, '');
    // 直连不可用（没配 Key / 白名单拦 / 网络差）时改走云函数中转验证
    const viaProbe = (directErr, directMsg) => {
      viaCloud(c, [{ role: 'user', content: 'ping' }], 'ping').then((r) => {
        if (r.ok) {
          resolve({
            ok: true,
            msg: directMsg ? '直连不可用（' + directMsg + '），经云函数中转连通' : '经云函数中转连通',
          });
        } else if (directMsg) {
          resolve({
            ok: false,
            err: directErr || r.err,
            msg: directMsg + '；云函数中转也不可用：' + errText(r.err, r.msg),
          });
        } else {
          resolve({ ok: false, err: r.err, msg: errText(r.err, r.msg) });
        }
      });
    };
    if (!base || !c.key) {
      viaProbe(null, '');
      return;
    }
    const base2 = base.replace(/\/chat\/completions$/, '');
    wx.request({
      url: base2 + '/models',
      method: 'GET',
      timeout: 12000,
      header: { Authorization: 'Bearer ' + c.key },
      success: (res) => {
        if (res && res.statusCode === 200) {
          const ids = ((res.data && res.data.data) || []).map((m) => m && m.id).filter(Boolean).slice(0, 5);
          resolve({ ok: true, msg: ids.length ? '连通 · 可用模型：' + ids.join('、') : '连通，配置没问题' });
          return;
        }
        if (res && (res.statusCode === 401 || res.statusCode === 403)) {
          resolve({ ok: false, msg: 'Key 无效或没有权限（' + res.statusCode + '）' });
          return;
        }
        // 没有 /models 的兼容接口：用最小对话验证
        remote(c, { q: 'ping' }).then((r) => {
          if (r.ok) resolve({ ok: true, msg: '连通（该接口不支持 /models，已用对话验证）' });
          else resolve({ ok: false, msg: errText(r.err, r.msg) });
        });
      },
      fail: (e) => {
        const m = (e && e.errMsg) || '';
        let err = 'net';
        if (m.indexOf('timeout') >= 0) err = 'timeout';
        else if (/domain/i.test(m)) err = 'domain';
        viaProbe(err, errText(err, m));
      },
    });
  });
}

module.exports = {
  hasCloudAI,
  stream,
  keywords,
  rag,
  toBlocks,
  defaultCfg,
  readCfg,
  saveCfg,
  remote,
  viaCloud,
  ping,
  errText,
};
