/** Admin dashboard — uses adapter query API key, separate from chat cookie auth. */

export const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? ''
export const ADMIN_API_KEY_HEADER =
  import.meta.env.VITE_ADMIN_API_KEY_HEADER ?? 'X-Adapter-Query-Key'

export const ADMIN_OVERVIEW_POLL_MS = 8_000
export const ADMIN_DOCUMENT_POLL_MS = 5_000

export function isAdminConfigured(): boolean {
  // Dev: adapter allows admin without key when ADAPTER_QUERY_API_KEY is unset
  return true
}
