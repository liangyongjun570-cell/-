// 题库（基础 30 道，覆盖 ch0–ch7；增补题见 qb_a/qb_b/qb_c，共 130 道）
// 难度标签：基础概念 / 期末考研核心 / 工程综合
module.exports = [
  {
    id: 'q01', ch: 1, difficulty: '基础概念',
    stem: '信号 f(t) = 3cos(2πt) 属于哪一类信号？',
    options: ['能量信号', '功率信号', '既非能量也非功率信号', '无法判断'],
    answer: 1,
    hint: '先看信号在无穷时间上是否持续存在：周期信号的能量积分会发散。',
    explanation: '余弦是周期信号，能量 E = ∫9cos²(2πt)dt → ∞，而平均功率 P = 9/2 = 4.5 为有限正值，因此是功率信号。能量信号要求 0 < E < ∞（此时 P = 0）。',
    formulaRef: 'f05',
  },
  {
    id: 'q02', ch: 1, difficulty: '基础概念',
    stem: '系统 y(t) = t·f(t) 的线性与时不变性判断，正确的是：',
    options: ['线性、时不变', '线性、时变', '非线性、时不变', '非线性、时变'],
    answer: 1,
    hint: '线性看"先叠加再处理"与"先处理再叠加"是否相等；时不变看输入延迟后输出是否同样延迟。',
    explanation: '线性：T[αf₁+βf₂] = t(αf₁+βf₂) = αT[f₁]+βT[f₂]，满足。时不变：输入 f(t−t₀) 得 t·f(t−t₀)，而输出延迟 t₀ 应为 (t−t₀)f(t−t₀)，两者不等，故时变。系数含 t 的系统通常时变。',
  },
  {
    id: 'q03', ch: 1, difficulty: '期末考研核心',
    stem: '已知 h(t) = e^{2t}u(−t)，该连续时间 LTI 系统：',
    options: ['因果且稳定', '因果但不稳定', '非因果但稳定', '非因果且不稳定'],
    answer: 2,
    hint: '因果看 t<0 时 h 是否为零；稳定算 ∫|h(t)|dt 是否有限。',
    explanation: '因 h(t) 仅在 t<0 有值，系统"提前响应"，非因果。稳定性：∫₋∞⁰e^{2t}dt = 1/2 < ∞，绝对可积，故 BIBO 稳定。可见"因果"与"稳定"是两个独立条件。',
    formulaRef: 'f07',
  },
  {
    id: 'q04', ch: 2, difficulty: '期末考研核心',
    stem: '设 f(t) 连续，则 ∫₋∞^{+∞} f(t)δ(2t−4)dt 等于：',
    options: ['f(2)', 'f(2)/2', '2f(2)', 'f(4)/2'],
    answer: 1,
    hint: '先把 δ(2t−4) 化成 δ(t−t₀) 的标准形式，注意尺度因子。',
    explanation: 'δ(2t−4) = δ(2(t−2)) = δ(t−2)/2。于是积分 = (1/2)∫f(t)δ(t−2)dt = f(2)/2。冲激做尺度变换时幅值按 1/|a| 变化。',
    formulaRef: 'f09',
  },
  {
    id: 'q05', ch: 2, difficulty: '期末考研核心',
    stem: '信号 f(t) = e^{−t}u(t) 的偶分量 f_e(t) 为：',
    options: ['0.5e^{−|t|}', 'e^{−|t|}', '0.5e^{−t}u(t)', '0.5e^{t}u(−t)'],
    answer: 0,
    hint: '套 f_e(t) = [f(t)+f(−t)]/2，注意 f(−t) = e^{t}u(−t)。',
    explanation: 'f(t) = e^{−t}u(t) 只在 t>0 有值；f(−t) = e^{t}u(−t) 只在 t<0 有值。两者相加恰为 e^{−|t|}，故 f_e(t) = 0.5e^{−|t|}，是双边对称衰减的偶函数。',
    formulaRef: 'f10',
  },
  {
    id: 'q06', ch: 2, difficulty: '基础概念',
    stem: '把 f(t) 变为 f(2t−3)，正确的操作顺序是：',
    options: ['先右移 3 再压缩 2 倍', '先压缩 2 倍再右移 1.5', '先左移 3 再压缩 2 倍', '先压缩 2 倍再左移 1.5'],
    answer: 1,
    hint: '把括号内提取公因子写成 2(t−1.5)，再分别看两个因子。',
    explanation: 'f(2t−3) = f(2(t−1.5))：先对 t 压缩 2 倍得到 f(2t)，再把整体右移 1.5。若先平移 3 再压缩，结果是 f(2t−6)，错位。',
    formulaRef: 'f11',
  },
  {
    id: 'q07', ch: 2, difficulty: '基础概念',
    stem: '离散序列 f(k) = R₄(k)（长度 4 的矩形序列）的一阶后向差分为：',
    options: ['δ(k) − δ(k−4)', 'δ(k) + δ(k−4)', 'u(k) − u(k−4)', 'δ(k−1) − δ(k−5)'],
    answer: 0,
    hint: '后向差分 ∇f(k) = f(k) − f(k−1)，逐点算：只在"起跳"和"落下"两处有非零值。',
    explanation: 'R₄(k) = u(k) − u(k−4)。差分 ∇R₄(k) = δ(k) − δ(k−4)：k=0 处起跳到 1 产生正冲激，k=4 处落回 0 产生负冲激。',
  },
  {
    id: 'q08', ch: 3, difficulty: '基础概念',
    stem: '长度分别为 3 与 4 的两个有限长序列做卷积和，结果长度为：',
    options: ['4', '6', '7', '12'],
    answer: 1,
    hint: '有限长序列卷积的长度公式：N₁ + N₂ − 1。',
    explanation: '3 + 4 − 1 = 6。起点为两序列起点之和，终点为两终点之和，长度即 6。',
    formulaRef: 'f14',
  },
  {
    id: 'q09', ch: 3, difficulty: '基础概念',
    stem: 'x = [1, 2, 3]（k=0,1,2），h = [1, 1]，则 y = x*h 为：',
    options: ['[1, 3, 5, 3]', '[1, 2, 3, 1]', '[3, 5, 3, 1]', '[1, 3, 3, 5]'],
    answer: 0,
    hint: '逐项移位相加：h 只有两个非零值，相当于"原序列 + 延迟一位的原序列"。',
    explanation: 'y(k) = x(k) + x(k−1) 对 k=0..3：1；1+2=3；2+3=5；3。故 [1,3,5,3]。',
    formulaRef: 'f14',
  },
  {
    id: 'q10', ch: 3, difficulty: '期末考研核心',
    stem: '关于 LTI 系统的全响应，下列说法正确的是：',
    options: [
      '零输入响应由输入决定，零状态响应由初始状态决定',
      '零输入响应由初始状态决定，零状态响应由输入决定',
      '两者都由输入决定',
      '两者都由初始状态决定',
    ],
    answer: 1,
    hint: '回忆"零输入"与"零状态"两个词里"零"的是谁。',
    explanation: '零输入响应：令输入为零，只由初始状态引起的响应；零状态响应：令初始状态为零，只由输入引起的响应。全响应 = 两者之和，这正是 LTI 系统可分解性的体现。',
  },
  {
    id: 'q11', ch: 3, difficulty: '期末考研核心',
    stem: '某 LTI 系统 h(t) = δ(t) − δ(t−1)，其单位阶跃响应为：',
    options: ['u(t) − u(t−1)', 'u(t) + u(t−1)', 'δ(t) − δ(t−1)', 't·u(t)'],
    answer: 0,
    hint: '阶跃响应是 h(t) 与 u(t) 的卷积；δ(t−t₀) 与 u(t) 卷积相当于把 u 平移。',
    explanation: 'g(t) = h(t)*u(t) = u(t) − u(t−1)：δ(t) 卷积 u(t) 得 u(t)，δ(t−1) 卷积 u(t) 得 u(t−1)。结果是一个宽度为 1 的矩形脉冲。',
    formulaRef: 'f13',
  },
  {
    id: 'q12', ch: 4, difficulty: '期末考研核心',
    stem: '幅度为 ±1、周期为 T₀ 的对称方波，其傅里叶级数：',
    options: [
      '只含奇次正弦谐波，幅度按 1/n 衰减',
      '只含偶次余弦谐波，幅度按 1/n² 衰减',
      '含全部谐波，幅度按 1/n 衰减',
      '只含直流分量',
    ],
    answer: 0,
    hint: '方波是奇函数（只含正弦），再考虑半波对称性（奇谐函数只含奇次）。',
    explanation: '奇函数使 aₙ = 0，只留正弦项；奇谐特性使偶次谐波为零。bₙ = (4/nπ)（n 为奇数），故 f(t) = (4/π)[sin ω₀t + (1/3)sin3ω₀t + …]，幅度按 1/n 衰减，跳变处出现吉布斯过冲。',
    formulaRef: 'f17',
  },
  {
    id: 'q13', ch: 4, difficulty: '基础概念',
    stem: '周期矩形脉冲信号（周期 T₀，脉宽 τ）的频谱中，相邻谱线的间隔为：',
    options: ['2π/τ', '2π/T₀', 'τ/T₀', '1/τ'],
    answer: 1,
    hint: '周期信号的谱是离散的，间隔由谁决定——周期还是脉宽？',
    explanation: '谱线位于 nω₀，间隔 ω₀ = 2π/T₀，由周期决定；而包络的零点间隔由脉宽决定（2π/τ）。周期越大谱线越密，脉宽越小包络越宽。',
    formulaRef: 'f15',
  },
  {
    id: 'q14', ch: 4, difficulty: '期末考研核心',
    stem: '周期信号在时间上延迟 t₀ 后，其傅里叶级数系数 Cₙ 的变化是：',
    options: ['幅度不变，相位增加 −nω₀t₀', '幅度减半，相位不变', '幅度与相位都不变', '幅度变为原来的 1/n'],
    answer: 0,
    hint: '时移性质：f(t−t₀) 的系数乘上一个复指数因子。',
    explanation: '由 Cₙ′ = Cₙe^{−jnω₀t₀}，幅度 |Cₙ| 不变，相位增加了 −nω₀t₀（随 n 线性变化）。这就是"时移只改相位"在周期信号中的体现。',
    formulaRef: 'f21',
  },
  {
    id: 'q15', ch: 4, difficulty: '基础概念',
    stem: '"奇谐函数"（半波对称，f(t) = −f(t ± T₀/2)）的傅里叶级数：',
    options: ['只含奇次谐波', '只含偶次谐波', '只含直流', '含全部谐波'],
    answer: 0,
    hint: '半波对称意味着平移半个周期后波形反相，偶次谐波平移半周期后不变，只能为零。',
    explanation: '偶次谐波 e^{jnω₀t} 在平移 T₀/2 后变为 e^{jnπ} = 1（n 偶），不满足反相要求，故偶次系数为零；只剩奇次谐波。典型例子是对称方波与三角波。',
    formulaRef: 'f16',
  },
  {
    id: 'q16', ch: 5, difficulty: '期末考研核心',
    stem: '矩形脉冲 p_τ(t)（宽 τ、高 1、关于原点对称）的傅里叶变换及其第一个零点位置是：',
    options: ['τSa(ωτ/2)，零点在 ω = 2π/τ', 'τSa(ωτ)，零点在 ω = π/τ', 'Sa(ωτ/2)/τ，零点在 ω = 2π/τ', '2τSa(ωτ/2)，零点在 ω = π/τ'],
    answer: 0,
    hint: '对 e^{−jωt} 在 ±τ/2 上积分，结果是 (2/jω)sin(ωτ/2)，再写成 Sa 形式。',
    explanation: 'F(jω) = ∫₋τ/2^{τ/2}e^{−jωt}dt = (2/jω)sin(ωτ/2) = τSa(ωτ/2)。Sa(x)=0 的最小正根是 x=π，故 ωτ/2 = π，第一零点 ω = 2π/τ。脉宽越窄，主瓣越宽——时宽带宽积为常数。',
    formulaRef: 'f18',
  },
  {
    id: 'q17', ch: 5, difficulty: '基础概念',
    stem: '单位冲激信号 δ(t) 的傅里叶变换是：',
    options: ['1', '2πδ(ω)', '1/jω', 'πδ(ω)'],
    answer: 0,
    hint: '把 δ(t) 代入定义式，用筛选性质。',
    explanation: 'F(jω) = ∫δ(t)e^{−jωt}dt = e^{0} = 1。物理意义：冲激包含所有频率分量且幅度相同，是"最宽的频谱"。对偶地，直流 1 的变换是 2πδ(ω)。',
    formulaRef: 'f18',
  },
  {
    id: 'q18', ch: 5, difficulty: '期末考研核心',
    stem: '余弦信号 f(t) = cos(ω₀t) 的傅里叶变换为：',
    options: ['π[δ(ω−ω₀)+δ(ω+ω₀)]', 'jπ[δ(ω+ω₀)−δ(ω−ω₀)]', '2πδ(ω−ω₀)', '1/(jω−ω₀)'],
    answer: 0,
    hint: '先用欧拉公式拆成两个复指数，再用 ℱ[e^{jω₀t}] = 2πδ(ω−ω₀)。',
    explanation: 'cos ω₀t = ½(e^{jω₀t}+e^{−jω₀t})，而 ℱ[e^{jω₀t}] = 2πδ(ω−ω₀)，故得 π[δ(ω−ω₀)+δ(ω+ω₀)]：一对位于 ±ω₀ 的冲激，权重 π。（正弦则带 ±j 因子。）',
    formulaRef: 'f18',
  },
  {
    id: 'q19', ch: 5, difficulty: '期末考研核心',
    stem: '已知 ℱ[f(t)] = F(jω)，则 ℱ[f(2t)] 为：',
    options: ['0.5F(jω/2)', '2F(j2ω)', 'F(j2ω)', '0.5F(j2ω)'],
    answer: 0,
    hint: '尺度性质：时间压缩 a 倍，频谱展宽 a 倍、幅度乘 1/|a|。',
    explanation: 'ℱ[f(at)] = (1/|a|)F(jω/a)。取 a = 2 得 0.5F(jω/2)：时域压缩使频谱展宽并降幅，与"时宽带宽积为常数"一致。',
    formulaRef: 'f21',
  },
  {
    id: 'q20', ch: 6, difficulty: '基础概念',
    stem: '线性系统实现无失真传输的频域条件是：',
    options: [
      '幅频为常数、相频为过原点的直线',
      '幅频为常数、相频为常数',
      '幅频线性增长、相频为零',
      '幅频与相频都为常数',
    ],
    answer: 0,
    hint: '无失真意味着输出只是输入的延迟缩放：y(t) = Kf(t−t_d)，对它做傅里叶变换看看。',
    explanation: 'y(t)=Kf(t−t_d) 的变换为 KF(jω)e^{−jωt_d}，故 H(jω)=Ke^{−jωt_d}：|H| = K 为常数（各频率等增益），φ(ω) = −ωt_d 为过原点的直线（群延迟恒定）。相频若只是常数，不同频率延迟不同，波形会失真。',
    formulaRef: 'f24',
  },
  {
    id: 'q21', ch: 6, difficulty: '基础概念',
    stem: '最高频率 f_m = 2 kHz 的带限信号，无失真采样的最低采样频率应大于：',
    options: ['1 kHz', '2 kHz', '4 kHz', '8 kHz'],
    answer: 2,
    hint: '采样定理：f_s > 2f_m。',
    explanation: 'f_s > 2f_m = 4 kHz。临界值 2f_m 称奈奎斯特频率，实际工程常取 4–5 倍留裕量（如音频取 44.1 kHz）。',
    formulaRef: 'f25',
  },
  {
    id: 'q22', ch: 6, difficulty: '工程综合',
    stem: '用 f_s = 8 kHz 采样一个 5 kHz 的正弦信号，恢复后会听到的频率是：',
    options: ['5 kHz', '3 kHz', '8 kHz', '13 kHz'],
    answer: 1,
    hint: '采样后频率会折叠到 [0, f_s/2] 区间：先算 f₀ − k·f_s 的绝对值。',
    explanation: 'f_s = 8 kHz < 2×5 kHz，发生混叠。混叠频率 = |f₀ − f_s| = |5 − 8| = 3 kHz。这就是为什么抗混叠滤波器必须放在采样器之前。',
    formulaRef: 'f25',
  },
  {
    id: 'q23', ch: 6, difficulty: '工程综合',
    stem: '理想延迟系统 H(jω) = e^{−j3ω}（|ω| 全通），输入 f(t) = Sa(2t) 时输出为：',
    options: ['Sa(2(t−3))', 'Sa(2t−3)', 'Sa(2(t+3))', '3Sa(2t)'],
    answer: 0,
    hint: 'H(jω) = e^{−jωt_d} 对应的时域作用是"延迟 t_d"，注意延迟的是整个信号。',
    explanation: 'e^{−j3ω} ⇔ δ(t−3)，输出 = f(t)*δ(t−3) = f(t−3) = Sa(2(t−3))。这是"线性相位 = 纯延迟"的直接体现。',
    formulaRef: 'f21',
  },
  {
    id: 'q24', ch: 7, difficulty: '基础概念',
    stem: '单边拉普拉斯变换 ℒ[e^{−2t}u(t)] 及其收敛域为：',
    options: ['1/(s+2)，Re(s) > −2', '1/(s−2)，Re(s) > 2', '1/(s+2)，Re(s) < −2', '1/(s²+4)，Re(s) > 0'],
    answer: 0,
    hint: '套 ℒ[e^{−at}u(t)] = 1/(s+a)，ROC 在极点右侧。',
    explanation: '∫₀⁻^∞ e^{−2t}e^{−st}dt = ∫₀^∞ e^{−(s+2)t}dt = 1/(s+2)，收敛要求 Re(s+2) > 0 即 Re(s) > −2。极点 s = −2 在左半平面，信号衰减。',
    formulaRef: 'f27',
  },
  {
    id: 'q25', ch: 7, difficulty: '期末考研核心',
    stem: '已知 F(s) = 1/(s(s+1))，用终值定理求 f(∞) 得：',
    options: ['1', '0', '∞', '不存在'],
    answer: 0,
    hint: '终值定理：f(∞) = lim_{s→0} sF(s)，前提是 sF(s) 的极点都在左半平面。',
    explanation: 'sF(s) = 1/(s+1)，令 s→0 得 1。也可逆变换验证：f(t) = (1−e^{−t})u(t) → 1。注意若 sF(s) 有右半平面极点（如发散信号），终值定理不适用。',
  },
  {
    id: 'q26', ch: 7, difficulty: '期末考研核心',
    stem: 'H(s) = 1/(s²+2s+3) 的因果系统是否稳定？',
    options: ['稳定，极点为 −1±j√2', '不稳定，极点有正实部', '临界稳定，极点在虚轴', '无法判断'],
    answer: 0,
    hint: '解分母 s²+2s+3=0，看极点实部符号。',
    explanation: 's²+2s+3 = 0 → s = −1 ± j√2，实部 −1 < 0，极点全在左半平面，因果系统稳定。判据：因果有理系统稳定 ⇔ 全部极点位于 s 左半平面。',
    formulaRef: 'f28',
  },
  {
    id: 'q27', ch: 7, difficulty: '工程综合',
    stem: 'F(s) = 1/(s(s+1)) 的逆变换 f(t)（t ≥ 0）为：',
    options: ['(1−e^{−t})u(t)', 'e^{−t}u(t)', 't·u(t)', '(1+e^{−t})u(t)'],
    answer: 0,
    hint: '部分分式：1/(s(s+1)) = A/s + B/(s+1)，定系数后逐项逆变换。',
    explanation: 'A = 1，B = −1，故 F(s) = 1/s − 1/(s+1)，逆变换为 (1 − e^{−t})u(t)。这是 RC 电路阶跃充电的标准响应。',
    formulaRef: 'f27',
  },
  {
    id: 'q28', ch: 0, difficulty: '基础概念',
    stem: '三大变换的适用对象，配对正确的是：',
    options: [
      '傅里叶变换—连续非周期信号；拉普拉斯—连续信号（含增长）；Z 变换—离散序列',
      '傅里叶变换—离散序列；拉普拉斯—离散序列；Z 变换—连续信号',
      '傅里叶变换—周期信号；拉普拉斯—离散序列；Z 变换—连续信号',
      '三者都只适用于周期信号',
    ],
    answer: 0,
    hint: '看每个变换的定义式中时间是连续还是离散、是否引入衰减因子。',
    explanation: 'FT 处理连续非周期信号（周期信号用 FS）；LT 通过 e^{−σt} 扩展了可变换范围，能处理增长信号；ZT 是离散序列的复频域工具。三者构成"时域—频域—复频域"的完整链条。',
  },
  {
    id: 'q29', ch: 0, difficulty: '期末考研核心',
    stem: 'f(k) = a^k u(k) 的 Z 变换 F(z) = z/(z−a)，若要求单位圆落在收敛域内（即 DTFT 存在），需满足：',
    options: ['|a| < 1', '|a| > 1', 'a > 0', '任意 a'],
    answer: 0,
    hint: 'ROC 是 |z| > |a|，单位圆是 |z| = 1。',
    explanation: 'ROC 为 |z| > |a|，单位圆 |z| = 1 落在其中要求 |a| < 1，此时序列衰减、DTFT 存在。若 |a| > 1，序列发散，只能谈 Z 变换而不能谈 DTFT。',
    formulaRef: 'f02',
  },
  {
    id: 'q30', ch: 0, difficulty: '基础概念',
    stem: '拉普拉斯变换与傅里叶变换的关系是：',
    options: [
      'F(jω) = F(s)|_{s=jω}（当虚轴在 ROC 内时）',
      'F(jω) = F(s)|_{s=0}',
      '两者完全无关',
      'F(jω) = F(s)|_{s=σ}',
    ],
    answer: 0,
    hint: 'LT 的定义式里把 s 换成 jω 会得到什么？',
    explanation: 'LT 定义中取 s = jω 即得 FT（要求 ROC 包含虚轴）。s 平面与 ω 轴的关系解释了为什么"极点离虚轴越近，频响峰越尖"。',
    formulaRef: 'f26',
  },
];

