import { RESIZE_HANDLE_WIDTH } from '../hooks/useResizableWidth'

interface SidebarResizeHandleProps {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  isResizing: boolean
}

export default function SidebarResizeHandle({ onPointerDown, isResizing }: SidebarResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      onPointerDown={onPointerDown}
      style={{ width: RESIZE_HANDLE_WIDTH }}
      className="h-full shrink-0 pl-1 flex items-center cursor-col-resize touch-none group"
    >
      <div
        className={`w-0.5 h-12 rounded-full transition-colors ${
          isResizing ? 'bg-gray-400' : 'bg-gray-200 group-hover:bg-gray-300'
        }`}
      />
    </div>
  )
}
