// _smoke_ai.js —— 自定义模型 API 接入（utils/ai）烟测
// 覆盖：配置读写 / remote 成功与错误归因 / 代码块解析 / 历史与风格进 system / ping 自检
const path = require('path');
const ROOT = path.join(__dirname, 'signals-pro') + path.sep;

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ok  ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''));
  }
}

// ---------- mock wx ----------
const store = {};
const reqLog = [];
let reqHandler = null;
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => {
    store[k] = v;
  },
  request: (opt) => {
    reqLog.push(opt);
    if (reqHandler) reqHandler(opt);
  },
  cloud: {
    callFunction: (opt) => {
      cloudLog.push(opt);
      if (cloudHandler) cloudHandler(opt);
      else opt.fail({ errMsg: 'cloud.callFunction:fail env not exist' });
    },
  },
};
const cloudLog = [];
let cloudHandler = null;
global.getApp = () => ({ globalData: {} });

const ai = require(ROOT + 'utils/ai.js');

// ---------- 1. 配置读写 ----------
ok('默认配置：小米 MiMo 且始终启用（启用与 Key 解绑）', (() => {
  const c = ai.defaultCfg();
  // enabled 必须恒为 true：发布前清掉 PRESET_KEY 也不能把整条模型链关掉（无 Key 走云函数中转）
  return (
    c.enabled === true &&
    c.baseUrl === 'https://api.xiaomimimo.com/v1' &&
    c.model === 'mimo-v2.6-flash' &&
    typeof c.key === 'string' &&
    (c.key === '' || /^sk-/.test(c.key))
  );
})());

ok('readCfg 空存储时回落预置配置', (() => {
  const c = ai.readCfg();
  return (
    c.enabled === true &&
    c.baseUrl === 'https://api.xiaomimimo.com/v1' &&
    c.model === 'mimo-v2.6-flash' &&
    typeof c.key === 'string'
  );
})());

ok('saveCfg 后 readCfg 往返一致', (() => {
  ai.saveCfg({ enabled: true, key: 'sk-test-123', baseUrl: 'https://api.deepseek.com/v1/', model: 'deepseek-reasoner' });
  const c = ai.readCfg();
  return c.enabled === true && c.key === 'sk-test-123' && c.model === 'deepseek-reasoner';
})());

ok('saveCfg 补默认 baseUrl/model（小米）', (() => {
  const c = ai.saveCfg({ enabled: true, key: 'k' });
  return c.baseUrl === 'https://api.xiaomimimo.com/v1' && c.model === 'mimo-v2.6-flash';
})());

ok('saveCfg 关闭时不残留 enabled', (() => {
  const c = ai.saveCfg({ enabled: false, key: 'k' });
  return c.enabled === false && ai.readCfg().enabled === false;
})());

ok('saveCfg 允许启用且无 Key（走云函数中转）', (() => {
  const c = ai.saveCfg({ enabled: true, key: '' });
  return c.enabled === true && c.key === '' && ai.readCfg().enabled === true && ai.readCfg().key === '';
})());

// ---------- 2. remote 请求体 ----------
const CFG = { enabled: true, key: 'sk-abc', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };

function runRemote(handler, opts) {
  reqHandler = handler;
  const before = reqLog.length;
  return ai.remote(CFG, opts).then((r) => ({ r, req: reqLog[before] }));
}

const askOpts = {
  q: '卷积为什么要翻转',
  style: 'code',
  ctx: { chapter: 'ch3', label: '第3章' },
  history: [
    { role: 'user', text: '傅里叶是什么' },
    { role: 'assistant', text: '把信号拆成正弦' },
    { role: 'user', text: 'x' },
    { role: 'assistant', text: 'y' },
  ],
};

