# 知识库与 Agent 应用

> **翻译说明：** 本页是与 [英文源规格](/spec/03-runtime/23-knowledge-and-agent-apps) 一一对应的机器辅助翻译。代码、协议字段和标识符保持原文；如翻译与英文源事实有歧义，以英文版本为准。

Schema v29 在 JSON-RPC 分发器之后新增两个由宿主拥有的领域：

- `knowledge.*` —— 本地文档库，支持关键词与可选语义检索，以及 hub 可视化的活动轨迹。
- `apps.*` —— 桌面在既有工作面板 Browser 标签页中打开的 Web 应用注册表。

两者只由 `crates/host-core` 写入。渲染进程通过 `host.call` 访问它们，永不直接打开 SQLite。决策见
[ADR 0338](../../../adr/0338-knowledge-base-and-agent-apps.md)。

## 1. 存储

| 表 | 归属 | 内容 |
|---|---|---|
| `knowledge_libraries` | `knowledge` | 名称、描述、语义开关、嵌入提供程序/模型 |
| `knowledge_documents` | `knowledge` | 源路径或笔记标题、媒体类型、字节大小、状态、错误 |
| `knowledge_chunks` | `knowledge` | 片段序号、文本、可选 `f32` 嵌入 blob |
| `knowledge_chunks_fts` | `knowledge` | 覆盖 `knowledge_chunks.text` 的 FTS5 `trigram` 外部内容索引 |
| `knowledge_activity` | `knowledge` | 动作、库/文档 id、短标题、时间戳 |
| `agent_apps` | `agent_apps` | 名称、描述、类型、入口、图标、启用、排序、最近打开 |

`knowledge_chunks_fts` 由 `knowledge_chunks` 上的插入/更新/删除触发器保持同步；没有代码直接写入它。必须使用
trigram 分词：默认的 `unicode61` 分词器会把一段连续中文当作单个词元，使子串检索失去意义。

全新数据库执行 v30 DDL：v28 的表、v29 活动表，以及 v30 正文字段 `content_md`、`content_state`
（`legacy` / `ready` / `failed`）、`content_kind`（`markdown` / `text` / `pdf-text` / `office-text`）与
`char_count`。升级链为 v27→v28→v29→v30。每一步都是幂等的（表与索引用 `IF NOT EXISTS`，字段先探测是否存在）
并复用同一个 `knowledge::SCHEMA` 常量，因此全新安装与升级安装不会分叉。v28→v29 只新增一张表及其索引；
v29→v30 新增字段并做备份，把既有文档标记为 `legacy` 而不是重写行：正文在首次打开时才落库。

### 库负载

`knowledge.listLibraries` 返回 hub 需要的计数，无需二次查询：

- `documentCount` —— 就绪（可检索）的文档；
- `documentTotal` —— 所有行，包括导入失败的；
- `failedDocumentCount` —— 没有产出可用文本的导入；
- `vectorPendingDocumentCount` —— 至少有一个片段尚未嵌入的就绪文档；
- `chunkCount` / `embeddedChunkCount` —— 索引进度。

### 活动轨迹

每个会修改数据的 knowledge 调用都会尽力向 `knowledge_activity` 追加一行：`base.create`、`base.delete`、
`doc.upload`、`doc.manual`、`doc.delete`、`doc.save`、`index.run`，以及每次成功检索的 `search`。写入是最尽力而为的：
失败只记录日志，绝不让用户请求的操作失败。全局保留 500 行，插入时裁剪；删除库会移除其文档级行，但保留
`base.create` 与 `base.delete`，让轨迹仍能显示生命周期。

`knowledge.listActivities` 返回 `{ activities[] }`，按最新在前排序，可选 `libraryId` 与 `limit`（限制 1–50，
默认 5）。`knowledge.activityTrend` 返回 `{ days, points[] }`，每个点形如 `{ day: "YYYY-MM-DD", searches }`，
使用本地时间。只有 `search` 与 `ask` 动作算作访问；上传与编辑不算访问。时间窗限制 1–30 天（默认 7）。

## 2. 摄取

`knowledge.importFiles` 接受库 id 与绝对路径数组。桌面在主进程从 `dialog.showOpenDialog` 取得这些路径；
渲染进程永远不会为该方法编造路径。

提取支持：

- 纯文本与代码 —— 散文（`txt`、`md`、`markdown`、`rst`、`log`），数据（`json`、`jsonl`、`csv`、`tsv`、
  `yaml`、`yml`、`toml`、`ini`、`xml`），标记（`html`、`htm`，去除标签），以及源码（`py`、`js`、`jsx`、
  `ts`、`tsx`、`go`、`rs`、`java`、`kt`、`c`、`h`、`cpp`、`sql`、`sh`、`css`）；
