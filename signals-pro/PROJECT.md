# 信号与系统 Pro — 工程构成清单

> 维护备忘：数字按 2026-10-30 当前代码实测统计。改动模块后请同步更新本文件。

## 一、项目定位

微信原生小程序（无 npm 框架），《信号与系统》课程学·练·测·问一体化工具：章节精读、题库刷题、公式速查、虚拟实验室（含麦克风频谱）、1v1 擂台、AI 助教。

- 工程路径：`D:\xiaochengxu2\signals-pro`
- 代码总量：约 9000 行（不含素材）

## 二、目录构成

| 目录 | 内容 | 职责 |
|---|---|---|
| `pages/` | 14 个页面 | UI 与交互（5 tab + 9 子页） |
| `custom-tab-bar/` | 1 套 | 自定义 tab + 跨 tab 返回条 |
| `components/` | 3 个全局组件 | `math` 公式渲染、`sticker` 宠物贴纸、`assistant` 聊天 |
| `data/` | 17 个纯数据文件 | ch0–ch7 讲义、题库 130（qb_a/b/c + questions）、公式 28、精讲 14、离线知识 15、皮肤 32 |
| `utils/` | 13 个逻辑模块 | store / sync / auth / ai / engine / vision / pk / chat / math / search / cloud / util / appref |
| `cloudfunctions/mycloud/` | 1 个云函数 | 9 个 action 统一入口 |
| `assets/` | 32 皮肤图 + 6 宠物表情 + 3 纸纹 | 静态素材 |
| 项目根 `_smoke_*.js` | 13 套烟测 | Node 跑，不进小程序包（位于 `D:\xiaochengxu2\`） |

## 三、页面地图

- **Tab 五页**：首页 index · 章节 chapters · 实验室 lab · 公式 formulas · 我的 me
- **子页九个**：chapter 章节详情 · topic 专题 · quiz 刷题 · mistakes 错题本 · tutor 精讲 · records 学习记录 · pk 擂台 · assistant AI 助教 · login 登录

## 四、核心模式

1. **账号隔离本地存储**（`store.js`）——每个账号一键 `ssp_user_<acc>`，游客固定 `__guest__`；读档时 `defaults()` 整档合并 + `normPk()` 等纠偏兜底，坏数据算不出 NaN、切号不串数据。剪贴板 JSON 导出/导入做手动备份。
2. **本地为真源 + 云镜像同步**（`sync.js`）——本地永远是完整副本，云端只做跨设备镜像；快照瘦身（AI 会话留 10 个×30 条、pk 战史不上传、昵称落具体名防排行榜重名）；2 秒防抖 + `_busy`/`_dirty` 双标志防并发；未开云开发时整链静默 `off:true`，零网络请求。
3. **AI 四级降级链**——直连小米 MiMo（OpenAI 兼容）→ 云函数中转（`action:chat`，Key 在服务端、绕 request 域名白名单）→ 云开发 AI+RAG 流式 → 离线引擎（`engine.js`，内置题库三风格）；`via` 字段穿透到界面标注来源（直连 / 云函数中转 / 无标注=离线）；错误按 errMsg 归因成 domain/timeout/quota/model 等可操作文案。
4. **同构双端组件**——assistant 既有独立页（`pages/assistant`）又有全局组件（`components/assistant`），同一套问答逻辑，其他页面可内嵌对话框。
5. **视觉批改三层 + 拍照搜题**（`vision.js` + `search.js`）——本地像素分析（纸面质量/行切分/题型）→ 教材口径规则批改（符号、积分限等逐条校验）→ 云 OCR；识别文字再经 `search.matchQuestions`（字符二元组 Dice 相似度）匹配题库 130 道原题，报告里给出相似度/选项/答案/解析；刻意不编造没识别出的手写内容。报告渲染统一走 `vision.reportBlocks`（页面端/组件端共用）。
6. **登录三态**（`auth.js` + `app.js`）——游客直接进 / 微信一键登录 / 本地会话恢复；启动后 600ms 静默 `syncAll`，换手机同微信接着学。资料用官方「头像昵称填写」（`chooseAvatar` + `type="nickname"`）一键带入微信头像昵称，头像拷进 `USER_DATA_PATH` 只存本机、不进同步快照。
7. **云函数单入口 dispatch**——action 分发 + 全路径 try/catch，崩溃转 `chat-crash:` 可读错误；LLM 请求 18s 超时（须在控制台把函数超时调到 20s）。
8. **渐进可用**——所有功能在未开云开发时本地完整可跑，开通后增强（同步/RAG/OCR/中转），无一处硬依赖云端。

## 五、云函数 9 个 action

| action | 职责 |
|---|---|
| `login` | 微信登录建档 |
| `pull` / `push` | 学习档案同步 |
| `rank` | 排行榜 |
| `rag` | 教材切片检索 |
| `chat` | 小米 MiMo 中转（Key 存服务端） |
| `ocr` | 印刷体识别 |
| `pksave` / `pkget` | 段位战绩 |

## 六、质量与发布关卡

- **烟测**：13 套全绿（题库结构、登录态、游客隔离、云同步合并、PK 段位、AI 配置往返 / 错误归因 / via 穿透 / 导入恢复等）
- **隐私指引 4 类用途**：
  - 麦克风：用于采集环境声音并实时进行频谱分析，演示傅里叶变换
  - 相册（仅写入）：用于将 1v1 对战生成的战报长图保存到你的相册，便于分享留存
  - 剪切板：用于复制公式与学习文本，并导出、导入学习数据备份
  - 照片或视频信息：用于拍照或从相册选取题目照片，进行识别与手写推导批改
- **密钥管理**：MiMo Key 不硬编码、不进 git——客户端放 `utils/ai.key.local.js`、云函数放 `cloudfunctions/mycloud/mimo.key.js`（均被 .gitignore 排除，仓库只含 `*.example.js` 模板）。没有 Key 文件时整条链自动降级（直连→云函数中转→云开发 AI→离线），不会崩。
- **发布前核对**：
  1. 云函数部署包里确认带 `mimo.key.js`（中转的 Key 在服务端，不怕小程序包被反编译）
  2. 云开发控制台 mycloud 超时调到 20s
  3. mp 后台 request 合法域名已登记 `https://api.xiaomimimo.com`（直连快路径）
  4. 可选：不想让 Key 进小程序安装包时，上传前清空 `utils/ai.key.local.js` 的 KEY（用户可自填直连，不填则走中转）
