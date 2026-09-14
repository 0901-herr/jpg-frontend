import { Input, Tooltip } from 'antd'
import { useState } from 'react'
import { ChatCloseIcon, ChatSendIcon } from '../icons/chat'
import type { QueryTier } from '../api/types/query'
import { getSendDisabledReason } from '../utils/chatComposerGate'
import { type, typeColor } from '../styles/typography'
import { radius } from '../styles/theme'
import QueryTierDropdown from './QueryTierDropdown'

interface ChatInputProps {
  selectedCount: number
  selectedFiles?: string[]
  onClearSelection: () => void
  onSend: (message: string) => void
  onSummarize: () => void
  onExtractMetadata: () => void
  onStop: () => void
  isResponding?: boolean
  disabled?: boolean
  disabledReason?: string
  summarizeDisabledReason?: string | null
  extractMetadataDisabledReason?: string | null
  queryTier: QueryTier
  onQueryTierChange: (tier: QueryTier) => void
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
  onSummarize,
  onExtractMetadata,
  onStop,
  isResponding = false,
  disabled = false,
  disabledReason,
  summarizeDisabledReason = null,
  extractMetadataDisabledReason = null,
  queryTier,
  onQueryTierChange,
}: ChatInputProps) {
  const [value, setValue] = useState('')

  const canSend = !isResponding && !disabled && value.trim().length > 0 && selectedCount > 0
  const canSummarize = summarizeDisabledReason == null
  const canExtractMetadata = extractMetadataDisabledReason == null
  const sendDisabledReason = getSendDisabledReason({
    selectedCount,
    hasMessage: value.trim().length > 0,
    isResponding,
    disabled,
  })

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
    <div className="docu-chat-input-footer bg-[var(--docu-bg-app)]">
      <div className="max-w-4xl mx-auto docu-chat-input">
        {disabledReason && (
          <p className={`${type.caption} text-amber-700 px-1 mb-2`}>{disabledReason}</p>
        )}

        <div className="docu-chat-input-stack">
        <div className="docu-chat-composer flex items-center gap-2">
          <div className="docu-chat-composer-lead flex items-center shrink-0">
            {selectedCount > 0 && (
              <div className="docu-chat-composer-files-wrap">
                <Tooltip
                  title={<SelectedFilesTooltip files={selectedFiles} />}
                  placement="top"
                  mouseEnterDelay={0.2}
                  overlayClassName="docu-selected-files-tooltip"
                >
                  <span
                    className="docu-chat-composer-files"
                    aria-label={`${selectedCount} file${selectedCount === 1 ? '' : 's'} selected`}
                  >
                    {selectedCount} {selectedCount === 1 ? 'file' : 'files'}
                  </span>
                </Tooltip>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="docu-chat-composer-files-clear"
                  aria-label="Clear selection"
                >
                  <ChatCloseIcon className="text-inherit" />
                </button>
              </div>
            )}
          </div>

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
            className={`flex-1 !px-0 !py-0 ${type.body} !shadow-none resize-none !leading-6`}
          />

          <div className="docu-chat-composer-actions flex items-center shrink-0">
            <QueryTierDropdown
              tier={queryTier}
              onChange={onQueryTierChange}
              disabled={disabled || isResponding}
            />
            <Tooltip
              title={summarizeDisabledReason ?? undefined}
              placement="top"
              mouseEnterDelay={0.2}
            >
              <span className="inline-flex">
                <button
                  type="button"
                  onClick={onSummarize}
                  disabled={!canSummarize}
                  className="docu-chat-composer-summarize"
                  aria-label="Summarize selected document"
                >
                  Summarize
                </button>
              </span>
            </Tooltip>
            <Tooltip
              title={extractMetadataDisabledReason ?? undefined}
              placement="top"
              mouseEnterDelay={0.2}
            >
              <span className="inline-flex">
                <button
                  type="button"
                  onClick={onExtractMetadata}
                  disabled={!canExtractMetadata}
                  className="docu-chat-composer-extract"
                  aria-label="Extract MQA metadata"
                >
                  Extract metadata
                </button>
              </span>
            </Tooltip>
            <Tooltip
              title={sendDisabledReason ?? undefined}
              placement="top"
              mouseEnterDelay={0.2}
            >
              <span className="inline-flex">
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
              </span>
            </Tooltip>
          </div>
        </div>

        <p className={`docu-chat-input-disclaimer ${type.caption} ${typeColor.muted}`}>
          Single question mode: this chat is{' '}
          <span className={typeColor.primary}>not context-aware</span>. Each question is a{' '}
          <span className={typeColor.primary}>separate question</span>, not a follow-up.
        </p>
        </div>
      </div>
    </div>
  )
}
