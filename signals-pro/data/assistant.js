// 三级联动智能助教：上下文感知 / 三种回答风格 / 章节难题库 / 符号输入台 / 引导卡
// 与 data/tutor.js 并存：tutor 负责五类讲解方式，本文件负责"平台级"问答与上下文

// ---------- 三种回答风格 ----------
const STYLES = [
  {
    id: 'intuition',
    icon: '💡',
    name: '直觉秒懂',
    short: '直觉',
    desc: '打比方、讲物理意义，30 秒抓住本质',
  },
  {
    id: 'rigorous',
    icon: '📐',
    name: '严谨推导',
    short: '推导',
    desc: '从定义出发，一步不跳，可直接抄进答题纸',
  },
  {
    id: 'code',
    icon: '🐍',
    name: '工程代码',
    short: '代码',
    desc: '给出可直接运行的 MATLAB / Python',
  },
];

// ---------- 数学符号快捷栏 ----------
const SYMBOLS_SHORT = [
  { k: 'δ(t)', v: 'δ(t)' },
  { k: 'u(t)', v: 'u(t)' },
  { k: 'x*h', v: 'x(t)*h(t)' },
  { k: '∫', v: '∫' },
  { k: 'e^{-jωt}', v: 'e^(-jωt)' },
  { k: 'H(s)', v: 'H(s)' },
  { k: 'H(z)', v: 'H(z)' },
];

const SYMBOLS_FULL = [
  { k: 'δ(t)', v: 'δ(t)' },
  { k: 'u(t)', v: 'u(t)' },
  { k: '∫_{-∞}^{+∞}', v: '∫_{-∞}^{+∞}' },
  { k: '∑', v: '∑' },
  { k: 'x(t)*h(t)', v: 'x(t)*h(t)' },
  { k: 'e^{-jωt}', v: 'e^(-jωt)' },
  { k: 'H(s)', v: 'H(s)' },
  { k: 'H(z)', v: 'H(z)' },
  { k: 'Sa(ωτ/2)', v: 'Sa(ωτ/2)' },
];

// ---------- 页面上下文：桌宠气泡 + 半屏标签 + 快捷追问 ----------
// match 为页面路由前缀；chapter 为关联章节（用于跳转与追问）
const CONTEXT = [
  {
    match: 'pages/index/index',
    tab: '首页',
    label: '首页 · 学习总览',
    hint: '今天想从哪儿学起？我可以按你的进度给条路线。',
    chapter: 'ch0',
    asks: ['帮我按剩余进度排个学习路线', '四大变换到底该怎么串起来', '卷积在工程里有什么用'],
  },
  {
    match: 'pages/chapters/chapters',
    tab: '章节',
    label: '章节目录',
    hint: '挑一章，我把这一章的主干先讲给你听。',
    chapter: 'ch1',
    asks: ['这八章之间的先后依赖是什么', '哪几章是期末必考', '信号与系统该怎么复习'],
  },
  {
    match: 'pages/chapter/chapter',
    tab: '章节',
    label: '章节详情',
    hint: '这一章的重点、易错点，我可以先给你划一遍。',
    chapter: 'ch1',
    asks: ['这章最容易考什么', '这章的公式怎么记', '给我一道这章的代表例题'],
  },
  {
    match: 'pages/topic/topic',
    tab: '章节',
    label: '知识点详解',
    hint: '看到不懂的地方，直接问我，我按你现在这一节讲。',
    chapter: 'ch1',
    asks: ['把这个知识点再讲简单一点', '这里的公式怎么推出来的', '考试会怎么考这个点'],
  },
  {
    match: 'pages/lab/lab',
    tab: '仿真实验',
    label: '仿真实验室',
    hint: '调参数的时候盯着波形看，我可以解释每个拐点为什么出现。',
    chapter: 'ch3',
    asks: ['卷积图解法里重叠面积怎么算', '吉布斯现象为什么消不掉', '极点位置怎么影响频响'],
  },
  {
    match: 'pages/formulas/formulas',
    tab: '公式',
    label: '公式库',
    hint: '公式不用死记，记住它从哪来、什么时候能用。',
    chapter: 'ch5',
    asks: ['傅里叶变换的对称性怎么用', '帕塞瓦尔定理说明什么', '卷积定理为什么能简化计算'],
  },
  {
    match: 'pages/quiz/quiz',
    tab: '习题',
    label: '智能题库',
    hint: '卡住别急着看答案，先告诉我你想到哪一步了。',
    chapter: 'ch3',
    asks: ['这道题的切入点在哪', '我的思路错在哪一步', '这类题有没有通用套路'],
  },
  {
    match: 'pages/mistakes/mistakes',
    tab: '习题',
    label: '错题本',
    hint: '错题不是用来重做的，是用来找规律。',
    chapter: 'ch3',
    asks: ['帮我总结这些错题的共同点', '我总在哪儿翻车', '错题该怎么复盘才有效'],
  },
  {
    match: 'pages/me/me',
    tab: '我的',
    label: '学习档案',
    hint: '看看你的五维能力，偏科的地方我帮你补。',
    chapter: 'ch0',
    asks: ['我的短板在哪个维度', '怎么提升频域分析能力', '还有多少没学完'],
  },
  {
    match: 'pages/records/records',
    tab: '我的',
    label: '学习记录',
    hint: '学习节奏比总时长重要，我可以帮你看看规律。',
    chapter: 'ch0',
    asks: ['我的学习节奏有什么问题', '下一步该复习什么', '怎么安排每天的学习量'],
  },
  {
    match: 'pages/tutor/tutor',
    tab: '助教',
    label: '智能助教',
    hint: '在这里可以放开问，我按章节和风格给你讲。',
    chapter: 'ch3',
    asks: ['卷积为什么要翻转', '系统怎么判稳', 'FT 和 LT 差在哪'],
  },
];

