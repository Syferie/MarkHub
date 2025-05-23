/**
 * MarkHub Chrome Sync - Background Service Worker
 *
 * 该文件将作为Chrome扩展的Service Worker，负责:
 * 1. 监听Chrome书签创建事件
 * 2. 获取书签信息和文件夹列表
 * 3. 调用AI服务进行文件夹推荐
 * 4. 显示推荐结果和处理用户响应
 * 5. 与MarkHub应用同步书签数据
 */

// 导入配置管理器
import { getConfig } from './core/config_manager.js';
// 导入AI服务模块
import { suggestFolder } from './core/ai_service.js';
// 导入 MarkHub 同步模块
import { sendToMarkHub, sendPendingBookmarks } from './core/markhub_sync.js';

// 悬浮提示管理
let activeTabId = null;
let pendingToastMessages = [];
let isToastReady = false;

/**
 * 判断是否为Chrome内部URL
 * @param {string} url - 要检查的URL
 * @returns {boolean} - 如果是内部URL则返回true，否则返回false
 */
function isChromeInternalUrl(url) {
  return url && (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('chrome-devtools://')
  );
}

/**
 * 获取当前活动标签页ID
 * @returns {Promise<number|null>} 活动标签页ID，如果没有则返回null
 */
async function getActiveTabId() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      return tabs[0].id;
    }
    return null;
  } catch (error) {
    console.error('获取活动标签页ID失败:', error);
    return null;
  }
}

/**
 * 显示悬浮提示的加载状态
 * @param {string} bookmarkTitle - 书签标题
 * @returns {Promise<boolean>} - 成功返回true，失败返回false
 */
async function showToastLoading(bookmarkTitle) {
  console.log('准备显示悬浮提示加载状态...');

  // 获取当前活动标签页ID
  if (!activeTabId) {
    activeTabId = await getActiveTabId();
    if (!activeTabId) {
      console.error('无法获取活动标签页ID，无法显示悬浮提示');
      return false;
    }
  }

  // 发送消息到内容脚本
  return sendMessageToToast({
    type: 'TOAST_SHOW_LOADING',
    data: {
      bookmarkTitle: bookmarkTitle
    }
  });
}

/**
 * 显示悬浮提示的建议状态
 * @param {Object} data - 建议数据
 * @returns {Promise<boolean>} - 成功返回true，失败返回false
 */
async function showToastSuggestion(data) {
  console.log('准备显示悬浮提示建议状态...');

  // 获取当前活动标签页ID
  if (!activeTabId) {
    activeTabId = await getActiveTabId();
    if (!activeTabId) {
      console.error('无法获取活动标签页ID，无法显示悬浮提示');
      return false;
    }
  }

  // 发送消息到内容脚本
  return sendMessageToToast({
    type: 'TOAST_SHOW_SUGGESTION',
    data: data
  });
}

/**
 * 显示悬浮提示的错误状态
 * @param {string} errorMessage - 错误消息
 * @returns {Promise<boolean>} - 成功返回true，失败返回false
 */
async function showToastError(errorMessage) {
  console.log('准备显示悬浮提示错误状态...');

  // 获取当前活动标签页ID
  if (!activeTabId) {
    activeTabId = await getActiveTabId();
    if (!activeTabId) {
      console.error('无法获取活动标签页ID，无法显示悬浮提示');
      return false;
    }
  }

  // 发送消息到内容脚本
  return sendMessageToToast({
    type: 'TOAST_SHOW_ERROR',
    data: {
      errorMessage: errorMessage
    }
  });
}

/**
 * 隐藏悬浮提示
 * @returns {Promise<boolean>} - 成功返回true，失败返回false
 */
async function hideToast() {
  console.log('准备隐藏悬浮提示...');

  if (!activeTabId) {
    console.log('没有活动的标签页ID，无需隐藏悬浮提示');
    return true;
  }

  // 发送消息到内容脚本
  return sendMessageToToast({
    type: 'TOAST_HIDE'
  });
}

/**
 * 向悬浮提示发送消息
 * @param {Object} message - 要发送的消息对象
 * @returns {Promise<boolean>} - 成功返回true，失败返回false
 */
