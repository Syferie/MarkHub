/**
 * MarkHub Chrome Sync - Content Script
 *
 * 该文件作为Chrome扩展的内容脚本，负责:
 * 1. 访问页面DOM
 * 2. 提取网页的关键文本内容（标题、元数据、正文等）
 * 3. 将提取的信息发送回后台脚本用于AI分析
 * 4. 在MarkHub应用页面中处理书签数据并与应用通信
 * 5. 注入和管理页面内悬浮提示UI
 */

// 立即在全局作用域执行，记录内容脚本已加载并提供页面信息
console.log("MarkHub Content Script: Executing on " + window.location.href);

// 全局变量存储悬浮提示状态
let tooltip = null;
let countdownTimer = null;
let countdownSeconds = 5;
let bookmarkData = null;

// 创建并注入悬浮提示UI
function createTooltipUI() {
  console.log('MarkHub: 开始创建悬浮提示UI');

  // 注入样式
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('tooltip.css');
  document.head.appendChild(link);
  console.log('MarkHub: 悬浮提示样式已注入');

  // 创建悬浮提示DOM
  const tooltipContainer = document.createElement('div');
  tooltipContainer.className = 'markhub-tooltip markhub-tooltip-loading';
  tooltipContainer.id = 'markhub-tooltip';
  tooltipContainer.style.display = 'none';

  // 创建图标
  const iconDiv = document.createElement('div');
  iconDiv.className = 'markhub-tooltip-icon';
  iconDiv.innerHTML = `
    <svg class="markhub-document-icon" viewBox="0 0 1024 1024" width="22" height="22">
      <path d="M858.256 384l-148.64 336H624v-112h-79.376v239.088l-95.984-61.056L352 847.088V608h-79.36v112h-68.96C178.512 720 144 719.888 144 617.664 144 512.128 179.92 512 203.68 512h507.584l227.52-464H435.52c-86.992 0-126.176 34.96-172.016 103.312-55.792 83.184-111.584 190.624-182.464 359.52C67.584 542.752 64 582.416 64 618.336c0 158.368 75.376 181.584 151.52 181.584 19.504 0 41.136-0.16 57.12-0.16V992.8l176-111.968L624 992.8V800h137.728L945.6 384h-87.344z m-528.32-188.88C366.16 141.12 382.368 128 435.52 128h375.04l-149.216 304H202.176c44.528-96 88.64-178.56 127.76-236.88z" fill="#888"></path>
    </svg>
  `;

  // 创建内容区域
  const contentDiv = document.createElement('div');
  contentDiv.className = 'markhub-tooltip-content';

  // 创建状态指示器
  const stateIndicator = document.createElement('div');
  stateIndicator.className = 'markhub-state-indicator markhub-loading';

  // 添加到容器
  tooltipContainer.appendChild(iconDiv);
  tooltipContainer.appendChild(contentDiv);
  tooltipContainer.appendChild(stateIndicator);

  // 添加到页面
  document.body.appendChild(tooltipContainer);
  console.log('MarkHub: 悬浮提示DOM已创建');

  // 通知后台脚本悬浮提示已准备就绪
  chrome.runtime.sendMessage({
    type: 'TOAST_READY'
  });

  return {
    container: tooltipContainer,
    iconDiv: iconDiv,
    contentDiv: contentDiv,
    stateIndicator: stateIndicator
  };
}

