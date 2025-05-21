# MarkHub 存储重构计划 (迁移至 Go 后端内嵌 PocketBase)

**最后更新时间:** 2025-05-21 (已修改)

**目标：** 将 MarkHub 应用的书签及相关数据（文件夹、应用设置）的存储从客户端的 `IndexedDB` 和 `localStorage` 迁移到**一个自定义的 Go 后端应用，该应用内嵌 PocketBase 数据库**。这将简化 Chrome 插件与主应用的数据同步，实现更纯粹的前后端分离，并将业务逻辑（如标签生成、文件夹建议、WebDAV 操作）集中到 Go 后端处理，同时为未来的功能扩展（如多设备同步）打下坚实基础。

---

## 1. 架构概览

新的系统架构将包含以下主要组件：

*   **MarkHub Next.js 应用 (客户端)**: 用户主要的交互界面。负责展示书签、文件夹，处理用户操作，并与后端的 **MarkHub Go 后端** API 通信。
*   **MarkHub Chrome 插件**: 辅助用户从浏览器快速添加书签。负责用户认证，并将书签数据通过 API 发送到 **MarkHub Go 后端**。
*   **MarkHub Go 后端 (内嵌 PocketBase)**: 作为应用的后端服务。这是一个您编写的 Go 应用程序：
    *   **内嵌 PocketBase**: 用于数据库管理、内置的用户认证服务、为集合自动生成 RESTful API。存储所有用户数据，包括书签、文件夹、用户账户和应用设置。
    *   **自定义 Go 逻辑**: 实现特定的业务逻辑，如标签生成、文件夹建议、WebDAV 操作等，通过自定义的 Go HTTP 处理函数或 PocketBase 钩子实现。

```mermaid
graph TD
    subgraph 用户设备
        A[Chrome 浏览器] -->|浏览/操作| P[MarkHub Chrome 插件];
        A -->|浏览/操作| N[MarkHub Next.js 应用];
    end

    subgraph 后端服务
        GO_PB[MarkHub Go 后端 (内嵌 PocketBase)]
    end

    N -->|HTTPS (API 调用)| GO_PB;
    P -->|HTTPS (API 调用)| GO_PB;

    N -->|用户认证跳转| N; # 插件跳转到主应用认证，认证服务由内嵌的PocketBase提供
    P -->|用户认证跳转| N;

    style GO_PB fill:#f9f,stroke:#333,stroke-width:2px
    style N fill:#ccf,stroke:#333,stroke-width:2px
    style P fill:#cfc,stroke:#333,stroke-width:2px
```

---

## 2. 数据库模型设计 (PocketBase Collections)

**此部分与原方案完全相同。** 我们将在内嵌的 PocketBase 实例中通过迁移脚本定义以下主要集合 (Collections)：

1.  **`users` (内置)**: PocketBase 内置的用户集合，用于存储用户信息和处理认证。
2.  **`bookmarks`**:
    *   `userId`: (Relation to `users.id`) - 关联用户 (必需)
    *   `title`: (Text) - 书签标题 (必需)
    *   `url`: (URL) - 书签链接 (必需, 唯一约束基于 userId + url, 通过钩子或API规则实现)
    *   `folderId`: (Relation to `folders.id`) - 关联文件夹 (可选)
    *   `tags`: (JSON, Array of Text) - 标签列表 (可选, 由 Go 后端钩子自动生成)
    *   `favicon`: (URL or Text) - Favicon 链接或 Base64 (可选)
    *   `isFavorite`: (Boolean) - 是否收藏 (默认为 false)
    *   `createdAt`: (Date) - 创建时间 (PocketBase 自动生成)
    *   `updatedAt`: (Date) - 更新时间 (PocketBase 自动生成)
    *   `chromeBookmarkId`: (Text) - Chrome 书签 ID (可选, 用于同步)
