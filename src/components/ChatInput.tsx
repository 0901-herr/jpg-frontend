import { ArrowUpOutlined, FileOutlined } from '@ant-design/icons'
import { Input } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { useMemo, useRef, useState } from 'react'
import type { DocumentItem } from '../api/types/documents'
import { type, typeColor } from '../styles/typography'
import {
  displayDocumentName,
  filterDocumentsForMention,
} from '../utils/documentMentions'

interface ChatInputProps {
  documents: DocumentItem[]
  onSend: (message: string) => void
  onStop: () => void
  isResponding?: boolean
}

export default function ChatInput({
  documents,
  onSend,
  onStop,
  isResponding = false,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const [mentionFilter, setMentionFilter] = useState<string | null>(null)
  const textareaRef = useRef<TextAreaRef>(null)

  const canSend = !isResponding && value.trim().length > 0

  const mentionSuggestions = useMemo(
    () =>
      mentionFilter === null
        ? []
        : filterDocumentsForMention(documents, mentionFilter),
    [documents, mentionFilter],
  )

  const updateMentionState = (text: string, cursor: number) => {
    const before = text.slice(0, cursor)
    const atMatch = before.match(/@("([^"]*)"|([^\s@]*))$/)
    setMentionFilter(atMatch ? (atMatch[2] ?? atMatch[3] ?? '') : null)
  }

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || isResponding) return
    onSend(trimmed)
    setValue('')
    setMentionFilter(null)
  }

  const insertMention = (doc: DocumentItem) => {
    const el = textareaRef.current?.resizableTextArea?.textArea
    const cursor = el?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    const name = displayDocumentName(doc)
    const needsQuotes = name.includes(' ')
    const mention = needsQuotes ? `@"${name}"` : `@${name}`
    const nextBefore = before.replace(/@("([^"]*)"|([^\s@]*))$/, `${mention} `)
    const next = `${nextBefore}${after}`
    setValue(next)
    setMentionFilter(null)
    requestAnimationFrame(() => {
      const input = textareaRef.current?.resizableTextArea?.textArea
      input?.focus()
      const pos = nextBefore.length
      input?.setSelectionRange(pos, pos)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape' && mentionFilter !== null) {
      e.preventDefault()
      setMentionFilter(null)
    }
  }

  return (
    <div className="px-8 pb-6 pt-2">
      <div className="relative max-w-3xl mx-auto">
        {mentionFilter !== null && mentionSuggestions.length > 0 && (
          <div
            className="absolute left-0 right-14 bottom-full mb-2 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-10"
            role="listbox"
            aria-label="Document suggestions"
          >
            {mentionSuggestions.map((doc) => (
              <button
                key={doc.doc_id}
                type="button"
                role="option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(doc)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 ${type.body} ${typeColor.secondary}`}
              >
                <FileOutlined className={`${type.caption} ${typeColor.muted} shrink-0`} />
                <span className="truncate">{displayDocumentName(doc)}</span>
              </button>
            ))}
          </div>
        )}

        <Input.TextArea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            updateMentionState(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }}
          onClick={(e) =>
            updateMentionState(
              value,
              (e.target as HTMLTextAreaElement).selectionStart ?? value.length,
            )
          }
          onKeyDown={handleKeyDown}
          placeholder='Ask a question, or type @ to pick a document'
          autoSize={{ minRows: 1, maxRows: 4 }}
          className={`!rounded-2xl !py-3.5 !px-5 !pr-14 ${type.body} !border-gray-200 !shadow-none resize-none`}
        />
        <button
          type="button"
          onClick={isResponding ? onStop : handleSend}
          disabled={!isResponding && !canSend}
          className={`absolute right-3 bottom-2.5 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            isResponding || canSend
              ? 'bg-black hover:bg-gray-800'
              : 'bg-gray-200 cursor-not-allowed'
          }`}
          aria-label={isResponding ? 'Stop response' : 'Send message'}
        >
          {isResponding ? (
            <span className="block w-2.5 h-2.5 bg-white rounded-sm" aria-hidden />
          ) : (
            <ArrowUpOutlined
              className={canSend ? `${type.caption} !text-white` : `${type.caption} !text-gray-400`}
            />
          )}
        </button>
      </div>
    </div>
  )
}
