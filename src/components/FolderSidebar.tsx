import { Alert, message, Select, Spin, Tooltip, Tree } from 'antd'
import {
  ChatAppsIcon,
  ChatAppsSuffixIcon,
  ChatChevronIcon,
  ChatDescriptionIcon,
  ChatFolderIcon,
  ChatRefreshIcon,
} from '../icons/chat'
import type { AntTreeNodeProps, DataNode, TreeProps } from 'antd/es/tree'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sectionLabel } from '../styles/theme'
import { sidebar, typeColor } from '../styles/typography'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import { useBrowseCategories } from '../hooks/useBrowseCategories'
import { fetchSubtreeDocuments } from '../api/browse'
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
import IndexingStatusBadge, {
  getDocumentSelectionHint,
  getSelectableDocumentIds,
  isDocumentSelectable,
} from './IndexingStatusBadge'

interface FolderSidebarProps {
  browse: BrowseTreeState
  selection: DocumentSelection
}

const FOLDER_KEY_PREFIX = 'folder-'
const DOC_KEY_PREFIX = 'doc-'

type TreeCheckInfo = Parameters<NonNullable<TreeProps<DataNode>['onCheck']>>[1]

function switcherIcon({ expanded, isLeaf }: AntTreeNodeProps) {
  return isLeaf ? null : (
    <ChatChevronIcon
      className={`docu-tree-chevron${expanded ? ' expanded' : ''}`}
      aria-hidden
    />
  )
}

