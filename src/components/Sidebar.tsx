import {
  FileOutlined,
  FolderOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { Avatar, Layout, Spin, Tree, Typography } from 'antd'
import type { DataNode } from 'antd/es/tree'
import { useMemo } from 'react'
import type { DocumentItem } from '../api/types/documents'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../hooks/queries/useDocuments'
import { type, typeColor } from '../styles/typography'
import type { ChatSession } from '../types'
import ChatListItem from './ChatListItem'

const { Sider } = Layout
const { Text } = Typography

interface SidebarProps {
  width: number
  sessions: ChatSession[]
  activeChatId: string
  selectedDocumentId: string | null
  onSelectChat: (chatId: string) => void
  onRenameChat: (chatId: string, title: string) => void
  onDeleteChat: (chatId: string) => void
  onNewChat: () => void
  onSelectDocument: (document: DocumentItem) => void
}

function renderTreeTitle(node: DataNode) {
  const isLeaf = node.isLeaf ?? !node.children?.length
  return (
    <span className={`flex items-center gap-1.5 min-w-0 ${type.bodyLg}`}>
      {isLeaf ? (
        <FileOutlined className={`${typeColor.muted} ${type.body} shrink-0`} />
      ) : (
        <FolderOutlined className={`${typeColor.muted} ${type.body} shrink-0`} />
      )}
      <span className="truncate">{String(node.title ?? '')}</span>
    </span>
  )
}

export default function Sidebar({
  width,
  sessions,
  activeChatId,
  selectedDocumentId,
  onSelectChat,
  onRenameChat,
  onDeleteChat,
  onNewChat,
  onSelectDocument,
}: SidebarProps) {
  const { session } = useAuth()
  const { treeData, documents, isLoading, isError } = useDocuments()

  const documentById = useMemo(
    () => new Map(documents.map((doc) => [doc.doc_id, doc])),
    [documents],
  )

  const displayName = session?.username ?? 'Username'
  const avatarInitial = displayName.charAt(0).toUpperCase()

  return (
    <Sider
      width={width}
      className="docu-sidebar !bg-gray-50 !h-screen !overflow-hidden"
      theme="light"
    >
      <div className="flex flex-col h-full min-h-0 px-4 py-5">
        <Text strong className={`${type.title} ${typeColor.primary} mb-6 block shrink-0`}>
          Docu Arch AI
        </Text>

        <div className="flex flex-col flex-1 min-h-0 gap-6">
          <div className="flex flex-col min-h-0 flex-[3]">
            <Text strong className={`${type.body} ${typeColor.primary} mb-2 block shrink-0`}>
              Files
            </Text>
            <div className="docu-fade-bottom docu-file-tree-panel relative flex-1 min-h-0">
              <div className="docu-file-tree overflow-y-auto overflow-x-hidden h-full min-h-0">
                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <Spin size="small" />
                  </div>
                ) : isError ? (
                  <Text type="secondary" className={`${type.caption} px-1`}>
                    Could not load documents
                  </Text>
                ) : treeData.length === 0 ? (
                  <Text type="secondary" className={`${type.caption} px-1`}>
                    No indexed documents yet
                  </Text>
                ) : (
                  <Tree
                    defaultExpandAll
                    treeData={treeData}
                    titleRender={renderTreeTitle}
                    selectedKeys={selectedDocumentId ? [selectedDocumentId] : []}
                    onSelect={(keys, info) => {
                      if (!info.node.isLeaf || keys.length === 0) return
                      const doc = documentById.get(String(keys[0]))
                      if (doc) onSelectDocument(doc)
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0 flex-[2]">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <Text strong className={`${type.body} ${typeColor.primary}`}>
                Chats
              </Text>
              <button
                type="button"
                onClick={onNewChat}
                className={`${typeColor.muted} hover:text-gray-600 transition-colors p-0.5 rounded`}
                aria-label="New chat"
              >
                <PlusOutlined className={type.caption} />
              </button>
            </div>

            <div className="flex-1 overflow-auto min-h-0 space-y-0.5">
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

        <div className="flex items-center gap-2.5 pt-4 shrink-0 border-t border-gray-200">
          <Avatar size={32} className="!bg-gray-300 !text-gray-700 shrink-0">
            {avatarInitial}
          </Avatar>
          <Text className={`${type.body} ${typeColor.secondary}`}>{displayName}</Text>
        </div>
      </div>
    </Sider>
  )
}
