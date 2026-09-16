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
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

export function persistSelection(ids: Set<string>, userId?: string | null) {
  // There is no safe owner to write against until authentication resolves.
  if (userId === null) return
  localStorage.setItem(
    typeof userId === 'string' ? selectedDocumentsKey(userId) : SELECTED_DOCS_KEY,
    JSON.stringify([...ids]),
  )
}

export function loadPersistedExpandedFolders(): Set<number> {
  return new Set(readJsonArray(EXPANDED_FOLDERS_KEY).map((v) => Number.parseInt(v, 10)).filter(Number.isFinite))
}

export function persistExpandedFolders(ids: Set<number>) {
  localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...ids].map(String)))
}

export function loadPersistedActiveFolder(): number | null {
  return readJsonNumber(ACTIVE_FOLDER_KEY)
}

export function persistActiveFolder(folderId: number | null) {
  if (folderId == null) {
    localStorage.removeItem(ACTIVE_FOLDER_KEY)
  } else {
    localStorage.setItem(ACTIVE_FOLDER_KEY, String(folderId))
  }
}

export function clearBrowsePersistence() {
  localStorage.removeItem(SELECTED_DOCS_KEY)
  localStorage.removeItem(EXPANDED_FOLDERS_KEY)
  localStorage.removeItem(ACTIVE_FOLDER_KEY)
}