async function sendMessageToToast(message) {
  console.log('尝试向悬浮提示发送消息, 类型:', message.type);

  if (!activeTabId) {
    console.warn('没有活动的标签页ID，无法发送消息');
    return false;
  }

  // 如果悬浮提示未就绪，将消息加入队列
  if (!isToastReady) {
    console.log('悬浮提示未就绪，将消息加入队列:', message.type);
    pendingToastMessages.push(message);
    return true;
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(activeTabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('向悬浮提示发送消息失败:', chrome.runtime.lastError.message);
        resolve(false);
      } else {
        console.log('悬浮提示已接收消息, 响应:', response);
        resolve(true);
      }
    });
  });
}

/**
 * 获取Chrome书签文件夹列表
 * @returns {Promise<Array<{id: string, title: string}>>} 书签文件夹数组
 */
async function getChromeBookmarkFolders() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree(async (bookmarkTreeNodes) => {
      const folders = [];

      // 递归函数，遍历书签树并收集所有文件夹
      function traverseBookmarkNodes(nodes) {
        for (const node of nodes) {
          // 书签文件夹没有url属性
          if (!node.url) {
            folders.push({
              id: node.id,
              title: node.title
            });

            // 如果有子节点，继续递归遍历
            if (node.children) {
              traverseBookmarkNodes(node.children);
            }
          }
        }
      }

      // 开始遍历整个书签树
      traverseBookmarkNodes(bookmarkTreeNodes);

      resolve(folders);
    });
  });
}

