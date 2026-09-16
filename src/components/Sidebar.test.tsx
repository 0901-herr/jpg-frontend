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

vi.mock('../config/features', () => ({ FEATURES: { categoryView: false, chatSharing: true } }))

// FolderSidebar pulls in the browse/category hooks and api client — out of
// scope for a header-branding test, so it's stubbed out. Renders its
// `disabled` prop as a data attribute so Sidebar's own wiring of that prop
// (based on whether the active chat is shared) can be asserted here.
vi.mock('./FolderSidebar', () => ({
  default: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="folder-sidebar-stub" data-disabled={String(Boolean(disabled))} />
  ),
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

describe('Sidebar — project grouping', () => {
  function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
    return render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[
            { id: 'c1', title: 'Chat A', messages: [], projectId: 'p1' },
            { id: 'c2', title: 'Chat B', messages: [], projectId: null },
          ]}
          projects={[{ id: 'p1', name: 'Research' }]}
          activeChatId="c1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
          onMoveChat={vi.fn()}
          onCreateProject={vi.fn()}
          {...overrides}
        />
      </MemoryRouter>,
    )
  }

  it('groups a chat under its project, with a count, and leaves an unassigned chat outside it', () => {
    renderSidebar()

    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Chat A')).toBeInTheDocument()
    expect(screen.getByText('Chat B')).toBeInTheDocument()
  })

  it('collapses and re-expands a project group', async () => {
    const user = userEvent.setup()
    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Collapse project' }))
    expect(screen.queryByText('Chat A')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand project' }))
    expect(screen.getByText('Chat A')).toBeInTheDocument()
  })

  it('creates a project through the "New project" affordance', async () => {
    const user = userEvent.setup()
    const onCreateProject = vi.fn()
    renderSidebar({ onCreateProject })

    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.type(screen.getByPlaceholderText('Project name'), 'Legal{Enter}')

    expect(onCreateProject).toHaveBeenCalledWith('Legal')
  })

  it('moves a chat to a project via its options menu', async () => {
    const user = userEvent.setup()
    const onMoveChat = vi.fn()
    renderSidebar({ onMoveChat })

    const optionButtons = screen.getAllByRole('button', { name: 'Chat options' })
    await user.click(optionButtons[1]) // Chat B, the ungrouped one
    await user.hover(screen.getByText('Move to'))
    await user.click(await screen.findByRole('menuitem', { name: 'Research' }))

    expect(onMoveChat).toHaveBeenCalledWith('c2', 'p1')
  })

  it('shows the Shared group with a "by <owner>" subtitle, and hides the options menu for it', () => {
    renderSidebar({
      sharedSessions: [
        {
          id: 's1',
          title: 'Shared chat',
          messages: [],
          isOwner: false,
          ownerUsername: 'alice',
        },
      ],
    })

    expect(screen.getByText('Shared')).toBeInTheDocument()
    expect(screen.getByText('Shared chat')).toBeInTheDocument()
    expect(screen.getByText('by alice')).toBeInTheDocument()
    // Two owned chats (Chat A, Chat B) get an options button; the shared
    // row doesn't.
    expect(screen.getAllByRole('button', { name: 'Chat options' })).toHaveLength(2)
  })

  it('does not show the Shared group when there are no shared chats', () => {
    renderSidebar({ sharedSessions: [] })
    expect(screen.queryByText('Shared')).not.toBeInTheDocument()
  })
})

describe('Sidebar — share modal', () => {
  function renderSidebar(onShareChat = vi.fn().mockResolvedValue(undefined)) {
    return render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[{ id: 'c1', title: 'Chat A', messages: [], visibility: 'private' }]}
          activeChatId="c1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
          onShareChat={onShareChat}
        />
      </MemoryRouter>,
    )
  }

  it('opens the share modal from the options menu and changes visibility', async () => {
    const user = userEvent.setup()
    const onShareChat = vi.fn().mockResolvedValue(undefined)
    renderSidebar(onShareChat)

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Share'))

    expect(screen.getByText('Share this chat')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Anyone with the link can view'))

    expect(onShareChat).toHaveBeenCalledWith('c1', 'view')
  })
})

describe('Sidebar — Files pane disabled for a shared chat', () => {
  function renderSidebar(activeChatId: string) {
    return render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[{ id: 'c1', title: 'Chat A', messages: [] }]}
          sharedSessions={[
            { id: 's1', title: 'Shared chat', messages: [], isOwner: false, ownerUsername: 'alice' },
          ]}
          activeChatId={activeChatId}
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
        />
      </MemoryRouter>,
    )
  }

  it('disables FolderSidebar when the active chat is a shared (non-owned) one', () => {
    renderSidebar('s1')
    expect(screen.getByTestId('folder-sidebar-stub')).toHaveAttribute('data-disabled', 'true')
  })

  it('leaves FolderSidebar enabled for the viewer’s own active chat', () => {
    renderSidebar('c1')
    expect(screen.getByTestId('folder-sidebar-stub')).toHaveAttribute('data-disabled', 'false')
  })
})

describe('Sidebar — host revocation ("Stop sharing")', () => {
  function renderSidebar(onShareChat = vi.fn().mockResolvedValue(undefined)) {
    return render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[{ id: 'c1', title: 'Chat A', messages: [], visibility: 'query', shareToken: 'tok-1' }]}
          activeChatId="c1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
          onShareChat={onShareChat}
        />
      </MemoryRouter>,
    )
  }

  it('shows a "Stop sharing" item on the chat row menu only while the chat is shared', async () => {
    const user = userEvent.setup()
    const onShareChat = vi.fn().mockResolvedValue(undefined)
    renderSidebar(onShareChat)

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Stop sharing'))

    expect(onShareChat).toHaveBeenCalledWith('c1', 'private')
  })

  it('never shows "Stop sharing" for a private chat', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[{ id: 'c1', title: 'Chat A', messages: [], visibility: 'private' }]}
          activeChatId="c1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
          onShareChat={vi.fn()}
        />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(screen.queryByText('Stop sharing')).not.toBeInTheDocument()
  })

  it('offers "Stop sharing" from inside the share modal too', async () => {
    const user = userEvent.setup()
    const onShareChat = vi.fn().mockResolvedValue(undefined)
    renderSidebar(onShareChat)

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Share'))
    expect(screen.getByText('Share this chat')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stop sharing' }))

    expect(onShareChat).toHaveBeenCalledWith('c1', 'private')
  })
})

describe('Sidebar — recipient removal ("Remove from my chats")', () => {
  function renderSidebar(onRemoveSharedChat = vi.fn()) {
    return render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[]}
          sharedSessions={[
            { id: 's1', title: 'Shared chat', messages: [], isOwner: false, ownerUsername: 'alice' },
          ]}
          activeChatId="s1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
          onRemoveSharedChat={onRemoveSharedChat}
        />
      </MemoryRouter>,
    )
  }

  it('shows a menu with a single "Remove from my chats" item on a shared row', async () => {
    const user = userEvent.setup()
    const onRemoveSharedChat = vi.fn()
    renderSidebar(onRemoveSharedChat)

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Remove from my chats'))

    expect(onRemoveSharedChat).toHaveBeenCalledWith('s1')
  })

  it('hides the shared row menu entirely when onRemoveSharedChat is not provided', () => {
    render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[]}
          sharedSessions={[
            { id: 's1', title: 'Shared chat', messages: [], isOwner: false, ownerUsername: 'alice' },
          ]}
          activeChatId="s1"
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Chat options' })).not.toBeInTheDocument()
  })
})
