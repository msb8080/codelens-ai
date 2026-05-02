# OmniAgent — 全能智能体平台

> **大脑 + 手脚**：内置 9 大智能体 · 可配置 MCP / Skill / Rules · 多模型 API · SSE 流式对话

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.3.4-6db33f?logo=springboot)](https://spring.io/projects/spring-boot)
[![Spring AI](https://img.shields.io/badge/Spring%20AI-1.0.0--M3-6db33f)](https://spring.io/projects/spring-ai)
[![Java](https://img.shields.io/badge/Java-17+-orange?logo=openjdk)](https://openjdk.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ 功能概览

| 能力 | 说明 |
|------|------|
| 🤖 **多智能体** | 9 个内置智能体（通用 / 编码 / PRD / 设计 / 测试 / 部署 / 烹饪 / 股票 / 游戏），支持自定义 |
| 🔀 **多模型切换** | 兼容 OpenAI API 格式 — 硅基流动 / 小米 mimo / Ollama / OpenAI 等，每个智能体可绑定不同模型 |
| 🌊 **SSE 流式输出** | Server-Sent Events 逐 token 输出，实时显示生成内容 |
| 🧠 **RAG 检索** | 集成 Qdrant 向量数据库 + Embedding 模型，检索相关代码片段增强回答 |
| 🔌 **MCP 服务器** | 连接 Model Context Protocol 扩展工具能力（文件系统 / Git / 搜索等） |
| 📦 **Skills 技能** | 可复用的领域知识模板（Code Review 清单 / PRD 模板 / 菜谱格式等） |
| 📏 **Rules 规则** | 全局行为约束 — 输出格式 / 语言偏好 / 安全策略 |
| ⌨️ **Slash 命令** | `/explain` `/optimize` `/bug` `/test` `/refactor` `/doc` 快捷代码分析 |
| 📊 **可观测性** | Micrometer + Prometheus 指标（调用次数、延迟、Token 用量） |
| 💾 **配置持久化** | 前端配置存 localStorage，支持导出/导入 JSON |
| 🎨 **深紫色 3D UI** | GSAP 动画 + Tailwind CSS + Glass Morphism 风格前端 |

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (GitHub Pages)                     │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  │
│  │ 智能体   │  │ 模型管理  │  │ MCP/Skill│  │ Slash 命令│  │
│  │ 选择器   │  │ 配置面板  │  │ Rules  │  │ 快捷分析  │  │
│  └────┬────┘  └────┬─────┘  └───┬────┘  └─────┬─────┘  │
│       └────────────┴────────────┴─────────────┘         │
│                         │ POST /api/chat/stream (SSE)    │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│              Spring Boot 后端 (:8090)                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐              │
│  │ChatCtrl  │→ │ChatSvc   │→ │ModelFactory│ (动态模型)   │
│  │(REST/SSE)│  │(多轮对话) │  │(OpenAI兼容)│              │
│  └──────────┘  └────┬─────┘  └───────────┘              │
│                     │ RAG 检索                            │
│                ┌────┴─────┐                              │
│                │RagService│──→ Qdrant (向量数据库)         │
│                └──────────┘                              │
│                                                         │
│  📊 Micrometer + Prometheus (可观测性)                    │
└─────────────────────────────────────────────────────────┘
```

---

## 🤖 内置智能体

| 类别 | 智能体 | 用途 | Emoji |
|------|--------|------|-------|
| 通用 | 通用助手 | 问答、翻译、写作、头脑风暴 | 🧠 |
| 生活 | 烹饪助手 | 菜谱推荐、营养搭配、烹饪技巧 | 🍳 |
| 投资 | 股票助手 | A 股/港股/美股行情分析、基本面/技术面 | 📈 |
| 娱乐 | 游戏助手 | LOL/王者赛事资讯、攻略、英雄推荐 | 🎮 |
| 开发 | PRD 助手 | 需求分析、用户故事、PRD 文档 | 📋 |
| 开发 | 设计助手 | UI/UX 设计方案、配色、原型 | 🎨 |
| 开发 | 编码助手 | 代码编写、重构、Code Review | 💻 |
| 开发 | 测试助手 | 测试用例设计、自动化测试 | 🧪 |
| 开发 | 部署助手 | Docker / K8s / CI/CD / 运维 | 🚀 |

> 每个智能体有独立的 System Prompt，可在配置面板中自定义或新建智能体。

---

## ⚙️ 可配置能力

### 多模型

支持任何 OpenAI 兼容 API，前端配置面板可添加多个模型并切换：

| 提供商 | Base URL | 说明 |
|--------|----------|------|
| 硅基流动 | `https://api.siliconflow.cn` | 免费 Qwen2.5-7B 等 |
| 小米 mimo | `https://token-plan-cn.xiaomimimo.com` | mimo-v2.5-pro |
| Ollama | `http://localhost:11434` | 本地部署 |
| OpenAI | `https://api.openai.com` | GPT-4o 等 |

### MCP 服务器

内置 3 个 MCP 服务器（可扩展）：

- **Filesystem** — `npx -y @anthropic-ai/mcp-filesystem-server /tmp`
- **Git** — `npx -y @anthropic-ai/mcp-git`
- **Brave Search** — `npx -y @anthropic-ai/mcp-brave-search`

### Skills 技能

内置 3 个技能模板：

- **Code Review 清单** — 8 项检查（命名、职责、错误处理、安全、性能等）
- **PRD 模板** — 标准产品需求文档结构
- **菜谱格式** — 菜谱 Markdown 模板

### Rules 规则

内置 3 条全局规则：

- **Markdown 输出** — 强制 Markdown 格式
- **中文优先** — 默认中文回答
- **安全规则** — 不生成恶意代码、涉及专业领域附免责声明

---

## 🚀 快速启动

### 方式一：本地运行

```bash
# 1. 克隆项目
git clone https://github.com/msb8080/codelens-ai.git
cd codelens-ai

# 2. 配置环境变量
export AI_BASE_URL=https://api.siliconflow.cn
export AI_API_KEY=你的API密钥
export AI_MODEL=Qwen/Qwen2.5-7B-Instruct

# 3. 启动 Qdrant（可选，RAG 功能需要）
docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant:v1.10.0

# 4. 构建并启动
mvn clean package -DskipTests
java -jar target/codelens-ai-1.0.0.jar

# 5. 访问 http://localhost:8090
```

### 方式二：Docker Compose（一键部署）

```bash
# 复制环境变量文件
cp .env.example .env
# 编辑 .env 填入真实 API Key

# 启动（含 Qdrant + 应用）
docker-compose up -d

# 访问 http://localhost:8090
```

### 方式三：Render 部署

项目包含 `render.yaml`，可直接部署到 Render 平台。

---

## 🔌 API 文档

### `POST /api/chat/stream` — SSE 流式对话

**请求体：**

```json
{
  "question": "帮我分析这段代码的时间复杂度",
  "sessionId": "user-123",
  "agentId": "code",
  "systemPrompt": "你是高级软件工程师...",
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "baseUrl": "https://api.siliconflow.cn",
  "apiKey": "sk-xxx"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | ✅ | 用户提问 |
| `sessionId` | string | ❌ | 会话 ID（多轮对话），默认 `"default"` |
| `agentId` | string | ❌ | 智能体 ID |
| `systemPrompt` | string | ❌ | 自定义系统提示词 |
| `model` | string | ❌ | 模型名称，覆盖默认配置 |
| `baseUrl` | string | ❌ | API Base URL |
| `apiKey` | string | ❌ | API Key |

**SSE 响应事件：**

```
event: token
data: "你好"

event: token
data: "！我是"

event: done
data: {"answer":"你好！我是...","ragHits":0,"latencyMs":1234,"tokenUsage":{"promptTokens":42,"completionTokens":128,"totalTokens":170}}
```

### `POST /api/chat` — 同步对话

请求体同上，直接返回 JSON 响应。

### `DELETE /api/chat/{sessionId}` — 清除会话历史

### `GET /api/health` — 健康检查

返回：`OmniAgent is running`

---

## 🎨 前端

前端部署在 GitHub Pages：**https://msb8080.github.io/codelens-ai/**

前端是纯静态单页应用（`docs/` 目录），修改文件 push 到 GitHub 自动生效。

**前端特性：**

- 🎭 **9 大智能体侧边栏切换** — 按类别分组（通用 / 生活 / 投资 / 娱乐 / 开发）
- 🔀 **模型下拉选择器** — 实时切换模型，绑定到智能体
- ⌨️ **Slash 命令面板** — 输入 `/` 触发代码分析快捷命令
- 📝 **模态表单配置** — 替代原生 `prompt()`，支持多字段编辑
- 📋 **配置项复制** — 一键创建模型/MCP/Skill/Rule/Agent 副本
- 🔑 **密码字段** — API Key 使用 `password` 类型不显明文
- 🔒 **内置项保护** — 内置 MCP/Skill/Rule 标签显示"内置"且不可删除
- 📤 **配置导入/导出** — JSON 文件跨设备同步
- 🌊 **Markdown 渲染** — 支持 GFM + 代码高亮 + Mermaid 图表
- ✨ **GSAP 动画** — 页面加载渐入效果

---

## 📁 项目结构

```
codelens-ai/
├── docs/                          # 前端 (GitHub Pages)
│   ├── index.html                 # 主页面
│   ├── css/style.css              # 样式 (深紫色 3D Bento 风格)
│   └── js/app.js                  # 前端逻辑 (智能体/模型/配置/SSE)
├── src/main/java/com/shuaibo/ai/
│   ├── CodeLensAiApplication.java # Spring Boot 启动类
│   ├── config/
│   │   ├── CorsConfig.java        # CORS 跨域配置
│   │   ├── ModelFactory.java      # 动态模型工厂 (多模型切换)
│   │   └── QdrantConfig.java      # Qdrant 向量数据库配置
│   ├── controller/
│   │   └── ChatController.java    # REST + SSE 接口
│   ├── model/
│   │   ├── ChatRequest.java       # 请求 DTO
│   │   └── ChatResponse.java      # 响应 DTO (含 TokenUsage)
│   └── service/
│       ├── ChatService.java       # 核心对话逻辑 (多轮/流式/RAG)
│       └── rag/RagService.java    # RAG 向量检索服务
├── src/main/resources/
│   ├── application.yml            # 应用配置
│   └── static/                    # 内嵌静态资源 (备用)
├── docker-compose.yml             # Docker Compose (Qdrant + App)
├── Dockerfile                     # 多阶段构建
├── pom.xml                        # Maven 依赖
├── render.yaml                    # Render 部署配置
└── .env.example                   # 环境变量模板
```

---

## 🔧 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | Spring Boot 3.3.4 + Spring AI 1.0.0-M3 |
| **AI 接口** | OpenAI 兼容 API（动态模型工厂，支持运行时切换） |
| **代码解析** | Tree-sitter（AST 解析） |
| **向量数据库** | Qdrant（gRPC Java Client 1.10.0） |
| **可观测性** | Micrometer + Prometheus |
| **构建工具** | Maven |
| **容器化** | Docker 多阶段构建 + Docker Compose |
| **前端** | 纯静态 HTML/CSS/JS + Tailwind CSS + GSAP + Marked.js + Mermaid |
| **部署** | GitHub Pages（前端）+ Render / Docker（后端） |

---

## 📝 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AI_BASE_URL` | `https://api.siliconflow.cn` | 模型 API 地址（不含 /v1） |
| `AI_API_KEY` | — | 模型 API 密钥 |
| `AI_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | 默认模型名称 |
| `QDRANT_HOST` | `localhost` | Qdrant 主机 |
| `QDRANT_PORT` | `6334` | Qdrant gRPC 端口 |
| `QDRANT_COLLECTION` | `codelens-code` | Qdrant 集合名 |

---

## 📊 监控

启动后访问以下端点：

- **健康检查**: http://localhost:8090/api/health
- **Prometheus 指标**: http://localhost:8090/actuator/prometheus
- **应用指标**: http://localhost:8090/actuator/metrics

核心指标：
- `codelens.chat.total` — 对话调用次数
- `codelens.chat.latency` — 对话响应延迟

---

## ⚠️ 免责声明

本项目为个人学习项目，非商业用途。数据存储在浏览器本地（localStorage），不保证服务可用性。

---

## License

[MIT](LICENSE)
