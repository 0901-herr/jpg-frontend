import { Input, Modal, Radio, Spin } from 'antd'
import { useState } from 'react'
import { type, typeColor } from '../styles/typography'
import type { ChatSession, ChatVisibility } from '../types'

interface ShareChatModalProps {
  chat: ChatSession | null
  onClose: () => void
  onChangeVisibility: (chatId: string, visibility: ChatVisibility) => Promise<void>
}

function shareLinkFor(token: string): string {
  return `${window.location.origin}/chat?share=${token}`
}

const OPTIONS: Record<ChatVisibility, { label: string; description: string }> = {
  private: {
    label: 'Private',
    description: 'Only you can access this chat. Anyone with an existing link loses access.',
  },
  view: {
    label: 'Anyone with the link can view',
    description: 'People with the link can read the chat, but cannot send messages.',
  },
  query: {
    label: 'Anyone with the link can view and ask',
    description:
      'People with the link can read and ask about your selected files. The shared file scope updates when you send a message.',
  },
}

/** Radio Private / "Anyone with the link can view" / "...and ask" — owner
 * only (`Sidebar` gates opening this behind `chat.isOwner` and
 * `FEATURES.chatSharing`). Changing the radio calls `onChangeVisibility`
 * right away (no separate Save step, matching the rest of this sidebar's
 * instant-action pattern); the link only appears once the chat actually
 * carries a token (private never does). */
export default function ShareChatModal({ chat, onClose, onChangeVisibility }: ShareChatModalProps) {
  const [updating, setUpdating] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!chat) return null

  const visibility: ChatVisibility = chat.visibility ?? 'private'

  const handleChange = (next: ChatVisibility) => {
    if (next === visibility) return
    setUpdating(true)
    setCopied(false)
    void onChangeVisibility(chat.id, next).finally(() => setUpdating(false))
  }

  const handleCopy = () => {
    if (!chat.shareToken) return
    const link = shareLinkFor(chat.shareToken)
    if (!navigator.clipboard) return
    navigator.clipboard
      .writeText(link)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return (
    <Modal open title="Share this chat" footer={null} onCancel={onClose} width={420} centered>
      <div className="mt-3">
        <Radio.Group
          onChange={(e) => handleChange(e.target.value as ChatVisibility)}
          value={visibility}
          disabled={updating}
          className="docu-share-options"
        >
          {(Object.keys(OPTIONS) as ChatVisibility[]).map((option) => (
            <Radio
              key={option}
              value={option}
              aria-label={OPTIONS[option].label}
              className="docu-share-option"
            >
              <span className="docu-share-option-label">{OPTIONS[option].label}</span>
              <span className={`docu-share-option-description ${type.caption} ${typeColor.muted}`}>
                {OPTIONS[option].description}
              </span>
            </Radio>
          ))}
        </Radio.Group>
        {updating && <Spin size="small" data-testid="visibility-spinner" />}
      </div>

      {visibility !== 'private' && chat.shareToken && (
        <div className="mt-5">
          <p className={`mb-2 ${type.caption} ${typeColor.secondary}`}>Share link</p>
          <div className="flex items-center gap-2">
          <Input readOnly value={shareLinkFor(chat.shareToken)} className="flex-1 min-w-0" />
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 px-3 py-2 rounded-lg border border-[#ececec] hover:bg-[#f4f4f4] transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          </div>
        </div>
      )}

      {visibility !== 'private' && !chat.shareToken && (
        <p className={`mt-5 ${type.caption} ${typeColor.muted}`}>Creating the link…</p>
      )}
    </Modal>
  )
}