// 显示加载状态
function showLoadingState(title) {
  console.log('MarkHub: 显示加载状态, 标题:', title);

  if (!tooltip) {
    tooltip = createTooltipUI();
  }

  // 设置加载状态样式
  tooltip.container.className = 'markhub-tooltip markhub-tooltip-loading';

  // 更新内容区域
  tooltip.contentDiv.innerHTML = `
    <div class="markhub-tooltip-header">
      <svg class="markhub-folder-icon" viewBox="0 0 1024 1024" width="16" height="16">
        <path d="M860.16 869.3248H163.84a84.5312 84.5312 0 0 1-84.48-84.4288V239.104A84.5312 84.5312 0 0 1 163.84 154.6752h300.5952a120.6272 120.6272 0 0 1 94.8736 46.592l46.8992 60.672a65.3824 65.3824 0 0 0 51.2 25.2416H860.16a84.5312 84.5312 0 0 1 84.48 84.4288v413.2864a84.5312 84.5312 0 0 1-84.48 84.4288zM163.84 200.7552a38.4 38.4 0 0 0-38.4 38.3488v545.792a38.4 38.4 0 0 0 38.4 38.3488h696.32a38.4 38.4 0 0 0 38.3488-38.3488V371.6096a38.4 38.4 0 0 0-38.3488-38.3488h-202.5472a111.7184 111.7184 0 0 1-87.8592-43.1616l-46.8992-60.672a74.2912 74.2912 0 0 0-58.4192-28.672z" fill="#888"></path>
        <path d="M819.2 429.6192H114.432a23.04 23.04 0 1 1 0-46.08H819.2a23.04 23.04 0 0 1 0 46.08z" fill="#888"></path>
      </svg>
      <span class="markhub-tooltip-title">Smart recommendation...</span>
    </div>
    <div class="markhub-tooltip-description">${title || 'Loading...'}</div>
  `;

  // 更新状态指示器
  tooltip.stateIndicator.className = 'markhub-state-indicator markhub-loading';
  tooltip.stateIndicator.innerHTML = `
    <svg class="markhub-spinner" viewBox="0 0 24 24" width="20" height="20">
      <circle cx="12" cy="12" r="10" fill="none" stroke-width="3"></circle>
    </svg>
  `;

  // 显示悬浮提示
  tooltip.container.style.display = 'flex';
}

// 显示建议状态
function showSuggestionState(data) {
  console.log('MarkHub: 显示建议状态, 数据:', data);

  if (!tooltip) {
    tooltip = createTooltipUI();
  }

  // 保存书签数据
  bookmarkData = data;

  // 设置成功状态样式
  tooltip.container.className = 'markhub-tooltip markhub-tooltip-success';

  // 添加操作按钮区域，但只保留拒绝按钮
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'markhub-tooltip-actions';

  // 创建拒绝按钮
  const declineButton = document.createElement('button');
  declineButton.className = 'markhub-action-button markhub-decline';
  declineButton.textContent = '×';
  declineButton.addEventListener('click', handleCancel);

  // 添加拒绝按钮到操作区域
  actionsDiv.appendChild(declineButton);

  // 更新内容区域
  tooltip.contentDiv.innerHTML = `
    <div class="markhub-tooltip-header">
      <svg class="markhub-folder-icon" viewBox="0 0 1024 1024" width="16" height="16">
        <path d="M860.16 869.3248H163.84a84.5312 84.5312 0 0 1-84.48-84.4288V239.104A84.5312 84.5312 0 0 1 163.84 154.6752h300.5952a120.6272 120.6272 0 0 1 94.8736 46.592l46.8992 60.672a65.3824 65.3824 0 0 0 51.2 25.2416H860.16a84.5312 84.5312 0 0 1 84.48 84.4288v413.2864a84.5312 84.5312 0 0 1-84.48 84.4288zM163.84 200.7552a38.4 38.4 0 0 0-38.4 38.3488v545.792a38.4 38.4 0 0 0 38.4 38.3488h696.32a38.4 38.4 0 0 0 38.3488-38.3488V371.6096a38.4 38.4 0 0 0-38.3488-38.3488h-202.5472a111.7184 111.7184 0 0 1-87.8592-43.1616l-46.8992-60.672a74.2912 74.2912 0 0 0-58.4192-28.672z" fill="#888"></path>
        <path d="M819.2 429.6192H114.432a23.04 23.04 0 1 1 0-46.08H819.2a23.04 23.04 0 0 1 0 46.08z" fill="#888"></path>
      </svg>
      <span class="markhub-tooltip-title">${data.suggestedFolder || '未知文件夹'}</span>
    </div>
    <div class="markhub-tooltip-description">${data.bookmarkTitle || '未知书签'}</div>
  `;

  // 如果已有操作按钮，先移除
  const existingActions = tooltip.container.querySelector('.markhub-tooltip-actions');
  if (existingActions) {
    existingActions.remove();
  }

  // 添加操作按钮
  tooltip.container.insertBefore(actionsDiv, tooltip.stateIndicator);

  // 更新状态指示器
  tooltip.stateIndicator.className = 'markhub-state-indicator markhub-success';
  tooltip.stateIndicator.innerHTML = `
    <div class="markhub-countdown-container">
      <svg class="markhub-countdown-circle" viewBox="0 0 36 36" width="28" height="28">
        <circle class="markhub-countdown-circle-bg" cx="18" cy="18" r="16" fill="none" stroke-width="2"></circle>
        <circle class="markhub-countdown-circle-progress" cx="18" cy="18" r="16" fill="none" stroke-width="2"></circle>
      </svg>
      <div class="markhub-countdown-number">5</div>
    </div>
  `;

  // 为倒计时容器添加点击事件
  const countdownContainer = tooltip.stateIndicator.querySelector('.markhub-countdown-container');
  if (countdownContainer) {
    countdownContainer.addEventListener('click', handleConfirm);
  }

  // 显示悬浮提示
  tooltip.container.style.display = 'flex';

  // 开始倒计时
  startCountdown();
}

