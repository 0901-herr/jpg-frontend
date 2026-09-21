import { Alert, App, Select, Skeleton, Spin, Tooltip, Tree } from 'antd'
import {
  ChatAppsIcon,
  ChatAppsSuffixIcon,
  ChatChevronIcon,
  ChatRefreshIcon,
} from '../icons/chat'
import type { AntTreeNodeProps, DataNode, TreeProps } from 'antd/es/tree'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { sectionLabel } from '../styles/theme'
import { sidebar, typeColor } from '../styles/typography'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import { useBrowseCategories } from '../hooks/useBrowseCategories'
import { FEATURES } from '../config/features'
import { fetchDocumentViewUrl, fetchSubtreeDocuments } from '../api/browse'
import type { BrowseDocumentItem } from '../api/types/browse'
import {
  extractCategories,
  filterDocumentsByCategory,
  getUncategorizedNote,
  resolveCategorySourceDocuments,
} from '../utils/documentCategories'
import BrowseViewToggle, { type BrowseViewMode } from './BrowseViewToggle'
import CategoryTag from './CategoryTag'
import DocumentChecklist from './DocumentChecklist'
import {
  getReadinessTooltipExplanation,
  getSelectableDocumentIds,
  isDocumentSelectable,
} from './IndexingStatusBadge'

interface FolderSidebarProps {
  browse: BrowseTreeState
  selection: DocumentSelection
  /** True for a shared chat the viewer doesn't own (owner decision,
   * 2026-09-16): a follower can't choose documents at all, so the whole
   * pane renders as a dimmed, non-interactive note instead of the file
   * tree — takes priority over every other state (session-expired,
   * loading, etc.). */
  disabled?: boolean
}

const FOLDER_KEY_PREFIX = 'folder-'
const DOC_KEY_PREFIX = 'doc-'
const SUBTREE_FETCH_MAX_ATTEMPTS = 3
const SUBTREE_FETCH_RETRY_MS = 5000

type TreeCheckInfo = Parameters<NonNullable<TreeProps<DataNode>['onCheck']>>[1]

function switcherIcon({ expanded, isLeaf }: AntTreeNodeProps) {
  return isLeaf ? null : (
    <ChatChevronIcon
      className={`docu-tree-chevron${expanded ? ' expanded' : ''}`}
      aria-hidden
    />
  )
}

// P2-3 (UI polish pass): a folder row's title has no built-in truncation
// tooltip the way buildDocLeaf's file row does above — a long folder name
// just elides under the antd Tree's own CSS with no way to read the rest.
// Same fix, minus the file row's ready/open-in-LogicalDOC affordances
// (a folder has neither): truncate visually, show the full name on hover.
function buildFolderTitle(name: string) {
  return (
    <Tooltip title={name} mouseEnterDelay={0.2}>
      <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {name}
      </span>
    </Tooltip>
  )
}

