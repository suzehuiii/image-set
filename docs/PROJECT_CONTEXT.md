# 商品套图 AI：项目需求、架构与实施记录

> 本文档是项目的单一事实源，用于跨会话保存产品目标、需求、技术决策、实施进度和交接信息。

## 0. 文档信息

| 项目     | 内容                                                     |
| -------- | -------------------------------------------------------- |
| 当前版本 | 0.2                                                      |
| 最后更新 | 2026-10-16                                               |
| 当前阶段 | M0 项目初始化已完成并通过本地全栈健康检查，下一步进入 M1 |
| 工作名称 | 商品套图 AI                                              |
| 目标市场 | 海外电商优先                                             |
| 首期交付 | 可用 MVP、私有测试环境、完整源码与部署文档               |

### 文档维护规则

1. 新会话或新开发者开始工作前，先完整阅读本文档。
2. 需求、接口、数据模型、技术选型或进度发生关键变化时，在同一次工作中更新本文档。
3. 每个重要开发阶段完成后，在“开发与变更日志”追加日期、完成内容、验证结果和下一步。
4. 未确认事项进入“未决事项与风险”，不得当作已确定要求实现。
5. 本文档不保存任何 API Key、密码、Token 或生产凭证。

---

## 1. 项目背景与目标

面向国内跨境电商卖家，提供从商品实体图到电商信息与商品套图的一站式 AI 工具。

用户上传一张或多张真实商品图，补充商品规格、卖点、目标受众和生成要求，可选上传风格参考图。系统通过 AI：

- 分析商品信息并生成英文电商文案及中文解释。
- 规划符合目标平台的图片组合。
- 生成商品主图、功能卖点图、使用场景图和细节图。
- 检查生成图片与真实商品之间的一致性风险。
- 保存项目历史，支持单张重生成和批量下载。

### 成功标准

- 用户不需要掌握提示词即可完成一次套图生成。
- 商品主体的颜色、形状、材质、Logo、数量和配件尽量保持一致。
- 英文标题、关键词和卖点可直接编辑和复用。
- 主图符合目标平台的基础规则，营销图可用于进一步人工审核与发布。
- 任务失败不会重复收费，成功结果不会因部分失败丢失。

### 目标用户

- Amazon、Shopify、TikTok Shop 等平台的中国跨境卖家。
- 电商运营、设计和商品上架人员。
- 缺少稳定设计资源、需要快速制作多商品素材的小团队。

---

## 2. MVP 范围

### 2.1 首期包含

- 邮箱账号登录与用户数据隔离。
- 项目创建、项目列表和历史记录。
- 上传 1–10 张商品图。
- 可选上传 0–4 张风格参考图。
- 填写商品名称、品类、规格、材质、目标人群、真实卖点和额外要求。
- AI 生成英文标题、关键词、卖点和商品描述，并提供中文对照。
- 用户编辑并确认 AI 分析结果。
- 默认生成 4 张 1:1 电商套图。
- 查看生成进度、失败原因和一致性检查结果。
- 修改文案、修改生成要求、单张重生成。
- 下载单张 PNG/JPG 或整套 ZIP。
- 额度余额、预扣、消费、失败退款和流水记录。
- 私有测试环境部署和完整本地运行方式。

### 2.2 首期不包含

- 真实支付、套餐购买和发票。
- 自由拖拽、图层、抠图等完整画布编辑器。
- 批量 SKU 或 Excel 批量生图。
- 服装虚拟试穿和模特换装。
- 商品视频生成。
- 团队空间与多人协作。
- 自动发布到电商平台。
- 多 AI 供应商自动路由。
- 食品、医疗、保健、美妆功效等强监管品类的合规承诺。

---

## 3. 用户流程与功能设计

### 3.1 核心流程

1. 用户注册或登录。
2. 创建项目并选择目标平台，默认 Amazon US。
3. 上传商品实拍图，可选上传风格参考图。
4. 填写商品事实、卖点、规格和生成要求。
5. AI 分析并返回结构化双语商品信息。
6. 用户检查和修改分析结果。
7. 系统创建 4 个独立生成任务，最多并发执行 2 个。
8. 每张图片生成后执行商品一致性检查。
9. 用户查看结果，可修改文案、确认风险或单张重生成。
10. 下载单图或套图 ZIP，项目保存在历史记录中。

