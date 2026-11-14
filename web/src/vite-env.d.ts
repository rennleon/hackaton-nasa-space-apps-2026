/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}
declare module 'plotly.js-basic-dist-min' {
  const Plotly: unknown
  export default Plotly
}
