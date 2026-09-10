import { FileTextOutlined, FolderOpenOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, Select, Spin, TreeSelect } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { AntTreeNodeProps } from 'antd/es/tree'
import { sectionLabel } from '../styles/theme'
import { sidebar, typeColor } from '../styles/typography'
import { formatCategoryLabel } from '../utils/classification'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import DocumentChecklist from './DocumentChecklist'

interface FolderSidebarProps {
  browse: BrowseTreeState
  selection: DocumentSelection
}

export default function FolderSidebar({ browse, selection }: FolderSidebarProps) {
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
  } = browse

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const allDocuments = activeFolderContents?.documents ?? []

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const doc of allDocuments) {
      const key = doc.classification_category ?? 'uncategorized'
      if (!seen.has(key)) seen.set(key, formatCategoryLabel(doc.classification_category))
    }
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [allDocuments])

  const filteredDocuments = useMemo(() => {
    if (!categoryFilter) return allDocuments
    return allDocuments.filter(
      (doc) => (doc.classification_category ?? 'uncategorized') === categoryFilter,
    )
  }, [allDocuments, categoryFilter])

  useEffect(() => {
    setCategoryFilter(null)
  }, [activeFolderId])

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
      <div className="shrink-0">
        <span className={sectionLabel}>
          <FolderOpenOutlined className="text-[14px]" />
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
              <RightOutlined
                className={`docu-tree-chevron${expanded ? ' expanded' : ''}`}
                aria-hidden
              />
            )
          }
          onChange={(value) => {
            const folderId = Number(value)
            if (Number.isFinite(folderId)) void handleSelectFolder(folderId)
          }}
          suffixIcon={<FolderOpenOutlined className="text-[#8e8e8e] text-sm" />}
          className="w-full docu-sidebar-select"
          popupMatchSelectWidth={false}
          classNames={{ popup: { root: 'docu-folder-tree-popup' } }}
          styles={{ popup: { root: { maxHeight: 320, overflow: 'auto' } } }}
        />
      </div>

      <div className="flex flex-col min-h-0 flex-1 gap-1.5 pt-4">
        <div className="flex items-center justify-between shrink-0 gap-2">
          <span className={`${sectionLabel} !mb-0`}>
            <FileTextOutlined className="text-[14px]" />
            Documents
          </span>
          {activeFolderName && (
            <span
              className={`${sidebar.caption} ${typeColor.muted} truncate max-w-[45%]`}
              title={activeFolderName}
            >
              {activeFolderName}
            </span>
          )}
        </div>
        {categoryOptions.length > 1 && (
          <Select
            allowClear
            placeholder="All categories"
            value={categoryFilter ?? undefined}
            onChange={(value) => setCategoryFilter(value ?? null)}
            options={categoryOptions}
            size="small"
            className="w-full shrink-0"
          />
        )}
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto -mx-3 px-3">
          <DocumentChecklist
            documents={filteredDocuments}
            selectedIds={selection.selectedIds}
            isLoading={isActiveFolderLoading}
            hasMore={activeFolderContents?.has_more_documents}
            isLoadingMore={loadingMoreFolderId === activeFolderId}
            onToggle={selection.toggleDocument}
            onSelectAll={() =>
              selection.selectAllSelectable(filteredDocuments, {
                replace: true,
              })
            }
            onDeselectAll={() => selection.deselectAllInView(filteredDocuments)}
            onLoadMore={() => void handleLoadMoreDocuments()}
          />
        </div>
      </div>
    </div>
  )
}