### 3.2 默认四图

| 图种        | 主要目标             | 默认规则                                       |
| ----------- | -------------------- | ---------------------------------------------- |
| 白底主图    | 展示真实商品主体     | 纯白背景、无营销文字、无无关道具、商品完整展示 |
| 功能卖点图  | 表达一个核心购买理由 | 商品主体加简短英文卖点，文字由确定性模板排版   |
| 使用场景图  | 展示真实使用情境     | 场景不得虚构商品不具备的用途、尺寸或效果       |
| 材质/细节图 | 展示做工、接口或材质 | 只突出真实存在且在原图或用户信息中可验证的细节 |

默认输出 2048×2048，提供 PNG 和 JPG。若模型原始输出尺寸不同，由导出层统一规范化。

### 3.3 文案和图片分层

- AI 优先生成无文字商品视觉。
- 营销文字通过固定模板叠加，避免模型生成错误英文。
- MVP 不提供自由画布编辑器。
- 用户修改文字后免费重新合成图片。
- 用户要求改变场景、构图或商品展示方式时，触发付费的视觉重生成。

### 3.4 一致性检查

生成图与原商品图对比检查：

- 商品颜色、形状和主要结构。
- Logo、图案和品牌标识。
- 材质和表面纹理。
- 商品数量、套装内容和配件。
- 尺寸比例与使用场景。
- 是否出现用户没有声明的功能、性能或认证。

检查结果分为：

- `passed`：未发现明显差异，可正常下载。
- `review_required`：存在潜在差异，提示用户重生成或确认后下载。
- `blocked`：内容安全拒绝、文件损坏或生成失败，不产出可下载结果。

自动检查只是辅助，最终商品真实性仍需商家人工确认。

---

## 4. 界面信息架构

### 4.1 页面

- `/`：项目列表、最近作品、额度余额和创建入口。
- `/login`、`/register`：邮箱登录注册。
- `/projects/new`：创建项目和上传素材。
- `/projects/:id`：双栏生成工作台。
- `/account`：账户、额度和消费流水。
- `/admin`：暂不在首期公开实现；测试额度通过受控脚本或数据库管理。

### 4.2 工作台布局

- 桌面端：约 380px 左侧配置栏，右侧自适应结果区。
- 左侧：商品图、参考图、商品资料、AI 分析结果、文案和生成要求。
- 右侧：四图卡片、生成状态、一致性提示、重生成与下载操作。
- 移动端：改为分步式纵向流程，不强行保留双栏。
- 视觉方向：浅灰背景、白色卡片、珊瑚红主色；参考用户提供的工具型布局，但不复制品牌和导航。

---

## 5. 技术选型

### 5.1 已确认技术栈

| 层级        | 选择                                                    | 说明                                 |
| ----------- | ------------------------------------------------------- | ------------------------------------ |
| 前端        | Next.js + React + TypeScript                            | 产品界面、SSR/CSR、上传和结果展示    |
| API 服务    | NestJS + TypeScript                                     | 鉴权、项目、额度、任务和文件接口     |
| 异步 Worker | NestJS Standalone + BullMQ                              | AI 分析、生图、检查、合成和失败重试  |
| 主数据库    | PostgreSQL                                              | 用户、项目、任务、额度和事务数据     |
| ORM/迁移    | Drizzle ORM                                             | 类型安全且保留清晰 SQL 控制          |
| 队列与缓存  | Redis + BullMQ                                          | 任务队列、限流、锁、进度和短期缓存   |
| 文件存储    | 本地 MinIO；生产 S3/R2/OSS                              | 保存原图、参考图和生成结果           |
| 反向代理    | Nginx                                                   | HTTPS、域名、上传限制和服务转发      |
| 部署        | Docker Compose                                          | 本地和服务器环境尽量一致             |
| AI 供应商   | OpenAI，服务端密钥                                      | 首期单供应商，通过适配层隔离业务代码 |
| Monorepo    | pnpm workspace                                          | 管理三个应用与共享包，锁文件保证复现 |
| 基础工具链  | Node.js 22、TypeScript 5.9、ESLint 10、Prettier、Vitest | 统一构建、检查、格式与测试基线       |

