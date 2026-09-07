import { Tag } from 'antd'
import type { LifecycleStatus } from '../../api/types/admin'
import { LIFECYCLE_COLORS, LIFECYCLE_LABELS } from '../../utils/lifecycle'

interface DocumentStatusBadgeProps {
  status: LifecycleStatus | string
}

export default function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const key = (status in LIFECYCLE_LABELS ? status : 'DISCOVERED') as LifecycleStatus
  return <Tag color={LIFECYCLE_COLORS[key]}>{LIFECYCLE_LABELS[key]}</Tag>
}
