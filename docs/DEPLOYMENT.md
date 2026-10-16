# M5 私有测试环境部署与运维

本文档描述当前 M5 初始化阶段可重复执行的单机 Docker Compose 部署。它适合私有测试环境，不代表已经完成公开生产上线；真实 OpenAI 成功链路、云资源选型、数据保留政策和异步补偿仍须在公开上线前完成。

## 1. 部署前提

- 64 位 Linux 主机，安装 Docker Engine 与 Docker Compose v2/v5。
- 一个解析到主机的域名，以及该域名的 TLS 证书。
- 外部 PostgreSQL 17、启用持久化的 Redis、受维护的 S3 兼容对象存储。
- 受限权限的 OpenAI API Key；不得写入镜像、Git 或 Compose 文件。
- 防火墙仅公开 80/443；PostgreSQL、Redis、对象存储管理端口只允许受信网络访问。

生产编排不会启动本地 PostgreSQL、Redis 或 Legacy MinIO。应用容器仅连接 `backend` 内部网络，只有 Nginx 发布主机端口。

## 2. 准备配置与证书

在仓库外创建受限目录，例如 `/opt/image-set/secrets`，将 `.env.production.example` 复制为 `/opt/image-set/secrets/image-set.env` 并填写真实值：

```bash
install -d -m 700 /opt/image-set/secrets/tls
install -m 600 fullchain.pem /opt/image-set/secrets/tls/fullchain.pem
install -m 600 privkey.pem /opt/image-set/secrets/tls/privkey.pem
cp .env.production.example /opt/image-set/secrets/image-set.env
chmod 600 /opt/image-set/secrets/image-set.env
```

必填契约：

- `APP_DOMAIN` 只填域名，不带协议。
- `DATABASE_URL` 指向 PostgreSQL；生产账号只授予本应用数据库所需权限。
- `REDIS_URL` 推荐 `rediss://` 并配置认证。
- `S3_ENDPOINT` 和 `S3_PUBLIC_ENDPOINT` 必须为 HTTPS；后者必须是浏览器可访问且参与签名的域名。
- `S3_ACCESS_KEY` 只授予目标 bucket 的读写删权限。
- `OPENAI_API_KEY` 使用项目级、限预算、可轮换密钥。
- `TLS_CERT_DIR` 是主机证书目录，内含 `fullchain.pem` 和 `privkey.pem`。

API 在 `DEPLOYMENT_ENV=production` 时会拒绝缺失必填值、非安全 Cookie、HTTP 对象存储端点、HTTP Web Origin 和明显的本地占位凭证。

## 3. 构建和启动

先在 CI 或部署主机完成质量检查和生产配置解析：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm compose:production:check
```

启动：

```bash
docker compose \
  --env-file /opt/image-set/secrets/image-set.env \
  -f docker-compose.production.yml \
  up --build -d
```

API 启动时在 PostgreSQL advisory lock 保护下执行幂等迁移。部署期间查看状态：

```bash
docker compose \
  --env-file /opt/image-set/secrets/image-set.env \
  -f docker-compose.production.yml \
  ps
docker compose \
  --env-file /opt/image-set/secrets/image-set.env \
  -f docker-compose.production.yml \
  logs --tail=200 api worker nginx