export default function FolderSidebar({
  browse,
  selection,
  disabled = false,
}: FolderSidebarProps) {
  // `App.useApp()` rather than the static `message` import from 'antd' —
  // see App.tsx's comment on the `<AntApp>` provider this reads from.
  const { message } = App.useApp()
  const [viewMode, setViewMode] = useState<BrowseViewMode>('folder')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const {
    rootFolderId,
    cache,
    folderMeta,
    initialLoading,
    initError,
    sessionExpired,
    ensureFolderLoaded,
    refreshDocumentStatuses,
  } = browse

  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false)
  // Every rendered folder's full recursive document list (the adapter's
  // subtree endpoint, cached server-side). A folder's checkbox is DERIVED
  // from this list against the current selection — checked when every
  // selectable file beneath it is selected, half-checked when some are,
  // disabled when it holds none — so it stays truthful however the files
  // got selected: via the folder, via an ancestor, or one file at a time.
  // Kept in state (re-renders the derivation) and mirrored in a ref (sync
  // reads inside the async check/uncheck handlers).
  const [subtreeById, setSubtreeById] = useState<Map<number, BrowseDocumentItem[]>>(
    () => new Map(),
  )
  const subtreeCacheRef = useRef<Map<number, BrowseDocumentItem[]>>(new Map())
  const subtreeInflightRef = useRef<Map<number, Promise<BrowseDocumentItem[]>>>(new Map())
  const [pendingFolderIds, setPendingFolderIds] = useState<Set<number>>(new Set())
  // Fallback only: folders the user clicked whose subtree is not known
  // yet (fetch still in flight, or it failed). Ticked optimistically so the
  // click has an immediate visible effect; once the subtree is known the
  // derived state takes over and this entry is ignored. checkStrictly (on
  // the Tree) makes antd render exactly the keys we hand it instead of
  // cascading from rendered children, which a collapsed folder has none of.
  const [checkedFolderIds, setCheckedFolderIds] = useState<Set<number>>(new Set())
  // Bumped a few seconds after a background subtree fetch fails, so the
  // effect below retries it (bounded per folder) instead of leaving that
  // folder's checkbox contradicting its own files until some other click.
  const [subtreeRetryTick, setSubtreeRetryTick] = useState(0)
  const subtreeFailuresRef = useRef<Map<number, number>>(new Map())

  // One fetch per folder, deduplicated while in flight; `truncated`
  // subtrees are still cached (the warning belongs to the caller that
  // bulk-selects, not to the passive derivation).
  const loadSubtree = useCallback(
    (folderId: number, onTruncated?: () => void): Promise<BrowseDocumentItem[]> => {
      const cached = subtreeCacheRef.current.get(folderId)
      if (cached) return Promise.resolve(cached)
      const inflight = subtreeInflightRef.current.get(folderId)
      if (inflight) return inflight
      const promise = fetchSubtreeDocuments(folderId)
        .then((response) => {
          subtreeCacheRef.current.set(folderId, response.documents)
          setSubtreeById((prev) => new Map(prev).set(folderId, response.documents))
          selection.registerDocuments(response.documents)
          if (response.truncated) onTruncated?.()
          return response.documents
        })
        .finally(() => {
          subtreeInflightRef.current.delete(folderId)
        })
      subtreeInflightRef.current.set(folderId, promise)
      return promise
    },
    [selection],
  )

  const handleRefreshStatus = useCallback(async () => {
    if (isRefreshingStatus) return
    setIsRefreshingStatus(true)
    try {
      await refreshDocumentStatuses()
    } finally {
      // Files added or removed since the subtrees were fetched would
      // otherwise keep a folder's derived state stale until a reload. The
      // clicked-folder fallback goes too: it must not resurface as "fully
      // checked" for a folder the user has since partially deselected.
      subtreeCacheRef.current = new Map()
      subtreeFailuresRef.current = new Map()
      setSubtreeById(new Map())
      setCheckedFolderIds(new Set())
      setIsRefreshingStatus(false)
    }
  }, [isRefreshingStatus, refreshDocumentStatuses])

  // Category view groups every document in the tree, not one folder at a
  // time (there's no more single "active folder" now that Files is a
  // unified tree) — reuses the same recursive subtree fetch + cache as
  // checking a folder in the tree, so whichever ran first for the root
  // saves the other a network round trip.
  const [allDocuments, setAllDocuments] = useState<BrowseDocumentItem[]>([])
  const [allDocumentsLoading, setAllDocumentsLoading] = useState(false)

  useEffect(() => {
    if (viewMode !== 'category' || rootFolderId == null) return undefined
    const cached = subtreeCacheRef.current.get(rootFolderId)
    if (cached) {
      setAllDocuments(cached)
      return undefined
    }
    let cancelled = false
    setAllDocumentsLoading(true)
    loadSubtree(rootFolderId)
      .then((docs) => {
        if (!cancelled) setAllDocuments(docs)
      })
      .catch(() => {
        if (!cancelled) message.error('Could not load documents for category view.')
      })
      .finally(() => {
        if (!cancelled) setAllDocumentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [viewMode, rootFolderId, loadSubtree])

  // FEATURES.categoryView is a build-time constant (baked in from
  // VITE_FEATURE_CATEGORY_VIEW at build time, see src/config/features.ts)
  // — it can never change between renders of a running app, so gating the
  // hook call itself on it does not violate the rules of hooks in
  // practice. Doing it this way (rather than always calling the hook with
  // `enabled: false`) is deliberate: the client asked for the whole
  // category feature — including its polling of /browse/categories — to
  // be inert with the flag off, and this is what lets a test assert the
  // hook itself was never invoked.
  const { serverCategories, categoriesLoading: serverCategoriesLoading } =
    FEATURES.categoryView
      ? // eslint-disable-next-line react-hooks/rules-of-hooks -- see comment above
        useBrowseCategories(allDocuments, {
          enabled: viewMode === 'category',
          activeFolderId: rootFolderId,
          refreshActiveFolder: browse.refreshActiveFolder,
        })
      : { serverCategories: null, categoriesLoading: false }
  const categoriesLoading = allDocumentsLoading || serverCategoriesLoading

  const categorySourceDocuments = useMemo(
    () => resolveCategorySourceDocuments(allDocuments),
    [allDocuments],
  )

  const categoryOptions = useMemo(() => {
    if (serverCategories) {
      return serverCategories.categories.map((group) => ({
        name: group.name,
        count: group.count,
      }))
    }
    return extractCategories(categorySourceDocuments)
  }, [serverCategories, categorySourceDocuments])

  const uncategorizedNote = useMemo(
    () => getUncategorizedNote(serverCategories),
    [serverCategories],
  )

  useMemo(() => {
    if (viewMode !== 'category') return
    if (categoryOptions.length === 0) {
      setActiveCategory(null)
      return
    }
    if (activeCategory == null || !categoryOptions.some((c) => c.name === activeCategory)) {
      setActiveCategory(categoryOptions[0].name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, categoryOptions])

  const categoryViewDocuments = useMemo(() => {
    if (activeCategory == null) return []
    return filterDocumentsByCategory(categorySourceDocuments, activeCategory)
  }, [categorySourceDocuments, activeCategory])

  // Per known folder: 'checked' | 'half' | 'none' | 'empty' from the latest
  // status of each file beneath it (documentMeta wins over the fetched copy
  // so a file that became Ready after the fetch counts). 'empty' means no
  // selectable file at all — its checkbox is disabled rather than shown as
  // an unticked box next to a ticked parent.
  const folderCheckStates = useMemo(() => {
    const states = new Map<number, 'checked' | 'half' | 'none' | 'empty'>()
    for (const [folderId, docs] of subtreeById) {
      let selectable = 0
      let selected = 0
      for (const doc of docs) {
        const latest = selection.documentMeta.get(doc.document_id) ?? doc
        if (!isDocumentSelectable(latest.indexing_status, latest.queryable)) continue
        selectable += 1
        if (selection.selectedIds.has(doc.document_id)) selected += 1
      }
      if (selectable === 0) states.set(folderId, 'empty')
      else if (selected === selectable) states.set(folderId, 'checked')
      else if (selected > 0) states.set(folderId, 'half')
      else states.set(folderId, 'none')
    }
    return states
  }, [subtreeById, selection.documentMeta, selection.selectedIds])

  const emptyFolderIds = useMemo(() => {
    const ids = new Set<number>()
    for (const [folderId, state] of folderCheckStates) if (state === 'empty') ids.add(folderId)
    return ids
  }, [folderCheckStates])

  // Building a doc's tree row: the filename fills the line and elides under
  // a long name. Hover shows Ready / Partial / Not ready (with a status
  // dot) above the full name; the tooltip filename underlines and opens
  // LogicalDOC. PARTIAL stays distinct from Ready — the file is queryable
  // but not fully indexed.
  const buildDocLeaf = useCallback((doc: BrowseDocumentItem): DataNode => {
    const selectable = isDocumentSelectable(doc.indexing_status, doc.queryable)
    const readiness =
      doc.indexing_status === 'READY'
        ? 'ready'
        : doc.indexing_status === 'PARTIAL'
          ? 'partial'
          : 'not-ready'
    const readinessLabel =
      readiness === 'ready' ? 'Ready' : readiness === 'partial' ? 'Partial' : 'Not ready'
    const readinessExplanation = getReadinessTooltipExplanation(
      doc.indexing_status,
      doc.status_reason,
    )
    const openFile = async (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      try {
        const url = await fetchDocumentViewUrl(doc.document_id)
        window.open(url, '_blank', 'noopener,noreferrer')
      } catch {
        message.error(`Could not open ${doc.filename}`)
      }
    }
    const row = (
      <span
        className={`docu-document-row-primary flex min-w-0 flex-1 items-center gap-1.5 ${
          selectable ? '' : 'opacity-45'
        }`}
      >
        <span
          className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${sidebar.body} ${typeColor.primary}`}
        >
          {doc.filename}
        </span>
        {FEATURES.categoryView && <CategoryTag category={doc.classification_category} />}
      </span>
    )
    return {
      key: `${DOC_KEY_PREFIX}${doc.document_id}`,
      title: (
        <Tooltip
          title={
            <div className="docu-file-row-tooltip">
              <div
                className={`docu-file-row-tooltip-status docu-file-row-tooltip-status--${readiness}`}
              >
                <span className="docu-file-row-tooltip-dot" aria-hidden />
                {readinessLabel}
              </div>
              <p className="docu-file-row-tooltip-explanation">{readinessExplanation}</p>
              <button
                type="button"
                className="docu-file-row-tooltip-name"
                aria-label={`Open ${doc.filename} in LogicalDOC`}
                onClick={(event) => {
                  void openFile(event)
                }}
              >
                {doc.filename}
              </button>
            </div>
          }
          mouseEnterDelay={0.2}
        >
          {row}
        </Tooltip>
      ),
      isLeaf: true,
      checkable: true,
      disableCheckbox: !selectable,
    }
  }, [])

  const buildFolderChildren = useCallback(
    (folderId: number): DataNode[] | undefined => {
      const entry = cache.get(folderId)
      if (!entry) return undefined
      const subfolders: DataNode[] = entry.contents.folders.map((folder) => ({
        key: `${FOLDER_KEY_PREFIX}${folder.folder_id}`,
        title: buildFolderTitle(folder.name),
        // Every listed child folder is reported has_children: true (its
        // own children aren't known without a fetch) — always expandable
        // via loadData, same as the previous folder picker.
        // A folder whose files are already loaded must stay expandable
        // whatever `has_children` says, or those files could never be seen.
        isLeaf: !folder.has_children && !cache.get(folder.folder_id)?.contents.documents.length,
        disableCheckbox: emptyFolderIds.has(folder.folder_id),
        children: buildFolderChildren(folder.folder_id),
      }))
      const docs = entry.contents.documents.map(buildDocLeaf)
      return [...subfolders, ...docs]
    },
    [cache, buildDocLeaf, emptyFolderIds],
  )

  const fileTreeData = useMemo((): DataNode[] => {
    if (rootFolderId == null) return []
    const rootMeta = folderMeta.get(rootFolderId)
    return [
      {
        key: `${FOLDER_KEY_PREFIX}${rootFolderId}`,
        title: buildFolderTitle(rootMeta?.name ?? 'All documents'),
        isLeaf: rootMeta ? !rootMeta.has_children : false,
        disableCheckbox: emptyFolderIds.has(rootFolderId),
        children: buildFolderChildren(rootFolderId),
      },
    ]
  }, [rootFolderId, folderMeta, buildFolderChildren, emptyFolderIds])

  // Fetch the subtree of every folder the tree currently renders, so each
  // one's checkbox can be derived. Failures are silent here: the folder
  // simply keeps the fallback (clicked) state until a later attempt.
  useEffect(() => {
    if (viewMode !== 'folder') return
    const ids: number[] = []
    const walk = (nodes: DataNode[] | undefined) => {
      for (const node of nodes ?? []) {
        const key = String(node.key)
        if (key.startsWith(FOLDER_KEY_PREFIX)) {
          ids.push(Number(key.slice(FOLDER_KEY_PREFIX.length)))
          walk(node.children)
        }
      }
    }
    walk(fileTreeData)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const id of ids) {
      if (!Number.isFinite(id) || subtreeById.has(id)) continue
      if ((subtreeFailuresRef.current.get(id) ?? 0) >= SUBTREE_FETCH_MAX_ATTEMPTS) continue
      loadSubtree(id).catch(() => {
        subtreeFailuresRef.current.set(id, (subtreeFailuresRef.current.get(id) ?? 0) + 1)
        timers.push(setTimeout(() => setSubtreeRetryTick((t) => t + 1), SUBTREE_FETCH_RETRY_MS))
      })
    }
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [viewMode, fileTreeData, subtreeById, loadSubtree, subtreeRetryTick])

  const checkedKeys = useMemo(() => {
    const checked = [...selection.selectedIds].map((id) => `${DOC_KEY_PREFIX}${id}`)
    const halfChecked: string[] = []
    for (const [folderId, state] of folderCheckStates) {
      if (state === 'checked') checked.push(`${FOLDER_KEY_PREFIX}${folderId}`)
      else if (state === 'half') halfChecked.push(`${FOLDER_KEY_PREFIX}${folderId}`)
    }
    for (const folderId of checkedFolderIds) {
      if (!folderCheckStates.has(folderId)) checked.push(`${FOLDER_KEY_PREFIX}${folderId}`)
    }
    return { checked, halfChecked }
  }, [selection.selectedIds, checkedFolderIds, folderCheckStates])

  const setFolderPending = useCallback((folderId: number, pending: boolean) => {
    setPendingFolderIds((prev) => {
      const next = new Set(prev)
      if (pending) next.add(folderId)
      else next.delete(folderId)
      return next
    })
  }, [])

  const setFolderChecked = useCallback((folderId: number, checked: boolean) => {
    setCheckedFolderIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(folderId)
      else next.delete(folderId)
      return next
    })
  }, [])

  const handleCheckFolder = useCallback(
    async (folderId: number) => {
      // Optimistic: tick the box immediately so the click has visible
      // effect right away, even before the subtree fetch resolves — reverted
      // on failure below.
      setFolderChecked(folderId, true)
      setFolderPending(folderId, true)
      void ensureFolderLoaded(folderId)
      try {
        const docs = await loadSubtree(folderId, () =>
          message.warning(
            'This folder has more files than could be loaded at once — some may be missing from the selection.',
          ),
        )
        const ids = getSelectableDocumentIds(docs)
        if (ids.length === 0) {
          message.info('No files ready yet in this folder.')
        } else {
          selection.mergeSelection(ids)
        }
      } catch {
        setFolderChecked(folderId, false)
        message.error('Could not load the files in that folder. Please try again.')
      } finally {
        setFolderPending(folderId, false)
      }
    },
    [selection, setFolderPending, setFolderChecked, ensureFolderLoaded, loadSubtree],
  )

  const handleUncheckFolder = useCallback(
    async (folderId: number) => {
      setFolderChecked(folderId, false)
      setFolderPending(folderId, true)
      try {
        const docs = await loadSubtree(folderId)
        selection.removeSelection(docs.map((doc) => doc.document_id))
      } catch {
        setFolderChecked(folderId, true)
        message.error('Could not update the selection for that folder. Please try again.')
      } finally {
        setFolderPending(folderId, false)
      }
    },
    [selection, setFolderPending, setFolderChecked, loadSubtree],
  )

  const handleTreeCheck = useCallback(
    (_checkedKeysValue: unknown, info: TreeCheckInfo) => {
      const key = String(info.node.key)
      const checked = info.checked
      if (key.startsWith(DOC_KEY_PREFIX)) {
        selection.toggleDocument(key.slice(DOC_KEY_PREFIX.length), checked)
        return
      }
      if (!key.startsWith(FOLDER_KEY_PREFIX)) return
      const folderId = Number(key.slice(FOLDER_KEY_PREFIX.length))
      if (!Number.isFinite(folderId)) return
      if (checked) {
        void handleCheckFolder(folderId)
      } else {
        void handleUncheckFolder(folderId)
      }
    },
    [selection, handleCheckFolder, handleUncheckFolder],
  )

  const handleTreeLoadData = useCallback(
    async (node: DataNode) => {
      const key = String(node.key)
      if (!key.startsWith(FOLDER_KEY_PREFIX)) return
      const folderId = Number(key.slice(FOLDER_KEY_PREFIX.length))
      await ensureFolderLoaded(folderId)
    },
    [ensureFolderLoaded],
  )

  const isTreeBusy = pendingFolderIds.size > 0

  if (disabled) {
    return (
      <div
        className="flex flex-col gap-2 opacity-50 pointer-events-none select-none"
        aria-disabled="true"
      >
        <span className={sectionLabel}>Files</span>
        <p className={`${sidebar.caption} ${typeColor.muted} m-0 px-1`}>
          Files are chosen by the chat owner. In a shared chat you can only ask
          about the files they picked.
        </p>
      </div>
    )
  }

  if (sessionExpired) {
    return (
      <Alert
        type="error"
        showIcon
        title="Session expired"
        description="Reopen Arche AI from LogicalDOC to continue."
        className="!text-xs !m-0"
      />
    )
  }

  if (initError) {
    return (
      <Alert
        type="warning"
        showIcon
        title={initError.title}
        description={initError.body}
        className="!text-xs !m-0"
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {FEATURES.categoryView && <BrowseViewToggle mode={viewMode} onChange={setViewMode} />}

      {FEATURES.categoryView && viewMode === 'category' && (
        <div className="shrink-0">
          <span className={sectionLabel}>
            <ChatAppsIcon />
            Category
          </span>
          {categoriesLoading ? (
            <div className="flex justify-center py-2">
              <Spin size="small" />
            </div>
          ) : categoryOptions.length === 0 ? (
            <p className={`${sidebar.caption} ${typeColor.muted} px-1 py-2 m-0`}>
              No categories yet in this folder.
            </p>
          ) : (
            <Select
              value={activeCategory ?? undefined}
              placeholder="Select a category"
              options={categoryOptions.map((option) => ({
                value: option.name,
                label: `${option.name} (${option.count})`,
              }))}
              onChange={(value) => setActiveCategory(String(value))}
              suffixIcon={<ChatAppsSuffixIcon className="text-[#8e8e8e] text-sm" />}
              className="w-full docu-sidebar-select"
              popupMatchSelectWidth
            />
          )}
          {uncategorizedNote != null && (
            <p className={`${sidebar.caption} ${typeColor.muted} px-1 pt-1 m-0`}>
              {uncategorizedNote}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between shrink-0 gap-2">
          <span className={`${sectionLabel} !mb-0 min-w-0 flex-1 truncate`}>
            {viewMode === 'folder' ? 'Files' : 'Documents'}
          </span>
          <div className="flex min-w-0 items-center gap-1.5 shrink-0">
            {isTreeBusy && <Spin size="small" />}
            {viewMode === 'folder' && (
              <Tooltip title="Refresh document status" mouseEnterDelay={0.3}>
                <button
                  type="button"
                  aria-label="Refresh document status"
                  onClick={() => void handleRefreshStatus()}
                  disabled={isRefreshingStatus || initialLoading}
                  className="flex shrink-0 items-center justify-center w-7 h-7 rounded-full !text-[#8e8e8e] transition-colors hover:!text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0084ff]/35 disabled:opacity-50"
                >
                  <ChatRefreshIcon sx={{ fontSize: 18, color: 'currentColor' }} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        {/* No local overflow — parent sidebar scrolls Files + Chats together. */}
        <div className="flex flex-col -mx-2.5 px-2.5">
          {viewMode === 'folder' ? (
            initialLoading ? (
              <div data-testid="files-skeleton" className="px-3 py-2">
                <Skeleton active paragraph={{ rows: 4 }} title={false} />
              </div>
            ) : fileTreeData.length === 0 ? (
              <div className="flex min-h-[80px] items-center justify-center">
                <Spin size="small" />
              </div>
            ) : (
              <Tree
                checkable
                checkStrictly
                selectable={false}
                multiple
                treeData={fileTreeData}
                checkedKeys={checkedKeys}
                onCheck={handleTreeCheck}
                loadData={handleTreeLoadData}
                defaultExpandedKeys={
                  rootFolderId != null ? [`${FOLDER_KEY_PREFIX}${rootFolderId}`] : []
                }
                switcherIcon={switcherIcon}
                className="docu-file-tree w-full"
              />
            )
          ) : categoryOptions.length === 0 ? (
            <div className="flex min-h-[80px] items-center justify-center px-3 text-center">
              <span className={`${sidebar.caption} ${typeColor.muted}`}>
                Categories appear once categorizing finishes for this folder.
              </span>
            </div>
          ) : (
            <DocumentChecklist
              documents={categoryViewDocuments}
              selectedIds={selection.selectedIds}
              isLoading={categoriesLoading}
              onToggle={selection.toggleDocument}
              onSelectAll={() =>
                selection.selectAllSelectable(categoryViewDocuments, { replace: true })
              }
              onDeselectAll={() => selection.deselectAllInView(categoryViewDocuments)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