// ---------- 章节快捷追问（半屏默认展示 3 个） ----------
const QUICK = {
  ch0: ['四大变换的演进主线是什么', '为什么要引入复频域', '时域和频域到底在换什么'],
  ch1: ['能量信号和功率信号怎么一眼分辨', 'LTI 的三个性质分别有什么用', '因果与稳定能互相推出吗'],
  ch2: ['冲激函数的筛选性质怎么用', '阶跃和冲激是什么关系', '信号分解有哪几种常用方式'],
  ch3: ['卷积为什么要翻转', '卷积图解法怎么分段', 'h(t) 为什么能完全代表系统'],
  ch4: ['傅里叶级数系数 Cₙ 怎么求', '周期信号频谱为什么是离散的', '吉布斯现象为什么消不掉'],
  ch5: ['冲激函数的傅里叶变换为什么是 1', '时移和频移怎么对应', '卷积定理怎么简化计算'],
  ch6: ['采样定理为什么是两倍', '混叠后频率怎么算', '无失真传输要满足什么条件'],
  ch7: ['拉氏变换收敛域怎么判', '零极点怎么决定稳定性', '单边拉氏变换怎么带初值'],
};

// ---------- 题库：8 大高频难题 ----------
const HARD = [
  {
    id: 'q1',
    title: '卷积为什么要翻转？',
    ch: 'ch3',
    topic: 'ch3-t4',
    formulas: ['f13', 'f14'],
    lab: 0,
    keys: ['卷积', '翻转', 'convolution', '图解法', '卷积积分'],
    intuition: [
      '把系统想成一面很长的走廊，你在走廊这头喊一嗓子，声音传过去会一路衰减。t 时刻传到走廊那头的声音，是过去每个时刻喊出的声音经过不同距离衰减后叠加的结果。',
      '"翻转"不是数学上的花样，而是因为它记录的是"时间差"：h 的自变量本来表示"冲激发生后过了多久"，而卷积里我们关心的是"输入发生在多久之前"，两个时间方向正好相反，于是出现了 τ 和 t−τ 的对调。',
      '所以更准确的说法是：卷积是先"翻"出一个镜像，再"移"到当前时刻，最后把重叠部分乘起来求和。翻转 + 平移 = 倒着看历史。',
    ],
    steps: [
      '① 任意输入都可拆成冲激的叠加：f(t) = ∫ f(τ)δ(t−τ)dτ。这是冲激的筛选性质，τ 是"输入发生的时刻"。',
      '② 系统是时不变的：δ(t) 激起 h(t)，那么延迟了 τ 的冲激 δ(t−τ) 就激起 h(t−τ)。注意 h 的自变量是"已经过去的时间"。',
      '③ 系统是线性的：输入是加权叠加，输出就是加权叠加，于是 y(t) = ∫ f(τ)h(t−τ)dτ。到这里翻转已经自然出现了，不是人为规定。',
      '④ 换元 v = t−τ，得到 y(t) = ∫ f(t−v)h(v)dv = h(t)*f(t)，这说明卷积可交换，也说明"谁翻转"只是视角不同。',
      '⑤ 图解法的三个动作就对应这三步：翻转 h(τ)→h(−τ)，平移 t 得到 h(t−τ)，再与 f(τ) 相乘求重叠面积。',
    ],
    code: [
      {
        lang: 'matlab',
        text: 't = 0:0.01:8;\nf1 = double(t>=0 & t<=2);\nf2 = 2*double(t>=0 & t<=3);\ng  = conv(f1, f2) * 0.01;   % 乘步长近似积分\ntg = (0:numel(g)-1) * 0.01;\nplot(tg, g, "LineWidth", 1.6); grid on;\nxlabel("t"); ylabel("g(t)");\ntitle("矩形脉冲卷积：梯形");',
      },
      {
        lang: 'python',
        text: 'import numpy as np\nimport matplotlib.pyplot as plt\n\ndt = 0.01\nt  = np.arange(0, 8, dt)\nf1 = ((t >= 0) & (t <= 2)).astype(float)\nf2 = 2 * ((t >= 0) & (t <= 3)).astype(float)\ng  = np.convolve(f1, f2) * dt\ntg = np.arange(len(g)) * dt\n\nplt.plot(tg, g, lw=1.6)\nplt.grid(True); plt.xlabel("t"); plt.ylabel("g(t)")\nplt.title("conv of two rectangles -> trapezoid")\nplt.show()',
      },
    ],
    tip: '两个矩形脉冲卷积一定是梯形（宽度相加、高度相乘再乘较窄者宽度）。图解法分段点就是两个矩形的 4 个边界组合。',
    pitfall: '离散卷积不要把 ∑ 写成 ∫；连续卷积数值计算时一定要乘步长 dt，否则幅值会差 1/dt 倍。',
  },
  {
    id: 'q2',
    title: '冲激函数的傅里叶变换为什么等于 1？',
    ch: 'ch5',
    topic: 'ch5-t3',
    formulas: ['f18', 'f09'],
    lab: 1,
    keys: ['冲激', '傅里叶变换', 'delta', '白噪声', '全频带'],
    intuition: [
      'δ(t) 是"只在一瞬间存在"的信号，时间是极端集中的；而傅里叶变换在说"这个信号由哪些频率组成"。时间上越集中，频率上就越分散——这是不确定性关系的直观版本。',
      '把 δ(t) 想成一次敲击：敲一下，你听到的是"啪"的一声，里面什么频率都有。所以它的频谱是一条平线，所有频率等量贡献，幅度都是 1。',
      '反过来也成立：频谱是常数 1，意味着所有频率同相叠加，在 t=0 处全部对齐成峰、其他时刻互相抵消，于是时域变成一个冲激。',
    ],
    steps: [
      '① 由定义 F(jω) = ∫_{-∞}^{+∞} f(t) e^{-jωt} dt。',
      '② 代入 f(t) = δ(t)，用冲激的筛选性质 ∫ δ(t)φ(t)dt = φ(0)。',
      '③ 这里 φ(t) = e^{-jωt}，在 t=0 处 φ(0) = e^0 = 1。',
      '④ 所以 F(jω) = 1，与 ω 无关，幅度谱恒为 1，相位谱恒为 0。',
      '⑤ 由对称性可得对偶关系：常数 1 ↔ 2πδ(ω)，即直流信号的频谱是 ω=0 处的冲激。',
      '⑥ 一般化：δ(t−t₀) ↔ e^{-jωt₀}，时移只改变相位、不改变幅度——这正是"时移不改变频谱形状"的根源。',
    ],
    code: [
      {
        lang: 'matlab',
        text: '% 用窄脉冲逼近冲激，观察频谱趋于平线\nw = linspace(-40, 40, 4000);\nfor tau = [2 0.5 0.1]\n    F = tau * sinc(w*tau/(2*pi));   % 矩形脉冲的频谱 tau*Sa(w*tau/2)\n    plot(w, F, "DisplayName", sprintf("tau=%.1f", tau)); hold on;\nend\nlegend; grid on; xlabel("\\omega"); title("\\tau -> 0 时频谱趋近常数 1");',
      },
      {
        lang: 'python',
        text: 'import numpy as np, matplotlib.pyplot as plt\nw = np.linspace(-40, 40, 4000)\nfor tau in (2, 0.5, 0.1):\n    F = tau * np.sinc(w * tau / (2 * np.pi))   # 注意 np.sinc 归一化为 sin(pi x)/(pi x)\n    plt.plot(w, F, label=f"tau={tau}")\nplt.legend(); plt.grid(True); plt.xlabel("w")\nplt.title("tau -> 0 : spectrum -> 1")\nplt.show()',
      },
    ],
    tip: '记住这套对偶：δ(t) ↔ 1，1 ↔ 2πδ(ω)，δ(t−t₀) ↔ e^{-jωt₀}，e^{jω₀t} ↔ 2πδ(ω−ω₀)。',
    pitfall: 'δ(ω) 与 δ(t) 的系数不要混：1 的变换是 2πδ(ω)，不是 δ(ω)。因为正变换前面没有 1/2π。',
  },
  {
    id: 'q3',
    title: '四大变换的演进主线与收敛域 ROC 判据',
    ch: 'ch0',
    topic: 'ch0-t6',
    formulas: ['f18', 'f26', 'f03'],
    lab: 2,
    keys: ['四大变换', '演进', 'ROC', '收敛域', '拉普拉斯', 'Z变换', '傅里叶'],
    intuition: [
      '一条主线：所有变换都是在问"这个信号由哪些基本单元组成"。傅里叶级数用的是"离散的谐波"，傅里叶变换把它推广到"连续的频率"，但遇到两类信号会失效：不绝对可积的（如 e^{2t}u(t)）和会发散的。',
      '拉普拉斯变换的办法是给信号乘一个衰减因子 e^{-σt}，把它"按下去"再变换——所以 s = σ + jω，傅里叶只是 σ = 0 的那一条竖线。Z 变换是同一招在离散域的版本，乘的是 r^{-k}，z = re^{jΩ}。',
      '所以 ROC 不是附加条件，而是"这个变换到底存不存在"的说明书：它告诉你哪个区域里积分/求和收敛，也决定了一个式子能对应几种时域信号。',
    ],
    steps: [
      '① 连续周期信号：f(t) = ∑ Cₙ e^{jnΩt}，Cₙ = (1/T)∫_T f(t)e^{-jnΩt}dt。条件是狄利克雷条件（绝对可积、有限个极值、有限个间断）。',
      '② 连续非周期信号：让 T→∞，离散谱线间隔 Ω→0，求和变积分，得到 F(jω) = ∫ f(t)e^{-jωt}dt。存在条件是 ∫|f(t)|dt < ∞。',
      '③ 拉普拉斯：把 f(t)e^{-σt} 做傅里叶变换，得 F(s) = ∫_0^-^∞ f(t)e^{-st}dt（单边）。存在条件是存在 σ 使 ∫|f(t)|e^{-σt}dt < ∞。',
      '④ Z 变换：离散域同理，F(z) = ∑ f(k)z^{-k}，收敛条件是 ∑|f(k)|r^{-k} < ∞，即 |z| 落在某个环内。',
      '⑤ ROC 三条硬规则：右边信号的 ROC 在极点最右者的右侧；左边信号在极点最左者的左侧；双边信号是环带；有限长信号 ROC 是整个平面（可能去掉 0 或 ∞）。',
      '⑥ 稳定性判据：连续系统稳定 ⇔ ROC 包含 jω 轴；离散系统稳定 ⇔ ROC 包含单位圆 |z| = 1。因果 ⇔ ROC 是最右极点右侧。两者同时满足才是"因果稳定"。',
      '⑦ 已知 e^{λt}u(t) ↔ 1/(s−λ)，ROC 为 Re{s} > λ。所以同一个式子 1/(s−λ) 配不同 ROC 可以对应右边、左边或双边信号——这就是"变换式 + ROC 才等于信号"。',
    ],
    code: [
      {
        lang: 'matlab',
        text: 'syms t s\nf = exp(-3*t) * heaviside(t);\nF = laplace(f, t, s)        % 1/(s+3)，ROC: Re{s} > -3\n\n% 数值验证：极点实部决定 ROC 左边界\nb = [1]; a = [1 3];\n[z,p,k] = tf2zp(b,a)        % p = -3\nsys = tf(b,a);\nisstable(sys)               % 极点在左半平面 -> 稳定',
      },
      {
        lang: 'python',
        text: 'import sympy as sp\ns, t = sp.symbols("s t")\nf = sp.exp(-3*t) * sp.Heaviside(t)\nF = sp.laplace_transform(f, t, s, noconds=True)\nprint("F(s) =", sp.simplify(F))      # 1/(s + 3)\n# ROC 由收敛条件 Re(s) > -3 给出\n\nimport numpy as np\nprint("j 轴是否在 ROC 内:", 0 > -3)   # True -> 稳定',
      },
    ],
    tip: '一句话记：傅里叶看"频率分布"，拉普拉斯看"频率 + 增长趋势"，Z 变换是离散版的拉普拉斯。FT = LT 在 σ=0 的切片。',
    pitfall: '只写 F(s) 不写 ROC 是不完整的；反过来，判断稳定性时不要只看极点位置，要看 ROC 是否包含 jω 轴（或单位圆）。',
  },
  {
    id: 'q4',
    title: '用单边拉氏变换解含初始值的微分方程',
    ch: 'ch7',
    topic: 'ch7-t3',
    formulas: ['f26', 'f27'],
    lab: 2,
    keys: ['单边拉氏', '初值', '微分方程', '0-', '零输入', '零状态'],
    intuition: [
      '微分方程直接解很麻烦：要设通解、代初值、定系数。拉氏变换把"求导"变成"乘 s"，于是微分方程变成代数方程，解完再反变换回去。',
      '关键在于初值：单边拉氏变换的微分性质里会带出 f(0⁻)，所以初值不是额外条件，而是被自动"吸收"进代数方程里。这就是为什么单边变换的下限要写 0⁻ 而不是 0。',
      '解出来的 y(t) 天然分成两块：只由初值引起的（零输入响应）和只由激励引起的（零状态响应）。用拉氏变换能一眼分开，物理意义非常清楚。',
    ],
    steps: [
      '① 写出微分方程，例如 y″(t) + 3y′(t) + 2y(t) = f′(t) + 4f(t)，已知 y(0⁻)=1，y′(0⁻)=2，f(t)=u(t)。',
      '② 用微分性质：L{y′(t)} = sY(s) − y(0⁻)，L{y″(t)} = s²Y(s) − s·y(0⁻) − y′(0⁻)。',
      '③ 代入并整理：把含 Y(s) 的项归到左边，初值项和激励项归到右边，注意符号。',
      '④ 得到 Y(s) = [初值多项式 + F(s)·(s+4)] / (s²+3s+2)，分母因式分解 (s+1)(s+2)。',
      '⑤ 部分分式展开，每个分式对应一个 e^{-at}u(t)，逐项反变换。',
      '⑥ 检查初值定理：lim_{s→∞} sY(s) 应等于 y(0⁻)=1，可用来验算展开系数对不对。',
    ],
    code: [
      {
        lang: 'matlab',
        text: 'syms s t Y\n% y"" + 3y\' + 2y = f\' + 4f, y(0-)=1, y\'(0-)=2, f=u(t) -> F=1/s\ny0 = 1; dy0 = 2;\nYs = (s*y0 + dy0 + 3*y0 + (s+4)/s) / (s^2 + 3*s + 2);\nyt = ilaplace(Ys, s, t);\nyt = simplify(yt)\npretty(yt)\n% 验算初值\ndouble(limit(s*Ys, s, inf))   % 应等于 1',
      },
      {
        lang: 'python',
        text: 'import sympy as sp\ns, t = sp.symbols("s t")\ny0, dy0 = 1, 2\nYs = (s*y0 + dy0 + 3*y0 + (s + 4)/s) / (s**2 + 3*s + 2)\nyt = sp.inverse_laplace_transform(Ys, s, t)\nprint(sp.simplify(yt))\nprint("初值校验:", sp.limit(s*Ys, s, sp.oo))   # 应为 1',
      },
    ],
    tip: '单边拉氏变换的下限是 0⁻，这样 y(0⁻) 才包含冲激在 t=0 处的全部信息，初值不会被漏掉。',
    pitfall: '零输入响应和零状态响应要分开写进同一个 Y(s) 的分子里，不能混在一起算；代初值时 y′(0⁻) 前面还有一个 s 系数，最容易漏。',
  },
  {
    id: 'q5',
    title: '零极点几何法怎么看频响与稳定性',
    ch: 'ch7',
    topic: 'ch7-t5',
    formulas: ['f24', 'f28'],
    lab: 2,
    keys: ['零极点', '几何法', '频响', '稳定性', '极点', 's平面'],
    intuition: [
      'H(jω) 的模可以写成"所有零点到 jω 点的距离之积"除以"所有极点到 jω 点的距离之积"。这就是几何法：不用算复数除法，拿尺子量距离就能画出幅频特性。',
      '极点像"山峰"：jω 轴上的点走到某个极点附近时，分母变小，幅度就冲高——这就是谐振峰。零点像"山谷"：靠近零点幅度掉下去。',
      '稳定性只看极点：连续系统极点全在左半平面（实部为负）就稳定；离散系统极点全在单位圆内就稳定。零点随便放，不影响稳定性。',
    ],
    steps: [
      '① 把 H(s) 写成因式形式 H(s) = K·∏(s−zᵢ)/∏(s−pⱼ)。',
      '② 取 s = jω，则 |H(jω)| = |K|·∏|jω−zᵢ| / ∏|jω−pⱼ|，∠H(jω) = ∠K + ∑∠(jω−zᵢ) − ∑∠(jω−pⱼ)。',
      '③ 画幅频：让 jω 沿虚轴从 0 走到 ∞，看分子分母距离之比怎么变。极点附近出现峰，零点附近出现谷。',
      '④ 判稳：解分母多项式 D(s)=0 得极点。全部 Re{pⱼ} < 0 ⇔ 稳定；有 Re{pⱼ} > 0 ⇔ 不稳定；有 Re{pⱼ}=0 的单极点 ⇔ 临界稳定（等幅振荡）。',
      '⑤ 二阶系统可快速判断：H(s)=ωₙ²/(s²+2ζωₙs+ωₙ²)，ζ>1 过阻尼、ζ=1 临界、0<ζ<1 欠阻尼（有峰）、ζ=0 无阻尼（虚轴上极点，振荡）。',
      '⑥ 用罗斯判据可以不求根直接判稳：二阶 a₂s²+a₁s+a₀ 全部系数同号即稳定（充要）。',
    ],
    code: [
      {
        lang: 'matlab',
        text: 'z = [-2];  p = [-1+2j, -1-2j, -5];  k = 3;\nsys = zpk(z, p, k);\npzmap(sys); grid on;                 % 看零极点分布\nbode(sys); grid on;                  % 看幅频/相频\nisstable(sys)                        % 极点全在左半平面 -> 1',
      },
      {
        lang: 'python',
        text: 'import numpy as np, matplotlib.pyplot as plt\nz = np.array([-2]); p = np.array([-1+2j, -1-2j, -5]); k = 3\nw = np.logspace(-1, 2, 800)\ns = 1j * w\nH = k * np.prod(s[:,None] - z, axis=1) / np.prod(s[:,None] - p, axis=1)\nplt.subplot(2,1,1); plt.semilogx(w, 20*np.log10(np.abs(H))); plt.grid(True); plt.ylabel("|H| dB")\nplt.subplot(2,1,2); plt.semilogx(w, np.angle(H, deg=True)); plt.grid(True); plt.ylabel("phase deg")\nplt.show()\nprint("稳定:", np.all(p.real < 0))',
      },
    ],
    tip: '速记：极点靠虚轴 → 峰高且窄；极点远离虚轴 → 峰矮且平；左半平面越远衰减越快。',
    pitfall: '稳定性只看极点，不看零点；但"频响有没有凹陷"要看零点。另外 ROC 与因果性一起才能定稳定性。',
  },
  {
    id: 'q6',
    title: '奈奎斯特采样定理与混叠频率计算',
    ch: 'ch6',
    topic: 'ch6-t1',
    formulas: ['f25'],
    lab: 3,
    keys: ['采样', '奈奎斯特', '混叠', 'aliasing', '采样定理', '频谱周期延拓'],
    intuition: [
      '采样就是在时间轴上"打点"。打点这件事在频域里等于把原频谱复制无数份、每隔 f_s 摆一个。只要这些复制品不互相压到，就能用一个低通滤波器把原来那份单独拎出来——这就是采样定理的全部内容。',
      '不重叠的条件是：最高频率 f_max 小于 f_s 的一半。所以 f_s > 2f_max，2f_max 就是奈奎斯特率。',
      '一旦 f_s 不够，复制品就会互相叠上去，高频那份"伪装"成低频，这就是混叠。混叠之后无法用任何滤波器分开，因为它们在同一个频率上。',
    ],
    steps: [
      '① 采样信号 f_s(t) = f(t)·δ_T(t)，其中 δ_T(t) = ∑δ(t−nT)，T = 1/f_s。',
      '② 冲激串的频谱还是冲激串：δ_T(t) ↔ (1/T)∑δ(ω−nω_s)，ω_s = 2π/T。',
      '③ 时域相乘 = 频域卷积，于是 F_s(jω) = (1/T)∑F(j(ω−nω_s))，频谱以 ω_s 为周期重复。',
      '④ 不混叠条件：ω_s > 2ω_max，即 f_s > 2f_max。',
      '⑤ 混叠频率计算：若 f₀ > f_s/2，采样后表现出的频率为 |f₀ − k·f_s| 中落在 [0, f_s/2] 的那个值。',
      '⑥ 恢复：接一个理想低通，截止频率取 f_s/2，增益取 T，即可无失真还原。',
      '⑦ 工程上加抗混叠前置滤波器，把 f_max 先压到 f_s/2 以下，再采样。',
    ],
    code: [
      {
        lang: 'matlab',
        text: 'fs = 100;  f0 = 130;          % f0 > fs/2 -> 必然混叠\nt  = 0:1/fs:1-1/fs;\nx  = cos(2*pi*f0*t);\nf_alias = abs(f0 - round(f0/fs)*fs)   % 30 Hz\n% 用 30 Hz 的余弦去拟合，采样点完全重合\ny = cos(2*pi*f_alias*t);\nmax(abs(x - y))              % 约等于 0，证明无法区分',
      },
      {
        lang: 'python',
        text: 'import numpy as np\nfs, f0 = 100.0, 130.0\nt = np.arange(0, 1, 1/fs)\nx = np.cos(2*np.pi*f0*t)\nf_alias = abs(f0 - round(f0/fs)*fs)      # 30.0\nprint("混叠频率:", f_alias)\ny = np.cos(2*np.pi*f_alias*t)\nprint("采样点最大误差:", np.max(np.abs(x - y)))   # ~0\n# 结论：采样后 f0 与 f_alias 不可区分',
      },
    ],
    tip: '混叠频率算法：f_alias = |f₀ − k·f_s|，取 k 使结果落在 [0, f_s/2]。',
    pitfall: 'f_s = 2f_max 是临界情况，工程上必须取"大于"并留余量；另外采样定理要求信号带限，实际信号要加抗混叠滤波器。',
  },
  {
    id: 'q7',
    title: '吉布斯现象为什么消不掉',
    ch: 'ch4',
    topic: 'ch4-t4',
    formulas: ['f16'],
    lab: 1,
    keys: ['吉布斯', 'Gibbs', '过冲', '傅里叶级数', '间断点', '方波'],
    intuition: [
      '用有限项正弦波去拼一个方波，跳变处总是会"冲出去"一点，然后振铃几下。直觉上你会以为多取几项就好了——项数越多，振铃越窄，但冲出去的高度几乎不变，始终比跳变幅度高出约 9%。',
      '原因是：方波在间断点处不连续，而有限项三角级数是连续函数。用连续函数去逼近一个"断崖"，必然在断崖两侧各留一个峰，这是拓扑层面的矛盾，不是精度问题。',
      '所以吉布斯现象不是"没算够"，而是"用错了工具"：只要在间断点用有限项傅里叶级数逼近，就一定有 9% 的过冲。想真正消掉，得换方法（比如加窗、用其它基函数、或接受它）。',
    ],
    steps: [
      '① 对称方波（幅度 ±1，周期 2π）的傅里叶级数只有奇次谐波：f(t) = (4/π)∑_{n 奇} (1/n) sin(nΩt)。',
      '② 取前 N 项部分和 S_N(t)，它在 t=0 附近会形成一个峰。',
      '③ 把 S_N 的导数求出来，令其为 0，得到峰值位置 t_N ≈ π/(2(N+1))，随 N 增大向间断点靠拢。',
      '④ 计算峰值：S_N(t_N) → (2/π)·Si(π) ≈ 1.1790，而方波幅度是 1，所以过冲约 17.9%，相对跳变幅度 2 则是 8.95%。',
      '⑤ 关键结论：过冲的**绝对高度**与 N 无关，只与跳变幅度有关；N 增大只是让振铃变窄、更贴近间断点。',
      '⑥ 若用最小二乘意义下的最佳逼近，过冲依然存在——这是傅里叶级数在间断点的固有行为。',
    ],
    code: [
      {
        lang: 'matlab',
        text: 't = linspace(-pi, pi, 4000);\nfor N = [1 5 25 101]\n    y = zeros(size(t));\n    for n = 1:2:N\n        y = y + (4/pi) * sin(n*t) / n;\n    end\n    plot(t, y, "DisplayName", sprintf("N=%d", N)); hold on;\nend\nplot(t, sign(sin(t)), "k--", "DisplayName", "理想方波");\nlegend; grid on; ylim([-1.4 1.4]);\ntitle("吉布斯现象：过冲高度不随 N 减小");',
      },
      {
        lang: 'python',
        text: 'import numpy as np, matplotlib.pyplot as plt\nt = np.linspace(-np.pi, np.pi, 4000)\nfor N in (1, 5, 25, 101):\n    y = sum((4/np.pi) * np.sin(n*t)/n for n in range(1, N+1, 2))\n    plt.plot(t, y, label=f"N={N}")\nplt.plot(t, np.sign(np.sin(t)), "k--", label="ideal square")\nplt.ylim(-1.4, 1.4); plt.legend(); plt.grid(True)\nplt.title("Gibbs overshoot ~ 8.95% regardless of N")\nplt.show()',
      },
    ],
    tip: '数字要记住：方波用傅里叶级数逼近，过冲约 8.95%（相对跳变幅度），振铃频率随 N 增大而变高。',
    pitfall: '不要说"项数够多就没有吉布斯"；也不要把过冲 17.9% 和 8.95% 混用——前者是相对单边幅度 1，后者是相对跳变幅度 2。',
  },
  {
    id: 'q8',
    title: '状态转移矩阵怎么求',
    ch: 'ch3',
    topic: 'ch3-t1',
    formulas: ['f13'],
    lab: 0,
    keys: ['状态转移矩阵', '状态方程', '矩阵指数', 'eAt', '状态变量'],
    intuition: [
      '状态方程是一阶矩阵微分方程：x′(t) = Ax(t) + Bf(t)。标量情形 x′ = ax 的解是 x = e^{at}x(0)，矩阵情形把 e^{at} 换成矩阵指数 e^{At}，这个 e^{At} 就是状态转移矩阵。',
      '"转移"两个字很形象：它负责把 t=0 时刻的状态，按系统自身的规律"搬运"到 t 时刻。输入 f 只负责在路上不断往上叠加贡献。',
      '所以完整解 = 零输入响应 e^{At}x(0) + 零状态响应 ∫e^{A(t−τ)}Bf(τ)dτ，形式和标量一阶线性方程完全一样。',
    ],
    steps: [
      '① 由电路或系统写出状态方程 x′ = Ax + Bf 与输出方程 y = Cx + Df，状态变量一般取储能元件的量（电容电压、电感电流）。',
      '② 状态转移矩阵定义为 Φ(t) = e^{At}，它满足 Φ′(t) = AΦ(t)，Φ(0) = I。',
      '③ 求法一（定义/级数）：e^{At} = I + At + (At)²/2! + …，适合手算低阶或验证。',
      '④ 求法二（拉氏变换）：Φ(t) = L⁻¹{(sI − A)⁻¹}，工程上最常用。',
      '⑤ 求法三（对角化）：若 A 有 n 个线性无关特征向量，A = PΛP⁻¹，则 e^{At} = Pe^{Λt}P⁻¹，其中 e^{Λt} 是对角线上 e^{λᵢt}。',
      '⑥ 求法四（凯莱-哈密顿）：e^{At} = α₀I + α₁A + … + α_{n−1}A^{n−1}，系数由特征值代入 e^{λᵢt} 解方程定出。',
      '⑦ 完整响应：x(t) = Φ(t)x(0) + ∫₀ᵗ Φ(t−τ)Bf(τ)dτ，再代 y = Cx + Df。',
    ],
    code: [
      {
        lang: 'matlab',
        text: 'A = [0 1; -2 -3];  B = [0; 1];  C = [1 0];  D = 0;\nsyms t s\nPhi = expm(A*t);            % 符号矩阵指数\npretty(simplify(Phi))\nPhi2 = ilaplace(inv(s*eye(2) - A), s, t);   % 拉氏法验证\nsys = ss(A, B, C, D);\ninitial(sys, [1; 0], 5);    % 零输入响应\ntitle("状态转移：初值 [1;0] 的自由响应");',
      },
      {
        lang: 'python',
        text: 'import numpy as np\nimport sympy as sp\nfrom scipy.linalg import expm\n\nA = np.array([[0., 1.], [-2., -3.]])\nprint("e^{At} at t=1:\\n", expm(A * 1.0))\n\ns, t = sp.symbols("s t")\nAs = sp.Matrix([[0, 1], [-2, -3]])\nPhi = sp.exp(As * t)              # 符号矩阵指数\nprint(sp.simplify(Phi))\nPhi2 = sp.inverse_laplace_transform((s*sp.eye(2) - As).inv(), s, t)\nprint("拉氏法一致:", sp.simplify(sp.simplify(Phi - Phi2)) == sp.zeros(2, 2))',
      },
    ],
    tip: '先记 Φ(t)=L⁻¹{(sI−A)⁻¹} 这一条，考试够用；A 可对角化时用 Pe^{Λt}P⁻¹ 更快。',
    pitfall: 'e^{At} ≠ 逐元素取指数，必须是矩阵指数；另外 Φ(t−τ) 里的 t−τ 不能写成 t。',
  },
];

