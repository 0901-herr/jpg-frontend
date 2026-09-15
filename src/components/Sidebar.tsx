import { Avatar, Dropdown, Layout } from 'antd'
import { ChatAddIcon, ChatLogoutIcon, ChatMessageIcon } from '../icons/chat'
import type { MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { sectionLabel, spacing, surface } from '../styles/theme'
import { sidebar, typeColor } from '../styles/typography'
import type { BrowseTreeState } from '../hooks/useBrowseTree'
import type { DocumentSelection } from '../hooks/useDocumentSelection'
import type { ChatSession } from '../types'
import ChatListItem from './ChatListItem'
import FolderSidebar from './FolderSidebar'
import SidebarNavItem from './SidebarNavItem'

const { Sider } = Layout

interface SidebarProps {
  /** A plain pixel number for the desktop resizable panel, or a CSS width
   * string (e.g. `"100%"`) when Sidebar is rendered to fill an antd Drawer
   * instead — see AppLayout's narrow-layout branch. */
  width: number | string
  sessions: ChatSession[]
  activeChatId: string
  browse: BrowseTreeState
  selection: DocumentSelection
  onSelectChat: (chatId: string) => void
  onRenameChat: (chatId: string, title: string) => void
  onDeleteChat: (chatId: string) => void
  onNewChat: () => void
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
  activeChatId,
  browse,
  selection,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onNewChat,
  onNavigate,
  inDrawer = false,
}: SidebarProps) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

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
            Drawer (AppLayout.tsx) renders "ARCHE AI" itself, in its own
            header, on the same row as the close button (fix round 1) —
            rendering it again here would duplicate it right below that
            header instead of sharing its row. */}
        {!inDrawer && (
          <div className="shrink-0 mb-3 text-left">
            <span className={`text-lg font-semibold ${typeColor.primary}`}>ARCHE AI</span>
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
            <FolderSidebar browse={browse} selection={selection} />
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
            <span className={sectionLabel}>
              <ChatMessageIcon />
              Chats
            </span>
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 space-y-0.5">
              {sessions.map((chat) => (
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
                />
              ))}
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
    </Sider>
  )
}
