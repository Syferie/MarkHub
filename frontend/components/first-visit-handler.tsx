"use client"

import { useEffect, useState, useRef } from "react"
import LoadingScreen from "./loading-screen"

const FirstVisitHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showLoadingScreen, setShowLoadingScreen] = useState(true) // 默认显示加载动画
  const [isAppLoaded, setIsAppLoaded] = useState(false) // 追踪应用是否已加载
  const childrenRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    // 使用 requestIdleCallback 在浏览器空闲时检查应用是否已加载
    // 这避免了阻塞主线程上的渲染工作
    const checkAppLoaded = () => {
      if (childrenRef.current) {
        // 子组件已挂载，我们认为应用已基本加载完成
        setIsAppLoaded(true)
      } else {
        // 继续检查
        requestIdleCallback(checkAppLoaded)
      }
    }
    
    // 现代浏览器支持 requestIdleCallback，但如果不支持则使用 setTimeout
    if ('requestIdleCallback' in window) {
      requestIdleCallback(checkAppLoaded)
    } else {
      setTimeout(checkAppLoaded, 200)
    }
  }, [])

  // 处理加载完成
  const handleLoadComplete = () => {
    setShowLoadingScreen(false)
  }

  // 如果加载屏幕显示中，返回加载动画
  if (showLoadingScreen) {
    return (
      <>
        <LoadingScreen
          onLoadComplete={handleLoadComplete}
          isAppLoaded={isAppLoaded}
        />
        <div
          ref={childrenRef}
          style={{ visibility: 'hidden' }}
        >
          {children}
        </div>
      </>
    )
  }

  // 否则返回子组件
  return <>{children}</>
}

export default FirstVisitHandler