### 5.2 为什么首期使用 Node.js/TypeScript

- 前后端共享类型、枚举和校验 Schema，减少接口偏差。
- 主要负载是文件和网络 I/O、AI API 等待与任务编排，适合 Node.js。
- NestJS 对模块、鉴权、依赖注入、测试和 BullMQ 有成熟支持。
- API 与 Worker 可使用同一套领域服务，又能独立部署和扩容。

### 5.3 Python 的使用边界

首期不引入 Python。出现以下需求时，再增加独立 Python AI Worker：

- 本地部署生成模型或 GPU 推理。
- SAM 抠图、YOLO 检测、复杂 OCR。
- OpenCV/Pillow 大批量处理。
- 模型训练、微调或自研一致性算法。

Python 服务不得直接替代核心账务和项目数据的事务控制；通过队列接受任务并返回结构化结果。

### 5.4 为什么使用 PostgreSQL

- 额度预扣、流水、退款和任务创建需要可靠事务。
- 用户、项目、素材和任务具有清晰关系，适合外键和约束。
- `jsonb` 可保存模型结果、Prompt 元数据和检查结果，并支持索引。
- 后续可使用全文搜索和 `pgvector`，无需过早引入额外搜索数据库。

Redis 不是业务主数据库。用户余额、任务最终状态和额度流水以 PostgreSQL 为准；Redis 只保存可恢复的队列和临时状态。

图片文件不得以 Base64/BLOB 形式长期存入 PostgreSQL，只保存对象存储 Key、格式、尺寸、哈希和状态。

---

## 6. 系统架构

```text
Browser
  │
  ▼
Nginx
  ├── Next.js Web
  └── NestJS API
         ├── PostgreSQL
         ├── Redis / BullMQ
         ├── S3-compatible Object Storage
         └── OpenAI API（短请求或任务提交）

Redis / BullMQ
  │
  ▼
NestJS Worker
  ├── OpenAI 商品分析
  ├── OpenAI 图片生成
  ├── 一致性检查
  ├── 文字模板合成
  ├── Object Storage
  └── PostgreSQL 状态与流水更新
```

### 推荐仓库结构

```text
apps/
  web/                 Next.js 前端
  api/                 NestJS API
  worker/              NestJS/BullMQ Worker
packages/
  shared/              DTO、Zod Schema、枚举、错误码
  database/            Drizzle Schema、迁移和 Repository
  ai-provider/         AI 模型适配层
  image-layout/        文字模板和导出规则
docs/
  PROJECT_CONTEXT.md   项目单一事实源
infra/
  nginx/
  docker/
docker-compose.yml
```

### 部署进程

- `web`：前端服务。
- `api`：HTTP API，不执行耗时生成任务。
- `worker`：独立任务消费者，可按生图并发量横向扩容。
- `postgres`：生产优先使用托管数据库；本地由 Docker 提供。
- `redis`：生产开启持久化和备份；本地由 Docker 提供。
- `minio`：仅本地或私有部署使用；生产可切换为 S3/R2/OSS。

当前本地 Compose 使用固定版本 `bitnamilegacy/minio:2025.7.23-debian-12-r5`。这是由于 2026-10 验收时上游官方预构建镜像无法匿名拉取的临时兼容方案，只限本地开发；生产不得直接沿用该 Legacy 镜像。

---

## 7. AI 处理流程

### 7.1 模型分工

当前默认模型配置：

- 商品识别与结构化文案：`gpt-6.1-sol`。
- 商品图片生成与编辑：`gpt-image-2.5-sunburst`。
- 生成后一致性检查：`gpt-6-luna`。

模型 ID 必须通过环境变量或配置表管理，不能散落在业务代码中。上线前重新核对可用性、价格和组织权限。

### 7.2 Provider 接口