/**
 * 监听书签创建事件
 */
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  console.log('------ 新书签事件开始 ------');
  console.log('检测到新书签创建:', bookmark.title, 'ID:', id);

  try {
    // 加载用户配置，检查同步开关
    console.log('正在加载用户配置...');
    const config = await getConfig();
    console.log('用户配置加载完成:', JSON.stringify({
      syncEnabled: config.syncEnabled,
      apiKeyConfigured: !!config.apiKey,
      markhubAppUrl: config.markhubAppUrl,
      modelName: config.modelName
    }));

    // 检查同步功能是否启用
    if (!config.syncEnabled) {
      console.log('同步功能未启用，不处理此书签。请在扩展设置中启用同步功能。');
      return;
    }

    // 检查API Key是否已配置
    if (!config.apiKey) {
      console.error('API Key未配置，无法调用AI服务。请在扩展设置中配置API Key。');
      return;
    }

    // 获取书签URL
    const { url, title } = bookmark;
    console.log('书签详情 - 标题:', title);
    console.log('书签详情 - URL:', url);

    // 检查是否是Chrome内部URL，如果是则不处理
    if (isChromeInternalUrl(url)) {
      console.log('忽略Chrome内部URL:', url);
      return;
    }

    // 获取Chrome书签文件夹列表
    console.log('正在获取Chrome书签文件夹列表...');
    const folders = await getChromeBookmarkFolders();
    console.log(`获取到${folders.length}个Chrome文件夹:`);
    console.log('前5个文件夹示例:', folders.slice(0, 5).map(f => f.title));

    // 获取页面内容的逻辑
    let pageContent = null;

    // 获取当前活动标签页
    try {
      console.log('正在获取当前活动标签页...');
      const tabs = await new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(tabs);
          }
        });
      });
      console.log(`获取到${tabs ? tabs.length : 0}个活动标签页`);

      // 如果找到活动标签页，尝试获取页面内容
      if (tabs && tabs.length > 0) {
        const activeTab = tabs[0];
        console.log('活动标签页信息:', {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title
        });

        console.log('正在向内容脚本发送GET_PAGE_CONTENT消息，标签页ID:', activeTab.id);

        // 向内容脚本发送消息请求页面数据
        try {
          let isTimeoutTriggered = false;
          let retryCount = 0;
          const maxRetries = 2; // 最多重试2次

          // 添加重试函数
          const sendMessageWithRetry = async () => {
            console.log(`尝试向内容脚本发送消息，尝试次数: ${retryCount + 1}/${maxRetries + 1}`);

            return new Promise((resolve, reject) => {
              // 设置超时处理
              const timeoutId = setTimeout(() => {
                console.warn('获取页面内容超时(3秒)');
                isTimeoutTriggered = true;
                resolve(null);
              }, 3000);

              chrome.tabs.sendMessage(
                activeTab.id,
                { type: 'GET_PAGE_CONTENT' },
                (response) => {
                  // 检查是否有响应和通信错误
                  const error = chrome.runtime.lastError;
                  if (isTimeoutTriggered) {
                    console.log('已超时，忽略迟到的响应');
                    return;
                  }

                  // 清除超时
                  clearTimeout(timeoutId);

                  if (error) {
                    // 特别处理"Could not establish connection"错误
                    const isConnectionError = error.message && error.message.includes("Could not establish connection");
                    if (isConnectionError) {
                      console.warn('无法建立与内容脚本的连接:', error.message);
                      console.warn('错误详情:', JSON.stringify(error));

                      // 如果还有重试机会，则延迟后重试
                      if (retryCount < maxRetries) {
                        retryCount++;
                        console.log(`将在500ms后进行第${retryCount}次重试...`);
                        setTimeout(() => {
                          sendMessageWithRetry().then(resolve).catch(reject);
                        }, 500); // 延迟500ms再重试
                        return;
                      }
                    }

                    // 其他错误或已达到最大重试次数
                    console.warn('获取页面内容时出错:', error.message);
                    console.warn('错误详情:', JSON.stringify(error));
                    resolve(null); // 返回null而不是拒绝，以便继续处理
                  } else if (response) {
                    console.log('成功获取页面内容，数据概要:', {
                      hasPageTitle: !!response.pageTitle,
                      hasMetaDescription: !!response.metaDescription,
                      hasH1: !!response.h1,
                      bodyTextLength: response.bodyText ? response.bodyText.length : 0
                    });
                    resolve(response);
                  } else {
                    console.warn('内容脚本未响应或返回了空数据');
                    resolve(null);
                  }
                }
              );
            });
          };

          // 开始尝试发送消息
          pageContent = await sendMessageWithRetry();
        } catch (contentError) {
          console.error('获取页面内容失败:', contentError);
          console.error('错误详情:', contentError.stack || JSON.stringify(contentError));
          pageContent = null;
        }
      } else {
        console.warn('未找到活动标签页，无法获取页面内容');
      }
    } catch (tabError) {
      console.error('获取活动标签页时出错:', tabError);
      console.error('错误详情:', tabError.stack || JSON.stringify(tabError));
    }

    // 保存原始书签信息
    const originalBookmarkInfo = {
      id,
      url,
      title,
      parentId: bookmark.parentId
    };
    console.log('原始书签信息:', originalBookmarkInfo);

    // 在AI服务调用前，显示悬浮提示加载状态
    console.log('正在显示悬浮提示加载状态...');
    try {
      const result = await showToastLoading(title);
      console.log('显示悬浮提示加载状态结果:', result);
    } catch (error) {
      console.error('显示悬浮提示加载状态失败:', error);
      // 即使显示失败，我们仍然继续处理AI推荐
    }

    // 准备调用AI服务
    try {
      // 准备书签信息对象
      const bookmarkInfo = {
        url,
        title
      };

      // 如果成功获取到页面内容，则添加到书签信息中
      if (pageContent) {
        bookmarkInfo.pageTitle = pageContent.pageTitle || title;
        bookmarkInfo.metaDescription = pageContent.metaDescription || '';
        bookmarkInfo.h1 = pageContent.h1 || '';
        bookmarkInfo.pageText = pageContent.bodyText || '';
        console.log('已将页面内容添加到书签信息');
      } else {
        console.log('未获取到页面内容，将仅使用URL和标题进行AI推荐');
      }

      // 调用AI服务获取推荐文件夹
      console.log('正在调用AI服务获取文件夹推荐...');
      console.log('传递给AI服务的数据:', {
        url: bookmarkInfo.url,
        title: bookmarkInfo.title,
        hasPageContent: !!pageContent,
        folderCount: folders.length
      });

      const suggestedFolder = await suggestFolder(bookmarkInfo, folders);

      // 处理AI服务响应
      if (suggestedFolder) {
        // 成功情况：AI返回了推荐文件夹
        console.log('AI推荐的文件夹名称:', suggestedFolder);

        // 查找对应的文件夹ID
        const suggestedFolderObj = folders.find(folder => folder.title === suggestedFolder);
        const suggestedFolderId = suggestedFolderObj ? suggestedFolderObj.id : null;

        if (suggestedFolderId) {
          console.log('找到匹配的文件夹ID:', suggestedFolderId);
        } else {
          console.warn('未找到匹配的文件夹ID，可能是AI推荐的文件夹不存在');
        }

        // 向悬浮提示发送建议
        console.log('正在向悬浮提示发送建议...');
        const suggestionData = {
          bookmarkTitle: title,
          suggestedFolder: suggestedFolder,
          suggestedFolderId: suggestedFolderId,
          bookmarkId: id,
          originalBookmarkInfo: originalBookmarkInfo
        };
        console.log('发送建议数据:', JSON.stringify(suggestionData));

        const sendResult = await showToastSuggestion(suggestionData);
        console.log('向悬浮提示发送建议结果:', sendResult);


      } else {
        // 无推荐情况
        console.log('AI未能为书签提供文件夹建议');

        // 向悬浮提示发送错误信息
        console.log('正在向悬浮提示发送错误信息...');
        const errorMessage = `无法为 "${title}" 获取AI文件夹建议。`;
        const sendResult = await showToastError(errorMessage);
        console.log('向悬浮提示发送错误信息结果:', sendResult);


      }
    } catch (error) {
      // 发生错误的情况
      console.error('AI文件夹推荐过程中发生错误:', error);
      console.error('错误详情:', error.stack || JSON.stringify(error));

      // 向悬浮提示发送错误信息
      console.log('正在向悬浮提示发送错误信息...');
      const errorMessage = `AI推荐过程中发生错误: ${error.message || '未知错误'}`;
      const sendResult = await showToastError(errorMessage);
      console.log('向悬浮提示发送错误信息结果:', sendResult);

    }

  } catch (error) {
    console.error('处理新创建书签时出错:', error);
    console.error('错误详情:', error.stack || JSON.stringify(error));
  }
  console.log('------ 新书签事件结束 ------');
});