// ---------- 空状态引导卡 ----------
const GUIDE_CARDS = [
  {
    id: 'g1',
    icon: '📐',
    title: '公式深推',
    desc: '从一个定义出发，把公式一步步推给你看，不跳步骤',
    ask: '把傅里叶变换的时移性质从头推一遍',
  },
  {
    id: 'g2',
    icon: '🔗',
    title: '四大变换贯通',
    desc: 'FT / LT / ZT / DFS 的关系与适用边界，一张图说清',
    ask: '四大变换的演进主线和 ROC 判据',
  },
  {
    id: 'g3',
    icon: '🎯',
    title: '考研大题拆解',
    desc: '按题型给套路：卷积、采样、零极点、微分方程',
    ask: '给我一道卷积综合大题并拆解思路',
  },
  {
    id: 'g4',
    icon: '💻',
    title: '生成仿真代码',
    desc: '直接给出可运行的 MATLAB / Python，边跑边看波形',
    ask: '写一段采样混叠的 Python 演示代码',
  },
];

// ---------- 兜底引导 ----------
const FALLBACK = {
  intro: '这个问题我在离线知识库里没有完全对应的条目，先说能确定的部分：',
  points: [
    '把问题拆成"定义 → 性质 → 计算 → 物理意义"四步，多数信号题都能落地。',
    '如果涉及具体数值，请把表达式或参数发我，我按步骤算。',
  ],
  suggest: ['卷积为什么要翻转', '四大变换的演进主线', '零极点怎么看稳定性', '采样为什么会混叠'],
};

