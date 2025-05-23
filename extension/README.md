# MarkHub Bookmarker 浏览器扩展

MarkHub Bookmarker 是一个用于快速保存网页到 MarkHub 应用的浏览器扩展。通过该扩展，您可以轻松地将当前浏览的网页或链接保存到 MarkHub，无需手动复制粘贴 URL 和标题。

## 功能特性

- 通过工具栏按钮快速添加当前页面到 MarkHub
- 右键菜单支持，可以对页面或链接使用"添加到 MarkHub"选项
- 支持添加标签和描述
- 即使 MarkHub 应用未打开，也能暂存书签供下次打开时添加
- 简洁易用的界面

## 安装方法

### 开发模式安装（Chrome/Edge）

1. 下载或克隆此仓库到本地
2. 打开 Chrome/Edge 浏览器，进入扩展管理页面
   - Chrome: 访问 `chrome://extensions/`
   - Edge: 访问 `edge://extensions/`
3. 开启"开发者模式"（右上角开关）
4. 点击"加载已解压的扩展"（或"加载解压缩的扩展"）
5. 选择 `markhub-extension` 目录
6. 安装完成，扩展图标应出现在浏览器工具栏

### 正式版安装

*注：当扩展发布到 Chrome 网上应用店后，可以通过以下方式安装：*

1. 访问 [Chrome 网上应用店的 MarkHub Bookmarker 页面](#)（链接待发布）
2. 点击"添加到 Chrome"按钮

## 使用方法

### 方法一：使用工具栏按钮

1. 浏览到想要保存的网页
2. 点击浏览器工具栏中的 MarkHub 图标
3. 在弹出窗口中，标题和 URL 会自动填充
4. 添加标签（可选，用逗号分隔）和描述（可选）
5. 点击"保存到 MarkHub"按钮

### 方法二：使用右键菜单

1. 在网页上或链接上点击右键
2. 从上下文菜单中选择"添加到 MarkHub"
3. 在弹出窗口中完成剩余步骤，如添加标签和描述
4. 点击"保存到 MarkHub"按钮

## 数据流转机制

本扩展采用多层通信机制确保数据可靠传递：

### 当 MarkHub 应用开启时

1. 扩展检测到已打开的 MarkHub 应用标签页
2. 通过 `chrome.tabs.sendMessage` 将书签数据发送到 `content-script.js`
3. `content-script.js` 再通过 `window.postMessage` 将数据传递给应用页面

### 当 MarkHub 应用未开启时（备用机制）

1. 扩展将书签数据保存到 `chrome.storage.local`（键名为 `pendingBookmarks`）
2. 同时尝试通过当前标签页向 `localStorage` 写入数据（键名为 `markhub_extension_bookmarks`）
3. 下次 MarkHub 应用启动时，可以读取并处理这些暂存的书签

## 权限说明

本扩展需要以下权限：

- `activeTab`: 访问当前标签页信息（URL、标题等）
- `tabs`: 查找已打开的 MarkHub 应用标签页
- `storage`: 存储暂存的书签数据
- `contextMenus`: 创建右键菜单项，使您能够通过右键点击网页或链接快速添加书签

### 主机权限说明

本扩展需要访问以下主机：

- `*://markhub.app/*`: 与 MarkHub 网页应用进行通信，用于发送和接收书签数据
- `http://localhost:3000/*`: 支持本地部署的 MarkHub 实例

**为什么需要这些权限？**

MarkHub 是一个开源的书签管理应用，本扩展的主要功能是与 MarkHub 应用进行通信，将书签数据发送到应用中。由于 MarkHub 可以部署在官方域名 (markhub.app) 或用户自己的本地环境 (localhost:3000)，因此扩展需要这两个主机权限来确保在各种部署场景下都能正常工作。

扩展仅与 MarkHub 应用通信，不会访问或收集其他网站的数据。所有数据传输仅限于书签信息（URL、标题、标签等），且仅在用户明确触发添加书签操作时进行。

## 问题反馈

如果您在使用过程中遇到任何问题或有改进建议，请通过以下方式反馈：

- [提交 Issue](https://github.com/Syferie/MarkHub/issues)
- 发送邮件至：[syferie@proton.me](mailto:syferie@proton.me)

## 许可证

本项目采用 [MIT 许可证](LICENSE)