import { Input, Tooltip } from 'antd'
import { useState } from 'react'
import { ChatCloseIcon, ChatFileIcon, ChatSendIcon } from '../icons/chat'
import { sidebar, type, typeColor } from '../styles/typography'
import { radius, surface } from '../styles/theme'

interface ChatInputProps {
  selectedCount: number
  selectedFiles?: string[]
  onClearSelection: () => void
  onSend: (message: string) => void
  onStop: () => void
  isResponding?: boolean
  disabled?: boolean
  disabledReason?: string
}

function SelectedFilesTooltip({ files }: { files: string[] }) {
  if (files.length === 0) return null
  return (
    <ul className="m-0 list-disc pl-4 max-h-48 overflow-y-auto space-y-0.5">
      {files.map((filename) => (
        <li key={filename} className="text-xs leading-snug break-all">
          {filename}
        </li>
      ))}
    </ul>
  )
}

export default function ChatInput({
  selectedCount,
  selectedFiles = [],
  onClearSelection,
  onSend,
  onStop,
  isResponding = false,
  disabled = false,
  disabledReason,
}: ChatInputProps) {
  const [value, setValue] = useState('')

  const canSend = !isResponding && !disabled && value.trim().length > 0 && selectedCount > 0

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isResponding || disabled || selectedCount === 0) return
    onSend(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="px-6 pb-5 pt-0 bg-[var(--docu-bg-app)]">
      <div className="max-w-3xl mx-auto docu-chat-input space-y-2">
        {selectedCount > 0 && (
          <div
            className={`flex items-center justify-between gap-3 px-3 py-2 ${radius.md} ${surface.inset}`}
          >
            <Tooltip
              title={<SelectedFilesTooltip files={selectedFiles} />}
              placement="top"
              mouseEnterDelay={0.2}
              overlayClassName="docu-selected-files-tooltip"
            >
              <span
                className={`inline-flex items-center gap-1.5 ${type.caption} ${typeColor.secondary} cursor-default`}
              >
                <ChatFileIcon className="text-zinc-400" />
                {selectedCount} {selectedCount === 1 ? 'file' : 'files'} selected
              </span>
            </Tooltip>
            <button
              type="button"
              onClick={onClearSelection}
              className={`inline-flex items-center gap-1 ${sidebar.caption} ${typeColor.muted} hover:text-[#676767] transition-colors`}
            >
              <ChatCloseIcon className="text-inherit" />
              Clear
            </button>
          </div>
        )}

        {disabledReason && (
          <p className={`${type.caption} text-amber-700 px-1`}>{disabledReason}</p>
        )}

        <div className="docu-chat-composer flex items-stretch gap-2 px-4 py-2">
          <Input.TextArea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedCount > 0
                ? 'Ask a question about the selected documents…'
                : 'Select documents first…'
            }
            disabled={disabled || selectedCount === 0}
            autoSize={{ minRows: 1, maxRows: 4 }}
            variant="borderless"
            className={`flex-1 !px-0 !py-2 ${type.body} !shadow-none resize-none !leading-6`}
          />
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={isResponding ? onStop : handleSend}
              disabled={!isResponding && !canSend}
              className={`w-9 h-9 ${radius.full} flex items-center justify-center transition-colors ${
                isResponding || canSend
                  ? 'bg-[#0084ff] hover:bg-[#0077e6]'
                  : 'bg-[#ececec] cursor-not-allowed'
              }`}
              aria-label={isResponding ? 'Stop response' : 'Send message'}
            >
              {isResponding ? (
                <span className="block w-3 h-3 bg-white rounded-[2px]" aria-hidden />
              ) : (
                <ChatSendIcon className={canSend ? '!text-white' : '!text-[#8e8e8e]'} />
              )}
            </button>
          </div>
        </div>

        <p className={`${type.caption} ${typeColor.muted} px-1`}>
          This chat is{' '}
          <span className={typeColor.primary}>not context-aware</span>. Each question is a{' '}
          <span className={typeColor.primary}>separate question</span>, not a follow-up.
        </p>
      </div>
    </div>
  )
}