// ---------- 桌宠状态文案 ----------
const PET_MOODS = {
  idle: '在的，随时问',
  think: '正在翻书…',
  happy: '这题拿下！',
  alert: '这里容易错',
};

// ---------- 快捷入口：默认上下文 ----------
const DEFAULT_CTX = {
  match: '',
  tab: '首页',
  label: '通用问答',
  hint: '有信号与系统的问题，直接问我。',
  chapter: 'ch3',
  asks: ['卷积为什么要翻转', '系统怎么判稳', '采样为什么会混叠'],
};

function contextOf(route, options) {
  const r = String(route || '');
  let hit = null;
  for (let i = 0; i < CONTEXT.length; i++) {
    if (r.indexOf(CONTEXT[i].match) === 0 || r === CONTEXT[i].match) {
      hit = CONTEXT[i];
      break;
    }
  }
  const base = hit || DEFAULT_CTX;
  const ctx = {
    match: base.match,
    tab: base.tab,
    label: base.label,
    hint: base.hint,
    chapter: base.chapter,
    asks: base.asks.slice(),
  };
  // 章节目录 / 章节详情：把真实章号带进标签
  if (options && options.chId) {
    ctx.chapter = options.chId;
    const n = String(options.chId).replace('ch', '');
    ctx.label = base.label + ' · 第 ' + n + ' 章';
    ctx.asks = (QUICK[options.chId] || base.asks).slice();
  }
  if (options && options.id && String(options.id).indexOf('ch') === 0) {
    const cid = String(options.id).split('-')[0];
    ctx.chapter = cid;
    const n = cid.replace('ch', '');
    ctx.label = base.label + ' · 第 ' + n + ' 章';
    ctx.asks = (QUICK[cid] || base.asks).slice();
  }
  return ctx;
}

function quickOf(chapter) {
  return (QUICK[chapter] || QUICK.ch3 || []).slice(0, 3);
}

function findHard(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  let best = null;
  let bestScore = 0;
  HARD.forEach((q) => {
    let score = 0;
    if (t.indexOf(q.title.toLowerCase()) >= 0) score += 8;
    (q.keys || []).forEach((k) => {
      const nk = String(k).toLowerCase();
      if (nk && t.indexOf(nk) >= 0) score += nk.length >= 3 ? 5 : 2;
    });
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  });
  return bestScore >= 4 ? best : null;
}

module.exports = {
  STYLES,
  SYMBOLS_SHORT,
  SYMBOLS_FULL,
  CONTEXT,
  QUICK,
  HARD,
  GUIDE_CARDS,
  FALLBACK,
  PET_MOODS,
  DEFAULT_CTX,
  contextOf,
  quickOf,
  findHard,
};