3.  **`folders`**:
    *   `userId`: (Relation to `users.id`) - 关联用户 (必需)
    *   `name`: (Text) - 文件夹名称 (必需)
    *   `parentId`: (Relation to `folders.id`) - 父文件夹ID (可选, 用于层级结构)
    *   `createdAt`: (Date) - 创建时间 (PocketBase 自动生成)
    *   `updatedAt`: (Date) - 更新时间 (PocketBase 自动生成)
    *   `chromeParentId`: (Text) - Chrome 父文件夹 ID (可选, 用于同步)
4.  **`user_settings`**:
    *   `userId`: (Relation to `users.id`, 唯一约束) - 关联用户 (必需)
    *   `darkMode`: (Boolean)
    *   `accentColor`: (Text)
    *   `defaultView`: (Text)
    *   `language`: (Text)
    *   `geminiApiKey`: (Text, 考虑加密或后端代理)
    *   `geminiApiBaseUrl`: (Text)
    *   `geminiModelName`: (Text)
    *   `webdav_config`: (JSON) - 包含 WebDAV 服务器 URL、用户名、密码（考虑加密）、路径、自动同步选项
    *   `favoriteFolderIds`: (JSON, Array of Text) - 收藏的文件夹 ID 列表
    *   `tagList`: (JSON, Array of Text) - 用户的所有标签列表 (用于快速选择和管理, 可由后端 Go 逻辑维护)
    *   `sortOption`: (Text) - 当前排序选项
    *   `searchFields`: (JSON, Array of Text) - 搜索时使用的字段
    *   `updatedAt`: (Date) - PocketBase 自动生成

---

## 3. API 设计 与 后端逻辑 (MarkHub Go Backend)

内嵌的 PocketBase 实例会自动为每个集合生成 RESTful API 端点。我们将主要使用这些内置端点。自定义的业务逻辑将通过 Go 语言编写的 PocketBase 钩子或自定义的 Go HTTP 处理函数实现。

*   **用户认证**:
    *   使用内嵌 PocketBase 提供的 `/api/collections/users/` 相关端点进行注册、登录、Token刷新等。
*   **Bookmarks API (由内嵌 PocketBase 提供)**:
    *   `GET /api/collections/bookmarks/records`
    *   `POST /api/collections/bookmarks/records`: 请求体主要包含 `title`, `url`, `folderId`。 **Go 后端的 `beforeCreate` 钩子**将负责同步生成 `tags` 并写入记录。
    *   `GET /api/collections/bookmarks/records/:id`
    *   `PATCH /api/collections/bookmarks/records/:id`: **Go 后端的 `beforeUpdate` 钩子**同步更新 `tags` (如果 `url` 或 `title` 变化)。
    *   `DELETE /api/collections/bookmarks/records/:id`
*   **Folders API (由内嵌 PocketBase 提供)**:
    *   `GET /api/collections/folders/records`
    *   `POST /api/collections/folders/records`
    *   `GET /api/collections/folders/records/:id`
    *   `PATCH /api/collections/folders/records/:id`
    *   `DELETE /api/collections/folders/records/:id`
*   **User Settings API (由内嵌 PocketBase 提供)**:
    *   `GET /api/collections/user_settings/records`
    *   `POST /api/collections/user_settings/records`
    *   `PATCH /api/collections/user_settings/records/:id`
*   **自定义后端逻辑 (在 Go 应用中实现)**:
    *   **标签生成**: 在 Go 代码中，通过为 `bookmarks` 集合注册 `OnRecordBeforeCreateRequest` 和 `OnRecordBeforeUpdateRequest` PocketBase 事件钩子来实现。这些 Go 函数将调用原标签生成服务的逻辑。
        ```go
        // 示例: main.go
        // app.OnRecordBeforeCreateRequest("bookmarks").Add(func(e *core.RecordCreateEvent) error {
        //     // 从 e.Record 获取 title, url
        //     // 调用您的 Go 标签生成函数
        //     // 将生成的标签用 e.Record.Set("tags", generatedTags) 写回
        //     return nil
        // })
        ```
    *   **文件夹建议**: 实现为一个由 Go 语言编写的自定义 HTTP 路由 (例如 `/api/custom/suggest-folder`)。这个 Go 处理函数会接收请求，执行文件夹建议逻辑 (可以访问内嵌 PocketBase 的 `app.Dao()` 来查询数据)，并返回结果。
        ```go
        // 示例: main.go
        // e.Router.GET("/api/custom/suggest-folder", func(c echo.Context) error {
        //     // 认证检查，获取 userId
        //     // 执行文件夹建议逻辑
        //     // return c.JSON(http.StatusOK, suggestions)
        //     return nil
        // }, apis.RequireUserAuth()) // PocketBase 提供的中间件，确保用户已认证
        ```
    *   **WebDAV 操作**: 实现为一组由 Go 语言编写的自定义 HTTP 路由 (例如 `/api/custom/webdav/backup`, `/api/custom/webdav/restore`)。这些 Go 处理函数会利用存储在 `user_settings` 中的配置来执行 WebDAV 操作。
