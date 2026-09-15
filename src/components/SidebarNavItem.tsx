import type { ReactNode } from 'react'
import { sidebar, typeColor } from '../styles/typography'
import { border, sidebarNav } from '../styles/theme'

interface SidebarNavItemProps {
  icon: ReactNode
  children: ReactNode
  onClick?: () => void
  active?: boolean
  /** 'secondary' — a bordered, full-width button (the "New chat" row,
   * mainstream placement directly under the wordmark): visible chrome
   * without the accent colour, which stays reserved for primary actions
   * and focus rings. */
  variant?: 'default' | 'primary' | 'secondary'
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
  const isSecondary = variant === 'secondary'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 text-left ${sidebarNav.row} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0084ff]/35 ${
        isPrimary
          ? 'bg-[#0084ff] text-white hover:bg-[#0077e6] font-medium'
          : isSecondary
            ? `border ${border.default} hover:bg-[var(--docu-bg-hover)] font-medium`
            : active
              ? sidebarNav.active
              : sidebarNav.idle
      } ${sidebar.body} ${
        isPrimary
          ? '!text-white'
          : isSecondary
            ? typeColor.primary
            : active
              ? typeColor.primary
              : typeColor.secondary
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
