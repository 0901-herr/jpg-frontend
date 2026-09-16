import { Button, type ButtonProps } from 'antd'
import { AdminRefreshIcon } from '../../icons/admin'

interface AdminRetryButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'size'> {
  label?: string
}

export default function AdminRetryButton({
  label = 'Retry',
  ...props
}: AdminRetryButtonProps) {
  return (
    <Button icon={<AdminRefreshIcon />} {...props}>
      {label}
    </Button>
  )
}