// 显示错误状态
function showErrorState(errorMessage) {
  console.log('MarkHub: 显示错误状态, 消息:', errorMessage);

  if (!tooltip) {
    tooltip = createTooltipUI();
  }

  // 设置错误状态样式
  tooltip.container.className = 'markhub-tooltip markhub-tooltip-failure';

  // 更新内容区域
  tooltip.contentDiv.innerHTML = `
    <div class="markhub-tooltip-header">
      <svg class="markhub-folder-icon" viewBox="0 0 1024 1024" width="16" height="16">
        <path d="M860.16 869.3248H163.84a84.5312 84.5312 0 0 1-84.48-84.4288V239.104A84.5312 84.5312 0 0 1 163.84 154.6752h300.5952a120.6272 120.6272 0 0 1 94.8736 46.592l46.8992 60.672a65.3824 65.3824 0 0 0 51.2 25.2416H860.16a84.5312 84.5312 0 0 1 84.48 84.4288v413.2864a84.5312 84.5312 0 0 1-84.48 84.4288zM163.84 200.7552a38.4 38.4 0 0 0-38.4 38.3488v545.792a38.4 38.4 0 0 0 38.4 38.3488h696.32a38.4 38.4 0 0 0 38.3488-38.3488V371.6096a38.4 38.4 0 0 0-38.3488-38.3488h-202.5472a111.7184 111.7184 0 0 1-87.8592-43.1616l-46.8992-60.672a74.2912 74.2912 0 0 0-58.4192-28.672z" fill="#888"></path>
        <path d="M819.2 429.6192H114.432a23.04 23.04 0 1 1 0-46.08H819.2a23.04 23.04 0 0 1 0 46.08z" fill="#888"></path>
      </svg>
      <span class="markhub-tooltip-title">Failed recommendation</span>
    </div>
    <div class="markhub-tooltip-description">${errorMessage || '未知错误'}</div>
  `;

  // 移除可能存在的操作按钮
  const existingActions = tooltip.container.querySelector('.markhub-tooltip-actions');
  if (existingActions) {
    existingActions.remove();
  }

  // 更新状态指示器
  tooltip.stateIndicator.className = 'markhub-state-indicator markhub-failure';
  tooltip.stateIndicator.innerHTML = `
    <svg class="markhub-x" viewBox="0 0 24 24" width="20" height="20">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  `;

  // 为错误状态指示器添加点击事件
  tooltip.stateIndicator.addEventListener('click', hideTooltip);

  // 显示悬浮提示
  tooltip.container.style.display = 'flex';

  // 3秒后自动隐藏
  setTimeout(() => {
    hideTooltip();
  }, 3000);
}

