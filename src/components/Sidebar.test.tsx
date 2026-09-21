import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'
import { vi } from 'vitest'
import Sidebar, { sortChatsNewestFirst } from './Sidebar'
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
  default: ({
    disabled,
    sharedScopeDocuments,
  }: {
    disabled?: boolean
    sharedScopeDocuments?: { documentId: string; filename: string | null }[]
  }) => (
    <div
      data-testid="folder-sidebar-stub"
      data-disabled={String(Boolean(disabled))}
      data-shared-scope-count={String(sharedScopeDocuments?.length ?? 0)}
    />
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
  it('shows "Arche AI" as the app name in the header, not the old "Docu Arch AI" name', () => {
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

    expect(screen.getByText('Arche AI')).toBeInTheDocument()
    expect(screen.queryByText('Docu Arch AI')).not.toBeInTheDocument()
  })
})

describe('Sidebar — chat ordering', () => {
  it('sorts dated chats newest first while keeping legacy undated chats at the end', async () => {
    const newest = { id: 'newest', title: 'Newest', messages: [], createdAt: '2026-09-17T08:00:00Z' }
    const oldest = { id: 'oldest', title: 'Oldest', messages: [], createdAt: '2026-09-15T08:00:00Z' }
    const legacy = { id: 'legacy', title: 'Legacy', messages: [] }

    expect(sortChatsNewestFirst([oldest, legacy, newest]).map((chat) => chat.id)).toEqual([
      'newest',
      'oldest',
      'legacy',
    ])
  })

  it('keeps creation order for chats with identical timestamps', async () => {
    const first = { id: 'first', title: 'First', messages: [], createdAt: '2026-09-17T08:00:00Z' }
    const second = { id: 'second', title: 'Second', messages: [], createdAt: '2026-09-17T08:00:00Z' }

    expect(sortChatsNewestFirst([first, second]).map((chat) => chat.id)).toEqual(['first', 'second'])
  })
})

describe('Sidebar — chat list loading', () => {
  it('shows a compact loading state instead of temporary chat rows while sessions hydrate', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[{ id: 'temporary', title: 'Temporary chat', messages: [] }]}
          activeChatId="temporary"
          isLoading
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
          onCreateProject={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('status', { name: 'Loading chats' })).toBeInTheDocument()
    expect(screen.queryByText('Temporary chat')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled()
  })
})

