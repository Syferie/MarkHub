"use client"

import { useEffect, useState, useRef } from "react"

interface LoadingScreenProps {
  onLoadComplete?: () => void
  isAppLoaded?: boolean
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onLoadComplete,
  isAppLoaded = false
}) => {
  const [isVisible, setIsVisible] = useState(true)
  const [progress, setProgress] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  
  // 最小动画显示时间和最大动画显示时间（毫秒）
  const minDuration = 800  // 至少显示800毫秒，确保品牌展示
  const maxDuration = 2000 // 最多显示2秒
  
  // 结束加载动画的函数
  const finishLoading = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    // 完成加载后的动画过渡
    setTimeout(() => {
      setIsVisible(false)
      if (onLoadComplete) onLoadComplete()
    }, 300)
  }

  useEffect(() => {
    // 追踪动画开始时间
    startTimeRef.current = Date.now()
    
    // 模拟加载进度
    const interval = 20 // 更新间隔（毫秒）
    const normalSteps = maxDuration / interval
    let currentStep = 0
    
    // 开始进度更新
    timerRef.current = setInterval(() => {
      currentStep++
      const elapsedTime = Date.now() - startTimeRef.current
      
      // 计算应用加载状态影响后的进度
      let targetProgress
      if (isAppLoaded) {
        // 应用已加载，加速进度到90%或更高
        // 但仍然保持最小显示时间
        if (elapsedTime < minDuration) {
          // 未达到最小显示时间，控制进度在70%以内
          targetProgress = Math.min(70, (elapsedTime / minDuration) * 70)
        } else {
          // 已达到最小显示时间，快速完成剩余进度
          targetProgress = 70 + ((elapsedTime - minDuration) / 300) * 30
          if (targetProgress >= 100) {
            setProgress(100)
            finishLoading()
            return
          }
        }
      } else {
        // 应用尚未加载，使用常规缓动进度
        // 使用 easeOutExpo 缓动函数，开始快结束慢
        const normalProgress = 1 - Math.pow(1 - currentStep / normalSteps, 4)
        targetProgress = normalProgress * 100
      }
      
      setProgress(targetProgress)
      
      // 如果达到最大时间或进度100%，结束动画
      if (currentStep >= normalSteps || targetProgress >= 100) {
        setProgress(100)
        finishLoading()
      }
    }, interval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isAppLoaded, onLoadComplete])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white dark:bg-[#1e1e1e] transition-opacity duration-300">
      <div className="flex flex-col items-center fade-in">
        <div className="relative mb-8">
          <img src="/icon128.png" alt="MarkHub Logo" className="w-24 h-24 animate-pulse" />
        </div>
        <h1 className="text-3xl font-bold mb-4 text-gray-800 dark:text-gray-100">MarkHub</h1>
        <div className="w-64 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-200 ease-out rounded-full"
            style={{
              width: `${progress}%`,
              backgroundColor: 'var(--accent-color)'
            }}
          />
        </div>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">现代书签管理应用</p>
      </div>
    </div>
  )
}

export default LoadingScreen