```ts
interface AiProvider {
  analyzeProduct(input: ProductAnalysisInput): Promise<ProductAnalysisResult>;
  generateImage(input: ImageGenerationInput): Promise<GeneratedImageResult>;
  reviewConsistency(
    input: ConsistencyReviewInput,
  ): Promise<ConsistencyReviewResult>;
}
```

首期只有 `OpenAiProvider`。业务服务依赖接口而不是直接依赖 OpenAI SDK，以便后续增加其他供应商或自建模型。

### 7.3 结构化分析结果

```ts
type ProductAnalysisResult = {
  productName: { en: string; zh: string };
  title: { en: string; zh: string };
  keywords: Array<{ en: string; zh: string }>;
  sellingPoints: Array<{ en: string; zh: string; evidence: string }>;
  description: { en: string; zh: string };
  missingInformation: string[];
  complianceFlags: string[];
  imagePlan: Array<{
    role: 'main' | 'feature' | 'lifestyle' | 'detail';
    objective: string;
    visualDirection: string;
    copyEn?: string;
    copyZh?: string;
  }>;
};
```

---

## 8. 数据模型草案

### 8.1 核心表

#### `users`

- `id`
- `email`
- `password_hash`
- `display_name`
- `credit_balance`
- `status`
- `created_at`
- `updated_at`

#### `projects`

- `id`
- `user_id`
- `name`
- `target_platform`
- `target_locale`
- `product_category`
- `product_brief` JSONB
- `analysis_result` JSONB
- `status`
- `created_at`
- `updated_at`
- `deleted_at`

#### `assets`

- `id`
- `project_id`
- `owner_user_id`
- `asset_type`：product/reference/generated/export
- `image_role`：main/feature/lifestyle/detail，可空
- `object_key`
- `mime_type`
- `width`
- `height`
- `file_size`
- `checksum`
- `status`
- `qa_result` JSONB
- `created_at`
- `deleted_at`

#### `generation_jobs`

- `id`
- `project_id`
- `user_id`
- `job_type`：analysis/image/review/export
- `image_role`
- `status`：queued/running/succeeded/failed/cancelled
- `provider`
- `model`
- `prompt_version`
- `input_snapshot` JSONB
- `result_asset_id`
- `credits_reserved`
- `attempt_count`
- `error_code`
- `error_message_safe`
- `started_at`
- `completed_at`
- `created_at`

#### `credit_ledger`

- `id`
- `user_id`
- `job_id`，可空
- `entry_type`：grant/reserve/consume/refund/adjustment
- `delta`
- `balance_after`
- `idempotency_key`
- `description`
- `created_at`

### 8.2 数据约束

- 所有用户资源查询必须同时带 `owner_user_id` 或通过项目归属校验。
- 额度流水只追加，不修改历史记录。
- `credit_ledger.idempotency_key` 唯一，防止重复扣费或退款。
- 软删除项目后禁止继续生成，并异步清理对象存储文件。
- Prompt 输入快照不保存秘密，只保存复现任务所需的业务参数和模板版本。

---

## 9. API 草案

### 身份

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 项目

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

### 文件

- `POST /api/assets/upload-url`：获取短期上传凭证或创建上传会话。
- `POST /api/assets/complete`：完成上传并写入素材记录。
- `GET /api/assets/:id/content`：鉴权下载或返回短期签名 URL。
- `DELETE /api/assets/:id`

### AI 与生成任务

- `POST /api/projects/:id/analyze`
- `PATCH /api/projects/:id/content`
- `POST /api/projects/:id/generations`
- `GET /api/projects/:id/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/retry`
- `POST /api/jobs/:id/cancel`

### 导出与额度

- `POST /api/projects/:id/exports`
- `GET /api/credits/balance`
- `GET /api/credits/ledger`

所有创建任务或扣费接口必须支持 `Idempotency-Key`。API 使用统一错误结构：

```ts
type ApiError = {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
};
```

---

## 10. 额度规则

MVP 默认规则：

| 操作                     |                 额度 |
| ------------------------ | -------------------: |
| 首次注册赠送             |                  +50 |
| AI 商品分析              |                   -1 |
| 完整四图                 |                  -12 |
| 单张视觉重生成           |                   -3 |
| 修改文字并重新合成       |                    0 |
| 模型失败、超时或安全拒绝 | 自动退回对应预留额度 |