- `pdf` 通过文本提取；
- `docx`、`pptx`、`xlsx` 通过 ZIP + XML 文本。

`knowledge.supportedExtensions` 是桌面构建选择器过滤器的权威清单；本节与该常量不得漂移。

旧式二进制 Office 格式（`.doc`、`.ppt`、`.xls`）会以可操作的提示被拒绝；它们不是 OOXML，没有转换器无法读取。

Markdown 与纯文本导入把源文本存为文档正文（`content_md`，`content_kind: markdown`，`content_state: ready`）；
PDF 与 Office 导入存储提取出的文本（`content_kind: pdf-text` / `office-text`），并且只读。提取出的正文按原样
存储 —— 裁剪只用于校验，绝不作用于已存的值。

限制：单文件 16 MB，提取 4,000,000 字符，单文档 2,000 片段。片段按整段聚合，最多 1,200 字符；更长的段落
会在 200 字符重叠处硬切。

`knowledge.importText` 接受 `{ libraryId, title, text }`，把笔记存为文档。同一库中的重复内容会报告为
`duplicate`，而不是重复存储；单文件失败以 `outcomes[]` 返回，带 `status: "failed"` 与错误码，因此一个坏文件
不会中断整批。

## 3. 检索

`knowledge.search` 接受：

```json
{ "query": "string", "libraryId": "optional", "mode": "hybrid|keyword|semantic", "limit": 8 }
```

- `keyword` 在 trigram 索引上使用 `bm25`。短于三个字符的查询无法命中 trigram 索引，因此该方法回退到有界的
  `LIKE` 扫描；两字中文查询很常见，必须可用。
- `semantic` 用库配置的提供程序/模型嵌入查询，并按余弦相似度对已嵌入片段排序。
- `hybrid` 以倒数排名融合合并两个排序列表。

结果是扁平对象 `{ query, mode, degraded, hits[] }`，每个命中携带文档 id、标题、源路径、片段序号、片段摘要与
分数。桌面 API 在顶层读取 `hits` 与 `degraded`，因此负载不得再包一层 `result` 对象。未配置语义的库、或嵌入
调用失败，会置 `degraded: true` 并返回关键词命中；调用本身不失败。没有任何向量的 `semantic` 返回空命中，
而不是编造结果。

`knowledge.indexLibrary` 以有界批次嵌入所有未嵌入片段，并报告 `{ embedded, remaining, providerId, model }`。
再次运行会从上一次停止处继续。每次运行追加一行 `index.run` 活动记录。

限制：查询 512 字符，`limit` 限制在 1–32。向量以小端 `f32` blob 存储；更改库的提供程序或模型会清除该库的
向量，而不是混用不兼容的向量空间。

## 4. 文档预览

`knowledge.getDocument` 接受 `{ libraryId, documentId }`，返回 `{ document, chunks[], truncated }`。文档必须
属于该库；不匹配会被拒绝，而不是泄漏另一库的行。

`chunks[]` 是按序号排列的已存提取行（`ordinal`、`text`、`charCount`、`embedded`）。预览把片段拼接起来供列表
与检索界面使用，从而让预览与检索共享同一事实来源：Agent 能检索到的，正是用户能读到的。导入失败会返回其文档行
与空片段列表，让阅读器显示已存的 `errorCode`/`errorMessage`，而不是空页面。

限制：每次请求最多 400 个片段与 240,000 字符；更大的源在片段边界处截断，`truncated` 为真。该方法只读取
`knowledge_documents` 与 `knowledge_chunks`。

### 正文存储

`knowledge.getDocumentContent` 接受 `{ libraryId, documentId }`，返回
`{ document, content, contentKind, contentState, truncated }`，是阅读器的读取路径：

- `ready` 行原样返回 `content_md`；
- `legacy` 行在首次打开时于同一事务内回填：源文件仍在则重新抽取，否则把已存片段拼接并做 200 字符重叠去重；
  结果上限 800,000 字符，超出则标记 `truncated`，并写入 `ready`（失败则写入 `failed` 与错误信息）；
- `content_kind` 为 `pdf-text` / `office-text` 的文档在界面中只读。

`knowledge.saveDocumentContent` 接受 `{ libraryId, documentId, content }`，返回 `{ document }`。只有 `markdown`
与 `text` 文档可以改写；PDF 与 Office 正文会被 `INVALID_PARAMS` 拒绝，因为它们是 Trail 不拥有的文件的提取文本。
保存只在校验时裁剪正文，存储时原样保留，随后重新切片（规则与摄取一致）、清除该文档的向量、更新 `content_hash`、
`char_count` 与 `chunk_count`，并追加 `doc.save` 活动行。空正文会被拒绝。

## 5. 面向 Agent 的检索

`KnowledgeSearch` 是风险等级为 `low` 的内置工具：

