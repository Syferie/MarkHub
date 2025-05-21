# MarkHub 存储重构进度

本文档用于追踪 MarkHub 应用存储重构项目的进度。详细计划请参阅 [[`markhub_refactor_plan.md`](markhub_refactor_plan.md)]。

## 主要开发步骤

1.  **Go 后端项目搭建**:
    *   创建新的 Go 项目。
    *   添加 PocketBase 依赖。
    *   创建 `main.go` 并初始化 PocketBase 实例，配置数据目录和迁移。
    *   状态：完成 (Done)
2.  **数据库 Schema 定义 (通过 PocketBase Go 迁移)**:
    *   在 Go 项目中创建 `migrations` 目录。
    *   编写 Go 迁移脚本定义集合、字段、索引和 API 规则。
    *   首次运行 Go 应用以应用迁移。
    *   状态：完成 (Done)
    *   备注：Go 迁移脚本 `001_init_collections.go` 已成功应用。数据库集合 (`bookmarks`, `folders`, `user_settings`)、字段及 API 规则已按计划创建，并通过 Admin UI 验证无误。
3.  **实现自定义 Go 后端逻辑**:
    *   状态：完成 (Done)
    *   **标签生成 (PocketBase 钩子)**:
        *   状态：进行中 (In Progress)
        *   备注：已在 Go 后端为 `bookmarks` 集合的创建/更新事件添加钩子骨架，可自动设置 `userId`。实际的 AI 标签生成逻辑（调用 OpenAI 兼容 API，参考原 `/app/api/generate-tags/route.ts`）尚未实现。
    *   **文件夹建议 (自定义 Go HTTP 路由)**:
        *   状态：完成 (Done)
        *   备注：已在 Go 后端 `/api/custom/suggest-folder` 路由中实现 AI 文件夹建议逻辑，包括获取用户配置、页面内容、调用 OpenAI 兼容 API 及处理响应。前端需对接并测试。
    *   **WebDAV 操作 (自定义 Go HTTP 路由)**:
        *   状态：完成 (Done)
        *   备注：已在 Go 后端 `/api/custom/webdav/backup` 和 `/api/custom/webdav/restore` 路由中实现实际的 WebDAV 客户端交互逻辑，用于数据备份和恢复。测试通过。
4.  **用户认证 (Next.js)**:
    *   Next.js 应用实现注册/登录页面，调用 Go 后端认证 API。
    *   状态：完成 (Done)
    *   备注：用户认证流程初步完成。已创建 `AuthContext` ([`context/auth-context.tsx`](context/auth-context.tsx:1)) 管理用户状态和 Token (使用 `localStorage` 存储)。登录/注册页面 ([`app/login/page.tsx`](app/login/page.tsx:1), [`app/register/page.tsx`](app/register/page.tsx:1)) 已集成此 Context。登录成功后会导航到主页，并已添加基础导航栏 ([`components/navbar.tsx`](components/navbar.tsx:1)) 显示用户状态和登出按钮。
5.  **API 服务层 (Next.js)**:
    *   创建封装与 Go 后端 API 调用的服务。
    *   状态：完成 (Done)
    *   备注：API 服务层 ([`lib/api-client.ts`](lib/api-client.ts:1)) 已创建，包含基础的 API 调用函数，并已成功实现和集成了用户注册 (`registerUser`) 与登录 (`loginUser`) 的 API 调用。
6.  **核心数据迁移 (Next.js `BookmarkContext`)**:
    *   切换数据源到调用 Go 后端的 API 服务层。
    *   状态：完成 (Done)
    *   备注：[`context/bookmark-context.tsx`](context/bookmark-context.tsx:1) 已完全改造，书签和文件夹的读取、创建、更新、删除操作以及书签收藏状态的同步，均已通过 API 服务层 ([`lib/api-client.ts`](lib/api-client.ts:1)) 对接后端 Go 应用。所有核心数据操作不再依赖 IndexedDB。测试通过。
7.  **应用设置迁移 (Next.js)**:
    *   将应用设置逻辑迁移到后端 `user_settings` (通过 Go 后端 API)。
    *   状态：完成 (Done)
    *   备注：所有核心用户设置（包括主题、标签列表、收藏文件夹、排序选项、搜索字段、WebDAV 配置及 Gemini API 配置）均已成功迁移。它们现在都通过 `AuthContext` 从后端 `user_settings` 加载，并通过 Settings Modal 或其他相关 UI 操作同步回后端。[`lib/config-storage.ts`](lib/config-storage.ts:1) 已简化，仅保留通用 localStorage 功能。测试通过。
8.  **本地迭代与测试 (MarkHub 主应用与 Go 后端)**:
    *   同时运行 Go 后端和 Next.js 开发服务器。
    *   进行全面的功能测试和调试。
    *   状态：进行中 (In Progress)
    *   备注：已对重构后的核心功能进行多轮迭代测试。目前，用户认证、书签和文件夹的 CRUD 操作、大部分应用设置（主题、标签、收藏、排序、搜索、WebDAV、Gemini配置）的后端同步和前端应用均已通过测试。UI 布局调整和相关构建/运行时错误已解决。后续将进行更全面的场景覆盖测试，并准备开始 Chrome 插件的改造。
9.  **Chrome 插件改造 (后期)**:
    *   认证、添加书签、双向同步逻辑改造。
    *   状态：待办 (To Do)
10. **(后期) Docker 化部署**:
    *   为 Go 后端应用编写 `Dockerfile`。
    *   构建 Docker 镜像并进行部署测试。
    *   状态：待办 (To Do)

---

## 详细任务与日志

(此部分将用于记录各个子任务的进展和完成情况)