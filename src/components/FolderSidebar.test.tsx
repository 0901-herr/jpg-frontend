import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, vi } from 'vitest'
import FolderSidebar from './FolderSidebar'
import * as useBrowseCategoriesModule from '../hooks/useBrowseCategories'
import * as browseApi from '../api/browse'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import type { BrowseDocumentItem } from '../api/types/browse'
import { useDocumentSelection } from '../hooks/useDocumentSelection'

vi.mock('../hooks/useBrowseCategories')
vi.mock('../api/browse')

beforeEach(() => {
  vi.mocked(browseApi.fetchSubtreeDocuments).mockResolvedValue({
    folder: { folder_id: 1, name: 'Root', parent_id: null, has_children: false },
    documents: folderDocuments,
    folder_count: 1,
    truncated: false,
  })
})

const folderDocuments: BrowseDocumentItem[] = [
  {
    document_id: 'doc-1',
    filename: 'contract.pdf',
    file_type: 'pdf',
    updated_at: '2026-09-14T00:00:00Z',
    folder_id: 1,
    indexing_status: 'READY',
    rag_document_id: 'rag-1',
    classification_category: 'Contracts',
    queryable: true,
  },
]

function createBrowseFixture(overrides: Partial<BrowseTreeState> = {}): BrowseTreeState {
  return {
    username: 'dev',
    rootFolderId: 1,
    cache: new Map([
      [
        1,
        {
          contents: {
            folder: { folder_id: 1, name: 'Root', parent_id: null, has_children: false },
            folders: [],
            documents: folderDocuments,
            page: 0,
            has_more_documents: false,
          },
          loadedPages: new Set([0]),
        },
      ],
    ]),
    folderMeta: new Map([[1, { name: 'Root', has_children: false, parent_id: null }]]),
    treeSelectData: [],
    activeFolderId: 1,
    activeFolderName: 'Root',
    activeFolderContents: {
      folder: { folder_id: 1, name: 'Root', parent_id: null, has_children: false },
      folders: [],
      documents: folderDocuments,
      page: 0,
      has_more_documents: false,
    },
    isInitializing: false,
    initError: null,
    sessionExpired: false,
    isActiveFolderLoading: false,
    loadingMoreFolderId: null,
    handleSelectFolder: vi.fn(),
    handleLoadTreeData: vi.fn(),
    ensureFolderLoaded: vi.fn(),
    handleLoadMoreDocuments: vi.fn(),
    refreshActiveFolder: vi.fn(),
    refreshDocumentStatuses: vi.fn(),
    applyStatusPatches: vi.fn(),
    ...overrides,
  }
}

function createSelectionFixture(overrides: Partial<DocumentSelection> = {}): DocumentSelection {
  return {
    selectedIds: new Set<string>(),
    selectedCount: 0,
    selectedFilenames: [],
    documentMeta: new Map(),
    registerDocuments: vi.fn(),
    toggleDocument: vi.fn(),
    setSelection: vi.fn(),
    mergeSelection: vi.fn(),
    selectAllSelectable: vi.fn(),
    deselectAllInView: vi.fn(),
    clearSelection: vi.fn(),
    trimSelection: vi.fn(),
    ...overrides,
  }
}

describe('FolderSidebar category note', () => {
  it('shows the not-categorised-yet note under the category selector when categories exist', async () => {
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockReturnValue({
      serverCategories: {
        categories: [{ name: 'Contracts', count: 1 }],
        uncategorized_count: 2,
        accessible_document_ids: ['doc-1'],
        note: null,
      },
      categoriesLoading: false,
    })

    const user = userEvent.setup()
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)

    await user.click(screen.getByRole('tab', { name: 'Category' }))

    expect(
      screen.getByText('2 files are not shown because they have not been categorised yet.'),
    ).toBeInTheDocument()
  })

  it('shows the server-provided note text verbatim when present', async () => {
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockReturnValue({
      serverCategories: {
        categories: [{ name: 'Contracts', count: 1 }],
        uncategorized_count: 2,
        accessible_document_ids: ['doc-1'],
        note: 'Some files are still being classified.',
      },
      categoriesLoading: false,
    })

    const user = userEvent.setup()
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)

    await user.click(screen.getByRole('tab', { name: 'Category' }))

    expect(screen.getByText('Some files are still being classified.')).toBeInTheDocument()
  })

  it('shows the note exactly once alongside the empty-category caption when there are no categories', async () => {
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockReturnValue({
      serverCategories: {
        categories: [],
        uncategorized_count: 1,
        accessible_document_ids: ['doc-1'],
        note: null,
      },
      categoriesLoading: false,
    })

    const user = userEvent.setup()
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)

    await user.click(screen.getByRole('tab', { name: 'Category' }))

    expect(
      screen.getByText('1 file is not shown because it has not been categorised yet.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Categories appear after ingestion classification completes.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No classification categories in this folder yet.'),
    ).toBeInTheDocument()
  })
})

