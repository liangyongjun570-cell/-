// 拍照识题 + 手写推导批改
//
// 能力分层（未开云开发也能完整跑通）：
//   1) 像素分析（始终可用）：纸面质量、行切分、题型判定 —— 纯本地，用 OffscreenCanvas 读像素
//   2) 规则批改（始终可用）：把「识别出的文字」按教材口径逐条校验符号与积分上下限
//      —— 内置 3 张典型考题自带标准答案文本，所以一进页面就能看到真实批改效果
//   3) 云端 OCR（可选）：开通云开发后上传图片，云函数调 ocr.printedText 取文字，
//      再喂给第 2 层，实现"自己拍的照片也能逐条批改"
//
// 刻意不做的事：不在没有 OCR 的情况下假装看懂手写内容——那种"编造批改"比不批改更糟。

const cloud = require('./cloud');
const search = require('./search');

// ---------- 教材口径规则库 ----------
// 每条：命中 pattern 就报一个问题，并给出"应该怎么写"
const RULES = [
  {
    id: 'symbol-f',
    re: /(^|[^a-zA-Z])x\s*\(\s*t\s*\)/,
    tag: '符号',
    weight: 2,
    bad: 'x(t)',
    good: 'f(t)',
    why: '本课教材（2017 交大版）输入统一用 f(t)，输出用 y(t)。写成 x(t) 判卷时容易被当成"另一门课的记号"。',
  },
  {
    id: 'symbol-Fw',
    re: /F\s*\(\s*ω\s*\)/,
    tag: '符号',
    weight: 3,
    bad: 'F(ω)',
    good: 'F(jω)',
    why: '连续时间傅里叶变换的自变量是 jω，写 F(ω) 会把 j 丢掉；反过来 F(jω) 也不能写成 F(s)。',
  },
  {
    id: 'symbol-sinc',
    re: /sin\s*\(\s*π\s*t\s*\)\s*\/\s*\(?\s*π\s*t/,
    tag: '符号',
    weight: 3,
    bad: 'sin(πt)/(πt)',
    good: 'Sa(t)=sin t/t',
    why: '教材的抽样函数是 Sa(t)=sin t/t（分母没有 π）。sin(πt)/(πt) 是归一化 sinc，两者差一个尺度，谱宽会算错。',
  },
  {
    id: 'limit-laplace',
    re: /0\s*[⁺+]|₀\s*[⁺+]|0\s*\+\s*(到|→|~|-)|\b0\+\b/,
    tag: '积分限',
    weight: 4,
    bad: '0⁺',
    good: '0⁻',
    why: '单边拉普拉斯变换下限取 0⁻：这样 t=0 处的冲激 δ(t) 才不会被漏掉。写成 0⁺ 会丢掉初始冲激，初值定理也对不上。',
  },
  {
    id: 'limit-conv',
    re: /∫\s*[_₀0]\s*\^?\s*[tT]\s*.*(d\s*τ|dτ)|∫\s*0\s*到\s*t/,
    tag: '积分限',
    weight: 3,
    bad: '∫₀^t',
    good: '∫₋∞^{+∞}（因果时可写 ∫_{0⁻}^{t}）',
    why: '卷积定义域是全时间轴。只有当 f、h 都是因果信号时才能收成 0⁻→t；直接写 0→t 会漏掉 t=0 处的冲激贡献。',
  },
  {
    id: 'conv-def',
    re: /f\s*\(\s*t\s*\)\s*\*\s*h\s*\(\s*t\s*\)/,
    tag: '完整性',
    weight: 2,
    bad: 'y(t)=f(t)*h(t)',
    good: 'y(t)=∫f(τ)h(t−τ)dτ',
    why: '大题里只写星号不给积分定义，通常拿不到过程分；至少要写出一行定义式再代具体函数。',
  },
  {
    id: 'roc-missing',
    re: /F\s*\(\s*[sz]\s*\)\s*=/,
    unless: /ROC|收敛域|Re\s*\[|RoC/,
    tag: '完整性',
    weight: 2,
    bad: '只有 F(s)/F(z) 表达式',
    good: '表达式 + 收敛域 ROC',
    why: '同一个 F(z) 在不同 ROC 下对应不同序列。只写表达式不写 ROC，答案不唯一，判卷按不完整扣分。',
  },
  {
    id: 'stable-no-reason',
    re: /稳定/,
    unless: /极点|左半平面|右半平面|单位圆|虚轴|奈奎斯特/,
    tag: '依据',
    weight: 2,
    bad: '结论"系统稳定"',
    good: '连续：H(s) 极点全在左半平面；离散：极点全在单位圆内',
    why: '稳定性结论必须给依据。连续系统看极点实部是否全为负（等价于 ROC 含虚轴），离散系统看极点模是否全小于 1（ROC 含单位圆）。',
  },
  {
    id: 'alias-cond',
    re: /采样|抽样|fs|f_s|fₛ/,
    tag: '依据',
    weight: 1,
    bad: '只写"采样后能恢复"',
    good: '必须写 fs ≥ 2f_max（奈奎斯特）',
    why: '采样定理的关键条件是采样率不低于最高频率的两倍；不写这个条件，混叠的结论就没有落脚点。',
  },
];

// 行内是否出现积分号（用于判断"这行是积分式"）
const HAS_INT = /∫|\\int/;

function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// 规则批改：输入识别出的文字（或内置题的标准文本），输出问题清单
function check(text) {
  const src = String(text || '');
  if (!src) return [];
  const lines = splitLines(src);

  // 只批改"解："之后的部分：题干里的 x(t)、f(t)*h(t) 是老师写的，不算学生错
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('解：') >= 0 || lines[i].indexOf('解:') >= 0 || /^(答|证)：/.test(lines[i])) {
      start = i;
      break;
    }
  }
  const body = lines.slice(start);
  const bodyText = body.join('\n');

  const hits = [];
  const seen = {};

  RULES.forEach((r) => {
    if (r.unless && r.unless.test(bodyText)) return;
    if (!r.re.test(bodyText)) return;
    if (seen[r.id]) return;
    seen[r.id] = 1;
    // 找出命中所在行号（回填原文行号，方便用户对回自己的草稿）
    let line = 0;
    for (let i = 0; i < body.length; i++) {
      if (r.re.test(body[i])) {
        line = start + i + 1;
        break;
      }
    }
    hits.push({
      id: r.id,
      tag: r.tag,
      weight: r.weight,
      bad: r.bad,
      good: r.good,
      why: r.why,
      line: line,
      lineText: line ? lines[line - 1].slice(0, 46) : '',
    });
  });

  // 逐行检查积分式有没有漏微分元（只查含 ∫ 的行，避免"整篇有一个 dτ 就都算过"）
  for (let i = 0; i < body.length; i++) {
    const ln = body[i];
    if (!HAS_INT.test(ln)) continue;
    if (/d\s*[τtxω]|\\,d/.test(ln)) continue;
    hits.push({
      id: 'diff-missing' + i,
      tag: '完整性',
      weight: 2,
      bad: '∫f(τ)h(t−τ)',
      good: '∫f(τ)h(t−τ)dτ',
      why: '积分号后面漏了微分元 dτ，等于没说对哪个变量积分——这是最常见的扣分点之一。',
      line: start + i + 1,
      lineText: ln.slice(0, 46),
    });
    break; // 同一类问题只报一次
  }

  hits.sort((a, b) => b.weight - a.weight);
  return hits;
}