处理原则：

1. 在 PostgreSQL 事务中检查余额、创建任务、预留额度并写流水。
2. Worker 成功后把预留转换为实际消费。
3. 失败只退回失败任务对应额度，已成功图片保留。
4. 相同幂等键不得创建第二个任务或重复扣费。

---

## 11. 安全、隐私与非功能要求

### 安全

- 密码使用 Argon2id 或等效安全算法哈希。
- 登录使用安全、HttpOnly、SameSite Cookie；生产环境强制 HTTPS。
- OpenAI 和对象存储密钥只存在于服务端 Secret/环境变量。
- 上传时校验 MIME、扩展名、文件头、大小和像素尺寸。
- 对象存储默认私有，访问需要鉴权或短期签名 URL。
- 所有项目、文件、任务和下载接口执行服务端归属校验。
- 日志不记录用户原图内容、完整 Prompt、密码和密钥。
- 对登录、上传、分析和生成接口实施限流。

### 可靠性

- API 重启不丢失已提交任务。
- Worker 使用指数退避重试；业务错误和安全拒绝不盲目重试。
- 任务状态、额度状态与对象文件写入需设计补偿流程。
- 生成任务支持超时和僵尸任务回收。
- PostgreSQL 定期备份；对象存储启用版本控制或生命周期策略。

### 性能基线

- 普通 API P95 目标小于 500ms，不包含上传和 AI 调用。
- 项目列表分页读取。
- 四图默认最多并发 2 张，避免单用户瞬时占满模型额度。
- 上传和下载不通过数据库中转大文件。

---

## 12. 本地开发与生产部署

### 本地 Docker Compose 服务

- `web`
- `api`
- `worker`
- `postgres`
- `redis`
- `minio`
- `nginx`，开发初期可选

本地环境使用 `.env.local` 或未追踪的 `.env`；仓库只提交 `.env.example`。

### 生产建议

- Linux 服务器运行 Web、API、Worker 和 Nginx 容器。
- PostgreSQL 优先使用托管实例，而不是与应用共用单机磁盘。
- Redis 使用托管实例或开启 AOF、RDB 和异机备份。
- 图片使用 S3、Cloudflare R2、阿里云 OSS 或腾讯云 COS。
- 海外用户优先选择新加坡、日本或美国区域，最终依据用户分布和合规要求确定。
- 接入域名、TLS、错误监控、结构化日志、健康检查和自动备份。

---

## 13. 实施里程碑

### M0：项目初始化

状态：已完成（2026-10-16）。

- 创建 monorepo、Web/API/Worker 应用和共享包。
- 配置 TypeScript、代码质量、测试和 Docker Compose。
- 启动 PostgreSQL、Redis、MinIO。
- 建立基础 CI 和环境变量模板。

验收：全新机器根据 README 能启动所有本地服务并通过健康检查。

完成验证：依赖锁定、格式检查、ESLint、全工作区类型检查、4 项单元测试、三应用生产构建和 Compose 配置校验均通过；PostgreSQL、Redis、MinIO、Web、API、Worker、Nginx 实际启动，Web/API/Worker/Nginx 四个外部健康检查通过。

### M1：账号、项目与素材

- 邮箱登录注册。
- 用户、项目和素材数据模型。
- 商品图/参考图上传和删除。
- 项目列表与创建流程。

验收：两个账号之间数据完全隔离，项目与素材可持久化。

### M2：AI 商品分析

- OpenAI Provider 抽象。
- 商品图视觉分析和结构化双语结果。
- 编辑、保存和重新分析。
- 分析额度预扣、消费和退款。

验收：结构化结果稳定通过 Schema 校验，刷新页面后可恢复。

### M3：四图生成

- BullMQ 任务、Worker、进度查询和重试。
- 四种图片 Prompt 模板和平台规则。
- 图片存储、结果卡片和单图重生成。
- 一致性检查和风险提示。

验收：部分任务失败不影响成功结果，额度结算准确。

