"use client"

import React, { useState } from "react"
import { Button, Badge, Drawer, Text, Progress, Tooltip } from "@mantine/core"
import { 
  IconLoader2, 
  IconCircleCheckFilled, 
  IconCircleXFilled,
  IconExternalLink,
  IconTag,
  IconFolder
} from "@tabler/icons-react"
import { useAIClassification } from "@/context/ai-classification-context"

export function AIClassificationIndicator() {
  // 获取分类任务状态
  const { 
    taskQueue, 
    hasActiveTasks, 
    processingCount, 
    completedCount, 
    failedCount,
    clearCompletedTasks,
    clearAllTasks
  } = useAIClassification()
  
  // 控制抽屉是否打开
  const [drawerOpen, setDrawerOpen] = useState(false)
  
  // 统计计数
  const totalTasks = taskQueue.length
  const pendingCount = totalTasks - processingCount - completedCount - failedCount
  
  // 如果没有任务，不显示指示器
  if (totalTasks === 0) {
    return null
  }
  
  // 计算进度百分比
  const progress = totalTasks > 0 
    ? ((processingCount + completedCount + failedCount) / totalTasks) * 100
    : 0
  
  // 确定按钮颜色和图标
  let buttonColor = "blue"
  let ButtonIcon = IconLoader2
  let loading = true
  
  if (!hasActiveTasks) {
    if (failedCount > 0) {
      buttonColor = "yellow"
      ButtonIcon = IconCircleXFilled
      loading = false
    } else {
      buttonColor = "green"
      ButtonIcon = IconCircleCheckFilled
      loading = false
    }
  }
  
  return (
    <>
      <Tooltip
        label={`AI分类任务: ${completedCount + failedCount}/${totalTasks} 已完成`}
        position="bottom"
        withArrow
      >
        <Button
          size="sm"
          variant="light"
          color={buttonColor}
          onClick={() => setDrawerOpen(true)}
          className="h-[36px]"
          leftSection={loading ? (
            <ButtonIcon size={18} className="animate-spin" />
          ) : (
            <ButtonIcon size={18} />
          )}
        >
          AI分类: {completedCount + failedCount}/{totalTasks}
          {failedCount > 0 && ` (${failedCount} 失败)`}
        </Button>
      </Tooltip>
      
      <Drawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="AI分类任务状态"
        position="right"
        size="md"
      >
        <div className="space-y-6">
          {/* 总体进度 */}
          <div>
            <div className="flex justify-between mb-2">
              <Text size="sm" fw={500}>总体进度: {completedCount + failedCount}/{totalTasks}</Text>
              <Text 
                size="sm" 
                color={hasActiveTasks ? "blue" : (failedCount > 0 ? "orange" : "green")}
              >
                {hasActiveTasks ? "处理中..." : "已完成"}
              </Text>
            </div>
            <Progress
              value={progress}
              color={failedCount > 0 ? "orange" : "green"}
              striped={hasActiveTasks}
              animated={hasActiveTasks}
            />
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>已处理: {completedCount}</span>
              <span>失败: {failedCount}</span>
              <span>处理中: {processingCount}</span>
              <span>等待中: {pendingCount}</span>
            </div>
            
            {/* 控制按钮 */}
            <div className="mt-4 flex justify-end space-x-2">
              <Button 
                size="xs" 
                variant="light" 
                onClick={clearCompletedTasks}
                disabled={completedCount + failedCount === 0}
              >
                清除已完成任务
              </Button>
              <Button 
                size="xs" 
                color="red" 
                variant="light" 
                onClick={clearAllTasks}
              >
                清除全部任务
              </Button>
            </div>
          </div>
          
          {/* 进行中的任务 */}
          {processingCount > 0 && (
            <div className="border-l-4 border-blue-500 pl-3 py-2">
              <Text size="sm" fw={500}>处理中 ({processingCount}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {taskQueue
                  .filter(task => task.overallStatus === 'processing')
                  .map(task => (
                    <div key={task.id} className="bg-blue-50 p-2 rounded mb-2">
                      <Text size="sm">{task.title}</Text>
                      <Text size="xs" color="dimmed" className="truncate">{task.url}</Text>
                      <div className="flex gap-2 mt-1">
                        {task.tagStatus === 'generating_tags' ? (
                          <Badge
                            size="xs"
                            variant="light"
                            color="blue"
                            leftSection={<IconTag size={12} />}
                          >
                            生成中...
                          </Badge>
                        ) : task.tagStatus === 'pending' && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="gray"
                            leftSection={<IconTag size={12} />}
                          >
                            等待中
                          </Badge>
                        )}

                        {task.folderStatus === 'suggesting_folder' ? (
                          <Badge
                            size="xs"
                            variant="light"
                            color="blue"
                            leftSection={<IconFolder size={12} />}
                          >
                            推荐中...
                          </Badge>
                        ) : task.folderStatus === 'pending' && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="gray"
                            leftSection={<IconFolder size={12} />}
                          >
                            等待中
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* 已完成的任务 */}
          {completedCount > 0 && (
            <div className="border-l-4 border-green-500 pl-3 py-2">
              <Text size="sm" fw={500}>已完成 ({completedCount}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {taskQueue
                  .filter(task => 
                    task.overallStatus === 'completed' || 
                    task.overallStatus === 'partially_failed'
                  )
                  .map(task => (
                    <div key={task.id} className="bg-green-50 p-2 rounded mb-2">
                      <div className="flex justify-between">
                        <Text size="sm">{task.title}</Text>
                        <a 
                          href={task.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          <IconExternalLink size={16} />
                        </a>
                      </div>
                      <Text size="xs" color="dimmed" className="truncate">{task.url}</Text>
                      
                      <div className="flex flex-wrap gap-2 mt-2">
                        {/* 统一展示生成的文件夹和标签 */}
                        {task.folderStatus === 'folder_suggested' && task.suggestedFolder && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="blue"
                            leftSection={<IconFolder size={12} />}
                          >
                            {task.suggestedFolder}
                          </Badge>
                        )}
                        
                        {task.tagStatus === 'tags_generated' && task.generatedTags && task.generatedTags.map((tag, idx) => (
                          <Badge
                            key={idx}
                            size="xs"
                            variant="light"
                            color="green"
                            leftSection={<IconTag size={12} />}
                          >
                            {tag}
                          </Badge>
                        ))}
                        
                        {/* 错误信息展示 */}
                        {task.folderStatus === 'folder_failed' && task.folderError && (
                          <Text size="xs" color="red" className="mt-1 w-full">
                            文件夹错误: {task.folderError}
                          </Text>
                        )}
                        
                        {task.tagStatus === 'tags_failed' && task.tagError && (
                          <Text size="xs" color="red" className="mt-1 w-full">
                            标签错误: {task.tagError}
                          </Text>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* 失败的任务 */}
          {failedCount > 0 && (
            <div className="border-l-4 border-red-500 pl-3 py-2">
              <Text size="sm" fw={500}>失败 ({failedCount}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {taskQueue
                  .filter(task => task.overallStatus === 'failed')
                  .map(task => (
                    <div key={task.id} className="bg-red-50 p-2 rounded mb-2">
                      <Text size="sm">{task.title}</Text>
                      <Text size="xs" color="dimmed" className="truncate">{task.url}</Text>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {task.tagStatus === 'tags_failed' && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="red"
                            leftSection={<IconTag size={12} />}
                          >
                            标签生成失败
                          </Badge>
                        )}
                        
                        {task.folderStatus === 'folder_failed' && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="red"
                            leftSection={<IconFolder size={12} />}
                          >
                            文件夹建议失败
                          </Badge>
                        )}
                        
                        {task.tagError && (
                          <Text size="xs" color="red" className="w-full mt-1">标签错误: {task.tagError}</Text>
                        )}
                        {task.folderError && (
                          <Text size="xs" color="red" className="w-full mt-1">文件夹错误: {task.folderError}</Text>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {/* 等待中的任务 */}
          {pendingCount > 0 && (
            <div className="border-l-4 border-gray-300 pl-3 py-2">
              <Text size="sm" fw={500}>等待中 ({pendingCount}):</Text>
              <div className="mt-1 max-h-36 overflow-y-auto">
                {taskQueue
                  .filter(task => task.overallStatus === 'pending')
                  .map(task => (
                    <div key={task.id} className="bg-gray-50 p-2 rounded mb-2">
                      <Text size="sm">{task.title}</Text>
                      <Text size="xs" color="dimmed" className="truncate">{task.url}</Text>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </>
  )
}