// ---------- 像素分析 ----------
// 尺寸压到 128×128 再读像素：够判断纸面与行分布，又不至于慢
const N = 128;

function pixelStats(data) {
  let dark = 0;
  let sum = 0;
  let sum2 = 0;
  const rows = new Array(N).fill(0);
  const cols = new Array(N).fill(0);
  const gray = new Float32Array(N * N);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const g = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      gray[y * N + x] = g;
      sum += g;
      sum2 += g * g;
      if (g < 0.62) {
        dark += 1;
        rows[y] += 1;
        cols[x] += 1;
      }
    }
  }

  const total = N * N;
  const mean = sum / total;
  const sd = Math.sqrt(Math.max(0, sum2 / total - mean * mean));

  // 行切分：有墨迹的行连成带，带数≈文本行数
  const th = Math.max(2, Math.round(N * 0.012));
  let bands = 0;
  let inBand = false;
  let maxBand = 0;
  let cur = 0;
  for (let y = 0; y < N; y++) {
    if (rows[y] >= th) {
      if (!inBand) {
        bands += 1;
        inBand = true;
      }
      cur += 1;
      if (cur > maxBand) maxBand = cur;
    } else {
      inBand = false;
      cur = 0;
    }
  }

  // 最长连续横线：电路图/表格的框线会比文字行"横贯整幅"
  let longRun = 0;
  for (let y = 0; y < N; y++) {
    let run = 0;
    let best = 0;
    for (let x = 0; x < N; x++) {
      if (rows[y] > 0 && gray[y * N + x] < 0.62) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    if (best > longRun) longRun = best;
  }

  // 边缘密度：手写笔画的粗细变化会带来更多强边缘
  let edges = 0;
  for (let y = 1; y < N; y++) {
    for (let x = 1; x < N; x++) {
      const d = Math.abs(gray[y * N + x] - gray[y * N + x - 1]) + Math.abs(gray[y * N + x] - gray[(y - 1) * N + x]);
      if (d > 0.35) edges += 1;
    }
  }

  return {
    inkRatio: dark / total,
    mean: mean,
    contrast: sd,
    bands: bands,
    maxBand: maxBand,
    longRun: longRun,
    edgeRatio: edges / total,
  };
}

