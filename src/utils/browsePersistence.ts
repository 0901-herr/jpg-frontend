import { MAX_EXPLICIT_SELECTION } from '../config/selection'

const SELECTED_DOCS_KEY = 'docu_selected_documents'
const EXPANDED_FOLDERS_KEY = 'docu_expanded_folders'
const ACTIVE_FOLDER_KEY = 'docu_active_folder'

function readJsonArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function selectedDocumentsKey(userId: string): string {
  return `${SELECTED_DOCS_KEY}_${userId}`
}

function readJsonNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/** `null` means the key has never been written — the browser has no
 * persisted selection at all, as opposed to an explicit, deliberate empty
 * selection (`[]`, from clearing every document). Either way, the caller's
 * own default (an empty `Set`) is what a fresh browser starts with — by
 * design, nothing is selected until the user checks something. */
/**
 * Selections belong to one authenticated account. Passing a user id reads
 * that account's private browser slot; `null` deliberately restores nothing
 * while auth is still unknown. The omitted argument keeps the legacy helper
 * behaviour for isolated callers/tests, but production always supplies an
 * authenticated id and never reads the old shared key.
 */
export function loadPersistedSelection(userId?: string | null): Set<string> | null {
  let raw: string | null
  try {
    if (userId === null) return null
    raw = localStorage.getItem(
      typeof userId === 'string' ? selectedDocumentsKey(userId) : SELECTED_DOCS_KEY,
    )
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    if (parsed.length > MAX_EXPLICIT_SELECTION) {
      // Never restore or re-submit a stale oversized selection. Clearing the
      // slot also prevents the same bad payload from being retried forever on
      // every mount; the user can make a fresh bounded selection instead.
      try {
        localStorage.removeItem(
          typeof userId === 'string' ? selectedDocumentsKey(userId) : SELECTED_DOCS_KEY,
        )
      } catch {
        // A storage failure must not prevent the in-memory selection from
        // starting empty.
      }
      return new Set()
    }
    return new Set(parsed.map(String))
  } catch {
    return new Set()
  }
}

export function persistSelection(ids: Set<string>, userId?: string | null) {
  // There is no safe owner to write against until authentication resolves.
  if (userId === null) return
  try {
    const key = typeof userId === 'string' ? selectedDocumentsKey(userId) : SELECTED_DOCS_KEY
    if (ids.size > MAX_EXPLICIT_SELECTION) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    // Storage can be unavailable (private browsing) or full. Selection still
    // lives in React state, so persistence is best effort and must never make
    // checking a document crash the composer.
  }
}

export function loadPersistedExpandedFolders(): Set<number> {
  return new Set(readJsonArray(EXPANDED_FOLDERS_KEY).map((v) => Number.parseInt(v, 10)).filter(Number.isFinite))
}

export function persistExpandedFolders(ids: Set<number>) {
  try {
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...ids].map(String)))
  } catch {
    // Best-effort preference only; a storage failure must not break browsing.
  }
}

export function loadPersistedActiveFolder(): number | null {
  return readJsonNumber(ACTIVE_FOLDER_KEY)
}

export function persistActiveFolder(folderId: number | null) {
  try {
    if (folderId == null) {
      localStorage.removeItem(ACTIVE_FOLDER_KEY)
    } else {
      localStorage.setItem(ACTIVE_FOLDER_KEY, String(folderId))
    }
  } catch {
    // Best-effort preference only; a storage failure must not break browsing.
  }
}

export function clearBrowsePersistence() {
  try {
    localStorage.removeItem(SELECTED_DOCS_KEY)
    localStorage.removeItem(EXPANDED_FOLDERS_KEY)
    localStorage.removeItem(ACTIVE_FOLDER_KEY)
  } catch {
    // Storage may be unavailable; there is nothing else to clear locally.
  }
}