export default function FolderSidebar({ browse, selection }: FolderSidebarProps) {
  const [viewMode, setViewMode] = useState<BrowseViewMode>('folder')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const {
    rootFolderId,
    cache,
    folderMeta,
    isInitializing,
    initError,
    sessionExpired,
    ensureFolderLoaded,
    refreshDocumentStatuses,
  } = browse

  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false)
  // Caches each checked folder's full recursive document list, so
  // unchecking it (or re-checking it later) never needs a second network
  // round trip for the same subtree.
  const subtreeCacheRef = useRef<Map<number, BrowseDocumentItem[]>>(new Map())
  const [pendingFolderIds, setPendingFolderIds] = useState<Set<number>>(new Set())

  const handleRefreshStatus = useCallback(async () => {
    if (isRefreshingStatus) return
    setIsRefreshingStatus(true)
    try {
      await refreshDocumentStatuses()
    } finally {
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
    fetchSubtreeDocuments(rootFolderId)
      .then((response) => {
        if (cancelled) return
        subtreeCacheRef.current.set(rootFolderId, response.documents)
        selection.registerDocuments(response.documents)
        setAllDocuments(response.documents)
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
  }, [viewMode, rootFolderId, selection])

  const { serverCategories, categoriesLoading: serverCategoriesLoading } = useBrowseCategories(
    allDocuments,
    {
      enabled: viewMode === 'category',
      activeFolderId: rootFolderId,
      refreshActiveFolder: browse.refreshActiveFolder,
    },
  )
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

  // Building a doc's tree row: filename + category tag + status badge,
  // matching the flat DocumentChecklist's visual language exactly (same
  // sub-components), just laid out as one Tree node's title instead of a
  // list row.
  const buildDocLeaf = useCallback((doc: BrowseDocumentItem): DataNode => {
    const selectable = isDocumentSelectable(doc.indexing_status, doc.queryable)
    const hint = selectable ? null : getDocumentSelectionHint(doc)
    const row = (
      <span
        className={`docu-document-row-primary flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 ${
          selectable ? '' : 'opacity-45'
        }`}
      >
        <span
          className={`min-w-0 truncate ${sidebar.body} ${typeColor.primary}`}
          title={doc.filename}
        >
          {doc.filename}
        </span>
        <CategoryTag category={doc.classification_category} />
        <IndexingStatusBadge status={doc.indexing_status} statusReason={doc.status_reason} compact />
      </span>
    )
    return {
      key: `${DOC_KEY_PREFIX}${doc.document_id}`,
      title: hint ? (
        <Tooltip title={hint} mouseEnterDelay={0.2}>
          {row}
        </Tooltip>
      ) : (
        row
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
        title: folder.name,
        // Every listed child folder is reported has_children: true (its
        // own children aren't known without a fetch) — always expandable
        // via loadData, same as the previous folder picker.
        isLeaf: !folder.has_children,
        children: buildFolderChildren(folder.folder_id),
      }))
      const docs = entry.contents.documents.map(buildDocLeaf)
      return [...subfolders, ...docs]
    },
    [cache, buildDocLeaf],
  )

  const fileTreeData = useMemo((): DataNode[] => {
    if (rootFolderId == null) return []
    const rootMeta = folderMeta.get(rootFolderId)
    return [
      {
        key: `${FOLDER_KEY_PREFIX}${rootFolderId}`,
        title: rootMeta?.name ?? 'All documents',
        isLeaf: rootMeta ? !rootMeta.has_children : false,
        children: buildFolderChildren(rootFolderId),
      },
    ]
  }, [rootFolderId, folderMeta, buildFolderChildren])

  // Folders bulk-checked via the tree (as opposed to individually-toggled
  // files) — tracked explicitly rather than derived from loaded children,
  // because a collapsed/never-expanded folder has no rendered child nodes
  // for antd to cascade a "checked" state up from: without this, checking
  // a collapsed top-level folder correctly updated the selection in the
  // background but its own checkbox never visibly ticked, which looked
  // like the click had done nothing. checkStrictly (below) makes each
  // folder's checked state exactly this set, independent of its children.
  const [checkedFolderIds, setCheckedFolderIds] = useState<Set<number>>(new Set())

  const checkedKeys = useMemo(
    () => ({
      checked: [
        ...[...selection.selectedIds].map((id) => `${DOC_KEY_PREFIX}${id}`),
        ...[...checkedFolderIds].map((id) => `${FOLDER_KEY_PREFIX}${id}`),
      ],
      halfChecked: [] as string[],
    }),
    [selection.selectedIds, checkedFolderIds],
  )

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
        let docs = subtreeCacheRef.current.get(folderId)
        if (!docs) {
          const response = await fetchSubtreeDocuments(folderId)
          docs = response.documents
          subtreeCacheRef.current.set(folderId, docs)
          if (response.truncated) {
            message.warning(
              'This folder has more files than could be loaded at once — some may be missing from the selection.',
            )
          }
        }
        selection.registerDocuments(docs)
        selection.mergeSelection(getSelectableDocumentIds(docs))
      } catch {
        setFolderChecked(folderId, false)
        message.error('Could not load the files in that folder. Please try again.')
      } finally {
        setFolderPending(folderId, false)
      }
    },
    [selection, setFolderPending, setFolderChecked, ensureFolderLoaded],
  )

  const handleUncheckFolder = useCallback(
    async (folderId: number) => {
      setFolderChecked(folderId, false)
      setFolderPending(folderId, true)
      try {
        let docs = subtreeCacheRef.current.get(folderId)
        if (!docs) {
          const response = await fetchSubtreeDocuments(folderId)
          docs = response.documents
          subtreeCacheRef.current.set(folderId, docs)
        }
        selection.removeSelection(docs.map((doc) => doc.document_id))
      } catch {
        setFolderChecked(folderId, true)
        message.error('Could not update the selection for that folder. Please try again.')
      } finally {
        setFolderPending(folderId, false)
      }
    },
    [selection, setFolderPending, setFolderChecked],
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

  if (sessionExpired) {
    return (
      <Alert
        type="error"
        showIcon
        message="Session expired"
        description="Reopen AI Chat from LogicalDOC to continue."
        className="!text-xs !m-0"
      />
    )
  }

  if (isInitializing) {
    return (
      <div className="flex justify-center py-8">
        <Spin size="small" />
      </div>
    )
  }

  if (initError) {
    return (
      <Alert
        type="warning"
        showIcon
        message={initError.title}
        description={initError.body}
        className="!text-xs !m-0"
      />
    )
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <BrowseViewToggle mode={viewMode} onChange={setViewMode} />

      {viewMode === 'category' && (
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
              No classification categories in this folder yet.
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

      <div className="flex flex-col min-h-0 flex-1 gap-1.5 pt-1">
        <div className="flex items-center justify-between shrink-0 gap-2">
          <span className={`${sectionLabel} !mb-0`}>
            {viewMode === 'folder' ? <ChatFolderIcon /> : <ChatDescriptionIcon />}
            {viewMode === 'folder' ? 'Files' : 'Documents'}
          </span>
          <div className="flex min-w-0 items-center gap-1.5">
            {isTreeBusy && <Spin size="small" />}
            {viewMode === 'folder' && (
              <Tooltip title="Refresh document status" mouseEnterDelay={0.3}>
                <button
                  type="button"
                  aria-label="Refresh document status"
                  onClick={() => void handleRefreshStatus()}
                  disabled={isRefreshingStatus}
                  className="flex shrink-0 items-center justify-center w-6 h-6 rounded-full text-[#8e8e8e] transition-colors hover:bg-[#ececec] hover:text-[#0d0d0d] disabled:opacity-50"
                >
                  <ChatRefreshIcon />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto -mx-2.5 px-2.5">
          {viewMode === 'folder' ? (
            fileTreeData.length === 0 ? (
              <div className="flex h-full min-h-[80px] items-center justify-center">
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
            <div className="flex h-full min-h-[80px] items-center justify-center px-3 text-center">
              <span className={`${sidebar.caption} ${typeColor.muted}`}>
                Categories appear after ingestion classification completes.
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