/**
 * 监听来自内容脚本的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 检查消息是否有效
  if (!message || !message.type) {
    return false;
  }

  console.log('收到消息:', message.type, message);

  // 处理悬浮提示就绪消息
  if (message.type === 'TOAST_READY') {
    console.log('悬浮提示已就绪，可以接收消息。标签页ID:', sender.tab?.id);
    isToastReady = true;
    activeTabId = sender.tab?.id;

    // 发送所有待处理的消息
    if (pendingToastMessages.length > 0) {
      console.log(`发送${pendingToastMessages.length}条待处理消息到悬浮提示`);

      // 智能处理消息队列，确保最终状态消息优先
      const loadingMsgs = pendingToastMessages.filter(msg => msg.type === 'TOAST_SHOW_LOADING');
      const finalStateMsgs = pendingToastMessages.filter(msg =>
        msg.type === 'TOAST_SHOW_SUGGESTION' || msg.type === 'TOAST_SHOW_ERROR');
      const otherMsgs = pendingToastMessages.filter(msg =>
        msg.type !== 'TOAST_SHOW_LOADING' && msg.type !== 'TOAST_SHOW_SUGGESTION' && msg.type !== 'TOAST_SHOW_ERROR');

      // 使用Promise链替代async/await
      (async function processMessages() {
        // 首先处理非状态消息
        for (const msg of otherMsgs) {
          try {
            console.log('处理非状态待处理消息:', msg.type);
            await sendMessageToToast(msg);
          } catch (err) {
            console.error('发送非状态待处理消息失败:', err);
          }
        }

        // 然后处理加载状态消息(如果没有最终状态消息)
        if (finalStateMsgs.length === 0 && loadingMsgs.length > 0) {
          try {
            console.log('处理加载状态待处理消息:', loadingMsgs[0].type);
            await sendMessageToToast(loadingMsgs[0]);
          } catch (err) {
            console.error('发送加载状态待处理消息失败:', err);
          }
        }

        // 最后处理最终状态消息(如果有)
        if (finalStateMsgs.length > 0) {
          try {
            // 只处理最后一条最终状态消息
            const lastFinalMsg = finalStateMsgs[finalStateMsgs.length - 1];
            console.log('处理最终状态待处理消息:', lastFinalMsg.type);
            await sendMessageToToast(lastFinalMsg);
          } catch (err) {
            console.error('发送最终状态待处理消息失败:', err);
          }
        }
      })();

      // 清空待处理消息队列
      pendingToastMessages = [];
    }

    sendResponse({ status: 'toast_ready_acknowledged' });
    return true;
  }

  // 根据消息类型处理不同的用户操作
  switch (message.type) {
    case 'USER_ACTION_CONFIRM':
      // 用户确认AI推荐
      console.log('用户确认采纳AI推荐，准备处理');
      handleUserConfirm(message.payload);
      sendResponse({ status: 'processing' });
      break;

    case 'USER_ACTION_REJECT':
      // 用户拒绝AI推荐，但仍然继续处理书签
      console.log('用户拒绝了AI推荐，使用原始文件夹');
      handleUserReject(message.payload);
      sendResponse({ status: 'processing_with_original' });
      break;

    case 'USER_ACTION_CANCEL':
      // 用户取消操作
      console.log('用户取消了AI推荐');
      // 重置状态
      activeTabId = null;
      isToastReady = false;
      sendResponse({ status: 'cancelled' });
      break;

    default:
      console.warn('收到未知类型的消息:', message.type);
      sendResponse({ status: 'unknown_message_type' });
      return false;
  }

  // 返回true表示我们将异步发送响应
  return true;
});

/**
 * 处理用户确认的书签文件夹推荐
 * @param {Object} payload - 确认消息的数据载荷
 */