// 题库扩容：按章增补（qb_a: ch0–ch2 / qb_b: ch3–ch5 / qb_c: ch6–ch7）
// 拆文件只是为了编辑时不用在千行里翻找，对外仍是同一个数组
const ALL = module.exports.concat(
  require('./qb_a'),
  require('./qb_b'),
  require('./qb_c')
);

// ---------- 选项稳定乱序 ----------
// 手工出题时正确项几乎都写在 A/B，直接上线会被"记位置"：这里按题目 id 打散。
// 关键点是"稳定"：同一个 id 在任何设备、任何时刻打散结果相同，于是
//   ① PK 双方拿到的选项顺序一致（公平）；
//   ② 错题本/战报里的"你选 A、正确 C"不会前后矛盾；
//   ③ 正确答案在四个位置上的数量保持均衡（不是随机，是按直方图补最短的那一列）。
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function balance(list) {
  const hist = [0, 0, 0, 0];
  return list.map((q) => {
    if (!q.options || q.options.length !== 4) return q;
    const correct = q.options[q.answer];
    const others = q.options.filter((o, i) => i !== q.answer);
    const rnd = mulberry32(hashStr(String(q.id || q.stem)));
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = others[i];
      others[i] = others[j];
      others[j] = t;
    }
    const target = hist.indexOf(Math.min.apply(null, hist));
    hist[target] += 1;
    const options = [];
    let k = 0;
    for (let i = 0; i < 4; i++) options[i] = i === target ? correct : others[k++];
    return Object.assign({}, q, { options: options, answer: target });
  });
}

module.exports = balance(ALL);