function judge(st) {
  if (!st) {
    return { kind: 'unknown', name: '未取到像素', hint: '图像读取失败，直接按下面的检查表核对即可。' };
  }
  const ink = st.inkRatio;
  const bands = st.bands;
  const longRatio = st.longRun / N;

  if (ink < 0.008) {
    return { kind: 'blank', name: '几乎全白', hint: '画面里几乎没看到字迹：可能拍到了白墙、对焦失败，或纸面反光。换个角度、让题目占满画面再拍。' };
  }
  if (ink > 0.42) {
    return { kind: 'dark', name: '过暗 / 阴影', hint: '大面积偏暗，通常是逆光或手挡住了光源。到窗边、让光从上方来。' };
  }
  if (longRatio > 0.42 && bands <= 6) {
    return { kind: 'figure', name: '电路图 / 系统框图', hint: '检测到贯通整幅的长直线，按框图题处理：重点核对每个方框里的 H(s)、箭头方向与相加点符号。' };
  }
  if (bands >= 5) {
    return { kind: 'derive', name: '多行手写推导', hint: '检测到 ' + bands + ' 行文本带，按推导题处理：逐行核对积分上下限与符号，尤其是等号两侧的量纲是否一致。' };
  }
  if (bands >= 2) {
    return { kind: 'mixed', name: '题面 + 少量演算', hint: '上密下疏，像是题干加两三行关键步骤：先确认抄对了题干条件（f(t) 的表达式、时间区间），再看推导。' };
  }
  return { kind: 'single', name: '单行 / 单个波形', hint: '识别为单行内容：如果是波形题，重点核对坐标轴标注（t 轴、幅度、周期 T₁）有没有漏。' };
}

function readPixels(path) {
  return new Promise((resolve) => {
    try {
      if (typeof wx.createOffscreenCanvas !== 'function') {
        resolve(null);
        return;
      }
      const cv = wx.createOffscreenCanvas({ type: '2d', width: N, height: N });
      const ctx = cv.getContext('2d');
      const img = cv.createImage();
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      img.onload = () => {
        try {
          ctx.clearRect(0, 0, N, N);
          ctx.drawImage(img, 0, 0, N, N);
          const d = ctx.getImageData(0, 0, N, N);
          finish(pixelStats(d.data));
        } catch (e) {
          finish(null);
        }
      };
      img.onerror = () => finish(null);
      img.src = path;
      setTimeout(() => finish(null), 3000);
    } catch (e) {
      resolve(null);
    }
  });
}

// 选图：相机 / 相册
function choose() {
  return new Promise((resolve) => {
    const done = (path) => resolve(path || '');
    if (typeof wx.chooseMedia === 'function') {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
        camera: 'back',
        success: (res) => {
          const f = res && res.tempFiles && res.tempFiles[0];
          done(f && f.tempFilePath);
        },
        fail: () => done(''),
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera', 'album'],
      success: (res) => done(res && res.tempFilePaths && res.tempFilePaths[0]),
      fail: () => done(''),
    });
  });
}

