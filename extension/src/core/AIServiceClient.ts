/**
 * Markhub Chrome Extension - AI 服务客户端
 * 
 * 该模块负责:
 * 1. 调用外部 AI 服务进行文件夹推荐
 * 2. 构建合适的 prompt
 * 3. 解析 AI 响应
 * 4. 错误处理
 */

import { PluginConfig } from './ConfigManager'
import { t } from '../utils/coreI18n'

/**
 * Chrome 书签文件夹信息
 */
export interface ChromeFolder {
  id: string
  title: string
  parentId?: string
  path: string // 完整路径，如 "工作/前端开发"
}

/**
 * 书签信息
 */
export interface BookmarkInfo {
  id: string
  title: string
  url: string
  parentId: string
}

/**
 * AI 推荐结果
 */
export interface FolderRecommendation {
  recommendedFolderId: string
  recommendedFolderName: string
  confidence: number // 0-1 之间的置信度
  reason?: string // 推荐理由
}

/**
 * AI 服务客户端类
 */
export class AIServiceClient {
  private config: PluginConfig['aiServiceConfig']['folderRec']

  constructor(config: PluginConfig['aiServiceConfig']['folderRec']) {
    this.config = config
  }

  /**
   * 获取文件夹推荐
   */
  async getFolderRecommendation(
    bookmark: BookmarkInfo,
    chromeFolders: ChromeFolder[]
  ): Promise<FolderRecommendation | null> {
    try {
      // 验证配置
      this.validateConfig()

      // 构建 prompt
      const prompt = this.buildPrompt(bookmark, chromeFolders)

      // 调用 AI 服务
      const response = await this.callAIService(prompt)

      // 解析响应
      return this.parseAIResponse(response, chromeFolders)

    } catch (error) {
      console.error('AIServiceClient: Error getting folder recommendation:', error)
      return null
    }
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error(t('aiConfigErrorApiKey'))
    }

    if (!this.config.apiUrl) {
      throw new Error(t('aiConfigErrorApiUrl'))
    }

    if (!this.config.modelName) {
      throw new Error(t('aiConfigErrorModelName'))
    }

