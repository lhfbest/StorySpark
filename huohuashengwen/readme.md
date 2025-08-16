下面是一份**可交接的项目代码文档**（面向下一个 AI/开发者），覆盖项目结构、运行方式、端到端数据流、接口契约、关键前后端模块、如何扩展新模型、常见问题与排查清单。按此文档即可快速上手与安全修改。

---

# 火花生文 · 项目代码文档

> 主题：小说 AI 助手（“你只需要创意和决策，内容交给火花”）
> 前端：纯前端 HTML/CSS/JS（ES5 兼容版）
> 后端：Flask + 可插拔模型网关（Gemini / DeepSeek）
> 交互：根信息 → 自动生成「三选一 + 其他」 → 按节点确认生成后续 → 树状展开，支持路径高亮与世界线总结

---

## 1. 目录结构与职责

```
huohuashengwen/
├─ run.py                     # 启动入口（Flask）
├─ app/
│  ├─ __init__.py             # Flask App 工厂（create_app）
│  ├─ config.py               # 配置与默认 provider、API Keys、模型参数
│  ├─ routes/
│  │  ├─ __init__.py
│  │  └─ api.py               # 后端 REST API：/api/initial, /api/summarize_and_expand
│  ├─ services/
│  │  ├─ gateway.py           # 模型网关：前端传入 provider → 路由到具体模型
│  │  ├─ gemini.py            # 谷歌 Gemini 调用（JSON 输出封装）
│  │  └─ deepseek.py          # DeepSeek（OpenAI 兼容）调用（JSON 输出封装）
│  ├─ templates/
│  │  └─ index.html           # 页面骨架（左侧总结面板 + 右侧根输入+树+SVG曲线层）
│  └─ static/
│     ├─ css/
│     │  └─ styles.css        # UI 样式（节点框、光晕、灰暗态、曲线样式等）
│     └─ js/
│        └─ main.js           # 前端逻辑（ES5 版：事件、树渲染、曲线、面板、API 调用）
```

**模块边界**

* `routes/api.py`：只负责 HTTP 层解析/返回，不直接拼模型 Prompt。
* `services/gateway.py`：只负责“选哪个模型就走哪个模型”，无强制覆盖。
* `services/gemini.py` / `services/deepseek.py`：**各自**完成 Prompt 拼装 & 调用，并归一到统一 JSON 响应结构。
* `templates/index.html` + `static/js/main.js`：前端展示、交互、状态管理；严格**端到端契约**发起 POST。

---

## 2. 运行与环境

### 2.1 依赖

* Python 3.8+（Windows/conda 环境可）
* Flask
* requests 或 openai（DeepSeek 为 OpenAI 兼容）
* 浏览器（建议 Chrome/Edge 新版；当前前端为 ES5 兼容版，旧内核也可运行）

### 2.2 环境变量

后端从 `Config` 读取（`app/config.py`）：

* `DEFAULT_PROVIDER`（可选，默认 `deepseek`）
* **DeepSeek**

  * `DEEPSEEK_API_KEY`（必填）
  * `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）
  * `DEEPSEEK_MODEL`（默认 `deepseek-chat`）
* **Gemini**

  * `GEMINI_API_KEY`
  * `GEMINI_MODEL`（默认 `gemini-1.5-flash`）

### 2.3 启动

```bash
python run.py
# 控制台会打印 DeepSeek 初始化日志与 Flask 启动信息
```

---

## 3. 前后端数据流（端到端）

### 3.1 初次生成（/api/initial）

**触发**：前端点击“确认”（根输入框旁），会**即时读取**下拉 `#modelSelect` 的值作为 `provider`。

**请求体（JSON）**

```json
{
  "seed": "用户输入的根信息（简介/设定/灵感等）",
  "provider": "deepseek"    // 或 "gemini"
}
```

**后端流程**

1. `routes/api.py` → 解析 `seed, provider` → 调 `services/gateway.call_model_json(provider, prompt)`
2. `gateway` → 根据 `provider` 路由到 `deepseek.py` 或 `gemini.py`
3. 各模型服务**拼装 Prompt**（包含固定指令 + seed），调用 API，解析模型输出为统一 JSON。

**统一响应体（JSON）**

```json
{
  "ok": true,
  "summary": "对 seed 的整理归纳（已知信息总览）",
  "choices": ["选择A", "选择B", "选择C"],
  "other": "其他选择（提示语，可选）"
}
```

> 前端拿到后：
>
> * 立刻渲染**第一层**“根→三选一+其他”；
> * 左侧“已知信息”面板：基于 summary + seed 做启发式填充（尽可能有内容，无法确定填“未知”）。

