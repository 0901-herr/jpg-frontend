import { Alert } from 'antd'
import { MAX_EXPLICIT_SELECTION, SELECTION_LIMIT_MESSAGE } from '../config/selection'

interface SelectionLimitNoticeProps {
  selectedCount: number
}

/** Persistent, visible notice shown at the top of the Files pane once the
 * explicit-scope selection limit is reached — an owner requirement for the
 * demo (2026-09-23): the user must be able to tell, without hovering
 * anything, exactly why files have stopped being selectable. Shared by both
 * the folder tree view and the category checklist view in FolderSidebar, so
 * it lives on its own rather than duplicated per view. Renders nothing
 * below the limit. */
export default function SelectionLimitNotice({ selectedCount }: SelectionLimitNoticeProps) {
  if (selectedCount < MAX_EXPLICIT_SELECTION) return null

  return (
    <Alert
      type="warning"
      showIcon
      role="status"
      title={SELECTION_LIMIT_MESSAGE}
      className="docu-selection-limit-notice !text-xs !mb-2"
    />
  )
}
