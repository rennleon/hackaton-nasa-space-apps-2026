import type { DataClient } from './client'
import { ApiClient } from './apiClient'
import { FallbackClient } from './fallbackClient'
import { StaticClient } from './staticClient'

/** VITE_API_URL if set; in `npm run dev` it defaults to `/api`, which vite.config.ts proxies to localhost:8000. */
export function defaultApiUrl(): string | undefined {
  return import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : undefined)
}

/** The one place that picks the client: an API url -> API with static fallback, otherwise static only. */
export function createClient(apiUrl: string | undefined): DataClient {
  const stat = new StaticClient()
  return apiUrl ? new FallbackClient(new ApiClient(apiUrl), stat) : stat
}

export type { DataClient } from './client'
