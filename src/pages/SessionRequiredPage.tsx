import { Typography } from 'antd'
import { ChatLockIcon } from '../icons/chat'
import { useAuth } from '../context/AuthContext'
import { type, typeColor } from '../styles/typography'
import { radius, surface } from '../styles/theme'

const { Title, Paragraph } = Typography

export default function SessionRequiredPage() {
  const { sessionExpired } = useAuth()

  return (
    <div className={`min-h-screen ${surface.page} flex items-center justify-center p-4`}>
      <div className={`w-full max-w-md text-center ${surface.card} ${radius.md} p-8`}>
        <div
          className={`inline-flex items-center justify-center w-12 h-12 ${radius.md} ${surface.inset} mb-4`}
        >
          <ChatLockIcon className="text-zinc-500" />
        </div>

        <Title level={4} className="!mb-3 !font-semibold !text-zinc-900">
          {sessionExpired ? 'Session expired' : 'Sign in required'}
        </Title>

        <Paragraph className={`!mb-0 ${type.body} ${typeColor.secondary}`}>
          {sessionExpired
            ? 'Your AI Chat session has expired.'
            : 'You need an active LogicalDOC session to use AI Chat.'}
        </Paragraph>

        <Paragraph className={`!mt-3 !mb-0 ${type.body} ${typeColor.secondary}`}>
          Reopen <strong>AI Chat</strong> from LogicalDOC to continue.
        </Paragraph>

        <p className={`${type.caption} ${typeColor.muted} mt-6 pt-6 border-t border-[#ececec]`}>
          Dev: visit{' '}
          <code className="font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded-md">
            /api/auth/session?exchange=…
          </code>{' '}
          after handoff, or set{' '}
          <code className="font-mono text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded-md">
            VITE_AUTH_BYPASS=true
          </code>
          .
        </p>
      </div>
    </div>
  )
}