async function handleUserConfirm(payload) {
  if (!payload || !payload.bookmarkId || !payload.suggestedFolderId) {
    console.error('确认消息中缺少必要的信息');
    return;
  }

  console.log('用户采纳了AI建议，准备移动书签', payload);

  const { bookmarkId, suggestedFolderId } = payload;

  try {
    // 移动书签到推荐的文件夹
    await moveBookmarkToFolder(bookmarkId, suggestedFolderId);

    // 隐藏悬浮提示
    await hideToast();

    // 重置状态
    activeTabId = null;
    isToastReady = false;

    // 获取移动后的书签信息，准备发送到 MarkHub
    try {
      const movedBookmark = await new Promise((resolve, reject) => {
        chrome.bookmarks.get(bookmarkId, (bookmarks) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (bookmarks && bookmarks.length > 0) {
            resolve(bookmarks[0]);
          } else {
            reject(new Error('找不到移动后的书签'));
          }
        });
      });

      // 获取目标文件夹信息
      const targetFolder = await new Promise((resolve, reject) => {
        chrome.bookmarks.get(suggestedFolderId, (folders) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (folders && folders.length > 0) {
            resolve(folders[0]);
          } else {
            reject(new Error('找不到目标文件夹'));
          }
        });
      });

      // 构建 SyncedBookmarkPayload 对象
      const syncedBookmarkPayload = {
        url: movedBookmark.url,
        title: movedBookmark.title,
        chromeBookmarkId: movedBookmark.id,
        chromeParentId: movedBookmark.parentId,
        folderName: targetFolder.title,
        createdAt: new Date().toISOString()
      };

      // 调用 sendToMarkHub 发送书签数据
      const sendResult = await sendToMarkHub(syncedBookmarkPayload);
      console.log(`书签数据发送状态: ${sendResult.status}`, sendResult);
    } catch (syncError) {
      console.error('同步书签到 MarkHub 时出错:', syncError);
    }

    // 不显示操作成功通知
  } catch (error) {
    console.error('处理用户确认时出错:', error);

  }
}

/**
 * 处理用户拒绝AI推荐但继续处理书签的情况
 * @param {Object} payload - 拒绝消息的数据载荷
 */
