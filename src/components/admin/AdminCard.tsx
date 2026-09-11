import { Card, type CardProps } from 'antd'
import {
  ADMIN_CARD_BODY_CLASS,
  ADMIN_CARD_CLASS,
  ADMIN_CARD_HEAD_CLASS,
} from '../../config/adminStyles'

export default function AdminCard({ className, ...props }: CardProps) {
  return (
    <Card
      variant="borderless"
      className={`${ADMIN_CARD_CLASS} ${className ?? ''}`}
      classNames={{ header: ADMIN_CARD_HEAD_CLASS, body: ADMIN_CARD_BODY_CLASS }}
      {...props}
    />
  )
}