describe('Sidebar — onNavigate (mobile Drawer close)', () => {
  async function renderSidebar(onNavigate?: () => void) {
    const view = render(
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
    return view
  }

  it('calls onNavigate after selecting a chat', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    await renderSidebar(onNavigate)

    await user.click(screen.getByText('Session 15 Sep 2026 (1)'))

    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it('calls onNavigate after New chat', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    await renderSidebar(onNavigate)

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
  async function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
    const view = render(
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
    return view
  }

  it('groups a chat under its project, with a count, and leaves an unassigned chat outside it', async () => {
    await renderSidebar()

    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Chats')).toBeInTheDocument()
    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Chat A')).toBeInTheDocument()
    expect(screen.getByText('Chat B')).toBeInTheDocument()
  })

  it('collapses and re-expands a project group', async () => {
    const user = userEvent.setup()
    await renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Collapse project' }))
    expect(screen.queryByText('Chat A')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand project' }))
    expect(screen.getByText('Chat A')).toBeInTheDocument()
  })

  it('creates a project through the "New project" affordance', async () => {
    const user = userEvent.setup()
    const onCreateProject = vi.fn()
    await renderSidebar({ onCreateProject })

    await user.click(screen.getByRole('button', { name: 'New project' }))
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Project name'), 'Legal{Enter}')

    expect(onCreateProject).toHaveBeenCalledWith('Legal')
  })

  it('moves a chat to a project via its options menu', async () => {
    const user = userEvent.setup()
    const onMoveChat = vi.fn()
    await renderSidebar({ onMoveChat })

    const optionButtons = screen.getAllByRole('button', { name: 'Chat options' })
    await user.click(optionButtons[1]) // Chat B, the ungrouped one
    await user.hover(screen.getByText('Move to'))
    await user.click(await screen.findByRole('menuitem', { name: 'Research' }))

    expect(onMoveChat).toHaveBeenCalledWith('c2', 'p1')
  })

  it('shows the Shared group with a "by <owner>" subtitle, and hides the options menu for it', async () => {
    await renderSidebar({
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
    // ChatListItem.tsx renders the subtitle with a middot separator
    // (`<span> · {subtitle}</span>`) — the rendered text is "· by alice",
    // not the bare "by alice" this assertion used to look for.
    expect(screen.getByText('· by alice')).toBeInTheDocument()
    // Two owned chats (Chat A, Chat B) get an options button; the shared
    // row doesn't.
    expect(screen.getAllByRole('button', { name: 'Chat options' })).toHaveLength(2)
  })

  it('does not show the Shared group when there are no shared chats', async () => {
    await renderSidebar({ sharedSessions: [] })
    expect(screen.queryByText('Shared')).not.toBeInTheDocument()
  })

  it('shows the "New project" button with a tooltip clarifying its purpose', async () => {
    const user = userEvent.setup()
    await renderSidebar()

    await user.hover(screen.getByRole('button', { name: 'New project' }))

    expect(await screen.findByRole('tooltip', { name: 'New project' })).toBeInTheDocument()
  })

  it('warns the real chat count will be permanently deleted when deleting a project with chats', async () => {
    const user = userEvent.setup()
    const onDeleteProject = vi.fn()
    await renderSidebar({ onDeleteProject })

    await user.click(screen.getByRole('button', { name: 'Project options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(
      screen.getByText('This will permanently delete 1 chat in this project. This cannot be undone.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/kept — this only removes the project/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDeleteProject).toHaveBeenCalledWith('p1')
  })

  it('shows an empty-project message (no false chat-count claim) when the project has no chats', async () => {
    const user = userEvent.setup()
    await renderSidebar({
      sessions: [{ id: 'c2', title: 'Chat B', messages: [], projectId: null }],
    })

    await user.click(screen.getByRole('button', { name: 'Project options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(
      screen.getByText('This project has no chats. It will be permanently deleted.'),
    ).toBeInTheDocument()
  })

  it('shows a spinner and disables the New project trigger while a create is in flight', async () => {
    const user = userEvent.setup()
    let resolveCreate: () => void
    const onCreateProject = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = () => resolve()
        }),
    )
    await renderSidebar({ onCreateProject })

    await user.click(screen.getByRole('button', { name: 'New project' }))
    await user.type(screen.getByPlaceholderText('Project name'), 'Legal{Enter}')

    expect(screen.getByTestId('create-project-spinner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New project' })).toBeDisabled()

    resolveCreate!()
    await waitFor(() =>
      expect(screen.queryByTestId('create-project-spinner')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'New project' })).not.toBeDisabled()
  })

  it('shows a "Deleting project" spinner near the Projects header while the cascade is in flight', async () => {
    const user = userEvent.setup()
    let resolveDelete: () => void
    const onDeleteProject = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = () => resolve()
        }),
    )
    await renderSidebar({ onDeleteProject })

    await user.click(screen.getByRole('button', { name: 'Project options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDeleteProject).toHaveBeenCalledWith('p1')
    // The confirm modal's `open` prop is already false at this point
    // (unchanged from before this task — antd keeps the closing dialog's
    // markup mounted for its own exit transition, which jsdom doesn't run,
    // so its title text can still be queried here; that's an antd/jsdom
    // quirk unrelated to this task, not asserted on). The pending
    // indicator lives at the Sidebar level instead, precisely because
    // `deleteProject` optimistically removes the project row (and this
    // header) synchronously — a row-local spinner would never be seen.
    expect(screen.getByTestId('delete-project-spinner')).toBeInTheDocument()
    expect(screen.getByText('Deleting project')).toBeInTheDocument()

    resolveDelete!()
    await waitFor(() =>
      expect(screen.queryByTestId('delete-project-spinner')).not.toBeInTheDocument(),
    )
  })

  it('shows a "Deleting chat" spinner near the Chats header while a chat delete is in flight', async () => {
    const user = userEvent.setup()
    let resolveDelete: () => void
    const onDeleteChat = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = () => resolve()
        }),
    )
    await renderSidebar({ onDeleteChat })

    const optionButtons = screen.getAllByRole('button', { name: 'Chat options' })
    await user.click(optionButtons[0]) // Chat A
    await user.click(screen.getByText('Delete'))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onDeleteChat).toHaveBeenCalledWith('c1')
    // Same reasoning as the project-delete spinner above: `deleteChat`
    // optimistically removes the chat's own row synchronously, so a
    // row-local spinner would never be seen — this indicator lives at
    // the Sidebar level instead.
    expect(screen.getByTestId('delete-chat-spinner')).toBeInTheDocument()
    expect(screen.getByText('Deleting chat')).toBeInTheDocument()

    resolveDelete!()
    await waitFor(() =>
      expect(screen.queryByTestId('delete-chat-spinner')).not.toBeInTheDocument(),
    )
  })

  it('shows a spinner on the row and disables its options button while a move is in flight', async () => {
    const user = userEvent.setup()
    let resolveMove: () => void
    const onMoveChat = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMove = () => resolve()
        }),
    )
    await renderSidebar({ onMoveChat })

    const optionButtons = screen.getAllByRole('button', { name: 'Chat options' })
    await user.click(optionButtons[1]) // Chat B, the ungrouped one
    await user.hover(screen.getByText('Move to'))
    await user.click(await screen.findByRole('menuitem', { name: 'Research' }))

    expect(onMoveChat).toHaveBeenCalledWith('c2', 'p1')
    // Unlike delete, `moveChat` keeps the chat in `sessions` (just under a
    // different `projectId`) — the row relocates rather than vanishing,
    // so this is a genuine per-row spinner (driven by Sidebar's own
    // `movingChatIds`, not the row's local state, which a relocation
    // would reset — see ChatListItem's `moving` prop doc).
    expect(screen.getByTestId('move-chat-spinner')).toBeInTheDocument()

    resolveMove!()
    await waitFor(() => expect(screen.queryByTestId('move-chat-spinner')).not.toBeInTheDocument())
  })

  it('shows a spinner next to the project name and disables Project options while a rename is in flight', async () => {
    const user = userEvent.setup()
    let resolveRename: () => void
    const onRenameProject = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = () => resolve()
        }),
    )
    await renderSidebar({ onRenameProject })

    await user.click(screen.getByRole('button', { name: 'Project options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await user.type(screen.getByDisplayValue('Research'), ' updated{Enter}')

    expect(onRenameProject).toHaveBeenCalledWith('p1', 'Research updated')
    expect(screen.getByTestId('rename-project-spinner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Project options' })).toBeDisabled()

    resolveRename!()
    await waitFor(() =>
      expect(screen.queryByTestId('rename-project-spinner')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Project options' })).not.toBeDisabled()
  })
})

describe('Sidebar — share modal', () => {
  async function renderSidebar(onShareChat = vi.fn().mockResolvedValue(undefined)) {
    const view = render(
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
    return view
  }

  it('opens the share modal from the options menu and changes visibility', async () => {
    const user = userEvent.setup()
    const onShareChat = vi.fn().mockResolvedValue(undefined)
    await renderSidebar(onShareChat)

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Share'))

    expect(screen.getByText('Share this chat')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Anyone with the link can view'))

    expect(onShareChat).toHaveBeenCalledWith('c1', 'view')
  })
})

describe('Sidebar — Files pane disabled for a shared chat', () => {
  // `isSharedChat` is the one source of truth (AppLayout computes it from
  // `activeSession?.isOwner === false`, the same value it uses to gate
  // Summarize/Categorize/Extract metadata) — Sidebar must not re-derive
  // its own answer from `sharedSessions`/`activeChatId`, which could
  // disagree with AppLayout's own gating.
  async function renderSidebar(activeChatId: string, isSharedChat: boolean) {
    return render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[{ id: 'c1', title: 'Chat A', messages: [] }]}
          sharedSessions={[
            { id: 's1', title: 'Shared chat', messages: [], isOwner: false, ownerUsername: 'alice' },
          ]}
          activeChatId={activeChatId}
          isSharedChat={isSharedChat}
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

  it('disables FolderSidebar when isSharedChat is true', async () => {
    await renderSidebar('s1', true)
    expect(screen.getByTestId('folder-sidebar-stub')).toHaveAttribute('data-disabled', 'true')
  })

  it('passes sharedScopeDocuments through to FolderSidebar', async () => {
    render(
      <MemoryRouter>
        <Sidebar
          width={280}
          sessions={[]}
          sharedSessions={[
            { id: 's1', title: 'Shared chat', messages: [], isOwner: false, ownerUsername: 'alice' },
          ]}
          activeChatId="s1"
          isSharedChat
          sharedScopeDocuments={[
            { documentId: 'doc-b', filename: 'shared.pdf' },
            { documentId: 'doc-c', filename: null },
          ]}
          browse={browseFixture()}
          selection={selectionFixture()}
          onSelectChat={vi.fn()}
          onRenameChat={vi.fn()}
          onDeleteChat={vi.fn()}
          onNewChat={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('folder-sidebar-stub')).toHaveAttribute(
      'data-shared-scope-count',
      '2',
    )
  })

  it('leaves FolderSidebar enabled when isSharedChat is false', async () => {
    await renderSidebar('c1', false)
    expect(screen.getByTestId('folder-sidebar-stub')).toHaveAttribute('data-disabled', 'false')
  })

  it('trusts the isSharedChat prop over its own activeChatId/sharedSessions match', async () => {
    // activeChatId matches a shared session's id, but the caller says
    // isSharedChat is false — the prop wins.
    await renderSidebar('s1', false)
    expect(screen.getByTestId('folder-sidebar-stub')).toHaveAttribute('data-disabled', 'false')

    // The reverse: activeChatId matches the viewer's own chat, but the
    // caller says isSharedChat is true — the prop still wins.
    await renderSidebar('c1', true)
    expect(screen.getAllByTestId('folder-sidebar-stub')[1]).toHaveAttribute(
      'data-disabled',
      'true',
    )
  })
})

describe('Sidebar — host revocation (Share modal Private row)', () => {
  async function renderSidebar(onShareChat = vi.fn().mockResolvedValue(undefined)) {
    const view = render(
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
    return view
  }

  // The chat-row menu's own "Stop sharing" item was removed (client
  // feedback, Task 5) — it duplicated this modal's Private-radio revoke
  // action. Only the modal-driven revoke flow below remains.

  it('revokes sharing from inside the share modal by selecting the Private row', async () => {
    const user = userEvent.setup()
    const onShareChat = vi.fn().mockResolvedValue(undefined)
    await renderSidebar(onShareChat)

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Share'))
    expect(screen.getByText('Share this chat')).toBeInTheDocument()

    // The modal has no separate "Stop sharing" button — selecting Private
    // has the same revoking effect (visibility: 'private' already revokes
    // shared-link access server-side), so this drives the flow through the
    // Private radio row instead.
    await user.click(screen.getByRole('radio', { name: 'Private' }))

    expect(onShareChat).toHaveBeenCalledWith('c1', 'private')
  })
})

describe('Sidebar — recipient removal ("Remove from my chats")', () => {
  async function renderSidebar(onRemoveSharedChat = vi.fn()) {
    const view = render(
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
    return view
  }

  it('shows a menu with a single "Remove from my chats" item on a shared row', async () => {
    const user = userEvent.setup()
    const onRemoveSharedChat = vi.fn()
    await renderSidebar(onRemoveSharedChat)

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    await user.click(screen.getByText('Remove from my chats'))

    expect(onRemoveSharedChat).toHaveBeenCalledWith('s1')
  })

  it('hides the shared row menu entirely when onRemoveSharedChat is not provided', async () => {
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

    expect(screen.getByText('Shared chat')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Chat options' })).not.toBeInTheDocument()
  })
})