// 云端 OCR（可选）：上传 -> 云函数 -> 返回文字。任何一步失败返回空串
function ocr(path) {
  if (!cloud.available()) return Promise.resolve('');
  return new Promise((resolve) => {
    try {
      wx.cloud.uploadFile({
        cloudPath: 'papers/' + Date.now() + '_' + Math.floor(Math.random() * 1e4) + '.jpg',
        filePath: path,
        success: (up) => {
          if (!up || !up.fileID) {
            resolve('');
            return;
          }
          cloud.call('ocr', { fileID: up.fileID }).then((r) => {
            if (r.ok && r.text) resolve(String(r.text));
            else resolve('');
            // 顺手清理云存储，避免占配额
            try {
              wx.cloud.deleteFile({ fileList: [up.fileID] });
            } catch (e) {}
          });
        },
        fail: () => resolve(''),
      });
    } catch (e) {
      resolve('');
    }
  });
}

// ---------- 内置 3 张典型考题 ----------
// text 是这张图上"手写推导"的标准文字版（等价于云端 OCR 结果），
// 所以不用联网也能走完整批改链路；truth 记录这张图故意写错的地方，用于页面对照说明。
const PAPERS = [
  {
    id: 'p1',
    img: '/assets/paper/p1.jpg',
    title: '卷积积分：两个矩形脉冲',
    sub: 'ch3 · 系统时域分析',
    text: [
      '已知 f(t)=u(t)-u(t-2)，h(t)=u(t)-u(t-1)，求 y(t)=f(t)*h(t)',
      '解：y(t) = ∫0到t f(τ)h(t−τ)',
      '当 0<t<1 时，y(t)=∫0到t 1dτ = t',
      '当 1<t<2 时，y(t)=1',
      '当 2<t<3 时，y(t)=3−t',
      '所以 y(t) 是一个梯形',
    ].join('\n'),
    truth: ['积分下限写成 0，因果信号应写成 0⁻', '积分号后漏写微分元 dτ'],
  },
  {
    id: 'p2',
    img: '/assets/paper/p2.jpg',
    title: '单边拉氏变换与初值',
    sub: 'ch7 · 复频域分析',
    text: [
      '求 f(t)=e^(-2t)u(t)+δ(t) 的单边拉普拉斯变换，并求 f(0+)',
      '解：F(s)=∫0+到∞ [e^(-2t)u(t)+δ(t)] e^(-st) dt',
      '= 1/(s+2) + 1',
      '= (s+3)/(s+2)，收敛域 Re[s] > -2',
      '由初值定理 f(0+) = lim sF(s) = 1',
      '所以系统稳定。',
    ].join('\n'),
    truth: ['积分下限写成 0⁺，教材用 0⁻', '稳定性结论没给判据（应说明极点全在左半平面 / ROC 含虚轴）'],
  },
  {
    id: 'p3',
    img: '/assets/paper/p3.jpg',
    title: '抽样函数与频谱',
    sub: 'ch4 · 连续时间频域分析',
    text: [
      '求矩形脉冲 f(t)=E[u(t+τ/2)−u(t−τ/2)] 的频谱',
      '解：F(ω)=∫f(t)e^(-jωt)dt = Eτ·sin(πt)/(πt)',
      '所以幅度谱是 sinc 形状，主瓣宽度 2π/τ',
      '当 τ 变小时，频谱变宽',
    ].join('\n'),
    truth: ['频谱应写成 F(jω)，漏了 j', 'Sa(t)=sin t/t，写成 sin(πt)/(πt) 差一个尺度'],
  },
];