```

## 4. 冒烟与端到端验收

公开入口检查：

```bash
BASE_URL=https://studio.example.com pnpm smoke:production
```

脚本验证 Nginx、API 及 PostgreSQL/Redis/对象存储依赖健康，检查请求 ID、TLS 安全头、CSP 和登录页。随后由测试账号人工完成一次完整流程：

1. 注册、退出、重新登录。
2. 创建项目，上传 1 张商品图和 0 张风格图。
3. 完成真实 OpenAI 商品分析并保存编辑。
4. 生成四个角色图片，确认并发、进度、一致性结果和额度流水。
5. 对失败角色执行单图重试；确认成功结果不丢失且只结算对应额度。
6. 修改英文文案，导出单图 PNG/JPG 和整套 ZIP，检查 2048×2048、命名和主图无字。
7. 用第二个账号验证无法读取第一个账号的项目、任务、素材和下载。
8. 在手机宽度和桌面宽度下仅用键盘完成登录、项目创建、上传和导出操作。

真实模型测试会产生费用，测试账号和预算上限应事先隔离。

## 5. 日志、监控与告警

- API 每个请求向标准输出写一条 JSON：`event=http_request`、`requestId`、方法、无查询参数路径、状态码、耗时和时间戳；不记录 Cookie、请求体、Prompt、图片或密钥。
- Nginx 向上游传递请求 ID；API 响应返回 `x-request-id`，故障排查按该值关联代理与应用日志。
- Docker 日志轮转为每文件 10 MB、最多 5 个文件。长期环境应接入集中日志平台，而不是依赖容器本地日志。
- 外部监控每分钟探测 `GET /healthz` 和 `GET /api/health`。连续 3 次失败、5xx 比例升高、P95 超过 500 ms、Worker 不健康或队列持续积压时告警。
- 至少监控 PostgreSQL 连接/容量、Redis 内存/AOF、对象存储容量与错误率、主机磁盘、TLS 到期时间、OpenAI 错误率/延迟/预算。

登录注册、上传、分析和生图/重试接口使用 Redis 原子计数按来源 IP 限流；超限返回 429、`Retry-After` 和 `X-RateLimit-*`。Redis 不可用时敏感写接口失败关闭并返回 503。Nginx 另有每 IP 10 请求/秒的总体保护。

## 6. PostgreSQL 备份与恢复演练

部署主机安装 PostgreSQL 17 客户端。定时任务只需向脚本提供 `DATABASE_URL` 和仓库外备份目录：

```bash
DATABASE_URL='postgresql://...' \
BACKUP_DIRECTORY=/var/backups/image-set/postgres \
BACKUP_RETENTION_DAYS=14 \
./scripts/backup-postgres.sh
```

脚本生成 custom-format 归档、执行 `pg_restore --list` 校验并写 SHA-256；默认删除 14 天前由本脚本创建的归档和校验文件。备份应再复制到异机、加密存储，并限制读取权限。

对象存储备份由供应商完成：生产 bucket 必须开启版本控制、服务端加密、生命周期和跨区域或异账号复制。Redis 是可恢复队列而非业务真相源，但仍应启用 AOF/RDB 和异机备份。

恢复只能对已核对的目标执行；脚本会清理并覆盖目标数据库，因此需要显式确认：

```bash
DATABASE_URL='postgresql://restore-target/...' \
ALLOW_DATABASE_RESTORE=I_UNDERSTAND_THIS_OVERWRITES_DATA \
./scripts/restore-postgres.sh /var/backups/image-set/postgres/image-set-TIMESTAMP.dump
```

至少每季度在隔离数据库做恢复演练，随后启动应用并执行健康检查和只读数据抽查。未实际恢复验证的归档不能视为可用备份。

## 7. 更新与回滚

1. 更新前完成数据库和对象存储备份，记录当前 Git commit 与镜像 digest。
2. 新版本先在私有测试环境执行完整冒烟，再更新生产。
3. 当前迁移只允许向前兼容；发生应用故障时可把 `APP_IMAGE` 切回上一镜像并重新 `up -d`。
4. 如果新迁移改变了数据库且不向后兼容，禁止仅回滚镜像；必须使用该迁移对应的书面回退方案或从已验证备份恢复。

## 8. 当前上线门槛

在以下事项完成前，本配置只用于私有测试：

- 使用受限 OpenAI 测试密钥完成 M2/M3 真实成功链路和费用/延迟记录。
- 确认云厂商、区域、托管 PostgreSQL/Redis/S3 产品及数据保留期限。
- 补齐 Redis 丢失后的 queued 任务重投、分析 running 僵尸任务退款、软删除对象清理和过期会话清理。
- 完成隐私政策、用户协议、AI 内容免责声明和正式安全评审。
- 在真实主机完成部署、备份恢复演练及两账号端到端验收。
