import { Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { type, typeColor } from '../styles/typography'
import type { ChatMessage } from '../types'

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

function AssistantMessage({ message }: AssistantMessageProps) {
  if (message.status === 'thinking') {
    return <ThinkingIndicator />
  }

  return (
    <div className="space-y-3">
      <div>
        <div className={`${type.body} ${typeColor.body} leading-relaxed`}>
          {message.content}
          {message.fileTags && message.fileTags.length > 0 && (
            <span className="inline-flex items-center gap-1 ml-2 align-middle">
              {message.fileTags.map((tag, i) => (
                <Tag
                  key={`${tag}-${i}`}
                  className={`!m-0 !rounded ${type.caption} !border-gray-200 !bg-gray-50 !text-gray-500`}
                >
                  {tag}
                </Tag>
              ))}
            </span>
          )}
        </div>
        {message.thinkingSeconds != null && message.thinkingSeconds > 0 && (
          <Text className={`${type.caption} ${typeColor.muted} block mt-1.5`}>
            {formatThoughtDuration(message.thinkingSeconds)}
          </Text>
        )}
      </div>

      {message.sources && message.sources.length > 0 && (
        <div>
          <Text strong className={`${type.body} ${typeColor.primary} block mb-1.5`}>
            Sources
          </Text>
          <ol className="list-none space-y-0.5 m-0 p-0">
            {message.sources.map((source) => (
              <li key={source.index} className={`${type.body} ${typeColor.caption}`}>
                [{source.index}] {source.filename}
                {source.reference && (
                  <span className={typeColor.muted}> — {source.reference}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
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
        <div className="inline-block bg-gray-100 rounded-2xl px-4 py-2.5 mb-3 max-w-xl">
          <Text className={`${type.body} ${typeColor.body}`}>{message.content}</Text>
        </div>
      ) : (
        <AssistantMessage message={message} />
      )}
      {showDivider && <hr className="border-gray-200 my-6" />}
    </div>
  )
}
