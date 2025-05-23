/**
 * MarkHub 浏览器扩展 - 弹出窗口脚本
 * 新版 UI 及简化流程版本
 */

import { getConfig, saveConfig } from '../core/config_manager.js';

document.addEventListener('DOMContentLoaded', async function() {
  // 获取 DOM 元素
  const pageTitleElement = document.getElementById('pageTitle');
  const pageUrlElement = document.getElementById('pageUrl');
  const saveButton = document.getElementById('saveButton');
  const manageButton = document.getElementById('manageButton');
  const settingsButton = document.getElementById('settingsButton');
  const backButton = document.getElementById('backButton');
  const settingsPanel = document.getElementById('settingsPanel');
  
  // 配置相关元素
  const configElements = {
    apiKey: document.getElementById('api-key'),
    apiBaseUrl: document.getElementById('api-base-url'),
    modelName: document.getElementById('model-name'),
    markhubAppUrl: document.getElementById('markhub-app-url'),
    syncEnabled: document.getElementById('sync-enabled'),
    saveBtn: document.getElementById('save-config-btn'),
    statusMessage: document.getElementById('status-message')
  };

  // MarkHub 应用的 URL - 从配置中获取
  let MARKHUB_APP_URL = 'http://markhub.app'; // 默认值

  // 当前页面信息
  let currentTitle = '';
  let currentUrl = '';

  // 初始化界面
  initializePopup();
  
  // 加载配置
  await loadConfig();

  // 添加事件监听
  saveButton.addEventListener('click', saveBookmark);
  manageButton.addEventListener('click', openManagePage);
  settingsButton.addEventListener('click', openSettings);
  backButton.addEventListener('click', closeSettings);
  settingsPanel.addEventListener('click', function(e) { // 点击背景关闭设置
    if (e.target === settingsPanel) {
      closeSettings();
    }
  });
  
  // 配置保存按钮事件监听
  configElements.saveBtn.addEventListener('click', saveFormConfig);

  /**
   * 初始化弹出窗口
   */
  async function initializePopup() {
    // 首先检查URL中是否有参数（从右键菜单打开时会有）
    const urlParams = new URLSearchParams(window.location.search);
    const urlFromParams = urlParams.get('url');
    const titleFromParams = urlParams.get('title');
    const sourceFromParams = urlParams.get('source');

    // 检查是否是从右键菜单打开的
    const isFromContextMenu = sourceFromParams === 'contextmenu';

    if (urlFromParams) {
      // 如果URL参数存在，直接使用
      currentUrl = urlFromParams;
      currentTitle = titleFromParams || '';

      // 更新页面信息
      pageTitleElement.value = currentTitle;
      pageUrlElement.textContent = currentUrl;
      pageUrlElement.title = currentUrl;

      // 为标题输入框添加焦点事件，使其在获得焦点时自动全选内容
      pageTitleElement.addEventListener('focus', function() {
        this.select();
      });

      // 如果是从右键菜单打开的，自动聚焦到标题输入框
      if (isFromContextMenu) {
        setTimeout(() => {
          pageTitleElement.focus();
        }, 100);
      }

      return; // 已经获取到信息，不需要继续查询标签页
    }

    // 如果没有URL参数，则获取当前活动标签页信息
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        const activeTab = tabs[0];
        currentUrl = activeTab.url || '';
        currentTitle = activeTab.title || '';

        // 更新页面信息
        pageTitleElement.value = currentTitle || ''; // 使用 value 而不是 textContent，因为现在是输入框
        pageUrlElement.textContent = currentUrl || '无法获取 URL';
        pageUrlElement.title = currentUrl || '无法获取 URL';

        // 为标题输入框添加焦点事件，使其在获得焦点时自动全选内容
        pageTitleElement.addEventListener('focus', function() {
          this.select();
        });

      } else {
        pageTitleElement.value = ''; // 使用 value 而不是 textContent
        pageTitleElement.placeholder = '无法获取页面标题';
        pageUrlElement.textContent = '无法获取页面 URL';
        saveButton.disabled = true;
      }
    } catch (error) {
      console.error('获取标签页信息失败:', error);
      showMessage('获取页面信息失败', 'error');
      saveButton.disabled = true;
    }
  }

  /**
   * 保存书签到 MarkHub
   */
  async function saveBookmark() {
    if (saveButton.disabled) return;

    // 基本验证
    if (!currentTitle || !currentUrl) {
      showMessage('无效的页面信息', 'error');
      return;
    }

    try {
      // 验证URL格式
      new URL(currentUrl);
    } catch (e) {
      showMessage('无效的 URL 格式', 'error');
      return;
    }

    // 获取用户编辑后的标题
    const editedTitle = pageTitleElement.value.trim();

    // 创建简化的书签对象，使用编辑后的标题
    const bookmark = {
      title: editedTitle || currentTitle, // 如果用户清空了标题，则使用原始标题
      url: currentUrl,
      createdAt: new Date().toISOString()
    };

    setButtonsEnabled(false, '正在添加...');
    showMessage('正在保存...', ''); // 清除旧消息，准备显示新状态

    try {
      // 发送消息到 background.js
      chrome.runtime.sendMessage(
        { action: 'saveBookmark', bookmark },
        function(response) {
          if (chrome.runtime.lastError) {
            console.error('发送消息时出错:', chrome.runtime.lastError.message);
            showMessage(`保存失败: ${chrome.runtime.lastError.message}`, 'error');
            setButtonsEnabled(true);
            return;
          }

          if (response && response.success) {
            if (response.pending) {
              showMessage(response.message || '已暂存，将在下次连接时同步', 'pending');
              setTimeout(() => window.close(), 2500);
            } else {
              showMessage(response.message || '添加成功！', 'success');
              setTimeout(() => window.close(), 2000);
            }
          } else {
            showMessage(`保存失败: ${(response && response.error) || '未知错误'}`, 'error');
            setButtonsEnabled(true);
          }
        }
      );
    } catch (error) {
      console.error('发送消息失败:', error);
      showMessage(`发送失败: ${error.message}`, 'error');
      setButtonsEnabled(true);
    }
  }

  /**
   * 打开管理页面
   */
  function openManagePage() {
    if (manageButton.disabled) return;
    chrome.tabs.create({ url: MARKHUB_APP_URL });
  }

  /**
   * 打开设置面板
   */
  function openSettings() {
    if (settingsButton.disabled) return;
    settingsPanel.classList.add('active');
  }

  /**
   * 关闭设置面板
   */
  function closeSettings() {
    settingsPanel.classList.remove('active');
  }

  /**
   * 显示消息（直接在保存按钮上显示）
   * @param {string} text - 消息文本
   * @param {string} type - 消息类型: success, error, pending 或空字符串
   */
  function showMessage(text, type) {
    // 移除所有状态类
    saveButton.classList.remove('success', 'error', 'pending');

    // 更新按钮文本和状态
    if (type) {
      // 添加新的状态类
      saveButton.classList.add(type);

      // 更新按钮文本，保留图标
      const iconSpan = saveButton.querySelector('.btn-icon').outerHTML;
      saveButton.innerHTML = `${iconSpan} ${text}`;

      // 添加动画效果
      if (type === 'success') {
        // 先移除动画类，以便重新触发
        saveButton.classList.remove('animate');

        // 使用 setTimeout 确保 DOM 更新后再添加动画类
        setTimeout(() => {
          saveButton.classList.add('animate');
        }, 10);
      }
    }
  }

  /**
   * 设置按钮是否可用
   * @param {boolean} enabled - 是否启用按钮
   * @param {string} [loadingText] - 按钮在禁用时显示的文本 (仅用于 saveButton)
   */
  function setButtonsEnabled(enabled, loadingText = '添加书签') {
    saveButton.disabled = !enabled;
    manageButton.disabled = !enabled;
    // settingsButton 通常保持可用，除非有特定逻辑

    // 移除所有状态类，恢复默认外观
    saveButton.classList.remove('success', 'error', 'pending');

    if (!enabled && loadingText !== '添加书签') {
        // 为了保持图标和文本的对齐，我们只修改文本部分
        const iconSpan = saveButton.querySelector('.btn-icon').outerHTML;
        saveButton.innerHTML = `${iconSpan} ${loadingText}`;

        // 添加加载中的视觉效果
        saveButton.style.position = 'relative';
        saveButton.style.overflow = 'hidden';

        // 添加脉动效果
        saveButton.style.animation = 'pulse 1.5s infinite ease-in-out';

        // 定义脉动动画
        if (!document.getElementById('pulseAnimation')) {
            const style = document.createElement('style');
            style.id = 'pulseAnimation';
            style.textContent = `
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.7; }
                    100% { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    } else if (enabled) {
        const iconSpan = saveButton.querySelector('.btn-icon').outerHTML;
        saveButton.innerHTML = `${iconSpan} 添加书签`;

        // 移除加载动画
        saveButton.style.animation = '';
    }

    // 可以添加一些视觉反馈，比如透明度
    const opacityValue = enabled ? '1' : '0.8';
    manageButton.style.opacity = opacityValue;
  }

  /**
   * 下面是配置相关函数
   */

  /**
   * 显示配置状态消息
   * @param {string} message 消息内容
   * @param {boolean} isError 是否为错误消息
   */
  function showConfigStatusMessage(message, isError = false) {
    configElements.statusMessage.textContent = message;
    configElements.statusMessage.className = 'settings-status ' + (isError ? 'error' : 'success');
    
    // 5秒后自动清除消息
    setTimeout(() => {
      configElements.statusMessage.textContent = '';
      configElements.statusMessage.className = 'settings-status';
    }, 5000);
  }

  /**
   * 将配置应用到表单
   * @param {Object} config 配置对象
   */
  function applyConfigToForm(config) {
    configElements.apiKey.value = config.apiKey || '';
    configElements.apiBaseUrl.value = config.apiBaseUrl || '';
    configElements.modelName.value = config.modelName || '';
    configElements.markhubAppUrl.value = config.markhubAppUrl || '';
    configElements.syncEnabled.checked = config.syncEnabled || false;
    
    // 更新应用URL
    MARKHUB_APP_URL = config.markhubAppUrl || 'http://markhub.app';
  }

  /**
   * 从表单读取配置
   * @returns {Object} 配置对象
   */
  function readConfigFromForm() {
    return {
      apiKey: configElements.apiKey.value.trim(),
      apiBaseUrl: configElements.apiBaseUrl.value.trim(),
      modelName: configElements.modelName.value.trim(),
      markhubAppUrl: configElements.markhubAppUrl.value.trim(),
      syncEnabled: configElements.syncEnabled.checked
    };
  }

  /**
   * 验证配置
   * @param {Object} config 配置对象
   * @returns {Object} 包含isValid和message属性的对象
   */
  function validateConfig(config) {
    if (!config.apiKey && config.syncEnabled) {
      return {
        isValid: false,
        message: '启用同步功能时，API Key是必填项'
      };
    }
    
    return {
      isValid: true,
      message: ''
    };
  }

  /**
   * 保存配置
   */
  async function saveFormConfig() {
    const config = readConfigFromForm();
    const validation = validateConfig(config);
    
    if (!validation.isValid) {
      showConfigStatusMessage(validation.message, true);
      return;
    }
    
    try {
      await saveConfig(config);
      showConfigStatusMessage('配置已保存');
      
      // 更新应用URL
      MARKHUB_APP_URL = config.markhubAppUrl || 'http://markhub.app';
    } catch (error) {
      console.error('保存配置失败:', error);
      showConfigStatusMessage('保存配置失败: ' + error.message, true);
    }
  }

  /**
   * 加载配置
   */
  async function loadConfig() {
    try {
      const config = await getConfig();
      applyConfigToForm(config);
      
      // 更新应用URL
      MARKHUB_APP_URL = config.markhubAppUrl || 'http://markhub.app';
    } catch (error) {
      console.error('加载配置失败:', error);
      showConfigStatusMessage('加载配置失败: ' + error.message, true);
    }
  }
});