# OmniAgent 优化清单 & 进度跟踪

> 综合架构审查 + ChatGPT 前端评估，按阶段推进。
> 状态标记：⬜ 待开始 · 🔧 进行中 · ✅ 已完成 · ⏭️ 跳过

最后更新：2026-05-02

---

## Phase 0：安全 & 部署修复（最优先）

> 解决安全泄露和生产环境不可用问题。

| # | 类别 | 问题 | 方案 | 状态 | 备注 |
|---|------|------|------|------|------|
| 0.1 | 安全 | `.env.example` 含小米 mimo 真实 API Key | 改为占位符 `tp-your-api-key-here` | ✅ | 同时修正 Base URL 去掉 /v1，统一模型为 mimo-v2.5-pro |
| 0.2 | 安全 | `docker-compose.yml` 环境变量默认值含真实 Key | 去掉默认值，强制 `.env` 注入 | ✅ | |
| 0.3 | 安全 | `application.yml` 含硅基流动真实 Key 默认值 | 默认值改为空，启动时必须通过环境变量注入 | ✅ | 同时统一默认模型为 mimo-v2.5-pro |
| 0.4 | 安全 | 前端 `app.js` `defaultConfig()` 含 API Key 明文 | 去掉默认 Key，首次使用弹窗配置 | ✅ | 添加 `showFirstTimeSetup()` 引导 |
| 0.5 | 部署 | Render Free 计划 15 分钟休眠，冷启动 ~30s | 接受冷启动，不付费 | ⏭️ | 免费方案有限，接受延迟 |
| 0.6 | 部署 | Render 无 Qdrant，生产 RAG 不可用 | 去除 Qdrant 依赖，RagService 保留空接口 | ✅ | 删除 QdrantConfig + 依赖 + 配置 |
| 0.7 | 配置 | `.env.example` 的 Base URL 多了 `/v1` | 去掉 `/v1`（Spring AI 自动追加） | ✅ | 随 0.1 一起修复 |
| 0.8 | 配置 | `application.yml` 默认模型是硅基流动，其他地方用小米 mimo | 统一默认提供商为小米 mimo | ✅ | 随 0.3 一起修复 |

---

## Phase 1：架构地基

> 解决核心架构缺陷，为后续功能升级打基础。

| # | 类别 | 问题 | 方案 | 状态 | 备注 |
|---|------|------|------|------|------|
| 1.1 | 架构 | DOM 即状态，不可恢复/持久化/debug | 引入 Store 状态层：`store = { messages:[], sessions:{}, streaming:false }`，UI 从 store 渲染 | ⬜ | 前端最大改动 |
| 1.2 | 后端 | `ConcurrentHashMap` 会话历史无限增长，无清理机制 | 每 session 限 20 轮 + 24h TTL 过期清除 | ⬜ | |
| 1.3 | 后端 | sessionId 固定 `"default"`，所有用户共享历史 | 前端生成 `crypto.randomUUID()`，支持多会话 | ⬜ | |
| 1.4 | 后端 | `RagService.search()` 是空壳，TODO 未完成 | 去除 Qdrant，RagService 保留空接口供后续扩展 | ⏭️ | 已删除 Qdrant 全部依赖，保留接口 |
| 1.5 | 安全 | API Key 明文存 localStorage | 短期 base64 混淆；长期 Key 存后端，前端只传 model ID | ⬜ | |
| 1.6 | 部署 | CORS 白名单硬编码在 Java 代码中 | 改为环境变量 `CORS_ALLOWED_ORIGINS`，`CorsConfig` 读配置 | ✅ | `application.yml` + `render.yaml` 已配置 |
| 1.7 | 部署 | 前端 API 地址硬编码 Render URL（3 处） | 去掉硬编码，首次使用弹窗配置 + 支持 `?api=` 参数 | ✅ | `showFirstTimeSetup()` 引导 |
| 1.8 | 部署 | `src/main/resources/static/` 与 `docs/` 重复 | 删除 `static/`，统一为 `docs/` 作为唯一前端源 | ✅ | 已删除 static/ |

---

## Phase 2：前端性能 & 产品体验

> 流式渲染优化 + Agent 过程可视化 + 交互增强，拉开产品档次。

| # | 类别 | 问题 | 方案 | 状态 | 备注 |
|---|------|------|------|------|------|
| 2.1 | 性能 | 每个 token 都 `parseMarkdown()` + Mermaid 扫描 | 流式阶段用 `textNode.textContent` 追加纯文本，`done` 时一次性 parse + Mermaid | ⬜ | 必须做 |
| 2.2 | 功能 | 中断后"继续"是 restart 不是续写 | 前端维护 `chatHistory[]`，后端支持 `continue: true`，真正续写 | ⬜ | |
| 2.3 | 体验 | RAG 只显示 "RAG: 3条"，无来源信息 | 展示来源文件名列表：`📄 UserService.java · OrderController.kt` | ⬜ | 依赖 1.4 |
| 2.4 | 体验 | Agent 执行过程不可见 | SSE 增加 `event: step`，前端显示 `🧠 思考... 🔍 检索... 🛠 调用工具...` | ⬜ | 需后端配合 |
| 2.5 | 体验 | Token 用量展示太简单 | 改为 `Prompt: 1.2k · Completion: 320 · Cost: $0.0023` | ⬜ | |
| 2.6 | 交互 | 输入框只有 textarea | 支持拖拽代码文件、代码模式（monospace）、粘贴代码检测 | ⬜ | |
| 2.7 | 交互 | 消息操作只有 copy + continue | 增加 👍👎 反馈、🔁 重新生成、📌 固定 | ⬜ | |
| 2.8 | 性能 | `backdrop-filter: blur(20px)` 移动端卡顿 | 移动端关闭毛玻璃，fallback 为半透明背景 | ⬜ | |
| 2.9 | 交互 | 模型配置无法删除（与 MCP/Skill/Rule 不一致） | 区分"内置模型"和"用户模型"，用户模型可删 | ⬜ | |
| 2.10 | 体验 | 打字效果只有 cursor + append | 添加流式生成时的 subtle-glow 动画 | ⬜ | |