### M4：文字合成与导出

- 固定营销图模板。
- 文案修改后的免费重新合成。
- PNG/JPG 单图下载和 ZIP 导出。

验收：导出尺寸、格式、文件命名和主图规则正确。

### M5：生产准备与交付

- 响应式与可访问性检查。
- 安全、限流、日志、监控和备份。
- Docker 生产配置和 Nginx。
- 真实服务器部署、冒烟测试和交付文档。

验收：在线测试环境完成端到端流程，并可按照文档重复部署。

---

## 14. 总体验收场景

- 上传 1 张、10 张商品图和 0–4 张风格图。
- 拒绝非法格式、超限、损坏和伪造 MIME 文件。
- 没有风格图时仍能完成分析和四图生成。
- AI 输出严格符合约定结构，双语内容可编辑。
- 主图无文字和无关道具；营销图文字拼写准确。
- 页面显示四个任务的独立进度和结果。
- 单图失败时可重试，成功结果和额度不受影响。
- 修改文案不扣费，视觉重生成正确扣费。
- 刷新、退出和重新登录后可恢复项目状态。
- 用户无法访问其他用户的项目、任务、图片或下载地址。
- 导出的 PNG、JPG 和 ZIP 可以正常打开且尺寸正确。
- 手机和桌面端均可完成关键流程。

---

## 15. 决策记录

| 日期       | 决策                                            | 原因                                                             |
| ---------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| 2026-10-15 | 首期交付可用 MVP，不只做高保真原型              | 需要验证真实上传、分析、生图和下载闭环                           |
| 2026-10-15 | 海外电商优先，英文成品加中文对照                | 服务国内跨境卖家的校对与海外发布需求                             |
| 2026-10-15 | 首期支持通用硬商品                              | 降低虚拟试穿和强监管品类的一致性风险                             |
| 2026-10-15 | 默认生成 4 张标准套图                           | 在覆盖核心用途的同时控制成本与等待时间                           |
| 2026-10-15 | 不做完整画布编辑器                              | 聚焦生成闭环，文字使用模板确定性合成                             |
| 2026-10-15 | OpenAI 单供应商并设置 Provider 抽象             | 降低 MVP 集成成本，同时保留替换能力                              |
| 2026-10-15 | 采用本地开发并部署到自主真实服务器              | 便于独立域名、账号、队列、支付和长期运营                         |
| 2026-10-15 | 主后端使用 Node.js、NestJS 和 TypeScript        | 与前端共享类型，适合 I/O 和任务编排，开发效率高                  |
| 2026-10-15 | 首期不混用 Python                               | 当前只调用云端模型；自研视觉/GPU 推理时再引入                    |
| 2026-10-15 | PostgreSQL 为主数据库                           | 适合额度事务、关系数据、JSONB 和后续扩展                         |
| 2026-10-15 | Redis/BullMQ 负责异步任务，不作为业务真相源     | 支持恢复、重试和扩容，同时保持账务一致性                         |
| 2026-10-15 | 图片存对象存储，不存数据库 BLOB                 | 降低数据库体积并支持 CDN、签名访问和独立扩容                     |
| 2026-10-16 | 使用 pnpm workspace，不在 M0 引入额外任务编排器 | 当前规模下递归脚本足够，可减少工具链复杂度                       |
| 2026-10-16 | Web、API、Worker 在 Compose 中复用同一构建镜像  | 避免重复安装和构建相同工作区，降低网络失败概率                   |
| 2026-10-16 | Docker 构建默认使用可配置 npm 镜像源            | 当前网络对官方源存在间歇性重置，同时允许通过 `NPM_REGISTRY` 切换 |
| 2026-10-16 | 本地 MinIO 临时固定到 Bitnami Legacy 2025.7.23  | 官方预构建镜像当前不可拉取；仅限本地，生产另选受维护方案         |

---

## 16. 开发与变更日志

### 2026-10-15

- 完成需求澄清与 MVP 边界确认。
- 完成海外电商平台图片基础规则调研。
- 确认本地开发、真实服务器部署，不采用 Sites 作为生产承载。
- 确认 TypeScript/Node.js、Next.js、NestJS、PostgreSQL、Redis/BullMQ、对象存储和 Docker Compose 技术栈。
- 建立项目单一事实源、协作规则和实施里程碑。
- 当前未开始代码初始化或功能开发。

