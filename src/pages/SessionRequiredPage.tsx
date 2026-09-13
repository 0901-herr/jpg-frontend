import { Button, Typography } from 'antd'
import { ChatLockIcon, ChatOpenIcon } from '../icons/chat'
import { LOGICALDOC_APP_URL } from '../config/logicaldoc'
import { useAuth } from '../context/AuthContext'
import { type, typeColor } from '../styles/typography'
import { radius, surface } from '../styles/theme'

const { Title, Paragraph } = Typography

export default function SessionRequiredPage() {
  const { sessionExpired, signedOut } = useAuth()

  const title = signedOut
    ? 'You have signed out'
    : sessionExpired
      ? 'Session expired'
      : 'Sign in required'

  const description = signedOut
    ? 'You are no longer signed in to AI Chat.'
    : sessionExpired
      ? 'Your AI Chat session has expired.'
      : 'You need an active LogicalDOC session to use AI Chat.'

  return (
    <div className={`min-h-screen ${surface.page} flex items-center justify-center p-4`}>
      <div className={`w-full max-w-md text-center ${surface.card} ${radius.md} p-8`}>
        <div
          className={`inline-flex items-center justify-center w-12 h-12 ${radius.md} ${surface.inset} mb-4`}
        >
          <ChatLockIcon className="text-zinc-500" />
        </div>

        <Title level={4} className="!mb-3 !font-semibold !text-zinc-900">
          {title}
        </Title>

        <Paragraph className={`!mb-0 ${type.body} ${typeColor.secondary}`}>
          {description}
        </Paragraph>

        <Paragraph className={`!mt-3 !mb-6 ${type.body} ${typeColor.secondary}`}>
          Open <strong>LogicalDOC</strong>, then launch <strong>AI Chat</strong> from there to
          continue.
        </Paragraph>

        <Button
          type="primary"
          size="large"
          href={LOGICALDOC_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          icon={<ChatOpenIcon />}
          className="inline-flex items-center"
        >
          Open LogicalDOC
        </Button>
      </div>
    </div>
  )
}
