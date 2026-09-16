import { Dropdown, Input, Modal } from 'antd'
import { ChatDeleteIcon, ChatEditIcon, ChatMoreIcon, ChatMoveIcon, ChatShareIcon } from '../icons/chat'
import type { InputRef, MenuProps } from 'antd'
import type { MouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FEATURES } from '../config/features'
import { sidebar, typeColor } from '../styles/typography'
import { listRow, sidebarNav, surface } from '../styles/theme'
import type { ChatProject, ChatSession } from '../types'

const NO_PROJECT_KEY = '__no_project__'

/** The row's "..." trigger — shared by the owned-row and read-only-row
 * `Dropdown`s below (they were previously two copies of the same
 * oversized-padding button). `px-2 py-1.5` matches `ProjectGroupHeader`'s
 * own "..." button (`Sidebar.tsx`) so the two dropdown triggers in the
 * sidebar look consistent. */
function ChatOptionsButton({
  menuOpen,
  onClick,
}: {
  menuOpen: boolean
  onClick: (e: MouseEvent) => void
}) {
  return (
    <button
      type="button"
      aria-label="Chat options"
      onClick={onClick}
      className={`shrink-0 px-2 py-1.5 rounded-lg ${typeColor.muted} hover:text-[#404040] ${surface.hover} transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0084ff]/35 ${
        menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      }`}
    >
      <ChatMoreIcon className={sidebar.caption} />
    </button>
  )
}

interface ChatListItemProps {
  chat: ChatSession
  isActive: boolean
  onSelect: () => void
  onRename: (chatId: string, title: string) => void
  onDelete: (chatId: string) => void
  /** Omitted for a read-only row (the Shared group) — the whole options
   * menu is hidden and `subtitle` is shown instead of the question
   * preview. */
  projects?: ChatProject[]
  onMove?: (chatId: string, projectId: string | null) => void
  onShare?: (chatId: string) => void
  /** "by <owner>" — shown instead of the first-question preview for a
   * shared, non-owned chat. */
  subtitle?: string
  /** True for a chat the viewer doesn't own (the Shared group) — hides the
   * normal options menu; nothing there applies to someone else's chat. A
   * `readOnly` row still gets its own minimal menu (just "Remove from my
   * chats") when `onRemove` is provided. */
  readOnly?: boolean
  /** Recipient-side removal from the viewer's own "Shared" group — only
   * ever used on a `readOnly` row. Omitted entirely (rather than passed
   * as `undefined`) hides that row's menu, same as before this existed. */
  onRemove?: (chatId: string) => void
}

