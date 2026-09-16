import { Avatar, Dropdown, Input, Layout, Modal, Skeleton, Spin, Tooltip } from 'antd'
import { useEffect, useRef, useState } from 'react'
import {
  ChatAddIcon,
  ChatChevronIcon,
  ChatDeleteIcon,
  ChatEditIcon,
  ChatLogoutIcon,
  ChatMessageIcon,
  ChatMoreIcon,
  ChatNewFolderIcon,
} from '../icons/chat'
import type { InputRef, MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { sectionLabel, spacing, surface } from '../styles/theme'
import { sidebar, type, typeColor } from '../styles/typography'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import type { ChatProject, ChatSession, ChatVisibility } from '../types'
import ChatListItem from './ChatListItem'
import FolderSidebar from './FolderSidebar'
import ShareChatModal from './ShareChatModal'
import SidebarNavItem from './SidebarNavItem'

const { Sider } = Layout

/** Keep every chat group in the same, predictable order as the main chat
 * history: the most recently created session first.  The server's list
 * order is not part of the API contract, and newly-created sessions can be
 * interleaved with an older response, so sorting only in the store would be
 * easy to bypass when rendering project/shared groups. */
export function sortChatsNewestFirst(chats: ChatSession[]): ChatSession[] {
  return chats
    .map((chat, index) => ({ chat, index }))
    .sort((a, b) => {
      const aTime = a.chat.createdAt ? Date.parse(a.chat.createdAt) : Number.NaN
      const bTime = b.chat.createdAt ? Date.parse(b.chat.createdAt) : Number.NaN
      const aSortable = Number.isFinite(aTime)
      const bSortable = Number.isFinite(bTime)

      // Legacy sessions without a timestamp remain visible, but sit after
      // dated sessions. Preserve input order for missing/identical dates so
      // rendering never jumps around without a meaningful date change.
      if (!aSortable || !bSortable) {
        if (aSortable !== bSortable) return aSortable ? -1 : 1
        return a.index - b.index
      }
      return bTime - aTime || a.index - b.index
    })
    .map(({ chat }) => chat)
}

/** A project's header row: expand/collapse chevron, name (inline-editable),
 * chat count, and a Rename/Delete menu. Deleting a project cascades: every
 * chat in it is deleted too (after the confirmation below), not merely
 * orphaned — the adapter has no cascade-delete endpoint of its own, so
 * `useChatStore.deleteProject` deletes each chat individually first, then
 * the project. */
function ProjectGroupHeader({
  project,
  count,
  expanded,
  onToggleExpand,
  onRename,
  onDelete,
}: {
  project: ChatProject
  count: number
  expanded: boolean
  onToggleExpand: () => void
  /** Task 11 follow-up: already returned a promise before this round
   * (`useChatStore.renameProject` was already awaitable) — this header
   * just didn't await it. Typed here to make that explicit now that it
   * does. */
  onRename: (name: string) => Promise<void>
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
  const [renaming, setRenaming] = useState(false)
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (!isEditing) setDraftName(project.name)
  }, [project.name, isEditing])

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const commitRename = () => {
    const trimmed = draftName.trim()
    setIsEditing(false)
    if (trimmed && trimmed !== project.name) {
      // Same shape as `ChatListItem`'s chat rename: the input closes
      // immediately, the name already shows the new value (optimistic
      // update in `useChatStore.renameProject`), and `renaming` only
      // drives the spinner alongside it for the still-in-flight PATCH.
      setRenaming(true)
      void Promise.resolve(onRename(trimmed)).finally(() => setRenaming(false))
    } else {
      setDraftName(project.name)
    }
  }

  const menuItems: MenuProps['items'] = [
    { key: 'rename', label: 'Rename', icon: <ChatEditIcon /> },
    { type: 'divider' },
    { key: 'delete', label: 'Delete', icon: <ChatDeleteIcon />, className: 'docu-menu-item-danger' },
  ]

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation()
    if (key === 'rename') setIsEditing(true)
    if (key === 'delete') setDeleteOpen(true)
  }

  return (
    <div className="group flex items-center gap-0.5">
      <button
        type="button"
        onClick={onToggleExpand}
        aria-label={expanded ? 'Collapse project' : 'Expand project'}
        className="shrink-0 p-1.5 rounded-lg hover:bg-[#ececec]"
      >
        <ChatChevronIcon className={`docu-tree-chevron${expanded ? ' expanded' : ''}`} />
      </button>

      {isEditing ? (
        <Input
          ref={inputRef}
          size="small"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setDraftName(project.name)
              setIsEditing(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={`flex-1 min-w-0 mx-1 my-1 ${sidebar.body} !rounded-lg`}
          maxLength={200}
        />
      ) : (
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left py-1.5"
        >
          <span className={`truncate ${sidebar.body} font-medium ${typeColor.secondary}`}>
            {project.name}
          </span>
          <span className={`shrink-0 ${sidebar.caption} ${typeColor.muted}`}>{count}</span>
          {renaming && <Spin size="small" data-testid="rename-project-spinner" />}
        </button>
      )}

      {!isEditing && (
        <Dropdown
          menu={{ items: menuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="bottomRight"
          overlayClassName="docu-chat-options-menu"
        >
          <button
            type="button"
            aria-label="Project options"
            onClick={(e) => e.stopPropagation()}
            disabled={renaming}
            className={`shrink-0 px-2 py-1.5 rounded-lg ${typeColor.muted} hover:text-[#404040] ${surface.hover} opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <ChatMoreIcon className={sidebar.caption} />
          </button>
        </Dropdown>
      )}

      <Modal
        open={deleteOpen}
        title="Delete project?"
        footer={null}
        closable={false}
        centered
        width={360}
        className="chat-delete-modal"
        onCancel={() => setDeleteOpen(false)}
      >
        <p className="chat-delete-modal-body">
          {count > 0
            ? `This will permanently delete ${count} chat${count === 1 ? '' : 's'} in this project. This cannot be undone.`
            : 'This project has no chats. It will be permanently deleted.'}
        </p>
        <div className="chat-delete-modal-actions">
          <button
            type="button"
            className="chat-delete-modal-btn chat-delete-modal-btn--cancel"
            onClick={() => setDeleteOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="chat-delete-modal-btn chat-delete-modal-btn--delete"
            onClick={() => {
              // Unlike a genuinely pending action, `deleteProject`
              // optimistically removes this very project (and its
              // `ProjectGroupHeader`, including this modal) from the
              // `projects` list *synchronously*, in the same call this
              // makes below — there is no surviving row/modal left to
              // render a spinner on by the time React next paints. Close
              // immediately (unchanged from before this task) and let
              // `onDelete` itself track the in-flight cascade at the
              // `Sidebar` level, where a "Deleting project" indicator
              // can actually stay mounted for the caller to see.
              setDeleteOpen(false)
              onDelete()
            }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}

interface SidebarProps {
  /** A plain pixel number for the desktop resizable panel, or a CSS width
   * string (e.g. `"100%"`) when Sidebar is rendered to fill an antd Drawer
   * instead — see AppLayout's narrow-layout branch. */
  width: number | string
  sessions: ChatSession[]
  /** Chats opened via a shared link the viewer doesn't own — rendered as a
   * separate "Shared" group, only when non-empty. */
  sharedSessions?: ChatSession[]
  projects?: ChatProject[]
  activeChatId: string
  /** The server-backed chat list is being hydrated. Keep temporary local
   * rows out of the navigation until the authoritative list is available. */
  isLoading?: boolean
  /** True when the active chat is shared and the viewer doesn't own it —
   * computed once by AppLayout (from `activeSession?.isOwner === false`,
   * the same value that gates Summarize/Categorize/Extract metadata) and
   * passed down as the one source of truth, rather than Sidebar
   * re-deriving its own answer from `sharedSessions`/`activeChatId`.
   * Disables the Files pane (owner decision, 2026-09-16: a follower can't
   * choose documents at all). */
  isSharedChat?: boolean
  browse: BrowseTreeState
  selection: DocumentSelection
  onSelectChat: (chatId: string) => void
  /** Task 11 follow-up: `useChatStore.renameChat`/`deleteChat`/`moveChat`
   * all stayed optimistic but now return the underlying API call's own
   * promise (previously fire-and-forget, `void ... .catch()`), so this
   * component and `ChatListItem` can await them to show a pending
   * indicator without changing what happens on success or failure. */
  onRenameChat: (chatId: string, title: string) => Promise<void>
  onDeleteChat: (chatId: string) => Promise<void>
  onNewChat: () => void
  onMoveChat?: (chatId: string, projectId: string | null) => Promise<void>
  onShareChat?: (chatId: string, visibility: ChatVisibility) => Promise<void>
  onCreateProject?: (name: string) => Promise<void>
  onRenameProject?: (id: string, name: string) => Promise<void>
  onDeleteProject?: (id: string) => void
  /** Recipient-side removal from the viewer's own "Shared" group — shown
   * as a "Remove from my chats" item on a shared row's own options menu
   * when provided; the menu is hidden entirely otherwise (unchanged
   * behaviour for a caller that doesn't wire this up). */
  onRemoveSharedChat?: (chatId: string) => void
  /** Called right after selecting a chat or starting a new one — AppLayout
   * passes this only when Sidebar is rendered inside the mobile Drawer, to
   * close it once the navigation it was opened for has happened. Desktop
   * callers omit it and both handlers below just no-op the extra call. */
  onNavigate?: () => void
  /** True only for the Drawer-rendered instance (AppLayout's narrow-layout
   * branch): the Drawer's own body already constrains height, so the Sider
   * must fill *that* rather than re-claim a fresh 100vh, which would clip
   * its bottom content by whatever chrome the Drawer adds. See the
   * `.docu-sidebar--drawer` override in src/index.css. */
  inDrawer?: boolean
}

export default function Sidebar({
  width,
  sessions,
  sharedSessions = [],
  projects = [],
  activeChatId,
  isLoading = false,
  isSharedChat = false,
  browse,
  selection,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onNewChat,
  onMoveChat,
  onShareChat,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onRemoveSharedChat,
  onNavigate,
  inDrawer = false,
}: SidebarProps) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(new Set())
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingProjectPending, setCreatingProjectPending] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  // Project ids with an in-flight `deleteProject` cascade — tracked here,
  // not inside `ProjectGroupHeader`, because `deleteProject` optimistically
  // removes the project (and thus unmounts that row) synchronously before
  // this ever settles; a row-local "deleting" flag would never survive to
  // be seen. This state lives above that unmount, so its indicator does.
  const [deletingProjectIds, setDeletingProjectIds] = useState<Set<string>>(new Set())
  // Chat ids with an in-flight `deleteChat` in progress — same reasoning
  // as `deletingProjectIds`: `deleteChat` removes the chat from `sessions`
  // synchronously, unmounting its row before there's anything to render a
  // spinner on, so this indicator lives here instead.
  const [deletingChatIds, setDeletingChatIds] = useState<Set<string>>(new Set())
  // Chat ids with an in-flight `moveChat` — unlike delete, the chat stays
  // in `sessions` (just under a different `projectId`), so it's passed
  // down to `ChatListItem` as a `moving` prop and rendered on the row
  // itself, wherever it currently is; see `ChatListItem`'s own `moving`
  // prop doc for why that has to be parent-owned state.
  const [movingChatIds, setMovingChatIds] = useState<Set<string>>(new Set())
  const newProjectInputRef = useRef<InputRef>(null)
  const [shareChatId, setShareChatId] = useState<string | null>(null)

  useEffect(() => {
    if (creatingProject) newProjectInputRef.current?.focus()
  }, [creatingProject])

  const displayName = browse.username ?? session?.username ?? 'User'
  const avatarInitial = displayName.charAt(0).toUpperCase()

  const handleProfileMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key !== 'logout') return
    void logout().then(() => {
      navigate('/chat', { replace: true })
    })
  }

  const profileMenu: MenuProps['items'] = [
    {
      key: 'logout',
      label: 'Log out',
      icon: <ChatLogoutIcon />,
      className: 'docu-menu-item-danger',
    },
  ]

  const toggleProjectExpanded = (id: string) => {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const commitNewProject = () => {
    const trimmed = newProjectName.trim()
    setCreatingProject(false)
    setNewProjectName('')
    if (!trimmed || !onCreateProject) return
    // Unlike rename/delete/move (optimistic — local state updates before
    // the network call, so the UI never has a visible pending window),
    // `createProject` awaits the create call before the new project ever
    // appears — there's a real gap here with nothing shown today. The
    // "+" trigger below swaps to a spinner and disables itself for the
    // duration so a second click can't fire an overlapping create.
    setCreatingProjectPending(true)
    // `Promise.resolve(...)` (not a bare `.finally()`) so a caller that
    // doesn't actually return a promise — the prop is typed to, but a
    // plain `vi.fn()` test double or future non-async wiring wouldn't —
    // doesn't throw here instead of merely skipping the spinner.
    void Promise.resolve(onCreateProject(trimmed)).finally(() => setCreatingProjectPending(false))
  }

  const handleDeleteProject = (projectId: string) => {
    if (!onDeleteProject) return
    setDeletingProjectIds((prev) => new Set(prev).add(projectId))
    void Promise.resolve(onDeleteProject(projectId)).finally(() => {
      setDeletingProjectIds((prev) => {
        const next = new Set(prev)
        next.delete(projectId)
        return next
      })
    })
  }

  const handleDeleteChat = (chatId: string) => {
    setDeletingChatIds((prev) => new Set(prev).add(chatId))
    void Promise.resolve(onDeleteChat(chatId)).finally(() => {
      setDeletingChatIds((prev) => {
        const next = new Set(prev)
        next.delete(chatId)
        return next
      })
    })
  }

  const handleMoveChat = (chatId: string, projectId: string | null) => {
    if (!onMoveChat) return
    setMovingChatIds((prev) => new Set(prev).add(chatId))
    void Promise.resolve(onMoveChat(chatId, projectId)).finally(() => {
      setMovingChatIds((prev) => {
        const next = new Set(prev)
        next.delete(chatId)
        return next
      })
    })
  }

  const sortedChats = sortChatsNewestFirst(sessions)
  const sortedSharedChats = sortChatsNewestFirst(sharedSessions)
  const ungroupedChats = sortedChats.filter((s) => !s.projectId)
  const shareModalChat = shareChatId ? (sessions.find((s) => s.id === shareChatId) ?? null) : null

  const renderChatItem = (chat: ChatSession) => (
    <ChatListItem
      key={chat.id}
      chat={chat}
      isActive={activeChatId === chat.id}
      onSelect={() => {
        onSelectChat(chat.id)
        onNavigate?.()
      }}
      onRename={onRenameChat}
      onDelete={handleDeleteChat}
      projects={projects}
      onMove={onMoveChat ? handleMoveChat : undefined}
      onShare={onShareChat ? (chatId) => setShareChatId(chatId) : undefined}
      moving={movingChatIds.has(chat.id)}
    />
  )

  return (
    <Sider
      width={width}
      className={`docu-sidebar ${inDrawer ? 'docu-sidebar--drawer' : ''} ${surface.sidebar} h-full !overflow-hidden`}
      theme="light"
    >
      <div className={`flex flex-col h-full min-h-0 ${spacing.panelLg}`}>
        {/* Compact wordmark row. The primary "New chat" action lives in the
            bottom action area beside the account control, so the top of the
            sidebar stays focused on browsing files and existing chats.
            Skipped when `inDrawer`: the
            Drawer (AppLayout.tsx) renders "Arche AI" itself, in its own
            header, on the same row as the close button (fix round 1) —
            rendering it again here would duplicate it right below that
            header instead of sharing its row. */}
        {!inDrawer && (
          <div className="shrink-0 mb-3 text-left">
            <span className={`text-lg font-semibold ${typeColor.primary}`}>Arche AI</span>
          </div>
        )}

        <div className={`flex flex-col flex-1 min-h-0 ${spacing.section} overflow-hidden`}>
          {/* Fix round 1: Files and Chats each scroll independently within
              their own `min-h-0 overflow-y-auto` section — the Files
              section (`flex-[3]`, the flexible share) also scrolls at
              this outer level now, not only inside FolderSidebar's own
              tree, so a long tree can never push "Chats"/"New chat" off
              the bottom of a short viewport: this section clips and
              scrolls its own overflow instead of growing past it. */}
          <div className="flex flex-col min-h-0 flex-[3] overflow-y-auto overflow-x-hidden pt-1">
            <FolderSidebar browse={browse} selection={selection} disabled={isSharedChat} />
          </div>

          {/* min-h-[270px] (~5 two-line ChatListItem rows, client feedback:
              the list used to collapse to nothing once Files grew) is a
              floor, not a fixed height — the Files section above still
              takes the rest via flex-[3], and this section still grows
              past its floor and scrolls its own overflow (both here, at
              the section level, and via the overflow-y-auto list below)
              rather than pushing Files — or itself — off-screen. */}
          <div
            className={`flex flex-col flex-1 min-h-[270px] overflow-y-auto overflow-x-hidden ${spacing.sectionY}`}
          >
            <div className="flex items-center justify-between">
              <span className={sectionLabel}>
                <ChatMessageIcon />
                Chats
              </span>
              {onCreateProject && (
                <Tooltip title="New project">
                  <button
                    type="button"
                    onClick={() => setCreatingProject(true)}
                    aria-label="New project"
                    disabled={isLoading || creatingProjectPending}
                    className={`shrink-0 p-1 mb-1.5 rounded-lg ${typeColor.muted} hover:text-[#404040] ${surface.hover} disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {creatingProjectPending ? (
                      <Spin size="small" data-testid="create-project-spinner" />
                    ) : (
                      <ChatNewFolderIcon />
                    )}
                  </button>
                </Tooltip>
              )}
            </div>

            {deletingProjectIds.size > 0 && (
              <span
                className={`flex items-center gap-1.5 mb-1.5 ${sidebar.caption} ${typeColor.muted}`}
              >
                <Spin size="small" data-testid="delete-project-spinner" />
                Deleting project
              </span>
            )}

            {deletingChatIds.size > 0 && (
              <span
                className={`flex items-center gap-1.5 mb-1.5 ${sidebar.caption} ${typeColor.muted}`}
              >
                <Spin size="small" data-testid="delete-chat-spinner" />
                Deleting chat
              </span>
            )}

            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
              {isLoading ? (
                <div
                  role="status"
                  aria-label="Loading chats"
                  data-testid="chats-loading"
                  className="space-y-2 px-2 py-1"
                >
                  <Skeleton.Input active size="small" block />
                  <Skeleton.Input active size="small" block />
                  <Skeleton.Input active size="small" block />
                </div>
              ) : (
                <>
                  {projects.map((project) => {
                    const projectChats = sortedChats.filter((s) => s.projectId === project.id)
                    const expanded = !collapsedProjectIds.has(project.id)
                    return (
                      <div key={project.id} className="mb-2">
                        <ProjectGroupHeader
                          project={project}
                          count={projectChats.length}
                          expanded={expanded}
                          onToggleExpand={() => toggleProjectExpanded(project.id)}
                          onRename={(name) =>
                            onRenameProject ? onRenameProject(project.id, name) : Promise.resolve()
                          }
                          onDelete={() => handleDeleteProject(project.id)}
                        />
                        {expanded && (
                          <div className="pl-4 space-y-0.5">
                            {projectChats.map(renderChatItem)}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Ungrouped chats sit outside any project — a plain list with
                  no header of their own (unlike "Shared" below, which gets
                  one). A thin divider (same `#ececec` rule used elsewhere in
                  this sidebar, e.g. above the profile row) marks where the
                  last project group ends and this unlabeled list begins;
                  without it the two read as one continuous list at the same
                  row rhythm, as if the top chat still belonged to the
                  project above it (client feedback: UI polish pass). Only
                  shown when there's a project to separate from — an
                  all-ungrouped sidebar has nothing to distinguish this list
                  from. */}
                  <div
                    className={`space-y-0.5 ${
                      projects.length > 0 ? 'mt-2 pt-2 border-t border-[#ececec]' : ''
                    }`}
                  >
                    {ungroupedChats.map(renderChatItem)}
                  </div>

                  {sharedSessions.length > 0 && (
                    <div className="mt-2">
                      <span className={sectionLabel}>Shared</span>
                      <div className="space-y-0.5">
                        {sortedSharedChats.map((chat) => (
                          <ChatListItem
                            key={chat.id}
                            chat={chat}
                            isActive={activeChatId === chat.id}
                            onSelect={() => {
                              onSelectChat(chat.id)
                              onNavigate?.()
                            }}
                            onRename={onRenameChat}
                            onDelete={onDeleteChat}
                            readOnly
                            subtitle={chat.ownerUsername ? `by ${chat.ownerUsername}` : undefined}
                            onRemove={onRemoveSharedChat}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <Modal
          open={creatingProject}
          title="New project"
          centered
          width={400}
          okText="Create project"
          cancelText="Cancel"
          confirmLoading={creatingProjectPending}
          okButtonProps={{ disabled: !newProjectName.trim() }}
          onOk={commitNewProject}
          onCancel={() => {
            if (creatingProjectPending) return
            setNewProjectName('')
            setCreatingProject(false)
          }}
        >
          <p className={`mb-3 ${type.body} ${typeColor.secondary}`}>
            Group related chats together.
          </p>
          <Input
            ref={newProjectInputRef}
            size="large"
            placeholder="Project name"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newProjectName.trim()) commitNewProject()
              if (e.key === 'Escape') {
                setNewProjectName('')
                setCreatingProject(false)
              }
            }}
            className={`${sidebar.body} !rounded-lg`}
            maxLength={200}
          />
        </Modal>

        <div className="shrink-0 pt-2 mt-1">
          <div className="border-t border-[#ececec] pt-2">
            <SidebarNavItem
              icon={<ChatAddIcon />}
              onClick={() => {
                if (isLoading) return
                onNewChat()
                onNavigate?.()
              }}
              variant="secondary"
              disabled={isLoading}
              title={isLoading ? 'Chats are loading' : 'Start a new chat'}
              className="mb-1.5"
            >
              New chat
            </SidebarNavItem>
            <Dropdown
              menu={{ items: profileMenu, onClick: handleProfileMenuClick }}
              trigger={['click']}
              placement="topLeft"
              overlayClassName="docu-profile-menu"
            >
              <button
                type="button"
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-[10px] text-left transition-colors hover:bg-[#ececec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0084ff]/35 ${sidebar.body}`}
              >
                <Avatar
                  size={32}
                  className="!bg-[#1e3a5f] !text-white shrink-0 !text-sm !font-medium"
                >
                  {avatarInitial}
                </Avatar>
                <span className={`flex-1 min-w-0 truncate ${typeColor.primary} font-medium`}>
                  {displayName}
                </span>
              </button>
            </Dropdown>
          </div>
        </div>
      </div>

      {onShareChat && (
        <ShareChatModal
          chat={shareModalChat}
          onClose={() => setShareChatId(null)}
          onChangeVisibility={onShareChat}
        />
      )}
    </Sider>
  )
}
