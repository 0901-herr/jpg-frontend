import { EllipsisOutlined } from '@ant-design/icons'
import { Dropdown, Input, Modal } from 'antd'
import type { InputRef, MenuProps } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { type, typeColor } from '../styles/typography'
import type { ChatSession } from '../types'

interface ChatListItemProps {
  chat: ChatSession
  isActive: boolean
  onSelect: () => void
  onRename: (chatId: string, title: string) => void
  onDelete: (chatId: string) => void
}

export default function ChatListItem({
  chat,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ChatListItemProps) {
  const [isEditing, setIsEditing] = useState(false)
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
    if (key === 'delete') {
      Modal.confirm({
        title: 'Delete chat?',
        content: 'This cannot be undone.',
        okText: 'Delete',
        okType: 'danger',
        cancelText: 'Cancel',
        centered: true,
        onOk: () => onDelete(chat.id),
      })
    }
  }

  const menuItems: MenuProps['items'] = [
    { key: 'rename', label: 'Rename' },
    { type: 'divider' },
    { key: 'delete', label: 'Delete', danger: true },
  ]

  return (
    <div
      className={`docu-chat-row group flex items-center gap-0.5 rounded-lg transition-colors ${
        isActive ? 'docu-chat-row-active bg-gray-200/70' : 'hover:bg-gray-100'
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
          className={`flex-1 min-w-0 mx-1 my-1 ${type.body}`}
          maxLength={80}
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className={`flex-1 min-w-0 text-left px-3 py-2 ${type.body} truncate ${
            isActive ? 'text-gray-900' : typeColor.secondary
          }`}
        >
          {chat.title}
        </button>
      )}

      {!isEditing && (
        <Dropdown
          menu={{ items: menuItems, onClick: handleMenuClick }}
          trigger={['click']}
          placement="bottomRight"
        >
          <button
            type="button"
            aria-label="Chat options"
            onClick={(e) => e.stopPropagation()}
            className={`docu-chat-menu-btn shrink-0 p-1.5 mr-1 rounded-md ${typeColor.muted} hover:text-gray-700 hover:bg-gray-200/80 opacity-0 group-hover:opacity-100 ${
              isActive ? 'opacity-100' : ''
            }`}
          >
            <EllipsisOutlined className={type.caption} />
          </button>
        </Dropdown>
      )}
    </div>
  )
}