// 隐藏悬浮提示
function hideTooltip() {
  console.log('MarkHub: 隐藏悬浮提示');

  if (tooltip) {
    // 添加退出动画
    tooltip.container.classList.add('markhub-tooltip-exit');

    // 动画结束后隐藏
    setTimeout(() => {
      tooltip.container.style.display = 'none';
      tooltip.container.classList.remove('markhub-tooltip-exit');
    }, 300);
  }

  // 清除倒计时
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// 开始倒计时
function startCountdown() {
  console.log('MarkHub: 开始倒计时');

  // 清除可能存在的旧计时器
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  // 重置倒计时
  countdownSeconds = 5;
  const countdownNumber = tooltip.stateIndicator.querySelector('.markhub-countdown-number');
  const progressCircle = tooltip.stateIndicator.querySelector('.markhub-countdown-circle-progress');

  if (countdownNumber) {
    countdownNumber.textContent = countdownSeconds;
  }

  if (progressCircle) {
    // 计算圆周长
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    progressCircle.style.strokeDasharray = circumference;
    progressCircle.style.strokeDashoffset = '0';
  }

  // 添加鼠标悬停暂停倒计时功能
  const countdownContainer = tooltip.stateIndicator.querySelector('.markhub-countdown-container');
  let isPaused = false;

  if (countdownContainer) {
    countdownContainer.addEventListener('mouseenter', () => {
      isPaused = true;
    });

    countdownContainer.addEventListener('mouseleave', () => {
      isPaused = false;
    });
  }

  // 设置新计时器
  countdownTimer = setInterval(() => {
    // 如果鼠标悬停在倒计时上，暂停倒计时
    if (isPaused) return;

    countdownSeconds--;

    // 更新UI
    if (countdownNumber) {
      countdownNumber.textContent = countdownSeconds;
    }

    if (progressCircle) {
      const radius = 16;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference * (1 - countdownSeconds / 5);
      progressCircle.style.strokeDashoffset = offset;
    }

    // 检查是否结束
    if (countdownSeconds <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      handleConfirm();
    }
  }, 1000);
}

// 处理确认操作
function handleConfirm() {
  console.log('MarkHub: 处理确认操作');

  // 清除倒计时
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  // 更新状态指示器为成功状态
  if (tooltip && tooltip.stateIndicator) {
    tooltip.stateIndicator.innerHTML = `
      <div class="markhub-countdown-container">
        <svg class="markhub-countdown-circle" viewBox="0 0 36 36" width="28" height="28">
          <circle class="markhub-countdown-circle-bg" cx="18" cy="18" r="16" fill="none" stroke-width="2"></circle>
          <path class="markhub-countdown-check" d="M10 18 L16 24 L26 12" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </div>
    `;

    // 移除点击事件，因为已经确认了
    const countdownContainer = tooltip.stateIndicator.querySelector('.markhub-countdown-container');
    if (countdownContainer) {
      countdownContainer.style.cursor = 'default';
      countdownContainer.removeEventListener('click', handleConfirm);
    }
  }

  // 移除操作按钮
  const actionsDiv = tooltip.container.querySelector('.markhub-tooltip-actions');
  if (actionsDiv) {
    actionsDiv.remove();
  }

  // 1秒后隐藏悬浮提示
  setTimeout(() => {
    hideTooltip();

    // 发送确认消息
    if (bookmarkData) {
      chrome.runtime.sendMessage({
        type: 'USER_ACTION_CONFIRM',
        payload: {
          bookmarkId: bookmarkData.bookmarkId,
          suggestedFolderId: bookmarkData.suggestedFolderId,
          originalBookmarkInfo: bookmarkData.originalBookmarkInfo
        }
      });
    }
  }, 1000);
}

// 处理取消操作
function handleCancel() {
  console.log('MarkHub: 处理取消操作 - 拒绝AI分类结果，使用原始文件夹');

  // 清除倒计时
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  // 添加拒绝动画效果
  const declineButton = document.querySelector('.markhub-decline');
  if (declineButton) {
    declineButton.style.backgroundColor = '#ff4d4f';
    declineButton.style.color = 'white';

    // 短暂延迟后恢复原样
    setTimeout(() => {
      declineButton.style.backgroundColor = '';
      declineButton.style.color = '';
    }, 200);
  }

  // 1秒后隐藏悬浮提示
  setTimeout(() => {
    hideTooltip();

    // 发送拒绝消息，使用原始文件夹信息
    if (bookmarkData) {
      chrome.runtime.sendMessage({
        type: 'USER_ACTION_REJECT',
        payload: {
          bookmarkId: bookmarkData.bookmarkId,
          originalBookmarkInfo: bookmarkData.originalBookmarkInfo
        }
      });
    } else {
      // 如果没有书签数据，发送普通取消消息
      chrome.runtime.sendMessage({
        type: 'USER_ACTION_CANCEL'
      });
    }
  }, 300);
}

/**
 * 监听来自后台脚本的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('MarkHub Content Script: 收到消息:', JSON.stringify({
    messageType: message?.type,
    sender: sender?.id,
    hasResponse: !!sendResponse
  }));

  // 立即记录消息接收确认
  console.log('MarkHub Content Script: 开始处理消息。当前文档状态:', document.readyState);

  try {
    // 处理悬浮提示相关消息
    if (message && message.type.startsWith('TOAST_')) {
      console.log('MarkHub: 收到悬浮提示相关消息:', message.type);

      // 根据消息类型处理
      switch (message.type) {
        case 'TOAST_SHOW_LOADING':
          showLoadingState(message.data?.bookmarkTitle || '加载中...');
          break;

        case 'TOAST_SHOW_SUGGESTION':
          showSuggestionState(message.data);
          break;

        case 'TOAST_SHOW_ERROR':
          showErrorState(message.data?.errorMessage || '未知错误');
          break;

        case 'TOAST_HIDE':
          hideTooltip();
          break;
      }

      // 发送成功响应
      if (sendResponse) {
        sendResponse({ success: true });
      }
      return true;
    }
    // 检查消息类型是否为请求页面内容
    else if (message && message.type === 'GET_PAGE_CONTENT') {
      console.log('MarkHub: 收到GET_PAGE_CONTENT请求，正在提取数据...');

      // 记录当前页面的基本信息，帮助调试
      console.log('MarkHub: 当前页面信息:', {
        url: window.location.href,
        title: document.title,
        readyState: document.readyState
      });

      // 提取页面内容
      const pageContent = extractPageContent();

      // 发送响应
      console.log('MarkHub: 提取完成，发送响应...');
      sendResponse({
        success: true,
        data: pageContent
      });

      return true;
    }
    // MarkHub 应用页面消息处理
    else if (message && message.type === "MARKHUB_EXTENSION_ADD_BOOKMARK") {
      console.log('MarkHub: 收到添加书签请求，准备转发至应用页面');
      // 收到书签数据，转发给MarkHub应用页面，使用新的消息类型支持AI自动分类
      const payload = {
        url: message.bookmark?.url,
        title: message.bookmark?.title,
        addedAt: message.bookmark?.createdAt || new Date().toISOString(),
        tags: message.bookmark?.tags || [],
        description: message.bookmark?.description || ""
      };

      console.log('MarkHub: 转发书签数据:', JSON.stringify(payload));

      window.postMessage({
        type: "NEW_BOOKMARK_FOR_AI_CLASSIFICATION",
        payload: payload,
        source: "markhub-extension"
      }, "*");

      // 发送成功响应
      if (sendResponse) {
        console.log('MarkHub: 发送成功响应');
        sendResponse({ success: true });
      }
      return true;
    }
    // 处理保存到localStorage的请求
    else if (message && message.type === "MARKHUB_EXTENSION_SAVE_TO_LOCALSTORAGE") {
      console.log('MarkHub: 收到保存到localStorage请求');
      // 作为备用方案，将书签数据保存到localStorage
      try {
        const key = message.key;
        console.log(`MarkHub: 尝试读取既有数据，键名: "${key}"`);

        const existingData = localStorage.getItem(key);
        let bookmarks = [];

        if (existingData) {
          try {
            bookmarks = JSON.parse(existingData);
            console.log(`MarkHub: 成功解析既有数据，包含${bookmarks.length}个条目`);

            if (!Array.isArray(bookmarks)) {
              console.warn('MarkHub: 既有数据不是数组，重置为空数组');
              bookmarks = [];
            }
          } catch (parseError) {
            console.error('MarkHub: 解析既有数据失败:', parseError);
            bookmarks = [];
          }
        } else {
          console.log('MarkHub: 不存在既有数据，使用空数组');
        }

        // 添加新书签
        const newBookmark = {
          ...message.bookmark,
          timestamp: new Date().getTime()
        };

        console.log('MarkHub: 添加新书签到数组:', JSON.stringify(newBookmark));
        bookmarks.push(newBookmark);

        // 保存更新后的书签
        const dataToSave = JSON.stringify(bookmarks);
        console.log(`MarkHub: 保存${bookmarks.length}个条目到localStorage，数据大小:`, dataToSave.length, '字节');

        localStorage.setItem(key, dataToSave);
        console.log('MarkHub: 成功保存到localStorage');

        if (sendResponse) {
          sendResponse({ success: true });
        }
        return true;
      } catch (error) {
        console.error("MarkHub: 保存到localStorage失败:", error);
        console.error("MarkHub: 错误详情:", error.stack || JSON.stringify(error));
        if (sendResponse) {
          sendResponse({ success: false, error: error.message });
        }
        return true;
      }
    }
    // 处理文件夹分类后的书签同步消息
    else if (message && message.type === 'MARKHUB_CHROME_SYNC_FOLDER_CLASSIFIED_BOOKMARK') {
      console.log('MarkHub: 收到 MARKHUB_CHROME_SYNC_FOLDER_CLASSIFIED_BOOKMARK 消息，准备转发至应用页面');
      console.log('MarkHub: 转发分类后的书签数据:', JSON.stringify(message.payload));

      window.postMessage({
        type: "MARKHUB_CHROME_SYNC_FOLDER_CLASSIFIED_BOOKMARK", // 确保这个类型与 MarkHub 应用期望的一致
        payload: message.payload,
        source: "markhub-extension"
      }, "*");

      // 发送成功响应
      if (sendResponse) {
        console.log('MarkHub: 发送成功响应');
        sendResponse({ success: true });
      }
      return true;
    } else {
      console.warn('MarkHub: 收到未知类型的消息:', message?.type);
      if (sendResponse) {
        sendResponse({ success: false, error: '未知的消息类型' });
      }
      return true;
    }
  } catch (error) {
    console.error('MarkHub Content Script: 处理消息时出错:', error);
    console.error('错误详情:', error.stack || JSON.stringify(error));

    // 尝试发送错误响应
    if (sendResponse) {
      sendResponse({
        success: false,
        error: error.message || '未知错误'
      });
    }

    return true;
  }
});

/**
 * 提取页面内容
 * @returns {Object} 页面内容对象
 */
function extractPageContent() {
  // 提取页面标题
  const title = document.title || '';

  // 提取页面描述
  let description = '';
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    description = metaDescription.getAttribute('content') || '';
  }

  // 提取页面关键词
  let keywords = '';
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords) {
    keywords = metaKeywords.getAttribute('content') || '';
  }

  // 提取页面主要内容
  let mainContent = '';

  try {
    // 尝试使用多种常见内容选择器
    const contentSelectors = [
      'article', 'main', '.content', '#content',
      '.post', '.article', '.post-content', '.entry-content'
    ];

    // 尝试使用多种常见内容选择器
    for (const selector of contentSelectors) {
      const contentElement = document.querySelector(selector);
      if (contentElement) {
        mainContent = contentElement.textContent;
        console.log(`MarkHub: 使用选择器 "${selector}" 成功提取内容，字符长度:`, mainContent.length);
        break;
      }
    }

    // 如果没有找到特定内容容器，则使用 body
    if (!mainContent) {
      console.log('MarkHub: 未找到特定内容容器，尝试使用body并排除非主体区域');
      // 获取 body 元素，但排除一些常见的非主体内容区域
      const body = document.body;
      if (body) {
        // 创建一个临时元素来复制body内容
        const tempElement = body.cloneNode(true);

        // 移除一些常见的非主体内容区域
        const nonContentSelectors = [
          'header', 'footer', 'nav', '.navigation', '.menu', '.sidebar',
          '.comments', '.related', '.recommended', '.advertisement',
          '.ads', '.ad-container'
        ];

        nonContentSelectors.forEach(selector => {
          const elements = tempElement.querySelectorAll(selector);
          elements.forEach(el => {
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          });
        });

        mainContent = tempElement.textContent;
        console.log('MarkHub: 使用body提取内容，字符长度:', mainContent.length);
      }
    }

    // 清理内容（移除多余空白）
    mainContent = mainContent.replace(/\s+/g, ' ').trim();

    // 限制内容长度
    if (mainContent.length > 10000) {
      console.log('MarkHub: 内容过长，截断至10000字符');
      mainContent = mainContent.substring(0, 10000);
    }
  } catch (error) {
    console.error('MarkHub: 提取页面内容时出错:', error);
    mainContent = '';
  }

  return {
    title,
    description,
    keywords,
    mainContent,
    url: window.location.href
  };
}

