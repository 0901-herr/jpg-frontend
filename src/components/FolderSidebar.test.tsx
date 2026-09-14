import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, vi } from 'vitest'
import FolderSidebar from './FolderSidebar'
import * as useBrowseCategoriesModule from '../hooks/useBrowseCategories'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import type { BrowseDocumentItem } from '../api/types/browse'

vi.mock('../hooks/useBrowseCategories')

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