### 3.2 确认节点并生成后续（/api/summarize\_and\_expand）

**触发**：在任意节点上点击“确认生成后续”。

**请求体（JSON）**

```json
{
  "history": [
    "【根信息】\nxxx",
    "【已确认选择】\n上一层已确认的文字（如果有）",
    "...（按从根到当前父节点顺序）"
  ],
  "selected": "当前节点的选择文本（若是‘其他’，则为输入框文本）",
  "prior_summary": "",     // 预留字段，当前未使用
  "provider": "deepseek",
  "path": ["根信息", "已确认选择1", "已确认选择2", "当前节点文本"]
}
```

**后端流程**

* `gateway` 同上；各模型服务**基于 path/history** 构建 Prompt：

  1. 先“阶段性总结”（整合到目前为止的**已知信息** + **剧情推进**）；
  2. 再给出**三条后续剧情走向**（choices）+“其他选择”。

**统一响应体（JSON）**

```json
{
  "ok": true,
  "stage_summary": "阶段性总结：……（结构化文本）",
  "choices": ["后续A", "后续B", "后续C"],
  "other": "其他选择（提示语，可选）",
  "worldline": { "progress": ["从根到该节点的每个决策点文字（1,2,3...）"] },
  "known_fields": {
    "第一部分：故事内核与基调": { "核心概念 (High Concept)": "…" , "题材类型 (Genre)": "…" },
    "第二部分：世界观设定": { ... },
    "...": { ... }
  }
}
```

**前端行为**

* 该节点生成一个**子层**（三选一+其他），并在当前层显示“展开/收起”；**同一层只允许一个展开**。
* 左侧“剧情推进”显示**从根到当前选中节点**的决策路径（选中谁就显示谁的路径）。
* 左侧“已知信息”尽量以返回的 `known_fields` 为准；没有的由启发式补全。
* **曲线连接**：根 → 第一层；父 → 子层（贝塞尔曲线）。
* **高亮**：鼠标点击选中的节点，**根到此节点路径**都加绿色光晕；非父辈/非子嗣的节点**灰暗半透明**。

---

## 4. 前端（ES5版）要点

文件：`app/templates/index.html` + `app/static/js/main.js`（ES5）

### 4.1 页面结构

* **左侧固定面板**：`#summaryPanel`

  * “已知信息”网格（`#knownGrid`）
  * “剧情推进”列表（`#worldProgress`）
  * 折叠按钮 `#togglePanel`（面板收起后右侧内容外边距变化）
* **右侧主区**：

  * 根输入卡 `#rootCard`（文本域 `#seed` + 模型选择 `#modelSelect` + “确认”按钮 `#btnSeed`）
  * SVG 曲线层 `#edgesSvg`
  * 树容器 `#tree`（多层）
  * 导出按钮 `#btnExport`

### 4.2 交互与状态

* **状态结构**（前端内存）：

  ```js
  state = {
    seed: "",                // 根文本
    rootSummary: "",         // 初始整理
    rootLevel: Level|null,   // 第一层
    selected: {levelId, nodeIdx} | null
  };

  Level = { id, nodes: Node[], expandedIndex: number|null, parentNode: Node|null }
  Node  = { id, text, isOther, customText, summary, childrenLevel, knownFields }
  ```
* **事件绑定**：

  * 采用 **三重触发**（`addEventListener` + 事件委托 + HTML inline `onclick` 兜底），避免浏览器兼容问题导致点击无效。
  * 所有网络请求使用 **XMLHttpRequest**（ES5 兼容）。
* **模型选择**：**每次请求**前都从下拉框**即时读取** `value`，避免初始状态或缓存还原造成“看似 DeepSeek 实则发 Gemini”的问题。
* **缓存清除**：`index.html` 中引入 `main.js` 时带 `?v=YYYY-MM-DD-x`，改动后更新尾缀防缓存。

---

## 5. 后端要点

### 5.1 App 工厂与配置

* `app/__init__.py`：`create_app()` 注册蓝图与配置。
* `app/config.py`：

  * 仅定义默认值与 Keys，不做“强制覆盖”。
  * `DEFAULT_PROVIDER` 仅在**前端没传 provider**时作为回退值使用。

### 5.2 路由（`routes/api.py`）

提供两个 POST 接口：

* `/api/initial`
* `/api/summarize_and_expand`
  解析请求 → 生成 Prompt → 通过 `services/gateway.call_model_json()` 调用具体模型 → 返回统一 JSON。

### 5.3 模型网关（`services/gateway.py`）

