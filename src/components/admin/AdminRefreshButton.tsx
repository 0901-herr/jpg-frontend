import { Button, type ButtonProps } from 'antd'
import { AdminRefreshIcon } from '../../icons/admin'

type AdminRefreshButtonProps = Omit<ButtonProps, 'children' | 'icon' | 'size'>

export default function AdminRefreshButton(props: AdminRefreshButtonProps) {
  return (
    <Button icon={<AdminRefreshIcon />} {...props}>
      Refresh
    </Button>
  )
}
