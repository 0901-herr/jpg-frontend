import { RESIZE_HANDLE_WIDTH } from '../hooks/useResizableWidth'

interface SidebarResizeHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  isResizing: boolean
}

export default function SidebarResizeHandle({ onPointerDown }: SidebarResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      style={{ width: RESIZE_HANDLE_WIDTH }}
      className="h-full shrink-0 cursor-col-resize touch-none bg-[var(--docu-bg-app)]"
    >
      <div className="w-1 h-full" aria-hidden />
    </div>
  )
}
