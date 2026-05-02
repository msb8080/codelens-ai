# CodeLens AI

基于 RAG + Agent 的代码智能分析引擎

## 技术栈

- **Spring Boot 3.x** + **Spring AI** — Java AI工程框架
- **Qdrant** — 向量数据库
- **Tree-sitter** — 代码AST解析
- **SiliconFlow API** — 免费模型API（OpenAI兼容）
- **Docker Compose** — 一键部署

## 快速启动

### 1. 配置环境变量

```bash
export AI_API_KEY=你的硅基流动API密钥
```

### 2. 启动Qdrant

```bash
docker-compose up -d qdrant
```

### 3. 启动应用

```bash
mvn spring-boot:run
```

### 4. 访问

打开浏览器访问 http://localhost:8090

## API

### POST /api/chat

```json
{
  "question": "这段代码有什么问题？",
  "sessionId": "optional-session-id"
}
```

响应：

```json
{
  "answer": "AI分析结果...",
  "ragHits": 2,
  "latencyMs": 1234
}
```

### GET /api/health

健康检查。

## 部署

### Render（免费，自动部署）

1. Fork本仓库
2. 在Render创建Web Service，连接仓库
3. 设置环境变量 `AI_API_KEY`
4. 自动构建部署

### Oracle Cloud（永久免费）

```bash
# 在服务器上
git clone <repo>
cd minshuaibo-ai
docker-compose up -d
mvn package -DskipTests
java -jar target/codelens-ai-1.0.0.jar
```

## 项目结构

```
minshuaibo-ai/
├── src/main/java/com/shuaibo/ai/
│   ├── controller/     # REST接口
│   ├── service/        # 业务逻辑
│   │   └── rag/        # RAG检索服务
│   │   └── agent/      # Agent工具调用
│   ├── model/          # 数据模型
│   ├── config/         # 配置类
│   └── parser/         # 代码解析器
├── src/main/resources/
│   └── static/         # 前端页面
├── docker-compose.yml
├── Dockerfile
└── pom.xml
```