```json
{ "query": "string", "libraryId": "optional", "mode": "hybrid", "limit": 6 }
```

`tools.execute` 在路径/Shell 权限管线之前就回答它，因为它只读取宿主拥有的表，不注册进程。省略 `libraryId`
会搜索所有库；默认上限为六段。工具结果与前面相同的 `{ query, mode, degraded, hits }` 对象，因此模型可以引用
文档标题，并在没有匹配时如实说明。

## 6. Agent 应用

`apps.create` / `apps.update` 接受 `{ name, description, kind, entry, icon?, enabled? }`，其中 `kind` 为
`remote` 或 `folder`：

- `remote` 要求 `http` 或 `https` URL 且主机非空。空白、控制字符与其他协议都会被拒绝。
- `folder` 要求包含 `index.html` 或 `index.htm` 的绝对目录路径。存储的 entry 是路径；`openUrl` 是百分号编码
  的 `file://` URL。

`apps.list` 返回每一行外加计算得到的 `openUrl`、`available` 与 `unavailableReason`。`index.html` 消失的
folder 仍然列出并标记 `available: false`，让用户可以修复或删除；不会因巡检而裁剪行。

`apps.pickFolder` 只存在于桌面主进程（原生目录对话框）；它返回路径或 `null`，不是 RPC 方法。

`apps.markOpened` 记录 `lastOpenedAt`。打开本身是渲染进程动作：`openWorkPanelTab(browserPluginTab(openUrl))`，
它复用 `pi.browser` 面板标签，而不是新建第二个 Browser，也不打开系统浏览器。

## 7. 安全边界

- 路径来自原生对话框，在 host-core 中重新校验，绝不从渲染进程里的用户输入字符串拼装。
- 应用只接受 `http(s)` 与可用于 `file://` 的绝对文件夹；`javascript:`、`data:` 与远程路径输入被拒绝。
- Folder 应用以只读方式打开；它们无法通过 Browser 界面写入用户的目录树。
- `KnowledgeSearch` 只暴露摘录而非整篇文档，也不在结果元数据之外披露文件路径。

## 8. 桌面界面

知识页有两个层级：

- **Hub** —— hero、库过滤器（`Ctrl/⌘ K` 限定在本页）、四张统计卡（库数、文档数、处理中、可用度）、库列表，
  以及分页器（每页 20/50/100，持久化在 `localStorage`）。每行显示状态点、由库负载派生的健康行、文档计数、
  嵌入模型与最近更新日期。上下文菜单与 `⋯` 菜单提供打开、重建索引（仅语义库）与删除。
- **工作台** —— 打开库后进入文档工作台，而不是列表：
  - 顶栏包含返回、库名、摄取动作与五个 tab —— **文档**（已实现）、**问 AI**、**检索**（原检索面板）、
    **Wiki**、**图谱**。问 AI 与 Wiki/图谱当前显示明确的“下一阶段”占位；绝不渲染编造的数据。
  - 左栏目录（文件树按源目录分组并可标题过滤，另有大纲模式：列出当前文档的 H2/H3 标题，通过
    `IntersectionObserver` 高亮可视章节）；
  - 中栏阅读区：紧凑页栏（标题、类型、大小、字符数、阅读时长、保存/只读状态）、由真实文档统计构建的 hero 卡，
    以及带标题锚点的 Markdown 正文。`markdown`/`text` 正文以编辑区打开；保存调用
    `knowledge.saveDocumentContent` 并刷新活动轨迹。PDF/Office 正文以只读渲染，页栏给出原因。
  - 右栏五张卡：健康度仪表、文档信息、索引状态、相关知识（同目录文档）与按 `documentId` 过滤的操作轨迹。
  - 布局：≥1440px 为 260px / 1fr / 300px；1200–1440px 保持三栏、右栏 280px；1024–1200px 右栏收进抽屉；
    低于 1024px 左栏也变成抽屉。页面在壳层内全宽展开（`.is-workbench` 解除 1120px 内容宽度上限）。

工作台健康度是文档分而非 hub 的库分：100 减去导入失败 60、零片段 30、语义库中仍有片段待向量化 10、缺少标题 5、
30 天未更新 5，最低为 0，并在仪表下列出扣分原因。分数实时计算、从不存储 —— 不存在固定的 92。

库健康度仅在启用语义检索时才把向量积压算作“处理中”：只有关键词的库即使有未嵌入片段也是健康的，不算待处理。

洞察栏显示健康度、七日检索趋势、最近活动与三个快捷动作。健康度聚合各库的就绪/总文档，并对失败与仍在处理的
文档扣分；分数不做持久化。快捷动作打开相关库（聚焦搜索或失败文档过滤器）或重建语义索引。库内问答尚未实现：
工作台的“问 AI” tab 只是占位，因此本页不会假装发送聊天消息。所有字符串都经过九个语言目录。
