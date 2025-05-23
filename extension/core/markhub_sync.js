/**
 * MarkHub Chrome Sync - 与 MarkHub 应用同步模块
 * 
 * 该模块负责:
 * 1. 将分类后的书签数据发送到 MarkHub 应用
 * 2. 当 MarkHub 应用未打开时，将数据暂存到 chrome.storage.local
 * 3. 尝试发送所有暂存的书签数据
 */

// 导入配置管理器，用于获取 MarkHub 应用 URL
import { getConfig } from './config_manager.js';

// 暂存书签的存储键名
const PENDING_BOOKMARKS_KEY = 'pendingMarkHubBookmarks';

// 消息类型 - 确保与MarkHub应用端完全一致
const MESSAGE_TYPE = 'MARKHUB_CHROME_SYNC_FOLDER_CLASSIFIED_BOOKMARK';

/**
 * 尝试将书签数据发送到 MarkHub 应用
 * 
 * @param {Object} bookmarkData - 书签数据对象 (SyncedBookmarkPayload)
 * @param {string} bookmarkData.url - 书签 URL
 * @param {string} bookmarkData.title - 书签标题
 * @param {string} bookmarkData.chromeBookmarkId - Chrome 书签 ID
 * @param {string} bookmarkData.chromeParentId - Chrome 父文件夹 ID
 * @param {string} bookmarkData.folderName - 文件夹名称
 * @param {string} bookmarkData.createdAt - 创建时间 (ISO 字符串)
 * @param {boolean} [addToPendingIfFail=true] - 发送失败时是否添加到暂存队列
 * @returns {Promise<Object>} 包含发送状态的对象 { status: 'sent' | 'pending' }
 */
async function sendToMarkHub(bookmarkData, addToPendingIfFail = true) {
  try {
    // 1. 获取 MarkHub 应用 URL
    const config = await getConfig();
    const markhubAppUrl = config.markhubAppUrl;
    
    if (!markhubAppUrl) {
      console.error('MarkHub 应用 URL 未配置');
      if (addToPendingIfFail) {
        await addToPending(bookmarkData);
      }
      return { status: 'pending', reason: 'MarkhubAppUrlNotConfigured' };
    }
    
    // 2. 查找 MarkHub 标签页
    // 注意：URL 模式需要包含通配符，以匹配 MarkHub 应用的任何页面
    const tabs = await chrome.tabs.query({ url: `${markhubAppUrl}/*` });
    
    // 3. 如果找到标签页，尝试发送数据
    if (tabs.length > 0) {
      // 选择第一个标签页
      const tab = tabs[0];
      
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tab.id, 
          { 
            type: MESSAGE_TYPE, 
            payload: bookmarkData 
          }, 
          (response) => {
            // 检查是否发送成功
            if (response && response.success) {
              console.log('书签数据成功发送到 MarkHub 应用', bookmarkData.url);
              resolve({ status: 'sent' });
            } else {
              console.warn('发送到 MarkHub 应用失败', chrome.runtime.lastError);
              if (addToPendingIfFail) {
                addToPending(bookmarkData)
                  .then(() => resolve({ status: 'pending', reason: 'SendMessageFailed' }));
              } else {
                resolve({ status: 'pending', reason: 'SendMessageFailed' });
              }
            }
          }
        );
        
        // 处理没有响应的情况（可能是超时）
        setTimeout(() => {
          if (chrome.runtime.lastError) {
            console.warn('发送到 MarkHub 应用超时', chrome.runtime.lastError);
            if (addToPendingIfFail) {
              addToPending(bookmarkData)
                .then(() => resolve({ status: 'pending', reason: 'Timeout' }));
            } else {
              resolve({ status: 'pending', reason: 'Timeout' });
            }
          }
        }, 5000); // 5秒超时
      });
    } else {
      console.log('未找到打开的 MarkHub 应用标签页，暂存数据');
      if (addToPendingIfFail) {
        await addToPending(bookmarkData);
      }
      return { status: 'pending', reason: 'NoMarkHubTabFound' };
    }
  } catch (error) {
    console.error('发送书签数据到 MarkHub 应用时出错', error);
    if (addToPendingIfFail) {
      await addToPending(bookmarkData);
    }
    return { status: 'pending', reason: 'Error', error: error.message };
  }
}

