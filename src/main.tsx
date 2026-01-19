import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { isTauri } from './lib/platform'

// 환경에 따라 다른 앱 로드
async function loadApp() {
  if (isTauri()) {
    // Tauri 환경: 메인 앱 로드
    const { default: App } = await import('./App.tsx')
    return App
  } else {
    // 웹 환경: 웹 클라이언트 앱 로드
    const { WebApp } = await import('./WebApp.tsx')
    return WebApp
  }
}

loadApp().then((AppComponent) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppComponent />
    </StrictMode>,
  )
})
