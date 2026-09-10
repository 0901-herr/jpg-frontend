import { Typography } from 'antd'
import { useEffect, useState } from 'react'
import { type, typeColor } from '../styles/typography'
import { radius } from '../styles/theme'
import { splitAnswerByDocRefs } from '../utils/citations'
import type { ChatMessage, CoverageInfo } from '../types'
import CitationList, { CitationLink } from './CitationList'

const { Text } = Typography

function ThinkingIndicator({ label }: { label?: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  const headline = label ?? 'Getting started…'

  return (
    <div className="space-y-1" aria-live="polite">
      <span className={`${type.body} ${typeColor.muted} docu-thinking-shimmer block`}>
        {headline}
      </span>
      <span className={`${type.caption} ${typeColor.muted} block`}>{elapsed}s</span>
    </div>
  )
}

function ErrorMessage({
  content,
  progressHint,
}: {
  content: string
  progressHint?: string
}) {
  return (
    <div
      className={`${radius.md} border border-amber-200 bg-amber-50 px-4 py-3 ${type.body} text-amber-950`}
      role="alert"
    >
      <p className="font-medium mb-1">Couldn&apos;t finish this answer</p>
      <p className="leading-relaxed">{content}</p>
      {progressHint && (
        <p className={`${type.caption} mt-2 text-amber-800/80`}>
          Last step: {progressHint.replace(/…$/, '')}
        </p>
      )}
    </div>
  )
}

interface AssistantMessageProps {
  message: ChatMessage
}

function formatThoughtDuration(seconds: number): string {
  return `Thought for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}

function CoverageNotice({ coverage }: { coverage?: CoverageInfo }) {
  const indexing = coverage?.indexing_files ?? 0
  if (indexing <= 0) return null

  const total = coverage?.total_files
  const ready = coverage?.ready_files ?? 0
  const scope =
    total != null ? `${ready} of ${total} selected documents ready` : `${indexing} still indexing`

  return (
    <p className={`${type.caption} ${typeColor.muted} leading-relaxed`} role="status">
      {scope}. Some documents are still indexing, so the answer may be incomplete.
    </p>
  )
}

function AnswerContent({ message }: { message: ChatMessage }) {
  const sources = message.sources ?? []
  const segments = splitAnswerByDocRefs(message.content, sources)
  const isStreaming = message.status === 'streaming'

  return (
    <div className={`${type.body} ${typeColor.body} leading-relaxed whitespace-pre-wrap`}>
      {segments.map((segment, i) => {
        if (segment.type === 'ref') {
          return (
            <CitationLink
              key={`ref-${i}`}
              source={segment.source}
              label={segment.value}
            />
          )
        }
        return <span key={`text-${i}`}>{segment.value}</span>
      })}
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle rounded-sm" />
      )}
    </div>
  )
}

function AssistantMessage({ message }: AssistantMessageProps) {
  if (message.status === 'error') {
    return (
      <ErrorMessage content={message.content} progressHint={message.progressLabel} />
    )
  }

  if (message.status === 'thinking') {
    return (
      <div className="space-y-2">
        <CoverageNotice coverage={message.coverage} />
        <ThinkingIndicator label={message.progressLabel} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <CoverageNotice coverage={message.coverage} />
      {message.status === 'streaming' && message.progressLabel && (
        <p className={`${type.caption} ${typeColor.muted}`}>{message.progressLabel}</p>
      )}
      <AnswerContent message={message} />

      {message.thinkingSeconds != null &&
        message.thinkingSeconds > 0 &&
        message.status !== 'streaming' && (
          <p className={`${type.caption} text-[#8e8e8e] block leading-relaxed mt-8`}>
            {formatThoughtDuration(message.thinkingSeconds)}
          </p>
        )}

      {message.sources && message.sources.length > 0 && message.status !== 'streaming' && (
        <CitationList sources={message.sources} />
      )}
    </div>
  )
}

interface ChatMessageItemProps {
  message: ChatMessage
  showDivider?: boolean
}

export default function ChatMessageItem({ message, showDivider }: ChatMessageItemProps) {
  return (
    <div>
      {message.role === 'user' ? (
        <div className={`inline-block bg-[#f4f4f4] ${radius.lg} px-4 py-3 mt-6 mb-4 max-w-xl`}>
          <Text className={`${type.body} ${typeColor.body}`}>{message.content}</Text>
        </div>
      ) : (
        <AssistantMessage message={message} />
      )}
      {showDivider && <hr className="my-6 border-0 border-t border-[#ececec]" />}
    </div>
  )
}