核心逻辑：

```python
req = normalize(provider_from_request)
cfg = normalize(current_app.config.get("DEFAULT_PROVIDER"))
prov = req or cfg or "deepseek"
print(f"[gateway] route -> provider={prov} (requested={provider!r}, default={cfg!r})")
```

**没有**任何 `FORCE_PROVIDER`。**前端传啥就用啥**；未传则用默认。

### 5.4 具体模型服务

* `services/deepseek.py`：

  * 使用 OpenAI 兼容 SDK 或 `requests` 直调（`base_url` 默认 `https://api.deepseek.com`）。
  * 封装 **JSON 输出**（只取 `choices[0].message.content` 并解析为结构化结果）。
* `services/gemini.py`：

  * 通过官方/HTTP 调用；注意 Gemini 对速率/计费限制敏感。
  * 同样封装为统一 JSON。

> 两个服务的**职责**：
>
> * 接收「语义化输入」（seed / history / path）
> * 拼装系统提示词与用户提示词（已在项目内实现）
> * 调用模型
> * **返回统一 JSON**（见前文的响应体）。
> * 若模型返回不规范文本，服务层负责**解析/容错**，不要把格式化负担丢给前端。

---

## 6. 接口契约（详细）

### 6.1 `/api/initial` → 生成第一层三选一

**请求**

```json
{ "seed": "<string>", "provider": "deepseek|gemini" }
```

**响应（成功）**

```json
{
  "ok": true,
  "summary": "<string>",
  "choices": ["<string>","<string>","<string>"],
  "other": "其他选择（可缺省）"
}
```

**响应（失败）**

```json
{ "ok": false, "error": "<错误消息>" }
```

### 6.2 `/api/summarize_and_expand` → 对选择进行阶段性总结 & 生成下一层

**请求**

```json
{
  "history": ["【根信息】...","【已确认选择】..."],
  "selected": "当前节点文本（或其他输入）",
  "prior_summary": "",
  "provider": "deepseek|gemini",
  "path": ["根信息","决策1","决策2","当前节点"]
}
```

**响应（成功）**

```json
{
  "ok": true,
  "stage_summary": "阶段性总结：...",
  "choices": ["<string>","<string>","<string>"],
  "other": "其他选择（可缺省）",
  "worldline": { "progress": ["决策1","决策2","当前"] },
  "known_fields": {
    "第一部分：故事内核与基调": { "核心概念 (High Concept)": "..." },
    "...": { ... }
  }
}
```

**响应（失败）**

```json
{ "ok": false, "error": "<错误消息>" }
```

---

## 7. UI/交互细节与可修改点

* **曲线连接**：`main.js/drawEdges()` 用 SVG 贝塞尔曲线连接父子节点，如需调整曲线弯曲度，改 `dy = Math.max(40, (end.y - start.y) * 0.4)` 的计算。
* **“其他选择”输入框宽度**：在 CSS `styles.css` 中 `.other-input textarea` 的宽度设定不应超过节点框宽，可通过 `max-width: 100%` 或固定 `width`。
* **高亮与灰暗**：

  * 点击节点后，调用 `applySelectionStyles()`：

    * 根到选中节点路径：添加 `.glow`（绿色光晕）
    * 非亲缘：添加 `.dimmed`（半透明灰）
  * 样式在 `styles.css` 中定义（如阴影、透明度、过渡）。
* **“展开/收起”**：同一层若多个节点都有子层，只有 `expandedIndex` 指向的那个显示子层；其它显示“展开”按钮。
* **运行提示**：节点右上角小徽标 `.node-busy`（“正在生成…”），不遮挡视线。
* **左侧面板**：

  * 标题“**当前世界线下的剧情总结**”
  * “已知信息”按五大章节呈现（见 schema）；尽量填充非“未知”。
  * “剧情推进”：当**点击节点**时，左侧展示从根到该节点的**所有决策点**（1、2、3…）。

---

## 8. 如何新增一个模型提供方（例如 OpenRouter、Claude 等）

1. **新增服务文件**：`app/services/<provider>.py`

   * 实现：`call_<provider>_json(prompt: str) -> dict`
   * 与 `deepseek.py/gemini.py` 保持一致：输入统一、输出统一。
2. **在网关注册**：`services/gateway.py`

   * 将 `<provider>` 加入 `_VALID = {"gemini","deepseek","<provider>"}`
   * 在 `call_model_json()` 里加分支：

     ```python
     if prov == "<provider>":
         return call_<provider>_json(prompt)
     ```
