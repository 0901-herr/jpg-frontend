import { Typography } from 'antd'
import { useEffect, useState } from 'react'
import { type, typeColor } from '../styles/typography'
import { radius } from '../styles/theme'
import { splitAnswerByDocRefs } from '../utils/citations'
import type { ChatMessage } from '../types'
import CitationList, { CitationLink } from './CitationList'

const { Text } = Typography

function ThinkingIndicator() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <span className={`${type.body} ${typeColor.muted} docu-thinking-shimmer`} aria-live="polite">
      Thinking {elapsed}s
    </span>
  )
}

interface AssistantMessageProps {
  message: ChatMessage
}

function formatThoughtDuration(seconds: number): string {
  return `Thought for ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
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
  if (message.status === 'thinking') {
    return <ThinkingIndicator />
  }

  return (
    <div className="space-y-3">
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
