# 商品套图 AI

面向跨境电商卖家的 AI 商品信息分析与电商套图生成工具。当前已完成 M0–M4 功能，并已启动 M5 生产准备：具备邮箱账号、项目与私有素材管理、商品图/风格图/产品说明书拖拽上传、OpenAI 商品视觉分析、异步四图生成、一致性检查、单图重生成、确定性文字模板、PNG/JPG/ZIP 导出、事务化额度流水，以及生产配置校验、敏感接口限流、结构化访问日志和 TLS 部署基线。

项目需求、技术架构、决策记录、实施进度和会话交接信息统一维护在 [项目主文档](docs/PROJECT_CONTEXT.md)。开始任何开发工作前，请先完整阅读该文档和根目录的 `AGENTS.md`。

## 环境要求

- Node.js 22+
- pnpm 11+（可通过 Corepack 启用）
- Docker Engine 29+ 与 Docker Compose v2/v5

## 一键启动全部本地服务

```bash
corepack enable
cp .env.example .env
docker compose up --build -d
pnpm install --frozen-lockfile
pnpm healthcheck
```

Windows PowerShell 复制环境模板时使用：

```powershell
Copy-Item .env.example .env
```

默认入口：

| 服务            | 地址                             |
| --------------- | -------------------------------- |
| Nginx 统一入口  | http://localhost:8080            |
| Web             | http://localhost:3000            |
| API 健康检查    | http://localhost:3001/api/health |
| Worker 健康检查 | http://localhost:3002/health     |
| MinIO API       | http://localhost:9000            |
| MinIO Console   | http://localhost:9001            |

`.env.example` 中的密码只适用于本地开发。任何共享或生产环境都必须替换，真实密钥不得提交到仓库。

API 启动时会在 PostgreSQL advisory lock 保护下自动执行幂等数据库迁移。生产环境必须设置 `COOKIE_SECURE=true` 并通过 HTTPS 提供服务。

Docker 构建默认通过 `NPM_REGISTRY=https://registry.npmmirror.com` 安装 npm 包；可在 `.env` 中改为团队批准的镜像源或官方源。依赖版本和完整性仍由 `pnpm-lock.yaml` 固定。

停止服务：

```bash
docker compose down
```

如需同时删除本地数据库、队列和对象存储数据，可显式执行 `docker compose down -v`；该命令会删除数据卷，请谨慎使用。

## 本机开发

先启动依赖并安装包：

```bash
corepack enable
pnpm install
pnpm dev:infra
```

本机进程使用 `localhost`，而 `.env.example` 默认值面向 Compose 容器。运行应用前请把本机 `.env.local` 中的连接地址设置为：

```dotenv
DATABASE_URL=postgresql://image_set:image-set-local-only@localhost:5432/image_set
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=image_set
S3_SECRET_KEY=image-set-local-only
```

再将变量载入当前终端并运行：

```bash
pnpm dev
```

## 质量检查

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config --quiet
pnpm compose:production:check
```

GitHub Actions 会对 push 到 `main` 和所有 Pull Request 执行同一组检查。

## 仓库结构

```text
apps/
  web/                 Next.js 前端
  api/                 NestJS HTTP API
  worker/              NestJS Standalone + BullMQ Worker
packages/
  shared/              共享 Schema、类型与枚举
  database/            Drizzle/PostgreSQL 连接层
  ai-provider/         AI Provider 接口
  image-layout/        图片模板与导出规则
infra/
  docker/              应用容器镜像
  nginx/               本地反向代理
