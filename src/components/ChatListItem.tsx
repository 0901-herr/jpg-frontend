import { Dropdown, Input, Modal, Spin } from 'antd'
import { ChatDeleteIcon, ChatEditIcon, ChatMoreIcon, ChatMoveIcon, ChatShareIcon, ChatChevronIcon } from '../icons/chat'
import type { InputRef, MenuProps } from 'antd'
import type { MouseEvent } from 'react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { FEATURES } from '../config/features'
import { sidebar, typeColor } from '../styles/typography'
import { listRow, sidebarNav } from '../styles/theme'
import type { ChatProject, ChatSession } from '../types'
import { isDefaultSessionTitle } from '../utils/chatTitle'

const NO_PROJECT_KEY = '__no_project__'

/** While the title is still the placeholder (a chat whose first question
 * has not been persisted yet), the row prefers the first user question as its
 * label; once the adapter or the user sets a real title, the stored title
 * wins so Rename actually changes what the sidebar shows. */
export function chatRowLabel(chat: Pick<ChatSession, 'title' | 'messages'>): string {
  const firstUser = chat.messages.find((m) => m.role === 'user')?.content?.trim()
  if (!isDefaultSessionTitle(chat.title)) {
    return chat.title
  }
  return firstUser || chat.title
}

/** The row's "..." trigger — shared by the owned-row and read-only-row
 * `Dropdown`s below (they were previously two copies of the same
 * oversized-padding button). `px-2 py-1.5` matches `ProjectGroupHeader`'s
 * own "..." button (`Sidebar.tsx`) so the two dropdown triggers in the
 * sidebar look consistent. */
// `forwardRef` is required here, not cosmetic: antd's `Dropdown` clones its
// trigger child with a ref it uses to measure and position the popup. A
// plain function component silently drops that ref (React no longer warns
// about this), so the popup's alignment effect never gets a real anchor
// element and the menu stays stuck at its off-screen pre-measurement
// position — reproduced live: the "..." menu on a chat row never appeared
// next to the button. The equivalent "..." buttons elsewhere in the sidebar
// (`ProjectGroupHeader`, the profile menu) render a plain `<button>` directly
// as `Dropdown`'s child, which is why only this one broke.
export const ChatOptionsButton = forwardRef<
  HTMLButtonElement,
  {
    menuOpen: boolean
    onClick: (e: MouseEvent) => void
    /** True while this row's own rename or move is in flight (Task 11
     * follow-up) — blocks opening the menu again (and so starting a second
     * overlapping rename/delete/move/share) until it settles. Delete itself
     * needs no such guard here: its confirm modal already closes instantly
     * and the row is gone from the list the moment the optimistic removal
     * lands, so there's nothing left on this row to disable by then. */
    disabled?: boolean
  }
>(function ChatOptionsButton({ menuOpen, onClick, disabled = false }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Chat options"
      onClick={onClick}
      disabled={disabled}
      className={`docu-chat-options-trigger shrink-0 w-8 h-8 px-2 py-1.5 inline-flex items-center justify-center leading-none rounded-lg !text-[#8e8e8e] hover:!text-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0084ff]/35 disabled:opacity-50 disabled:cursor-not-allowed ${
        menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
      }`}
    >
      <ChatMoreIcon sx={{ fontSize: 18, color: 'currentColor' }} />
    </button>
  )
})

