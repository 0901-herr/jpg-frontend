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

export function loadPersistedSelection(): Set<string> {
  return new Set(readJsonArray(SELECTED_DOCS_KEY))
}

export function persistSelection(ids: Set<string>) {
  localStorage.setItem(SELECTED_DOCS_KEY, JSON.stringify([...ids]))
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
