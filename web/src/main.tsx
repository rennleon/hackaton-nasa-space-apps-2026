import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled (no runtime request to a font service): Space Grotesk for headings, Nunito Sans for text.
import '@fontsource/space-grotesk/latin-700.css'
import '@fontsource/nunito-sans/latin-400.css'
import '@fontsource/nunito-sans/latin-700.css'
import App from './App'
import { ThemeToggle, applySavedTheme } from './components/ThemeToggle'
import './styles.css'

applySavedTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ThemeToggle />
  </StrictMode>,
)