/**
 * 检查chrome.storage.local中的暂存书签并发送到应用
 */
function checkPendingBookmarks() {
  // 首先检查新的存储键
  const storageKey = "markhub_pending_ai_bookmarks";
  chrome.storage.local.get(storageKey, (data) => {
    if (data[storageKey] && Array.isArray(data[storageKey]) && data[storageKey].length > 0) {
      console.log(`MarkHub扩展: 从${storageKey}中找到${data[storageKey].length}个暂存书签，发送给应用`);

      // 发送暂存的书签到应用
      window.postMessage({
        type: "NEW_BOOKMARK_FOR_AI_CLASSIFICATION_BATCH",
        payload: data[storageKey].map(bookmark => ({
          url: bookmark.url,
          title: bookmark.title,
          addedAt: bookmark.createdAt || bookmark.timestamp || new Date().toISOString(),
          tags: bookmark.tags || [],
          description: bookmark.description || ""
        })),
        source: "markhub-extension"
      }, "*");

      // 发送后清除暂存的书签
      chrome.storage.local.remove(storageKey, () => {
        console.log(`MarkHub扩展: 暂存书签已从${storageKey}中清除`);
      });

      return; // 已处理新的存储键，不需要检查旧的
    }

    // 如果新的存储键中没有书签，则检查旧的存储键（向后兼容）
    chrome.storage.local.get("pendingBookmarks", (oldData) => {
      if (oldData.pendingBookmarks && Array.isArray(oldData.pendingBookmarks) && oldData.pendingBookmarks.length > 0) {
        console.log(`MarkHub扩展: 从旧存储键中找到${oldData.pendingBookmarks.length}个暂存书签，发送给应用`);

        // 发送暂存的书签到应用
        window.postMessage({
          type: "NEW_BOOKMARK_FOR_AI_CLASSIFICATION_BATCH",
          payload: oldData.pendingBookmarks.map(bookmark => ({
            url: bookmark.url,
            title: bookmark.title,
            addedAt: bookmark.createdAt || bookmark.timestamp || new Date().toISOString(),
            tags: bookmark.tags || [],
            description: bookmark.description || ""
          })),
          source: "markhub-extension"
        }, "*");

        // 发送后清除暂存的书签
        chrome.storage.local.remove("pendingBookmarks", () => {
          console.log("MarkHub扩展: 旧版暂存书签已从存储中清除");
        });
      }
    });
  });
}