/**
 * 将书签数据添加到暂存队列
 * 
 * @param {Object} bookmarkData - 书签数据对象 (SyncedBookmarkPayload)
 * @returns {Promise<void>}
 */
async function addToPending(bookmarkData) {
  try {
    // 1. 从 chrome.storage.local 读取现有的暂存书签列表
    const data = await chrome.storage.local.get([PENDING_BOOKMARKS_KEY]);
    const pendingBookmarks = data[PENDING_BOOKMARKS_KEY] || [];
    
    // 2. 添加新书签到列表
    pendingBookmarks.push({
      ...bookmarkData,
      _addedToPendingAt: new Date().toISOString() // 添加内部时间戳，方便调试
    });
    
    // 3. 将更新后的列表存回 chrome.storage.local
    await chrome.storage.local.set({ [PENDING_BOOKMARKS_KEY]: pendingBookmarks });
    
    console.log('已将书签添加到待发送队列', bookmarkData.url);
  } catch (error) {
    console.error('将书签添加到待发送队列时出错', error);
    // 这里可以考虑是否需要进一步的错误处理逻辑
    // 例如，如果错误是因为存储已满，可能需要清理旧数据或通知用户
    
    // 输出更详细的错误信息以便调试
    if (error.name === 'QuotaExceededError') {
      console.error('存储空间已满，无法添加更多暂存书签');
    }
  }
}

/**
 * 尝试发送所有暂存的书签
 * 
 * @returns {Promise<Object>} 包含发送结果的对象 { sent: number, remaining: number }
 */
async function sendPendingBookmarks() {
  try {
    // 1. 从 chrome.storage.local 读取暂存书签列表
    const data = await chrome.storage.local.get([PENDING_BOOKMARKS_KEY]);
    const pendingBookmarks = data[PENDING_BOOKMARKS_KEY] || [];
    
    if (pendingBookmarks.length === 0) {
      console.log('没有暂存的书签需要发送');
      return { sent: 0, remaining: 0 };
    }
    
    console.log(`尝试发送 ${pendingBookmarks.length} 个暂存书签`);
    
    // 2. 记录成功发送的书签索引
    const sentIndices = [];
    
    // 3. 尝试为每个书签调用 sendToMarkHub
    // 注意：这里将 addToPendingIfFail 设置为 false，避免无限循环
    for (let i = 0; i < pendingBookmarks.length; i++) {
      const result = await sendToMarkHub(pendingBookmarks[i], false);
      
      if (result.status === 'sent') {
        sentIndices.push(i);
      }
    }
    
    // 4. 如果有书签成功发送，更新存储
    if (sentIndices.length > 0) {
      // 过滤掉已发送的书签
      const remainingBookmarks = pendingBookmarks.filter((_, index) => !sentIndices.includes(index));
      
      // 更新存储
      await chrome.storage.local.set({ [PENDING_BOOKMARKS_KEY]: remainingBookmarks });
      
      console.log(`成功发送 ${sentIndices.length} 个暂存书签, 剩余 ${remainingBookmarks.length} 个`);
      
      return { sent: sentIndices.length, remaining: remainingBookmarks.length };
    } else {
      console.log(`没有暂存书签成功发送, 剩余 ${pendingBookmarks.length} 个`);
      return { sent: 0, remaining: pendingBookmarks.length };
    }
  } catch (error) {
    console.error('发送暂存书签时出错', error);
    return { sent: 0, remaining: -1, error: error.message };
  }
}

// 导出模块函数
export {
  sendToMarkHub,
  addToPending,
  sendPendingBookmarks
};