async function handleUserReject(payload) {
  if (!payload || !payload.bookmarkId || !payload.originalBookmarkInfo) {
    console.error('拒绝消息中缺少必要的信息');
    return;
  }

  console.log('用户拒绝了AI建议，使用原始文件夹信息处理书签', payload);

  const { bookmarkId } = payload;

  try {
    // 隐藏悬浮提示
    await hideToast();

    // 重置状态
    activeTabId = null;
    isToastReady = false;

    // 获取书签信息，准备发送到 MarkHub
    try {
      const bookmark = await new Promise((resolve, reject) => {
        chrome.bookmarks.get(bookmarkId, (bookmarks) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (bookmarks && bookmarks.length > 0) {
            resolve(bookmarks[0]);
          } else {
            reject(new Error('找不到书签'));
          }
        });
      });

      // 获取原始文件夹信息
      const parentFolder = await new Promise((resolve, reject) => {
        chrome.bookmarks.get(bookmark.parentId, (folders) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (folders && folders.length > 0) {
            resolve(folders[0]);
          } else {
            reject(new Error('找不到父文件夹'));
          }
        });
      });

      // 构建 SyncedBookmarkPayload 对象
      const syncedBookmarkPayload = {
        url: bookmark.url,
        title: bookmark.title,
        chromeBookmarkId: bookmark.id,
        chromeParentId: bookmark.parentId,
        folderName: parentFolder.title,
        createdAt: new Date().toISOString()
      };

      // 调用 sendToMarkHub 发送书签数据
      const sendResult = await sendToMarkHub(syncedBookmarkPayload);
      console.log(`书签数据发送状态: ${sendResult.status}`, sendResult);

      // 不显示操作成功通知
    } catch (syncError) {
      console.error('同步书签到 MarkHub 时出错:', syncError);

    }
  } catch (error) {
    console.error('处理用户拒绝时出错:', error);

  }
}

/**
 * 将书签移动到指定文件夹
 * @param {string} bookmarkId - 书签ID
 * @param {string} folderId - 目标文件夹ID
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
function moveBookmarkToFolder(bookmarkId, folderId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(bookmarkId, { parentId: folderId }, (result) => {
      if (chrome.runtime.lastError) {
        console.error('移动书签失败:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        console.log('书签成功移动到文件夹:', result);
        resolve(result);
      }
    });
  });
}

console.log('MarkHub Chrome Sync 后台服务已启动');

/**
 * 定期发送暂存的书签数据
 */

// 在扩展启动时发送暂存的书签
chrome.runtime.onStartup.addListener(async () => {
  console.log('扩展启动，尝试发送暂存的书签数据');
  try {
    const result = await sendPendingBookmarks();
    console.log('扩展启动时发送暂存书签结果:', result);
  } catch (error) {
    console.error('扩展启动时发送暂存书签出错:', error);
  }
});

// 创建定期检查的 Alarm
chrome.alarms.create('sendPendingBookmarksTask', {
  delayInMinutes: 1,  // 首次延迟 1 分钟
  periodInMinutes: 15 // 之后每 15 分钟检查一次
});

// 监听 Alarm 触发
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sendPendingBookmarksTask') {
    console.log('定时任务触发，尝试发送暂存的书签数据');
    try {
      const result = await sendPendingBookmarks();
      console.log('定时任务发送暂存书签结果:', result);
    } catch (error) {
      console.error('定时任务发送暂存书签出错:', error);
    }
  }
});

// 监听标签页更新，检测 MarkHub 标签页打开
chrome.tabs.onUpdated.addListener(async (_, changeInfo, tab) => {
  // 只在标签页完成加载时处理
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      // 获取 MarkHub 应用 URL
      const config = await getConfig();
      const markhubAppUrl = config.markhubAppUrl;

      // 如果没有配置 MarkHub 应用 URL，直接返回
      if (!markhubAppUrl) {
        return;
      }

      // 检查是否是 MarkHub 应用的标签页
      if (tab.url.startsWith(markhubAppUrl)) {
        console.log('检测到 MarkHub 应用标签页打开，尝试发送暂存的书签数据');
        try {
          // 延迟 2 秒，确保 MarkHub 应用已完全加载
          setTimeout(async () => {
            const result = await sendPendingBookmarks();
            console.log('MarkHub 应用标签页打开时发送暂存书签结果:', result);
          }, 2000);
        } catch (error) {
          console.error('MarkHub 应用标签页打开时发送暂存书签出错:', error);
        }
      }
    } catch (error) {
      console.error('检测 MarkHub 标签页时出错:', error);
    }
  }
});