*   **API 规则与安全**:
    *   为每个集合设置 API 规则 (通过 PocketBase 迁移或 Admin UI 配置)，确保用户只能访问和修改自己的数据。这些规则由内嵌的 PocketBase 引擎执行。
    *   敏感信息（API密钥、密码）在 Go 代码中处理和存储时需特别注意安全。

---

## 4. 核心模块改造点 (Next.js)

**此部分与原方案基本相同，主要变化在于 API 的调用目标是 MarkHub Go 后端。**

1.  **`lib/db.ts`**: **废弃**。
2.  **`context/bookmark-context.tsx`**:
    *   数据加载、持久化、增删改查操作全部改为调用新的**后端 Go 应用提供的 API** 服务层。
    *   移除客户端的 `IndexedDB` 操作和相关防抖逻辑。
    *   集成用户认证状态。
    *   标签状态从 `user_settings.tagList` 或直接从书签数据中获取。
3.  **`components/extension-message-listener.tsx`**:
    *   消息处理逻辑改为调用**后端 Go 应用提供的 API** 创建/更新书签和文件夹。
    *   移除客户端的 `triggerAITagRecommendation`，标签生成由**后端 Go 应用的钩子**处理。
4.  **`lib/config-storage.ts`**: 主要功能迁移到后端的 `user_settings` 集合。可保留极少数纯客户端配置。
5.  **`app/api/*` 路由 (Next.js)**: 相关逻辑迁移到 **MarkHub Go 后端的自定义路由或钩子**。
6.  **`context/ai-classification-context.tsx`**: 重新评估其必要性，大部分功能可能因标签生成逻辑移至**后端 Go 应用**而废弃。
7.  **新增：用户认证模块 (Next.js 应用)**: 实现注册、登录页面和逻辑，管理用户会话 (与 Go 后端内嵌的 PocketBase 认证服务交互)。
8.  **新增：API 服务层 (Next.js 应用)**: 封装与 **MarkHub Go 后端 API** 的交互。

---

## 5. Chrome 插件改造点 (后期进行)

**此部分与原方案基本相同，主要变化在于 API 的调用目标是 MarkHub Go 后端。Chrome 插件的修改将推迟到后端和主应用稳定后再进行。**

1.  **用户认证**: 实现登录流程，引导用户到 Next.js 应用认证 (认证服务由 Go 后端内嵌的 PocketBase 提供)，获取并安全存储/使用认证 Token。
2.  **添加书签**: 直接调用 **MarkHub Go 后端 API** 创建书签，后端 Go 钩子同步生成标签。
3.  **双向同步逻辑**:
    *   **Chrome -> MarkHub**: 插件监听 Chrome 书签事件，通过 **MarkHub Go 后端 API** 将变更同步到 PocketBase 数据库。
    *   **MarkHub -> Chrome (手动触发)**: Next.js 应用提供同步按钮，将 **Go 后端 PocketBase 数据库中**的数据发送给插件，插件使用 `chrome.bookmarks` API 覆盖本地书签。
4.  **错误处理与用户反馈**: 健壮的 API 错误处理和清晰的用户反馈。

---

## 6. 开发步骤建议 (重点关注 Go 后端开发)

**开发初期不使用 Docker，专注于 Go 后端应用的本地开发。Chrome 插件修改推迟。**

