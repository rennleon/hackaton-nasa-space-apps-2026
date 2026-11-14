import type { DataClient } from './client'
import { ApiClient } from './apiClient'
import { FallbackClient } from './fallbackClient'
import { StaticClient } from './staticClient'

/** The one place that picks the client: VITE_API_URL set -> API with static fallback, otherwise static only. */
export function createClient(apiUrl: string | undefined = import.meta.env.VITE_API_URL): DataClient {
  const stat = new StaticClient()
  return apiUrl ? new FallbackClient(new ApiClient(apiUrl), stat) : stat
}

export type { DataClient } from './client'
