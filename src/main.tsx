import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import App from './App.tsx'

const container = document.getElementById('root')!
const g = globalThis as typeof globalThis & { __sublibrRoot?: Root }
g.__sublibrRoot ??= createRoot(container)
g.__sublibrRoot.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
