import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import * as Sentry from '@sentry/browser'

Sentry.init({
  dsn: 'https://0361538a2d1e42a8934f4d255890ad8d@errors.xivvenuemanager.com/1',
  environment: 'shout-crafter',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
