import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { vi } from 'vitest'
import Sidebar from './Sidebar'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ session: { userId: 'user-1', username: 'tester' }, logout: vi.fn() }),
}))

// FolderSidebar pulls in the browse/category hooks and api client — out of
// scope for a header-branding test, so it's stubbed out.
vi.mock('./FolderSidebar', () => ({
  default: () => <div data-testid="folder-sidebar-stub" />,
}))

function browseFixture(): BrowseTreeState {
  return {
    username: 'tester',
    rootFolderId: null,
    cache: new Map(),
    folderMeta: new Map(),
    treeSelectData: [],
    activeFolderId: null,
    activeFolderName: null,
    activeFolderContents: null,
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
  }
}

function selectionFixture(): DocumentSelection {
  return {
    selectedIds: new Set(),
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
  }
}

describe('Sidebar branding', () => {
  it('shows "ARCHE AI" as the app name in the header, not the old "Docu Arch AI" name', () => {
    render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[]}
          activeChatId=""
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('ARCHE AI')).toBeInTheDocument()
    expect(screen.queryByText('Docu Arch AI')).not.toBeInTheDocument()
  })
})