3. **前端下拉**：`templates/index.html`

   * `<select id="modelSelect">` 增加 `<option value="<provider>">ProviderName</option>`
4. **默认值**：`config.py` 可增加对应 API\_KEY、MODEL、BASE\_URL 等项，并在 `.env`/系统环境里配置。

---

## 9. 常见问题 & 快速排查

**Q1：点击“确认”后没有任何反应 / 后端无 POST 日志**

* 看浏览器 Console 是否有 `"[boot] ok"`。若没有：

  * 确认 `main.js` 为 **ES5 版**且 URL 带最新版本号（缓存问题用 Ctrl+F5 强刷）。
  * 必要时清除浏览器缓存 / 更换浏览器。
* 页面是否存在遮挡层（影响点击）？检查元素面板。

**Q2：选择了 DeepSeek，却路由到 Gemini**

* 前端每次请求都会**即时读取**下拉值；若仍异常：

  * 打开 Console，点击时应打印：`[api] /api/initial provider -> deepseek`
  * 对照后端日志 `requested='deepseek'` 是否一致；
  * 若不一致，说明页面有旧 JS：更新 `?v=` 版本并重刷。

**Q3：Gemini 报 429 或余额不足**

* 直接切换下拉到 DeepSeek；确保后端日志显示 `provider=deepseek (requested='deepseek')`。
* 若要默认 DeepSeek：在 `config.py` 里确保 `DEFAULT_PROVIDER="deepseek"`。

**Q4：初次三选一的第一个选项没进“剧情推进”**

* 已在当前版本修复：`worldline.progress` 使用 **从根到选中节点**的 path，包含第一层第一个节点。若还出现，检查前端 `collectFullPathIncluding()` 是否被改动。

**Q5：已知信息总是“未知”**

* 当前实现：优先使用后端 `known_fields`，缺项用启发式分析 `seed/rootSummary` 和路径文本。
* 若要更强：在服务层（模型提示词）里要求模型严格填表；或在前端启发式里增强正则/关键词提取。

---

## 10. Prompt 要点（服务层拼装，摘要）

* **初次 `/api/initial`**：

  > 系统：你是小说策划助手。
  > 用户：
  >
  > * 指令：整理已知信息；给出「第一章」的三种情节选择 + “其他选择”。
  > * 若核心要素缺失，转而先提出针对主角/背景/情节的**选择题**（同样三选一+其他）。
  > * 附：用户 seed 文本。

* **二次 `/api/summarize_and_expand`**：

  > 系统：你是剧情推进器。
  > 用户：
  >
  > * 指令：将 `history + selected` 汇总为“阶段性总结”（不要遗漏关键细节，条理清晰）；
  > * 输出下一步的三种剧情走向 + “其他选择”；
  > * 输出结构化的 `known_fields`（尽力填充五大部分；无法确定才填“未知”）；
  > * 返回 JSON 结构化内容（服务层解析再归一）。

> **注意**：服务层负责“将模型原始文本解析为统一 JSON”，前端不做复杂解析。

---

## 11. 二次开发建议

* **前端重构到框架**：若后续用 React/Vue，沿用相同的接口契约即可；SVG 曲线可改用 d3/edges 库。
* **服务端异步**：长响应可引入任务队列 + SSE 进度提示；目前为同步等待。
* **持久化**：当前树保存在前端内存（支持导出 JSON）。可加后端存储（用户会话/作品 ID）。
* **多模型融合**：在 `gateway` 层加“级联调用/兜底策略”（如先试 Gemini，不行回退 DeepSeek），但**务必保留“前端选择即优先”的语义**。

---

## 12. 变更点清单（本对话期间已实现/强调）

1. **模型选择**：不强制、**每次即时读取**下拉框，选择哪个就发哪个。
2. **ES5 兼容前端**：避免现代语法导致脚本不执行。
3. **树交互**：

   * 曲线连接父子；
   * 路径绿色光晕；非亲缘灰暗半透明；
   * 同层“展开/收起”，仅单一展开；
   * “其他选择”输入框宽度不超过节点框；
   * 节点局部“正在生成…”徽标。
4. **左侧面板**：固定区域“当前世界线下的剧情总结”，可折叠。

   * “剧情推进”：随**选中节点**展示从根到该节点的路径；
   * “已知信息”：尽量补全，无法确定再写“未知”。
5. **接口契约**：统一 JSON，服务层负责解析与容错。

---

如需把这份文档落地到仓库，请保存为 `docs/README.md` 或顶层 `README.md`。如果下一个 AI 需要，我也可以提供**最小可运行示例数据**和**Mock 服务器**，用于前端离线联调。