scripts/               本地验证脚本
docs/                  项目单一事实源
```

## M5 私有测试部署

生产编排与本地 Compose 分离。`docker-compose.production.yml` 只运行 Web、API、Worker 和 Nginx，要求使用外部 PostgreSQL、Redis、受维护的 S3 兼容存储与真实 TLS 证书；它不会把 API、Worker 或依赖服务端口发布到公网。

完整的配置契约、部署、冒烟、日志监控、备份恢复和回滚步骤见 [M5 部署与运维文档](docs/DEPLOYMENT.md)。配置模板为 `.env.production.example`，真实生产配置必须保存在仓库外。

```bash
pnpm compose:production:check
docker compose --env-file /secure/path/image-set.env -f docker-compose.production.yml up --build -d
BASE_URL=https://studio.example.com pnpm smoke:production
```

API 为每个请求生成或传递 `x-request-id`，并输出不含查询参数、Cookie、请求体和 Prompt 的 JSON 访问日志。登录注册、上传、分析和图片生成/重试按来源 IP 使用 Redis 原子限流；生产环境若缺少安全 Cookie、HTTPS Origin/对象存储端点或必填密钥，API 会拒绝启动。

## M4 使用流程

1. 打开 Web 或 Nginx 入口，在 `/register` 使用邮箱、称呼和至少 10 位密码注册。
2. 在项目列表创建项目，填写平台、品类、规格、卖点和生成要求。
3. 在项目页点击选择或拖拽上传 1–10 张商品图、最多 4 张风格参考图，并可选上传 1 份 PDF、DOC 或 DOCX 产品说明书。
4. 配置服务端 AI 访问：中转站使用 `OPENAI_BASE_URL` 和三把专项 Key；官网直连兼容模式才使用 `OPENAI_API_KEY`。然后点击“开始分析”；成功消费 1 额度，失败自动退款。
5. 检查并编辑英文/中文商品名称、标题、关键词、卖点依据、描述、风险和四图规划，然后免费保存修改。
6. 点击“生成完整四图”创建白底主图、功能卖点图、使用场景图和材质/细节图；四个 Worker 任务最多并发执行 2 个。
7. 在四张结果卡片中查看独立进度、一致性结论和风险说明；失败任务可单独重试，成功图片可按角色单张重生成。
8. 保存修改后的英文图片文案，在对应卡片点击“合成并下载 PNG/JPG”；主图保持无字，其他三类图片使用固定模板免费重新合成。
9. 四种角色均有成功图片后，可导出 PNG 或 JPG 整套 ZIP。文件统一为 2048×2048，并按固定角色顺序命名。

图片上传支持真实 JPG、PNG 和 WebP；产品说明书支持 PDF、DOC 和 DOCX；所有单文件均不超过 15 MB。服务端会核验扩展名、浏览器 MIME 与二进制文件签名，图片还会校验像素尺寸。素材保存到私有对象存储，读取前必须通过所属用户鉴权。产品说明书当前只作为项目私有附件保存和查看，不会自动送入 AI 分析。

商品分析使用 Responses API 和严格 Structured Outputs。送入模型前会在内存中生成最长边不超过 2048 像素的 JPEG 分析副本，原始素材不会被修改。可通过以下接口查看余额和只追加流水：

中转站必须兼容 Responses API 与 Images Edit API，并提供含 `/v1` 的 HTTPS `OPENAI_BASE_URL`。分别设置 `OPENAI_ANALYSIS_API_KEY`、`OPENAI_IMAGE_API_KEY`、`OPENAI_REVIEW_API_KEY` 后，分析、生图和一致性检查会各自使用对应 Key。保留的 `OPENAI_API_KEY` 仅用于官网直连兼容回退；三把专项 Key 只要任意一把被设置，就不会混用它。

`S3_ENDPOINT` 是 API/Worker 访问对象存储的内部地址；`S3_PUBLIC_ENDPOINT` 是浏览器使用签名下载链接时可访问的外部地址。本机 Compose 默认分别为 `http://minio:9000` 与 `http://localhost:9000`，生产环境应将后者设置为对象存储公网域名或 CDN 域名。

```text
GET /api/credits/balance
GET /api/credits/ledger
```

`POST /api/projects/:id/analyze` 必须携带 8–120 字符的 `Idempotency-Key`；相同键不会重复调用模型或扣费。

四图生成与重试接口同样必须携带 `Idempotency-Key`：

```text
POST /api/projects/:id/generations   # 空请求体生成四图；{ "role": "main" } 单张重生成
GET  /api/projects/:id/jobs         # 查询任务状态、阶段和 0–100 进度
GET  /api/jobs/:id                  # 查询单个任务
POST /api/jobs/:id/retry            # 重试失败的图片任务
```

完整四图会拆成 4 个独立任务，每个任务预留 3 额度。Worker 使用指数退避处理最多 3 次临时故障；成功任务写入 `consume` 流水，最终失败任务单独退款。生成图片先规范化为 2048×2048 PNG，再用视觉模型对照商品原图执行一致性检查；`review_required` 结果仍保留图片，但要求商家人工复核。

导出接口不扣额度，并始终读取当前已保存的分析文案与每个角色最新的成功图片：

```text
POST /api/projects/:id/exports       # { "format": "png|jpg", "role"?: "main|feature|lifestyle|detail" }
GET  /api/assets/:id/download        # 鉴权后使用原文件名下载单图或 ZIP
```

带 `role` 时返回单张 export 资产；省略 `role` 时要求四图齐全并返回整套 ZIP。相同内容、格式和文件名会按 SHA-256 复用已有导出资产。营销文字只来自当前 `imagePlan.copyEn`；白底主图无论输入如何都不会加入文字层。

## 当前实现边界

M5 当前完成的是可在仓库内验证的生产准备初始化，不等于已经通过真实服务器交付验收。仓库仍未配置真实 OpenAI 密钥，因此已验证 Provider 请求构造、Prompt、Schema、队列进度、三次临时错误退避、四任务独立退款和余额恢复；真实图片成功响应、视觉质量、延迟和模型费用仍需在提供测试密钥后联调。分析同步调用的僵尸任务补偿、Redis 丢失后的 queued 任务重投、软删除对象清理和过期会话清理也仍是公开上线前门槛。导出当前为 API 内同步内存处理，适合 MVP 固定四张 2048×2048 图片；未来扩展批量 SKU 时需迁移到流式或异步导出。

本地 MinIO 暂时使用固定版本的 `bitnamilegacy/minio` 镜像，因为上游官方预构建镜像目前无法匿名拉取。该镜像只用于本地开发；生产环境必须选用仍受维护的 S3 兼容托管服务或经安全评审的自建镜像。