interface ChatListItemProps {
  chat: ChatSession
  isActive: boolean
  onSelect: () => void
  /** Task 11 follow-up: `useChatStore.renameChat` stayed optimistic but
   * now returns the PATCH's own promise instead of firing it
   * fire-and-forget — this row awaits it locally to show a pending
   * spinner next to the (already-updated) title while it settles. */
  onRename: (chatId: string, title: string) => Promise<void>
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
  /** True while `Sidebar`'s own `moveChat` call for this exact chat id is
   * in flight (Task 11 follow-up) — driven from the parent, not local
   * state, because a move relocates this row to a different project's
   * list (a different subtree entirely), which unmounts and remounts a
   * fresh `ChatListItem` instance losing any of its own local state. A
   * parent-owned flag survives that remount and keeps showing correctly
   * at the row's new location. */
  moving?: boolean
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
  moving = false,
}: ChatListItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState(() => chatRowLabel(chat))
  const [renaming, setRenaming] = useState(false)
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (!isEditing) setDraftTitle(chatRowLabel(chat))
  }, [chat.title, chat.messages, isEditing])

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
      // The rename input closes immediately either way (unchanged) — the
      // title itself already shows the new value (optimistic update in
      // `useChatStore.renameChat`) by the time this row next renders.
      // `renaming` only drives the spinner below, alongside the title,
      // for the still-invisible network round-trip.
      setRenaming(true)
      // `Promise.resolve(...)` (not a bare `.finally()`) so a test double
      // or future caller that doesn't actually return a promise — the
      // prop is typed to — doesn't throw here instead of merely skipping
      // the spinner; same defensive idiom `Sidebar.tsx` already uses for
      // `createProject`/`deleteProject`.
      void Promise.resolve(onRename(chat.id, trimmed)).finally(() => setRenaming(false))
    } else {
      setDraftTitle(chatRowLabel(chat))
    }
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    domEvent.stopPropagation()
    if (key === 'rename') {
      // Seed the input with whatever the row currently shows (first question
      // or title), so Rename edits the visible name rather than a hidden
      // default "Session …" title the user may never have seen.
      setDraftTitle(chatRowLabel(chat))
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

  // Destinations only — skip the chat's current project, and only offer
  // "No project" when the chat is already in one (ungrouped chats with
  // zero projects used to open a submenu whose only entry was "No
  // project", which did nothing useful).
  const moveDestinations = onMove
    ? [
        ...projects
          .filter((project) => project.id !== chat.projectId)
          .map((project) => ({ key: `move:${project.id}`, label: project.name })),
        ...(chat.projectId
          ? [{ key: `move:${NO_PROJECT_KEY}`, label: 'No project' }]
          : []),
      ]
    : []

  const menuItems: MenuProps['items'] = [
    { key: 'rename', label: 'Rename', icon: <ChatEditIcon /> },
    ...(moveDestinations.length > 0
      ? [
          {
            key: 'move',
            label: 'Move to',
            icon: <ChatMoveIcon />,
            children: moveDestinations,
            popupClassName: 'docu-chat-options-menu',
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

  // Single-line row label: first user question while the session still has
  // its default auto-title, otherwise the (possibly renamed) session title.
  // Shared rows append "by <owner>" on the same line via `subtitle`.
  const label = chatRowLabel(chat)
  const fullLabel = subtitle ? `${label} · ${subtitle}` : label

  const labelSpan = (
    <span
      className={`block min-w-0 truncate ${sidebar.body} ${
        isActive ? `${typeColor.primary} font-normal` : typeColor.secondary
      }`}
      title={fullLabel}
    >
      {label}
      {subtitle ? (
        <span className={`${typeColor.muted}`}> · {subtitle}</span>
      ) : null}
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
              setDraftTitle(chatRowLabel(chat))
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
          className="flex-1 min-w-0 flex items-center text-left px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0084ff]/35 rounded-[10px]"
        >
          {isShared || renaming || moving ? (
            <span className="flex items-center gap-1 min-w-0">
              {labelSpan}
              {isShared && (
                <span
                  role="img"
                  aria-label="Shared chat"
                  className="shrink-0 inline-flex items-center leading-none text-[#8e8e8e]"
                >
                  <ChatShareIcon />
                </span>
              )}
              {renaming && <Spin size="small" data-testid="rename-spinner" />}
              {moving && <Spin size="small" data-testid="move-chat-spinner" />}
            </span>
          ) : (
            labelSpan
          )}
        </button>
      )}

      {!isEditing && !readOnly && (
        <Dropdown
          menu={{
            items: menuItems,
            onClick: handleMenuClick,
            expandIcon: (
              <ChatChevronIcon className="docu-chat-options-expand" aria-hidden />
            ),
          }}
          trigger={['click']}
          placement="rightTop"
          transitionName=""
          destroyOnHidden
          classNames={{ root: 'docu-chat-options-menu' }}
          open={menuOpen}
          onOpenChange={setMenuOpen}
        >
          <ChatOptionsButton
            menuOpen={menuOpen}
            onClick={(e) => e.stopPropagation()}
            disabled={renaming || moving}
          />
        </Dropdown>
      )}

      {!isEditing && readOnly && onRemove && (
        <Dropdown
          menu={{ items: readOnlyMenuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="rightTop"
          transitionName=""
          destroyOnHidden
          classNames={{ root: 'docu-chat-options-menu' }}
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