---

## Phase 3：后端健壮性

> 错误处理、输入验证、性能缓存。

| # | 类别 | 问题 | 方案 | 状态 | 备注 |
|---|------|------|------|------|------|
| 3.1 | 错误处理 | 异常直接抛 RuntimeException，前端只显示 HTTP 500 | 后端返回结构化错误码（API_KEY_INVALID / MODEL_UNAVAILABLE / TIMEOUT），前端友好提示 + 重试 | ⬜ | |
| 3.2 | 验证 | `ChatRequest` 无 Bean Validation | 添加 `@NotBlank` 等注解，Controller 层 `@Validated` | ⬜ | |
| 3.3 | 性能 | `ModelFactory.getModel()` 每次可能创建新实例 | 按 `baseUrl+model+apiKey` 做 LRU 缓存 | ⬜ | |
| 3.4 | 部署 | Dockerfile 无 health check | 添加 `HEALTHCHECK` 指令 | ✅ | wget 探活 /api/health |
| 3.5 | 部署 | JVM 无内存限制参数 | 添加 `-XX:MaxRAMPercentage=75.0` 适配容器 | ✅ | G1GC + ExitOnOutOfMemoryError |
| 3.6 | 部署 | Render auto-deploy 未确认 | 检查 Render Dashboard 是否配了 auto-deploy | ⬜ | |

---

## Phase 4：工程化 & 模块化

> 代码组织升级，为长期维护和 AI IDE 演进做准备。

| # | 类别 | 问题 | 方案 | 状态 | 备注 |
|---|------|------|------|------|------|
| 4.1 | 工程 | 前端单文件 816 行，无模块化 | 拆分为 `core/chat.js` `core/stream.js` `core/store.js` `ui/message.js` `ui/input.js` `ui/config.js` `utils/markdown.js` `utils/mermaid.js` | ⬜ | |
| 4.2 | 工程 | API 地址硬编码，无环境区分 | 引入 Vite + `import.meta.env.VITE_API_BASE`，支持 dev/prod | ⬜ | |
| 4.3 | 体验 | 首次加载、配置面板打开无骨架屏 | 添加 GSAP skeleton 动画 | ⬜ | |
| 4.4 | 工程 | 无 CI/CD | 配置 GitHub Actions：前端 lint + 后端 Maven build | ⬜ | |

---

## Phase 5：AI IDE 演进（远景）

> 从聊天 UI 向 Cursor / Copilot Workspace 级产品进化。

| # | 类别 | 方案 | 状态 | 备注 |
|---|------|------|------|------|
| 5.1 | 产品 | 集成代码编辑器（Monaco / CodeMirror） | ⬜ | |
| 5.2 | 产品 | 文件树浏览器 + 项目上下文 | ⬜ | |
| 5.3 | 产品 | Diff 视图展示 AI 修改建议 | ⬜ | |
| 5.4 | 产品 | Inline Explain：选中代码右键解释 | ⬜ | |
| 5.5 | 产品 | Agent Chain 可视化：多步骤任务执行过程 | ⬜ | |

---

## 决策记录

| 日期 | 决策 | 备注 |
|------|------|------|
| | | |

---

## 进度日志

| 日期 | 完成项 | 备注 |
|------|--------|------|
| 2026-05-02 | 创建优化清单文档 | 综合架构审查 + ChatGPT 前端评估 |
| 2026-05-02 | Phase 0: 安全泄露修复 | 清除 3 处明文 API Key，统一默认模型配置 |
| 2026-05-02 | Phase 0: 前端首次配置引导 | 添加 `showFirstTimeSetup()` 弹窗表单 |
| 2026-05-02 | Phase 1: CORS 环境变量化 | `CorsConfig` 改为读取 `cors.allowed-origins` |
| 2026-05-02 | Phase 1: 前端 API 地址去硬编码 | 移除 3 处 Render URL 硬编码 |
| 2026-05-02 | Phase 1: 清理重复静态文件 | 删除 `src/main/resources/static/` |
| 2026-05-02 | Phase 3: Dockerfile 优化 | 添加 health check + JVM 调优参数 |
| 2026-05-02 | Phase 0: 去除 Qdrant 依赖 | 删除 QdrantConfig、pom 依赖、配置、docker-compose 服务 |
| 2026-05-02 | Phase 0: Render 免费计划 | 接受冷启动，不付费 |