describe('FolderSidebar manual status refresh', () => {
  beforeEach(() => {
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockReturnValue({
      serverCategories: null,
      categoriesLoading: false,
    })
  })

  it('re-fetches document status when the refresh button is clicked', async () => {
    const refreshDocumentStatuses = vi.fn()
    const user = userEvent.setup()
    render(
      <FolderSidebar
        browse={createBrowseFixture({ refreshDocumentStatuses })}
        selection={createSelectionFixture()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Refresh document status' })
    await user.click(button)

    expect(refreshDocumentStatuses).toHaveBeenCalledTimes(1)
  })

  it('shows a tooltip on hover', async () => {
    const user = userEvent.setup()
    render(
      <FolderSidebar
        browse={createBrowseFixture({ refreshDocumentStatuses: vi.fn() })}
        selection={createSelectionFixture()}
      />,
    )

    await user.hover(screen.getByRole('button', { name: 'Refresh document status' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Refresh document status')
  })
})

describe('FolderSidebar file tree checkbox', () => {
  // Root (1) holds contract.pdf (doc-1); Sub (2) holds notes.pdf (doc-2);
  // Empty (3) holds nothing. Every folder is already loaded (expanded
  // once), so its rows can be rendered by expanding it in the test.
  const doc2: BrowseDocumentItem = {
    ...folderDocuments[0],
    document_id: 'doc-2',
    filename: 'notes.pdf',
    folder_id: 2,
  }
  const folderNode = (folder_id: number, name: string, parent_id: number | null) => ({
    folder_id,
    name,
    parent_id,
    // Child folders are always reported expandable by the adapter (their
    // own children are unknown without a fetch).
    has_children: true,
  })
  const entry = (
    folder: ReturnType<typeof folderNode>,
    folders: ReturnType<typeof folderNode>[],
    documents: BrowseDocumentItem[],
  ) => ({
    contents: { folder, folders, documents, page: 0, has_more_documents: false },
    loadedPages: new Set([0]),
  })
  const subtreeByFolder: Record<number, BrowseDocumentItem[]> = {
    1: [folderDocuments[0], doc2],
    2: [doc2],
    3: [],
  }

  function Harness({ browse }: { browse: BrowseTreeState }) {
    const selection = useDocumentSelection()
    return <FolderSidebar browse={browse} selection={selection} />
  }

  const checkboxOf = (label: string) =>
    (screen.getByText(label).closest('.ant-tree-treenode') as HTMLElement).querySelector(
      '.ant-tree-checkbox',
    ) as HTMLElement
  const expand = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
    const row = screen.getByText(label).closest('.ant-tree-treenode') as HTMLElement
    await user.click(row.querySelector('.ant-tree-switcher') as HTMLElement)
  }

  let browse: BrowseTreeState

  beforeEach(() => {
    window.localStorage.clear()
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockReturnValue({
      serverCategories: null,
      categoriesLoading: false,
    })
    vi.mocked(browseApi.fetchSubtreeDocuments).mockImplementation(async (folderId: number) => ({
      folder: folderNode(folderId, `Folder ${folderId}`, folderId === 1 ? null : 1),
      documents: subtreeByFolder[folderId] ?? [],
      folder_count: 1,
      truncated: false,
    }))
    const root = folderNode(1, 'Root', null)
    const sub = folderNode(2, 'Sub', 1)
    const empty = folderNode(3, 'Empty', 1)
    browse = createBrowseFixture({
      cache: new Map([
        [1, entry(root, [sub, empty], [folderDocuments[0]])],
        [2, entry(sub, [], [doc2])],
        [3, entry(empty, [], [])],
      ]),
      folderMeta: new Map([
        [1, { name: 'Root', has_children: true, parent_id: null }],
        [2, { name: 'Sub', has_children: true, parent_id: 1 }],
        [3, { name: 'Empty', has_children: true, parent_id: 1 }],
      ]),
    })
  })

  it('ticks a collapsed folder as soon as its checkbox is clicked and keeps it ticked', async () => {
    const user = userEvent.setup()
    render(<Harness browse={browse} />)

    await user.click(checkboxOf('Sub'))

    expect(browseApi.fetchSubtreeDocuments).toHaveBeenCalledWith(2)
    await waitFor(() => {
      expect(checkboxOf('Sub')).toHaveClass('ant-tree-checkbox-checked')
    })
    await expand(user, 'Sub')
    expect(checkboxOf('notes.pdf')).toHaveClass('ant-tree-checkbox-checked')
    // Root now has one of its two files selected.
    expect(checkboxOf('Root')).toHaveClass('ant-tree-checkbox-indeterminate')
  })

  it('ticks every folder beneath the root when the root is ticked, and greys out an empty folder', async () => {
    const user = userEvent.setup()
    render(<Harness browse={browse} />)

    await user.click(checkboxOf('Root'))

    await waitFor(() => {
      expect(checkboxOf('Root')).toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('Sub')).toHaveClass('ant-tree-checkbox-checked')
    })
    expect(checkboxOf('contract.pdf')).toHaveClass('ant-tree-checkbox-checked')
    await waitFor(() => {
      expect(checkboxOf('Empty')).toHaveClass('ant-tree-checkbox-disabled')
    })
    expect(checkboxOf('Empty')).not.toHaveClass('ant-tree-checkbox-checked')
  })

  it('drops a folder back to half-checked when one of its files is unticked', async () => {
    const user = userEvent.setup()
    render(<Harness browse={browse} />)

    await user.click(checkboxOf('Root'))
    await waitFor(() => {
      expect(checkboxOf('Sub')).toHaveClass('ant-tree-checkbox-checked')
    })
    await expand(user, 'Sub')
    await user.click(checkboxOf('notes.pdf'))

    await waitFor(() => {
      expect(checkboxOf('notes.pdf')).not.toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('Sub')).not.toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('Sub')).not.toHaveClass('ant-tree-checkbox-indeterminate')
      expect(checkboxOf('Root')).toHaveClass('ant-tree-checkbox-indeterminate')
    })
  })

  it('ticks a folder once every file beneath it has been ticked one by one', async () => {
    const user = userEvent.setup()
    render(<Harness browse={browse} />)

    await expand(user, 'Sub')
    await user.click(checkboxOf('contract.pdf'))
    await user.click(checkboxOf('notes.pdf'))

    await waitFor(() => {
      expect(checkboxOf('Sub')).toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('Root')).toHaveClass('ant-tree-checkbox-checked')
    })
  })

  it('unticks every file beneath a folder when the folder is unticked', async () => {
    const user = userEvent.setup()
    render(<Harness browse={browse} />)

    await user.click(checkboxOf('Root'))
    await waitFor(() => {
      expect(checkboxOf('Root')).toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('Sub')).toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('contract.pdf')).toHaveClass('ant-tree-checkbox-checked')
    })
    await user.click(checkboxOf('Root'))

    await waitFor(() => {
      expect(checkboxOf('Root')).not.toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('Sub')).not.toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('contract.pdf')).not.toHaveClass('ant-tree-checkbox-checked')
    })
  })

  it('recovers a folder whose background subtree fetch failed once', async () => {
    let subCalls = 0
    vi.mocked(browseApi.fetchSubtreeDocuments).mockImplementation(async (folderId: number) => {
      if (folderId === 2 && subCalls++ === 0) throw new Error('network')
      return {
        folder: folderNode(folderId, `Folder ${folderId}`, folderId === 1 ? null : 1),
        documents: subtreeByFolder[folderId] ?? [],
        folder_count: 1,
        truncated: false,
      }
    })
    window.localStorage.setItem('docu_selected_documents', JSON.stringify(['doc-1', 'doc-2']))
    render(<Harness browse={browse} />)

    await waitFor(() => {
      expect(checkboxOf('Root')).toHaveClass('ant-tree-checkbox-checked')
      expect(checkboxOf('Sub')).toHaveClass('ant-tree-checkbox-checked')
    })
    expect(subCalls).toBe(2)
  })
})