// ---------- 汇总 ----------
// 返回一份可直接渲染的报告（含拍照搜题的题库匹配结果）
function build(paper, stats, ocrText) {
  const st = stats || null;
  const judged = judge(st);
  const text = ocrText || (paper && paper.text) || '';
  const issues = check(text);
  const score = issues.reduce((s, x) => s + x.weight, 0);
  // 搜题：拿文字去题库匹配原题（只有取到文字才有得搜，纸面指标不参与）
  const matches = text ? search.matchQuestions(text, 3) : [];
  let verdict = '没发现明显问题';
  if (!text) verdict = '只做了题型识别，内容未逐字比对';
  else if (score >= 7) verdict = '有硬伤，建议重写这一步';
  else if (score >= 3) verdict = '有 1–2 处会被扣分的写法';
  else if (score > 0) verdict = '细节可再抠一下';

  return {
    // 题型判定
    kind: judged.kind,
    kindName: judged.name,
    kindHint: judged.hint,
    // 纸面指标
    ink: st ? Math.round(st.inkRatio * 1000) / 10 : 0,
    contrast: st ? Math.round(st.contrast * 100) / 100 : 0,
    bands: st ? st.bands : 0,
    // 批改
    text: text,
    issues: issues,
    score: score,
    verdict: verdict,
    fromOCR: !!ocrText,
    fromBuiltin: !ocrText && !!(paper && paper.text),
    // 搜题命中（每项：id/score/stem/options/answer/hint/explanation/difficulty/ch）
    matches: matches,
  };
}

// ---------- 报告渲染（页面端 / 组件端共用） ----------
// 把批改 + 搜题结果转成消息块，返回可直接 commit 的 blocks 数组
function reportBlocks(rep) {
  const out = [];
  out.push({ type: 'p', text: '识别：' + rep.kindName + '（墨迹占比 ' + rep.ink + '%，' + rep.bands + ' 行文本带）' });
  out.push({ type: 'tip', text: rep.kindHint });

  // 搜题结果优先展示：拍题的人最想看"这是不是题库里的题"
  const ms = rep.matches || [];
  if (ms.length) {
    out.push({ type: 'answer', text: '搜题结果：命中题库 ' + ms.length + ' 道（按相似度排序）' });
    ms.forEach((m, i) => {
      const right = 'ABCDEFGH'[m.answer] || '?';
      const opts = (m.options || []).map((o, j) => 'ABCDEFGH'[j] + '. ' + o).join('\n');
      out.push({
        type: 'step',
        index: i + 1,
        text: '【相似度 ' + Math.round(m.score * 100) + '% · ' + (m.difficulty || '题库') + '】' + m.stem + '\n' + opts,
      });
      out.push({ type: 'answer', text: '答案：' + right + '。' + (m.explanation || m.hint || '') });
    });
  } else if (rep.text) {
    out.push({ type: 'tip', text: '搜题结果：没命中内置题库（题库是本课程 130 道选择题；拍照搜题匹配的是题干，手写推导或作业大题搜不到属正常）。' });
  }

  if (rep.issues && rep.issues.length) {
    out.push({ type: 'answer', text: '批改结论：' + rep.verdict + '（累计 ' + rep.score + ' 分风险）' });
    rep.issues.slice(0, 5).forEach((it, i) => {
      out.push({
        type: 'step',
        index: i + 1,
        text: '【' + it.tag + '】' + (it.line ? '第 ' + it.line + ' 行：' : '') + it.bad + ' → 应写成 ' + it.good + '\n' + it.why,
      });
    });
  } else if (rep.fromBuiltin || rep.fromOCR) {
    out.push({ type: 'answer', text: '批改结论：' + rep.verdict });
    out.push({ type: 'p', text: '逐条对过教材口径检查表，没命中常见错误：符号、积分上下限、收敛域与稳定性依据都写得完整。' });
  } else {
    out.push({ type: 'answer', text: '批改结论：' + rep.verdict });
    out.push({ type: 'p', text: '这张照片没取到可批改的文字（离线模式不解码手写）。下面按题型给出的判断与检查表，需要你自己逐条核对。' });
  }
  if (rep.fromBuiltin) {
    out.push({ type: 'tip', text: '这是内置考题，批改依据它的标准文字稿 + 教材口径检查表，用来演示完整链路。' });
  } else if (!rep.fromOCR) {
    out.push({ type: 'tip', text: '离线识别：题型与行数来自本地像素分析；开通云开发 OCR 后可对自己拍的照片逐字批改与搜题。' });
  }
  return out;
}

module.exports = {
  RULES,
  PAPERS,
  check,
  choose,
  ocr,
  readPixels,
  judge,
  build,
  reportBlocks,
};