验证结果：文档方案已由用户确认，等待进入 M0。

下一步：初始化 monorepo、Docker Compose 和基础服务。

### 2026-10-16

- 完成 pnpm monorepo 初始化，建立 Next.js Web、NestJS API、NestJS Standalone/BullMQ Worker。
- 建立 `shared`、`database`、`ai-provider`、`image-layout` 四个共享包及基础类型、Provider 接口、Drizzle 连接层和导出规则。
- 完成 TypeScript、ESLint 10、Prettier、Vitest、GitHub Actions、环境变量模板和依赖锁文件。
- 完成 PostgreSQL、Redis、MinIO、Web、API、Worker、Nginx 的 Docker Compose 编排；应用健康检查会真实探测 PostgreSQL、Redis 和对象存储。
- Nginx 通过 Docker 内置 DNS 动态解析 Web/API 上游，应用容器重建后无需同步重启代理。
- Worker 注册 `image-generation` 队列占位处理器并将并发固定为 2；实际 AI 生图逻辑留待 M3。
- README 已补充全栈启动、本机开发、质量检查、服务入口和安全提示。

验证结果：`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`（2 个测试文件、4 项测试）、`pnpm build`、`docker compose config --quiet` 全部通过；完整容器栈启动后，Web、API、Worker、Nginx 健康检查全部通过，PostgreSQL、Redis、MinIO 容器健康。

下一步：进入 M1，实现数据库迁移、邮箱账号、项目与素材模型、对象上传及用户数据隔离。

---

## 17. 未决事项与风险

### 开发前或开发中确认

- 正式产品名称、Logo 和品牌色；开发阶段使用“商品套图 AI”。
- 首个生产云厂商、部署区域和对象存储供应商。
- 邮件服务供应商，用于注册验证和找回密码。
- 测试阶段 OpenAI API Key、组织权限和预算上限。
- 用户数据与图片的默认保留期限。
- 正式上线前的隐私政策、用户协议和 AI 内容免责声明。

### 已知风险

- 生成模型无法绝对保证商品一致性，必须保留人工确认步骤。
- 平台图片规则会变化，需要把规则做成可版本化配置。
- 生图成本与延迟受模型、尺寸、质量和参考图数量影响，需要记录真实用量后调整额度。
- Redis 任务与 PostgreSQL 业务事务之间存在双写风险，需要使用幂等键、事务状态和补偿扫描处理。
- 图片上传和生成可能造成存储成本增长，需要生命周期和删除策略。
- MinIO 上游已转向源码分发且官方预构建镜像当前不可稳定拉取；本地临时使用的 Bitnami Legacy 镜像不再维护，需持续做漏洞扫描，并在生产部署前确定受维护的 S3 兼容服务或自建镜像方案。
- Docker 构建默认 npm 镜像源是可配置的第三方镜像；CI/生产应按组织供应链政策设置 `NPM_REGISTRY`，并始终使用冻结锁文件和完整性校验。

---

## 18. 新会话交接摘要

新会话开始时可使用以下摘要，并要求继续读取本文档：

> 这是一个从空项目开始开发的跨境电商 AI 套图工具。MVP 已确认：上传商品图和可选风格图，AI 输出英文电商信息及中文对照，生成白底主图、功能图、场景图和细节图，支持一致性检查、单张重生成、额度和下载。技术栈为 Next.js + NestJS + TypeScript、PostgreSQL、Redis/BullMQ、MinIO/S3 兼容对象存储、Docker Compose，OpenAI 为首期 AI 供应商。M0 已完成：pnpm monorepo、Web/API/Worker/共享包、质量门禁、CI、环境模板和完整本地 Compose 均已建立并通过健康检查，下一步是 M1 账号、项目与素材。采用本地开发和自主服务器部署。`docs/PROJECT_CONTEXT.md` 是需求、架构、决策与进度单一事实源，任何关键变更都必须同步更新。