1.  **Go 后端项目搭建**:
    *   创建新的 Go 项目 (`go mod init github.com/yourname/markhub-backend`)。
    *   添加 PocketBase 依赖 (`go get github.com/pocketbase/pocketbase`)。
    *   创建 `main.go` 文件。在 `main.go` 中：
        *   初始化 PocketBase 实例 (`app := pocketbase.New()`)。
            *   可以考虑使用 `pocketbase.NewWithConfig()` 指定 `DataDir`，例如 `core.Config{DataDir: "./pb_data_dev"}`，这样开发时数据会存放在项目下的 `pb_data_dev` 目录。
        *   注册 PocketBase 迁移命令 (`migratecmd.MustRegister`) 并设置 `Automigrate: true` (方便开发时自动应用迁移)。
        *   添加基本的启动代码 (`if err := app.Start(); err != nil { log.Fatal(err) }`)。
2.  **数据库 Schema 定义 (通过 PocketBase Go 迁移)**:
    *   在 Go 项目中创建 `migrations` 目录。
    *   参考 PocketBase 文档 (可查阅项目中的 [`pocketbase_docs.md`](pocketbase_docs.md)) 编写 Go 迁移脚本来定义 `bookmarks`, `folders`, `user_settings` 集合及其字段、索引和 API 规则。
    *   首次运行 Go 应用 (`go run main.go serve`)，迁移脚本会自动执行，创建数据库结构。您可以通过访问 Admin UI (默认为 `http://127.0.0.1:8090/_/`) 来验证。
3.  **实现自定义 Go 后端逻辑**:
    *   **标签生成**: 在 `main.go` 或单独的 Go 包中，为 `bookmarks` 集合注册 `OnRecordBeforeCreateRequest` 和 `OnRecordBeforeUpdateRequest` 钩子函数，实现标签生成逻辑。
    *   **文件夹建议**: 在 `main.go` 的 `app.OnServe().Add()` 中，使用 `e.Router.GET("/api/custom/suggest-folder", ...)` 定义自定义路由和对应的 Go 处理函数。
    *   **WebDAV 操作**: 类似文件夹建议，定义相应的自定义 Go 路由和处理函数。
4.  **用户认证 (Next.js)**:
    *   Next.js 应用实现注册/登录页面，调用 Go 后端 (内嵌 PocketBase) 提供的 `/api/collections/users/auth-with-password` 等端点。
5.  **API 服务层 (Next.js)**: 创建封装与本地运行的 Go 后端 API 调用的服务。
6.  **核心数据迁移 (Next.js `BookmarkContext`)**: 切换数据源到调用本地 Go 后端的 API 服务层。
7.  **应用设置迁移 (Next.js)**: 将应用设置逻辑迁移到后端 `user_settings` (通过调用本地 Go 后端的 API)。
8.  **本地迭代与测试 (MarkHub 主应用与 Go 后端)**:
    *   在本地同时运行 Go 后端 (`go run main.go serve`) 和 Next.js 开发服务器。
    *   进行全面的功能测试和调试。
9.  **Chrome 插件改造 (后期)**:
    *   在主应用和后端稳定后，开始 Chrome 插件的认证、添加书签和双向同步逻辑的改造，使其与 Go 后端 API 交互。
10. **(后期) Docker 化部署**:
    *   开发完成后，为 Go 后端应用编写 `Dockerfile`。
    *   构建 Docker 镜像并进行部署测试。

---

## 7. 潜在风险与考虑

*   API 设计与版本控制
*   错误处理和网络延迟
*   安全性 (API 密钥, PocketBase API 规则, Go 代码安全实践)
*   Chrome 插件权限 (后期)
*   同步冲突 (长期考虑, 特别是插件部分)
*   **Go 后端应用的部署与维护**
*   **Go 应用的构建和依赖管理**
*   **管理自定义 Go 代码与内嵌 PocketBase 核心功能的复杂性平衡**
*   **本地开发环境配置 (Go 环境, 确保 Next.js 能访问本地 Go 服务)**

---