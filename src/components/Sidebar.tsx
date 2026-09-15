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
  width: number
  sessions: ChatSession[]
  activeChatId: string
  browse: BrowseTreeState
  selection: DocumentSelection
  onSelectChat: (chatId: string) => void
  onRenameChat: (chatId: string, title: string) => void
  onDeleteChat: (chatId: string) => void
  onNewChat: () => void
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
      className={`docu-sidebar ${surface.sidebar} !h-screen !overflow-hidden`}
      theme="light"
    >
      <div className={`flex flex-col h-full min-h-0 ${spacing.panelLg}`}>
        <div className="shrink-0 mb-3 text-left">
          <span className={`text-lg font-semibold ${typeColor.primary}`}>ARCHE AI</span>
        </div>

        <div className={`flex flex-col flex-1 min-h-0 ${spacing.section} overflow-hidden`}>
          <div className="flex flex-col min-h-0 flex-[3] overflow-hidden pt-1">
            <FolderSidebar browse={browse} selection={selection} />
          </div>

          <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${spacing.sectionY}`}>
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
                  onSelect={() => onSelectChat(chat.id)}
                  onRename={onRenameChat}
                  onDelete={onDeleteChat}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-2 mt-1">
          <SidebarNavItem icon={<ChatAddIcon />} onClick={onNewChat} variant="primary">
            New chat
          </SidebarNavItem>

          <div className="mt-2 pt-2 border-t border-[#ececec]">
            <Dropdown
              menu={{ items: profileMenu, onClick: handleProfileMenuClick }}
              trigger={['click']}
              placement="topLeft"
              overlayClassName="docu-profile-menu"
            >
              <button
                type="button"
                className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-[10px] text-left transition-colors hover:bg-[#ececec] ${sidebar.body}`}
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
