import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import FolderSidebar from './FolderSidebar'
import * as useBrowseCategoriesModule from '../hooks/useBrowseCategories'
import * as browseApi from '../api/browse'
import { FEATURES } from '../config/features'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import type { BrowseDocumentItem } from '../api/types/browse'
import { useDocumentSelection } from '../hooks/useDocumentSelection'

vi.mock('../hooks/useBrowseCategories')
vi.mock('../api/browse')
// Mutable mock object: individual tests flip `.categoryView` rather than
// re-mocking the module, since every describe block below needs a
// different value and vi.mock's factory only runs once per file.
vi.mock('../config/features', () => ({ FEATURES: { categoryView: true } }))

beforeEach(() => {
  vi.mocked(browseApi.fetchSubtreeDocuments).mockResolvedValue({
    folder: { folder_id: 1, name: 'Root', parent_id: null, has_children: false },
    documents: folderDocuments,
    folder_count: 1,
    truncated: false,
  })
  FEATURES.categoryView = true
})

afterEach(() => {
  FEATURES.categoryView = true
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
    initialLoading: false,
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
      screen.getByText('Categories appear once categorizing finishes for this folder.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No categories yet in this folder.'),
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

  it('keeps the refresh button visible by truncating the section label instead of letting it overflow', () => {
    // 240px matches the documented minimum sidebar width
    // (src/hooks/useResizableWidth.ts) — jsdom doesn't compute real layout,
    // so this is a DOM-structure assertion that the label can shrink/ellipsis
    // and the button never does.
    const { container } = render(
      <div style={{ width: 240 }}>
        <FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />
      </div>,
    )

    // `truncate` must sit on a span around the text run alone, not on the
    // icon+text flex container itself — mixing an icon flex-item with a raw
    // text node under `truncate` is a known CSS gotcha where browsers
    // hard-clip without rendering the ellipsis glyph.
    const textRun = within(container).getByText('Files', { selector: 'span.truncate' })
    expect(textRun.className).toMatch(/truncate/)

    // The label wrapper (icon + text run) — the text run's parent — must
    // still be able to shrink within the header row, and must be distinct
    // from the truncating text-run span itself.
    const labelWrapper = textRun.parentElement as HTMLElement
    expect(labelWrapper).not.toBe(textRun)
    expect(labelWrapper.className).toMatch(/min-w-0/)
    expect(labelWrapper.className).not.toMatch(/\btruncate\b/)

    const refreshButton = screen.getByRole('button', { name: 'Refresh document status' })
    expect(refreshButton.className).toMatch(/shrink-0/)
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

describe('FolderSidebar with the category-view flag off', () => {
  beforeEach(() => {
    FEATURES.categoryView = false
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockClear()
  })

  it('renders no Folder/Category toggle', async () => {
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)
    await screen.findByText('contract.pdf')

    expect(screen.queryByRole('tablist', { name: 'Browse view' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Category' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Folder' })).not.toBeInTheDocument()
  })

  it('never calls useBrowseCategories — no network traffic to /browse/categories', async () => {
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)

    await waitFor(() => {
      expect(browseApi.fetchSubtreeDocuments).toHaveBeenCalled()
    })

    expect(useBrowseCategoriesModule.useBrowseCategories).not.toHaveBeenCalled()
    expect(browseApi.fetchBrowseCategories).not.toHaveBeenCalled()
  })

  it('renders no CategoryTag chip on a file row', async () => {
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)

    await waitFor(() => {
      expect(screen.getByText('contract.pdf')).toBeInTheDocument()
    })

    expect(screen.queryByText('Contracts')).not.toBeInTheDocument()
  })

  it('still renders the folder file tree', async () => {
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)

    expect(await screen.findByText('contract.pdf')).toBeInTheDocument()
  })
})

describe('FolderSidebar file row status icon', () => {
  beforeEach(() => {
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockReturnValue({
      serverCategories: null,
      categoriesLoading: false,
    })
  })

  it('shows a coloured status icon with an aria-label and the full filename as a title attribute, no status-text chip', async () => {
    render(<FolderSidebar browse={createBrowseFixture()} selection={createSelectionFixture()} />)

    const filename = await screen.findByText('contract.pdf')
    expect(filename).toHaveAttribute('title', 'contract.pdf')
    expect(filename.className).toContain('text-ellipsis')

    expect(screen.getByRole('img', { name: 'Ready' })).toBeInTheDocument()
    // The old badge's visible status-text chip (e.g. "Ready" as its own
    // span next to the filename) is gone — only the icon's aria-label
    // carries that word now.
    expect(screen.queryByText('Ready')).not.toBeInTheDocument()
  })

  it('shows only the status label + reason in the row tooltip on hover — not the filename (client feedback)', async () => {
    const failedDoc: BrowseDocumentItem = {
      ...folderDocuments[0],
      indexing_status: 'FAILED',
      status_reason: 'Unsupported file format.',
    }
    render(
      <FolderSidebar
        browse={createBrowseFixture({
          cache: new Map([
            [
              1,
              {
                contents: {
                  folder: { folder_id: 1, name: 'Root', parent_id: null, has_children: false },
                  folders: [],
                  documents: [failedDoc],
                  page: 0,
                  has_more_documents: false,
                },
                loadedPages: new Set([0]),
              },
            ],
          ]),
        })}
        selection={createSelectionFixture()}
      />,
    )

    const user = userEvent.setup()
    await user.hover(await screen.findByText('contract.pdf'))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Failed — Unsupported file format.')
    expect(tooltip.textContent).not.toContain('contract.pdf')
    // The filename keeps its own native title attribute — a separate
    // element/mechanism from the antd Tooltip asserted above.
    expect(screen.getByText('contract.pdf')).toHaveAttribute('title', 'contract.pdf')
  })
})

describe('FolderSidebar initial loading', () => {
  beforeEach(() => {
    vi.mocked(useBrowseCategoriesModule.useBrowseCategories).mockReturnValue({
      serverCategories: null,
      categoriesLoading: false,
    })
  })

  it('shows a skeleton instead of the file tree while initialLoading is true, and disables the refresh button', () => {
    render(
      <FolderSidebar
        browse={createBrowseFixture({ isInitializing: true, initialLoading: true })}
        selection={createSelectionFixture()}
      />,
    )

    expect(screen.getByTestId('files-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh document status' })).toBeDisabled()
  })

  it('renders the file tree (no skeleton) once initialLoading turns false', async () => {
    render(
      <FolderSidebar
        browse={createBrowseFixture({ isInitializing: false, initialLoading: false })}
        selection={createSelectionFixture()}
      />,
    )

    expect(screen.queryByTestId('files-skeleton')).not.toBeInTheDocument()
    expect(await screen.findByText('contract.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh document status' })).not.toBeDisabled()
  })
})

describe('FolderSidebar disabled (shared chat, follower view)', () => {
  it('renders a dimmed, non-interactive note instead of the file tree', () => {
    render(
      <FolderSidebar
        browse={createBrowseFixture()}
        selection={createSelectionFixture()}
        disabled
      />,
    )

    expect(
      screen.getByText(
        'Files are chosen by the chat owner. In a shared chat you can only ask about the files they picked.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('tree')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh document status' })).not.toBeInTheDocument()
  })

  it('takes priority over every other state (session expired, loading, etc.)', () => {
    render(
      <FolderSidebar
        browse={createBrowseFixture({ sessionExpired: true })}
        selection={createSelectionFixture()}
        disabled
      />,
    )

    expect(screen.getByText('Files are chosen by the chat owner.', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Session expired')).not.toBeInTheDocument()
  })
})
