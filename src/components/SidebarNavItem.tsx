import type { ReactNode } from 'react'
import { sidebar, typeColor } from '../styles/typography'
import { sidebarNav } from '../styles/theme'

interface SidebarNavItemProps {
  icon: ReactNode
  children: ReactNode
  onClick?: () => void
  active?: boolean
  variant?: 'default' | 'primary'
  className?: string
  title?: string
}

export default function SidebarNavItem({
  icon,
  children,
  onClick,
  active = false,
  variant = 'default',
  className = '',
  title,
}: SidebarNavItemProps) {
  const Tag = onClick ? 'button' : 'div'
  const isPrimary = variant === 'primary'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={`w-full flex items-center gap-3 px-3 py-2 text-left ${sidebarNav.row} ${
        isPrimary
          ? 'bg-[#0084ff] text-white hover:bg-[#0077e6] font-medium'
          : active
            ? sidebarNav.active
            : sidebarNav.idle
      } ${sidebar.body} ${
        isPrimary ? '!text-white' : active ? typeColor.primary : typeColor.secondary
      } ${className}`}
    >
      <span
        className={`${isPrimary ? 'w-5 h-5 text-white' : sidebarNav.icon} shrink-0 flex items-center justify-center text-[14px]`}
      >
        {icon}
      </span>
      <span className="truncate min-w-0 flex-1">{children}</span>
    </Tag>
  )
}
