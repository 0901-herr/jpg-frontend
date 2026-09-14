import { Alert, Select, Spin, TreeSelect } from 'antd'
import {
  ChatAppsIcon,
  ChatAppsSuffixIcon,
  ChatChevronIcon,
  ChatDescriptionIcon,
  ChatFolderIcon,
  ChatFolderSuffixIcon,
} from '../icons/chat'
import type { AntTreeNodeProps } from 'antd/es/tree'
import { useEffect, useMemo, useState } from 'react'
import { sectionLabel } from '../styles/theme'
import { sidebar, typeColor } from '../styles/typography'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import { useBrowseCategories } from '../hooks/useBrowseCategories'
import {
  extractCategories,
  filterDocumentsByCategory,
  getUncategorizedNote,
  resolveCategorySourceDocuments,
} from '../utils/documentCategories'
import BrowseViewToggle, { type BrowseViewMode } from './BrowseViewToggle'
import DocumentChecklist from './DocumentChecklist'

interface FolderSidebarProps {
  browse: BrowseTreeState
  selection: DocumentSelection
}

export default function FolderSidebar({ browse, selection }: FolderSidebarProps) {
  const [viewMode, setViewMode] = useState<BrowseViewMode>('folder')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const {
    treeSelectData,
    activeFolderId,
    activeFolderName,
    activeFolderContents,
    isInitializing,
    initError,
    sessionExpired,
    isActiveFolderLoading,
    loadingMoreFolderId,
    handleSelectFolder,
    handleLoadTreeData,
    handleLoadMoreDocuments,
    refreshActiveFolder,
  } = browse

  const folderDocuments = activeFolderContents?.documents ?? []

  const { serverCategories, categoriesLoading } = useBrowseCategories(folderDocuments, {
    enabled: viewMode === 'category',
    activeFolderId,
    refreshActiveFolder,
  })

  const categorySourceDocuments = useMemo(
    () => resolveCategorySourceDocuments(folderDocuments),
    [folderDocuments],
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

  useEffect(() => {
    if (viewMode !== 'category') return
    if (categoryOptions.length === 0) {
      setActiveCategory(null)
      return
    }
    if (activeCategory == null || !categoryOptions.some((c) => c.name === activeCategory)) {
      setActiveCategory(categoryOptions[0].name)
    }
  }, [viewMode, categoryOptions, activeCategory])

  const visibleDocuments = useMemo(() => {
    if (viewMode === 'folder') return folderDocuments
    if (activeCategory == null) return []
    return filterDocumentsByCategory(categorySourceDocuments, activeCategory)
  }, [viewMode, folderDocuments, categorySourceDocuments, activeCategory])

  const documentsContextLabel =
    viewMode === 'folder'
      ? activeFolderName
      : activeCategory != null
        ? activeCategory
        : null

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
        message="Could not load folders"
        description={initError}
        className="!text-xs !m-0"
      />
    )
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-3">
      <BrowseViewToggle mode={viewMode} onChange={setViewMode} />

      <div className="shrink-0">
        {viewMode === 'folder' ? (
          <>
            <span className={sectionLabel}>
              <ChatFolderIcon />
              Folder
            </span>
            <TreeSelect
              value={activeFolderId ?? undefined}
              treeData={treeSelectData}
              placeholder="Select a folder"
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
              loadData={handleLoadTreeData}
              switcherIcon={({ expanded, isLeaf }: AntTreeNodeProps) =>
                isLeaf ? null : (
                  <ChatChevronIcon
                    className={`docu-tree-chevron${expanded ? ' expanded' : ''}`}
                    aria-hidden
                  />
                )
              }
              onChange={(value) => {
                const folderId = Number(value)
                if (Number.isFinite(folderId)) void handleSelectFolder(folderId)
              }}
              suffixIcon={<ChatFolderSuffixIcon className="text-[#8e8e8e] text-sm" />}
              className="w-full docu-sidebar-select"
              popupMatchSelectWidth={false}
              classNames={{ popup: { root: 'docu-folder-tree-popup' } }}
              styles={{ popup: { root: { maxHeight: 320, overflow: 'auto' } } }}
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <div className="flex flex-col min-h-0 flex-1 gap-1.5 pt-4">
        <div className="flex items-center justify-between shrink-0 gap-2">
          <span className={`${sectionLabel} !mb-0`}>
            <ChatDescriptionIcon />
            Documents
          </span>
          {documentsContextLabel && (
            <span
              className={`${sidebar.caption} ${typeColor.muted} truncate max-w-[45%]`}
              title={documentsContextLabel}
            >
              {documentsContextLabel}
            </span>
          )}
        </div>
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto -mx-2.5 px-2.5">
          {viewMode === 'category' && categoryOptions.length === 0 ? (
            <div className="flex h-full min-h-[80px] items-center justify-center px-3 text-center">
              <span className={`${sidebar.caption} ${typeColor.muted}`}>
                Categories appear after ingestion classification completes.
              </span>
            </div>
          ) : (
            <DocumentChecklist
              documents={visibleDocuments}
              selectedIds={selection.selectedIds}
              isLoading={
                (viewMode === 'folder' && isActiveFolderLoading) ||
                (viewMode === 'category' && categoriesLoading)
              }
              hasMore={viewMode === 'folder' && activeFolderContents?.has_more_documents}
              isLoadingMore={loadingMoreFolderId === activeFolderId}
              onToggle={selection.toggleDocument}
              onSelectAll={() =>
                selection.selectAllSelectable(visibleDocuments, {
                  replace: true,
                })
              }
              onDeselectAll={() => selection.deselectAllInView(visibleDocuments)}
              onLoadMore={viewMode === 'folder' ? () => void handleLoadMoreDocuments() : undefined}
            />
          )}
        </div>
      </div>
    </div>
  )
}
