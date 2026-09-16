import { Avatar, Dropdown, Input, Layout, Modal } from 'antd'
import { useEffect, useRef, useState } from 'react'
import {
  ChatAddIcon,
  ChatChevronIcon,
  ChatDeleteIcon,
  ChatEditIcon,
  ChatLogoutIcon,
  ChatMessageIcon,
  ChatMoreIcon,
} from '../icons/chat'
import type { InputRef, MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { sectionLabel, spacing, surface } from '../styles/theme'
import { sidebar, typeColor } from '../styles/typography'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import type { ChatProject, ChatSession, ChatVisibility } from '../types'
import ChatListItem from './ChatListItem'
import FolderSidebar from './FolderSidebar'
import ShareChatModal from './ShareChatModal'
import SidebarNavItem from './SidebarNavItem'

const { Sider } = Layout

/** A project's header row: expand/collapse chevron, name (inline-editable),
 * chat count, and a Rename/Delete menu. Deleting a project never deletes
 * its chats — they fall back to "ungrouped" (the adapter sets their
 * `project_id` to null; `Sidebar` mirrors that by clearing it locally). */
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
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draftName, setDraftName] = useState(project.name)
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
      onRename(trimmed)
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
            className={`shrink-0 px-2 py-1.5 rounded-lg ${typeColor.muted} hover:text-[#404040] ${surface.hover} opacity-0 group-hover:opacity-100 focus-visible:opacity-100`}
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
          Chats in this project are kept — this only removes the project.
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
  onRenameChat: (chatId: string, title: string) => void
  onDeleteChat: (chatId: string) => void
  onNewChat: () => void
  onMoveChat?: (chatId: string, projectId: string | null) => void
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
  const [newProjectName, setNewProjectName] = useState('')
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
    if (trimmed) void onCreateProject?.(trimmed)
  }

  const ungroupedChats = sessions.filter((s) => !s.projectId)
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
      onDelete={onDeleteChat}
      projects={projects}
      onMove={onMoveChat}
      onShare={onShareChat ? (chatId) => setShareChatId(chatId) : undefined}
      onStopSharing={onShareChat ? (chatId) => void onShareChat(chatId, 'private') : undefined}
    />
  )

  return (
    <Sider
      width={width}
      className={`docu-sidebar ${inDrawer ? 'docu-sidebar--drawer' : ''} ${surface.sidebar} h-full !overflow-hidden`}
      theme="light"
    >
      <div className={`flex flex-col h-full min-h-0 ${spacing.panelLg}`}>
        {/* Compact wordmark row, then "New chat" directly under it as a
            full-width secondary button — mainstream placement (client
            feedback: UI polish pass), rather than pinned at the very
            bottom below the chat list. Skipped when `inDrawer`: the
            Drawer (AppLayout.tsx) renders "Arche AI" itself, in its own
            header, on the same row as the close button (fix round 1) —
            rendering it again here would duplicate it right below that
            header instead of sharing its row. */}
        {!inDrawer && (
          <div className="shrink-0 mb-3 text-left">
            <span className={`text-lg font-semibold ${typeColor.primary}`}>Arche AI</span>
          </div>
        )}

        <div className="shrink-0 mb-3">
          <SidebarNavItem
            icon={<ChatAddIcon />}
            onClick={() => {
              onNewChat()
              onNavigate?.()
            }}
            variant="secondary"
          >
            New chat
          </SidebarNavItem>
        </div>

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
                <button
                  type="button"
                  onClick={() => setCreatingProject(true)}
                  aria-label="New project"
                  className={`shrink-0 p-1 mb-1.5 rounded-lg ${typeColor.muted} hover:text-[#404040] ${surface.hover}`}
                >
                  <ChatAddIcon sx={{ fontSize: 14 }} />
                </button>
              )}
            </div>

            {creatingProject && (
              <Input
                ref={newProjectInputRef}
                size="small"
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onBlur={commitNewProject}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNewProject()
                  if (e.key === 'Escape') {
                    setNewProjectName('')
                    setCreatingProject(false)
                  }
                }}
                className={`mb-1.5 ${sidebar.body} !rounded-lg`}
                maxLength={200}
              />
            )}

            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-0.5">
              {projects.map((project) => {
                const projectChats = sessions.filter((s) => s.projectId === project.id)
                const expanded = !collapsedProjectIds.has(project.id)
                return (
                  <div key={project.id} className="mb-1">
                    <ProjectGroupHeader
                      project={project}
                      count={projectChats.length}
                      expanded={expanded}
                      onToggleExpand={() => toggleProjectExpanded(project.id)}
                      onRename={(name) => void onRenameProject?.(project.id, name)}
                      onDelete={() => onDeleteProject?.(project.id)}
                    />
                    {expanded && (
                      <div className="pl-4 space-y-0.5">
                        {projectChats.map(renderChatItem)}
                      </div>
                    )}
                  </div>
                )
              })}

              {ungroupedChats.map(renderChatItem)}

              {sharedSessions.length > 0 && (
                <div className="mt-2">
                  <span className={sectionLabel}>Shared</span>
                  <div className="space-y-0.5">
                    {sharedSessions.map((chat) => (
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
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-2 mt-1">
          <div className="border-t border-[#ececec] pt-2">
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
