/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}
declare module 'plotly.js-basic-dist-min' {
  const Plotly: unknown
  export default Plotly
}

/** App version from web/package.json (kept in sync with VERSION by scripts/version.mjs). */
declare const __APP_VERSION__: string
