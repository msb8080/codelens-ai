# OmniAgent — 全能智能体平台

> 大脑 + 手脚：内置多智能体 · 可配置 MCP / Skill / Rules / 多模型 API

## 🧠 内置智能体

| 类别 | 智能体 | 用途 |
|------|--------|------|
| 开发 | 📋 PRD 助手 | 需求分析、PRD 文档撰写 |
| 开发 | 🎨 设计助手 | UI/UX 设计方案 |
| 开发 | 💻 编码助手 | 代码编写、重构、Code Review |
| 开发 | 🧪 测试助手 | 测试用例设计、自动化测试 |
| 开发 | 🚀 部署助手 | Docker / K8s / CI/CD |
| 生活 | 🍳 烹饪助手 | 菜谱推荐、营养分析 |
| 投资 | 📈 股票助手 | 行情分析、基本面/技术面 |
| 通用 | 🧠 通用助手 | 问答、翻译、写作、头脑风暴 |

## ⚙️ 可配置能力

- **多模型** — OpenAI 兼容 API（mimo / Ollama / 硅基流动 / OpenAI 等）
- **MCP 服务器** — 连接开源 MCP 扩展工具能力
- **Skills** — 注入领域知识和操作流程
- **Rules** — 约束输出格式、编码风格和安全策略
- **自定义智能体** — 创建你自己的专属 Agent

## 技术栈

- **Spring Boot 3.x** + **Spring AI** — Java AI 工程框架
- **Tree-sitter** — 代码 AST 解析
- **小米 mimo API** — 免费模型 API（OpenAI 兼容）
- **Docker Compose** — 一键部署

## 快速启动

### 1. 配置环境变量

```bash
export AI_API_KEY=你的模型API密钥
```

### 2. 启动应用

```bash
mvn spring-boot:run
```

### 3. 访问

打开浏览器访问 http://localhost:8090

## API

### POST /api/chat/stream

```json
{
  "question": "帮我分析这段代码",
  "agentId": "code",
  "systemPrompt": "你是高级软件工程师...",
  "model": "mimo-v2.5-pro"
}
```

SSE 流式响应：
- `event: token` — 文本片段
- `event: done` — 完成（含延迟和 token 统计）

## 前端

前端部署在 GitHub Pages：https://msb8080.github.io/codelens-ai/

前端配置通过 localStorage 持久化，支持导出/导入 JSON 配置文件。

## License

MIT
