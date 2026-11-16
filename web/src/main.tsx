import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (no runtime request to a font service): Bricolage Grotesque for headings, Inter for text,
// JetBrains Mono for years and coordinates.
import '@fontsource/bricolage-grotesque/latin-600.css'
import '@fontsource/bricolage-grotesque/latin-700.css'
import '@fontsource/space-grotesk/latin-600.css'
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import App from './App'
import { applySavedTheme } from './components/ThemeToggle'
import './styles.css'

applySavedTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