    // 验证 URL 格式
    try {
      new URL(this.config.apiUrl)
    } catch {
      throw new Error(t('aiConfigErrorInvalidUrl'))
    }
  }

  /**
   * 构建 AI prompt
   */
  private buildPrompt(bookmark: BookmarkInfo, chromeFolders: ChromeFolder[]): string {
    const folderList = chromeFolders
      .map(folder => `- ${folder.title} (ID: ${folder.id}, 路径: ${folder.path})`)
      .join('\n')

    return `你是一个智能书签管理助手。请根据书签的标题和URL，从提供的文件夹列表中选择最合适的文件夹。

书签信息：
- 标题：${bookmark.title}
- URL：${bookmark.url}

可选文件夹列表：
${folderList}

请分析书签的内容和主题，选择最合适的文件夹。请以JSON格式回复，包含以下字段：
{
  "folderId": "选择的文件夹ID",
  "folderName": "选择的文件夹名称",
  "confidence": 0.xx,
  "reason": "选择理由"
}

要求：
1. 必须从提供的文件夹列表中选择
2. confidence 字段应该是 0-1 之间的数值，表示推荐的置信度
3. reason 字段简要说明选择理由，理由为一句话，不得超过 20 个中文汉字。精简准确的描述清楚。
4. 如果没有合适的文件夹，选择最通用的文件夹并降低置信度`
  }

  /**
   * 测试 AI 服务连接
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      // 验证配置
      this.validateConfig()

      // 构建简单的测试 prompt
      const testPrompt = "请回复'连接成功'来确认服务正常工作。"

      // 调用 AI 服务
      const response = await this.callAIService(testPrompt)

      // 检查响应是否有效
      if (response && (response.choices || response.response)) {
        return {
          success: true,
          message: t('aiConnectionSuccess'),
          details: response
        }
      } else {
        return {
          success: false,
          message: t('aiResponseFormatError'),
          details: response
        }
      }

    } catch (error) {
      console.error('AIServiceClient: Test connection failed:', error)
      return {
        success: false,
        message: t('connectionFailedPrefix') + (error as Error).message,
        details: error
      }
    }
  }

  /**
   * 调用 AI 服务
   */
  async callAIService(prompt: string): Promise<any> {
    const requestBody = this.buildRequestBody(prompt)
    
    // 构建 API URL - 参考旧版本的简洁实现
    const apiUrl = `${this.config.apiUrl}/chat/completions`
    
    console.log('AIServiceClient: 调用AI服务:', apiUrl)
    console.log('AIServiceClient: 使用模型:', this.config.modelName)
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      let errorDetails = ''
      // 先克隆响应，以防需要多次读取
      const responseClone = response.clone()
      
      try {
        // 尝试解析错误响应为JSON
        const errorJson = await response.json()
        errorDetails = JSON.stringify(errorJson)
      } catch (e) {
        try {
          // 如果JSON解析失败，使用克隆的响应获取文本
          errorDetails = await responseClone.text()
        } catch (textError) {
          errorDetails = `无法读取错误响应: ${textError}`
        }
      }
      throw new Error(`AI 服务请求失败: ${response.status} - ${errorDetails}`)
    }

    const responseData = await response.json()
    console.log('AIServiceClient: AI服务响应:', JSON.stringify(responseData).substring(0, 100) + '...')
    
    return responseData
  }

  /**
   * 构建请求体（OpenAI 兼容格式）
   */
  private buildRequestBody(prompt: string): any {
    return {
      model: this.config.modelName,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的书签管理助手，擅长根据网页内容推荐合适的文件夹分类。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    }
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(response: any, chromeFolders: ChromeFolder[]): FolderRecommendation | null {
    try {
      // 提取响应内容
      let content = ''
      
      if (response.choices && response.choices[0] && response.choices[0].message) {
        content = response.choices[0].message.content
      } else if (response.response) {
        content = response.response
      } else {
        throw new Error('无法解析 AI 响应格式')
      }

      // 尝试解析 JSON
      let parsedContent: any
      try {
        // 提取 JSON 部分（可能包含在代码块中）
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0])
        } else {
          parsedContent = JSON.parse(content)
        }
      } catch (jsonError) {
        console.error('AIServiceClient: Failed to parse JSON response:', content)
        return this.fallbackRecommendation(chromeFolders)
      }

      // 验证响应格式
      if (!parsedContent.folderId || !parsedContent.folderName) {
        console.error('AIServiceClient: Invalid response format:', parsedContent)
        return this.fallbackRecommendation(chromeFolders)
      }

      // 验证文件夹ID是否存在
      const folder = chromeFolders.find(f => f.id === parsedContent.folderId)
      if (!folder) {
        console.error('AIServiceClient: Recommended folder not found:', parsedContent.folderId)
        return this.fallbackRecommendation(chromeFolders)
      }

      return {
        recommendedFolderId: parsedContent.folderId,
        recommendedFolderName: parsedContent.folderName,
        confidence: Math.max(0, Math.min(1, parsedContent.confidence || 0.5)),
        reason: parsedContent.reason
      }

    } catch (error) {
      console.error('AIServiceClient: Error parsing AI response:', error)
      return this.fallbackRecommendation(chromeFolders)
    }
  }

  /**
   * 备用推荐（当 AI 服务失败时）
   */
  private fallbackRecommendation(chromeFolders: ChromeFolder[]): FolderRecommendation | null {
    // 寻找"其他"、"未分类"等通用文件夹
    const fallbackNames = ['其他', '未分类', 'Other', 'Uncategorized', '书签栏']
    
    for (const name of fallbackNames) {
      const folder = chromeFolders.find(f => 
        f.title.toLowerCase().includes(name.toLowerCase())
      )
      if (folder) {
        return {
          recommendedFolderId: folder.id,
          recommendedFolderName: folder.title,
          confidence: 0.3,
          reason: t('aiServiceUnavailableGeneric')
        }
      }
    }

    // 如果没有找到通用文件夹，选择第一个文件夹
    if (chromeFolders.length > 0) {
      const folder = chromeFolders[0]
      return {
        recommendedFolderId: folder.id,
        recommendedFolderName: folder.title,
        confidence: 0.2,
        reason: t('aiServiceUnavailableDefault')
      }
    }

    return null
  }

  /**
   * 更新配置
   */
  updateConfig(config: PluginConfig['aiServiceConfig']['folderRec']): void {
    this.config = config
  }
}

/**
 * 工厂函数
 */
export function createAIServiceClient(config: PluginConfig['aiServiceConfig']['folderRec']): AIServiceClient {
  return new AIServiceClient(config)
}