// 监听来自页面的消息
window.addEventListener('message', (event) => {
  // 确保消息来自我们的页面脚本
  if (event.source !== window) {
    return;
  }

  // 处理来自MarkHub应用的请求暂存书签消息
  if (event.data && event.data.source === 'markhub-app' &&
      event.data.type === 'REQUEST_PENDING_BOOKMARKS_FROM_EXTENSION') {
    console.log('MarkHub: 收到应用请求暂存书签的消息，开始检查暂存书签');
    checkPendingBookmarks();
  }

  // 处理来自页面悬浮提示的消息
  if (event.data && event.data.source === 'markhub-toast') {
    console.log('MarkHub: 收到来自页面悬浮提示的消息:', event.data.type);

    // 处理来自悬浮提示的消息
    if (event.data.type === 'TOAST_READY') {
      // 通知后台脚本悬浮提示已准备就绪
      chrome.runtime.sendMessage({
        type: 'TOAST_READY'
      });
    } else if (event.data.type === 'USER_ACTION_CONFIRM' ||
               event.data.type === 'USER_ACTION_CANCEL') {
      // 转发用户操作消息给后台脚本
      chrome.runtime.sendMessage(event.data);
    }
  }
});

// 在页面加载完成后创建悬浮提示
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  if (document.body) {
    createTooltipUI();
  } else {
    // 如果body还不存在，等待DOM变化
    const observer = new MutationObserver((_, obs) => {
      if (document.body) {
        createTooltipUI();
        obs.disconnect(); // 停止观察
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
} else {
  window.addEventListener('DOMContentLoaded', () => {
    createTooltipUI();
  });
}

// 页面加载完成后执行
window.addEventListener('load', () => {
  console.log("MarkHub: 页面加载完成，内容脚本开始初始化");

  // 初始化通知，告知页面扩展已加载
  console.log("MarkHub: 发送MARKHUB_EXTENSION_LOADED消息到页面");
  window.postMessage({
    type: "MARKHUB_EXTENSION_LOADED",
    source: "markhub-extension"
  }, "*");

  console.log("MarkHub Chrome Sync 内容脚本已完成初始化");

  // 延迟一小段时间后检查暂存书签，确保应用已准备好接收消息
  console.log("MarkHub: 设置1秒延迟后检查暂存书签");
  setTimeout(() => {
    console.log("MarkHub: 开始检查暂存书签");
    checkPendingBookmarks();
  }, 1000);
});
