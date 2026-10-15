# 商品套图 AI

面向跨境电商卖家的 AI 商品信息分析与电商套图生成工具。当前已完成 M0 项目初始化，具备 Web、API、异步 Worker、共享包及本地基础设施。

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

## 当前实现边界

M0 仅建立可运行、可测试的工程底座。账号、项目、素材、AI 调用、额度结算与图片导出将在 M1–M5 逐步实现。Worker 当前注册了并发数为 2 的 `image-generation` 队列处理器占位实现，不能用于实际生图。

本地 MinIO 暂时使用固定版本的 `bitnamilegacy/minio` 镜像，因为上游官方预构建镜像目前无法匿名拉取。该镜像只用于本地开发；生产环境必须选用仍受维护的 S3 兼容托管服务或经安全评审的自建镜像。