export default function ChatListItem({
  chat,
  isActive,
  onSelect,
  onRename,
  onDelete,
  projects = [],
  onMove,
  onShare,
  subtitle,
  readOnly = false,
  onRemove,
}: ChatListItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState(chat.title)
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (!isEditing) setDraftTitle(chat.title)
  }, [chat.title, isEditing])

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const commitRename = () => {
    const trimmed = draftTitle.trim()
    setIsEditing(false)
    if (trimmed && trimmed !== chat.title) {
      onRename(chat.id, trimmed)
    } else {
      setDraftTitle(chat.title)
    }
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation()
    if (key === 'rename') {
      setIsEditing(true)
      return
    }
    if (key === 'share') {
      onShare?.(chat.id)
      return
    }
    if (key === 'remove') {
      onRemove?.(chat.id)
      return
    }
    if (key === 'delete') {
      setDeleteOpen(true)
      return
    }
    if (key.startsWith('move:')) {
      const projectKey = key.slice('move:'.length)
      onMove?.(chat.id, projectKey === NO_PROJECT_KEY ? null : projectKey)
    }
  }

  const canShare = FEATURES.chatSharing && chat.isOwner !== false && Boolean(onShare)
  /** Owned-and-shared-by-me or shared-with-me — drives the sidebar badge.
   * `false` once sharing is disabled entirely at build time, even for a
   * chat with stale `visibility` from before the flag was flipped off. */
  const isShared = FEATURES.chatSharing && Boolean(chat.visibility) && chat.visibility !== 'private'

  const menuItems: MenuProps['items'] = [
    { key: 'rename', label: 'Rename', icon: <ChatEditIcon /> },
    ...(onMove
      ? [
          {
            key: 'move',
            label: 'Move to',
            icon: <ChatMoveIcon />,
            children: [
              ...projects.map((project) => ({ key: `move:${project.id}`, label: project.name })),
              { key: `move:${NO_PROJECT_KEY}`, label: 'No project' },
            ],
          },
        ]
      : []),
    ...(canShare ? [{ key: 'share', label: 'Share', icon: <ChatShareIcon /> }] : []),
    { type: 'divider' as const },
    {
      key: 'delete',
      label: 'Delete',
      icon: <ChatDeleteIcon />,
      className: 'docu-menu-item-danger',
    },
  ]

  // A read-only (Shared group) row otherwise has no options menu at all —
  // "Remove from my chats" is the one action that applies to someone
  // else's chat from the recipient's own side.
  const readOnlyMenuItems: MenuProps['items'] = [
    {
      key: 'remove',
      label: 'Remove from my chats',
      icon: <ChatDeleteIcon />,
      className: 'docu-menu-item-danger',
    },
  ]

  // The first user question, as a preview — the row's muted second line.
  // Sidebar titles are now dated ("Session 15 Sep 2026 (1)"), not the
  // question itself, so this is the only place that question still shows
  // up in the Chats list. A shared row shows "by <owner>" instead.
  const preview = subtitle ?? chat.messages.find((m) => m.role === 'user')?.content

  const titleSpan = (
    <span
      className={`block min-w-0 truncate ${sidebar.body} ${
        isActive ? `${typeColor.primary} font-normal` : typeColor.secondary
      }`}
      title={chat.title}
    >
      {chat.title}
    </span>
  )

  return (
    <div
      className={`group flex items-center gap-0.5 ${listRow} ${
        isActive ? sidebarNav.active : sidebarNav.idle
      }`}
    >
      {isEditing ? (
        <Input
          ref={inputRef}
          size="small"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') {
              setDraftTitle(chat.title)
              setIsEditing(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={`flex-1 min-w-0 mx-1 my-1 ${sidebar.body} !rounded-lg`}
          maxLength={80}
        />
      ) : (
        // Font-size/colour live on the inner spans, not this `<button>`
        // element itself — `src/main.tsx` loads antd's unlayered
        // reset.css, whose `button { color; font-size; ... }` rule always
        // beats Tailwind's `@layer utilities` regardless of specificity
        // (see `.docu-citation-pill` in src/index.css for the fuller
        // writeup). A descendant span isn't a `button`, so its own
        // Tailwind text classes apply normally; only padding/layout sit on
        // the button itself, which the reset doesn't touch.
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 min-w-0 flex flex-col gap-0.5 text-left px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0084ff]/35 rounded-[10px]"
        >
          {isShared ? (
            <span className="flex items-center gap-1 min-w-0">
              {titleSpan}
              <span
                role="img"
                aria-label="Shared chat"
                className="shrink-0 inline-flex items-center leading-none text-[#8e8e8e]"
              >
                <ChatShareIcon />
              </span>
            </span>
          ) : (
            titleSpan
          )}
          {preview && (
            <span className={`block min-w-0 truncate ${sidebar.caption} ${typeColor.muted}`}>
              {preview}
            </span>
          )}
        </button>
      )}

      {!isEditing && !readOnly && (
        <Dropdown
          menu={{ items: menuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="bottomRight"
          overlayClassName="docu-chat-options-menu"
          open={menuOpen}
          onOpenChange={setMenuOpen}
        >
          <ChatOptionsButton menuOpen={menuOpen} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      )}

      {!isEditing && readOnly && onRemove && (
        <Dropdown
          menu={{ items: readOnlyMenuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="bottomRight"
          overlayClassName="docu-chat-options-menu"
          open={menuOpen}
          onOpenChange={setMenuOpen}
        >
          <ChatOptionsButton menuOpen={menuOpen} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      )}

      <Modal
        open={deleteOpen}
        title="Delete chat?"
        footer={null}
        closable={false}
        centered
        width={360}
        className="chat-delete-modal"
        onCancel={() => setDeleteOpen(false)}
      >
        <p className="chat-delete-modal-body">This cannot be undone.</p>
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
              onDelete(chat.id)
            }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}
