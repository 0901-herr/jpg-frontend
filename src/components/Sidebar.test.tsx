import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('Sidebar — onNavigate (mobile Drawer close)', () => {
  function renderSidebar(onNavigate?: () => void) {
    return render(
      <MemoryRouter>
        <Sidebar
          width="100%"
          sessions={[{ id: 'chat-1', title: 'Session 15 Sep 2026 (1)', messages: [] }]}
          activeChatId="chat-1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
          onNavigate={onNavigate}
        />
      </MemoryRouter>,
    )
  }

  it('calls onNavigate after selecting a chat', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    renderSidebar(onNavigate)

    await user.click(screen.getByText('Session 15 Sep 2026 (1)'))

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('calls onNavigate after New chat', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    renderSidebar(onNavigate)

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('does not require onNavigate — desktop usage is unaffected', async () => {
    const user = userEvent.setup()
    const onSelectChat = vi.fn()
    render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[{ id: 'chat-1', title: 'Session 15 Sep 2026 (1)', messages: [] }]}
          activeChatId="chat-1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={onSelectChat}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByText('Session 15 Sep 2026 (1)'))
    expect(onSelectChat).toHaveBeenCalledWith('chat-1')
  })
})