(async () => {
  // 成功 + 代码块解析
  const okRes = await runRemote(
    (opt) => {
      opt.success({
        statusCode: 200,
        data: {
          choices: [
            {
              message: {
                content: '先给结论：翻转是定义。\n\n```matlab\ny = conv(f, h);\n```\n\n再看积分上下限。',
              },
            },
          ],
        },
      });
    },
    askOpts
  );
  ok('remote 成功返回 ok 与 title', okRes.r.ok === true && okRes.r.title === '卷积为什么要翻转', okRes.r);
  ok('remote 代码块解析成 code 块', okRes.r.blocks.some((b) => b.type === 'code' && /conv/.test(b.text)), okRes.r.blocks);
  ok('remote 文本块保留', okRes.r.blocks.some((b) => b.type === 'p' && b.text.indexOf('翻转') >= 0));
  ok('请求打到 /chat/completions', /\/chat\/completions$/.test(okRes.req.url), okRes.req.url);
  ok('请求带 Bearer Key', okRes.req.header.Authorization === 'Bearer sk-abc');
  ok('system 提示含风格要求（code）', /代码用 ```/.test(okRes.req.data.messages[0].content), okRes.req.data.messages[0].content.slice(0, 60));
  ok('system 提示含当前页面', /第3章/.test(okRes.req.data.messages[0].content));
  ok('历史只带最近 4 条 + 1 条提问 = 6 条消息', okRes.req.data.messages.length === 6, okRes.req.data.messages.length);
  ok('最后一条是用户问题', okRes.req.data.messages.slice(-1)[0].role === 'user' && okRes.req.data.messages.slice(-1)[0].content === '卷积为什么要翻转');
  ok('model 名透传', okRes.req.data.model === 'deepseek-chat');
  ok('带 max_tokens 上限（防跑飞）', okRes.req.data.max_tokens === 800, okRes.req.data.max_tokens);

  // 401 -> key
  const r401 = await runRemote((opt) => opt.success({ statusCode: 401, data: {} }), askOpts);
  ok('401 归因为 key', r401.r.ok === false && r401.r.err === 'key', r401.r);
  ok('errText(key) 给人话', /Key/.test(ai.errText(r401.r.err)));

  // 404 -> model
  const r404 = await runRemote((opt) => opt.success({ statusCode: 404, data: {} }), askOpts);
  ok('404 归因为 model', r404.r.ok === false && r404.r.err === 'model', r404.r);

  // 400 + "Unsupported model"（MiMo 实际返回形态）-> model，且带接口原话
  const r400m = await runRemote(
    (opt) => opt.success({ statusCode: 400, data: { error: { code: '400', message: 'Unsupported model no-such-model' } } }),
    askOpts
  );
  ok('400 Unsupported model 归因为 model', r400m.r.ok === false && r400m.r.err === 'model', r400m.r);
  ok('model 错误带接口原话', /Unsupported model/.test(ai.errText(r400m.r.err, r400m.r.msg)), r400m.r.msg);

  // 400 其他原因 -> badreq
  const r400o = await runRemote(
    (opt) => opt.success({ statusCode: 400, data: { error: { message: 'invalid param' } } }),
    askOpts
  );
  ok('400 非模型错误归因为 badreq', r400o.r.ok === false && r400o.r.err === 'badreq', r400o.r);

  // 429 -> quota
  const r429 = await runRemote((opt) => opt.success({ statusCode: 429, data: { error: { message: 'rate limit' } } }), askOpts);
  ok('429 归因为 quota', r429.r.ok === false && r429.r.err === 'quota', r429.r);
  ok('errText(quota) 提到额度', /额度|频繁/.test(ai.errText(r429.r.err)));

  // 500 -> net
  const r500 = await runRemote((opt) => opt.success({ statusCode: 500, data: {} }), askOpts);
  ok('500 归因为 net', r500.r.ok === false && r500.r.err === 'net', r500.r);

  // 200 但空内容
  const rEmpty = await runRemote(
    (opt) => opt.success({ statusCode: 200, data: { choices: [{ message: { content: '   ' } }] } }),
    askOpts
  );
  ok('空内容归因为 empty', rEmpty.r.ok === false && rEmpty.r.err === 'empty', rEmpty.r);

  // 网络失败 -> net；超时 -> timeout；域名没进白名单 -> domain（最常见的真因，不能糊成 net）
  const rNet = await runRemote((opt) => opt.fail({ errMsg: 'request:fail ' }), askOpts);
  ok('fail 归因为 net', rNet.r.ok === false && rNet.r.err === 'net', rNet.r);
  const rTo = await runRemote((opt) => opt.fail({ errMsg: 'request:fail timeout' }), askOpts);
  ok('fail timeout 归因为 timeout', rTo.r.ok === false && rTo.r.err === 'timeout', rTo.r);
  const rDom = await runRemote((opt) => opt.fail({ errMsg: 'request:fail url not in domain list' }), askOpts);
  ok('fail 白名单归因为 domain', rDom.r.ok === false && rDom.r.err === 'domain', rDom.r);
  ok('domain 报错带 errMsg 明细', rDom.r.msg.indexOf('domain list') >= 0, rDom.r.msg);
  ok('errText(domain) 点名白名单并给解法', /合法域名/.test(ai.errText(rDom.r.err, rDom.r.msg)), ai.errText(rDom.r.err, rDom.r.msg));

  // 直连被拦 -> 自动改走云函数中转（不受白名单限制）
  {
    cloudHandler = (opt) => {
      ok('中转发到 mycloud 的 chat 动作', opt.name === 'mycloud' && opt.data.action === 'chat', opt.data && opt.data.action);
      ok('中转带完整消息与模型名', Array.isArray(opt.data.messages) && opt.data.messages.length === 6 && opt.data.model === 'deepseek-chat', opt.data && opt.data.model);
      opt.success({ result: { ok: true, text: '经中转的回答' } });
    };
    const rProxy = await runRemote((opt) => opt.fail({ errMsg: 'request:fail url not in domain list' }), askOpts);
    ok('直连被拦时经云函数中转成功', rProxy.r.ok === true && rProxy.r.via === 'cloud' && /中转的回答/.test(rProxy.r.text), rProxy.r);
    ok('中转结果解析成 blocks', rProxy.r.blocks.some((b) => b.type === 'p' && /中转的回答/.test(b.text)), rProxy.r.blocks);
    cloudHandler = (opt) => opt.fail({ errMsg: 'cloud.callFunction:fail env not exist' });
    const rBoth = await runRemote((opt) => opt.fail({ errMsg: 'request:fail url not in domain list' }), askOpts);
    ok('中转也不可用时保留直连错误', rBoth.r.ok === false && rBoth.r.err === 'domain' && /domain list/.test(rBoth.r.msg) && /中转/.test(rBoth.r.msg), rBoth.r);
    cloudHandler = null;
  }

  // 缺 key / 缺地址：不直连，改走云函数中转（服务端持 Key）
  {
    const before = reqLog.length;
    cloudHandler = (opt) => opt.success({ result: { ok: true, text: '中转回答' } });
    const rNoKey = await ai.remote({ enabled: true, key: '', baseUrl: 'https://x.com/v1' }, askOpts);
    ok('没 Key 走云函数中转且不发 HTTP', rNoKey.ok === true && rNoKey.via === 'cloud' && reqLog.length === before, rNoKey);
    ok('中转结果解析成 blocks', rNoKey.blocks.some((b) => b.type === 'p' && /中转回答/.test(b.text)), rNoKey.blocks);
    cloudHandler = (opt) => opt.fail({ errMsg: 'cloud.callFunction:fail' });
    const rNoUrl = await ai.remote({ enabled: true, key: 'k', baseUrl: '' }, askOpts);
    ok('没地址时中转失败要说清原因', rNoUrl.ok === false && /中转/.test(rNoUrl.msg), rNoUrl);
    cloudHandler = null;
  }

  // ---------- 3. ping 自检 ----------
  function runPing(cfg, handler) {
    reqHandler = handler;
    const before = reqLog.length;
    return ai.ping(cfg).then((r) => ({ r, req: reqLog[before] }));
  }

  const pOk = await runPing(CFG, (opt) =>
    opt.success({ statusCode: 200, data: { data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] } })
  );
  ok('ping 200 报连通并列出模型', pOk.r.ok === true && /deepseek-chat/.test(pOk.r.msg) && /reasoner/.test(pOk.r.msg), pOk.r);
  ok('ping 打的是 /models', /\/models$/.test(pOk.req.url), pOk.req.url);

  const p401 = await runPing(CFG, (opt) => opt.success({ statusCode: 401, data: {} }));
  ok('ping 401 说 Key 无效', p401.r.ok === false && /Key/.test(p401.r.msg), p401.r);

  // /models 404 时回退最小对话验证
  const pFallback = await runPing(CFG, (opt) => {
    if (/\/models$/.test(opt.url)) opt.success({ statusCode: 404, data: {} });
    else
      opt.success({ statusCode: 200, data: { choices: [{ message: { content: 'pong' } }] } });
  });
  ok('ping /models 404 时回退对话验证', pFallback.r.ok === true && /对话/.test(pFallback.r.msg), pFallback.r);

  const pFail = await runPing(CFG, (opt) => opt.fail({ errMsg: 'request:fail' }));
  ok('ping 网络失败提示域名白名单', pFail.r.ok === false && /域名|网络/.test(pFail.r.msg), pFail.r);
  const pDom = await runPing(CFG, (opt) => opt.fail({ errMsg: 'request:fail url not in domain list' }));
  ok('ping 白名单失败点名合法域名', pDom.r.ok === false && pDom.r.err === 'domain' && /合法域名/.test(pDom.r.msg), pDom.r);

  {
    cloudHandler = (opt) => opt.success({ result: { ok: true, text: 'pong' } });
    const pNoKey = await ai.ping({ enabled: true, key: '', baseUrl: 'https://x.com/v1' });
    ok('ping 缺 Key 改走云函数中转', pNoKey.ok === true && /中转/.test(pNoKey.msg), pNoKey);
    const pVia = await runPing(CFG, (opt) => opt.fail({ errMsg: 'request:fail url not in domain list' }));
    ok('ping 直连被拦时经中转报连通', pVia.r.ok === true && /中转/.test(pVia.r.msg), pVia.r);
    cloudHandler = null;
  }

  // ---------- 4. errText 全覆盖 ----------
  ok('errText 未知错误有兜底文案', ai.errText('???').length > 0 && ai.errText('timeout') === '请求超时，模型太慢或网络太差');

  // ---------- 5. Markdown 抹平（MiMo 会吐 # / **） ----------
  const blocksMd = ai.toBlocks('# 卷积的原因\n\n**核心**：翻转平移后再相乘。\n\n```matlab\ny = conv(f,h);\n```');
  ok('标题 # 被抹平', blocksMd[0].type === 'p' && blocksMd[0].text.indexOf('#') < 0 && /卷积的原因/.test(blocksMd[0].text), blocksMd[0]);
  ok('加粗 ** 被抹平', blocksMd[1].type === 'p' && blocksMd[1].text.indexOf('**') < 0 && /核心：翻转/.test(blocksMd[1].text), blocksMd[1]);
  ok('代码块内容不被动', blocksMd[2].type === 'code' && /conv\(f,h\)/.test(blocksMd[2].text));

  // ---------- 6. 空存储回落预置配置（小米），按有无 Key 文件分流 ----------
  store['ssp_api_cfg'] = '';
  reqHandler = (opt) => opt.success({ statusCode: 200, data: { choices: [{ message: { content: 'ok' } }] } });
  {
    const before = reqLog.length;
    if (ai.defaultCfg().key) {
      // 有 ai.key.local.js：走直连，打小米端点
      const rPre = await ai.remote(null, askOpts);
      ok(
        '空存储时 remote 用预置配置打小米端点',
        rPre.ok === true && reqLog[before] && /xiaomimimo\.com/.test(reqLog[before].url),
        reqLog[before] && reqLog[before].url
      );
    } else {
      // 无 Key 文件（仓库克隆/发布清 Key）：不打直连，自动改走云函数中转
      cloudHandler = (opt) => opt.success({ result: { ok: true, text: 'ok' } });
      const rPre = await ai.remote(null, askOpts);
      cloudHandler = null;
      ok(
        '空存储无 Key 文件时 remote 自动走云函数中转',
        rPre.ok === true && !reqLog[before] && rPre.via === 'cloud',
        { urls: reqLog.slice(before).map((x) => x.url), r: rPre }
      );
    }
  }

  // ---------- 7. 回答来源标注：via 穿透消息重建白名单（页面层） ----------
  {
    let captured = null;
    global.Page = (o) => {
      captured = o;
    };
    const full = ROOT + 'pages' + path.sep + 'assistant' + path.sep + 'assistant.js';
    delete require.cache[require.resolve(full)];
    require(full);
    const p = Object.assign({}, captured);
    p.data = JSON.parse(JSON.stringify(captured.data || {}));
    p.setData = (patch) => {
      Object.keys(patch).forEach((k) => {
        const parts = k.split('.');
        let t = p.data;
        for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]] || (t[parts[i]] = {});
        t[parts[parts.length - 1]] = patch[k];
      });
    };
    p.renderMsgs([
      { role: 'assistant', text: 'q1', via: 'cloud', blocks: [{ type: 'p', text: 'x' }], refs: { ch: 'ch1' } },
      { role: 'assistant', text: 'q2', via: 'direct', blocks: [{ type: 'p', text: 'y' }] },
      { role: 'assistant', text: 'q3', blocks: [{ type: 'p', text: 'z' }] },
      { role: 'user', text: 'hi' },
    ]);
    ok('via=cloud 随消息重建透出', p.data.msgs[0].via === 'cloud', p.data.msgs[0]);
    ok('via=direct 随消息重建透出', p.data.msgs[1].via === 'direct', p.data.msgs[1]);
    ok('无 via 的消息不带标注', !p.data.msgs[2].via, p.data.msgs[2]);
    ok('用户消息不受影响', p.data.msgs[3].role === 'user' && !p.data.msgs[3].via, p.data.msgs[3]);
    ok('blocks/refs 一并透出', p.data.msgs[0].blocks.length === 1 && p.data.msgs[0].refs.ch === 'ch1', p.data.msgs[0]);
  }

  console.log('');
  console.log('结果: ' + pass + ' 过 / ' + fail + ' 挂');
  if (fail) {
    console.log('有挂的用例');
    process.exit(1);
  }
  console.log('smoke ai: 全部通过');
})();
