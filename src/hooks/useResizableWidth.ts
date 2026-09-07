import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_MIN = 240
const DEFAULT_MAX = 480
const DEFAULT_WIDTH = 280

/** Width of the drag strip sitting outside the sidebar panel. */
export const RESIZE_HANDLE_WIDTH = 16

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function applySidebarWidth(container: HTMLElement | null, sidebarWidth: number) {
  if (!container) return

  const panel = container.querySelector('.docu-sidebar-panel') as HTMLElement | null
  if (panel) {
    panel.style.width = `${sidebarWidth}px`
  }

  const sider = container.querySelector('.ant-layout-sider') as HTMLElement | null
  if (!sider) return

  sider.style.width = `${sidebarWidth}px`
  sider.style.minWidth = `${sidebarWidth}px`
  sider.style.maxWidth = `${sidebarWidth}px`
  sider.style.flex = `0 0 ${sidebarWidth}px`
}

export function useResizableWidth(
  initial = DEFAULT_WIDTH,
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
) {
  const [width, setWidth] = useState(initial)
  const [isResizing, setIsResizing] = useState(false)
  const widthRef = useRef(width)
  const sidebarRef = useRef<HTMLDivElement>(null)

  widthRef.current = width

  useEffect(() => {
    if (isResizing) return
    applySidebarWidth(sidebarRef.current, width)
  }, [width, isResizing])

  const startResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()

      const handle = e.currentTarget
      const pointerId = e.pointerId
      handle.setPointerCapture(pointerId)

      const startX = e.clientX
      const startWidth = widthRef.current

      setIsResizing(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        const next = clamp(startWidth + (moveEvent.clientX - startX), min, max)
        widthRef.current = next
        applySidebarWidth(sidebarRef.current, next)
      }

      const onDone = (doneEvent: PointerEvent) => {
        if (doneEvent.pointerId !== pointerId) return

        setIsResizing(false)
        setWidth(widthRef.current)

        handle.releasePointerCapture(pointerId)
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onDone)
        handle.removeEventListener('pointercancel', onDone)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onDone)
      handle.addEventListener('pointercancel', onDone)
    },
    [min, max],
  )

  return { width, isResizing, startResize, sidebarRef, min, max }
}
