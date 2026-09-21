import AddIcon from '@mui/icons-material/Add'
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined'
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined'
import AppsIcon from '@mui/icons-material/Apps'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import CallMadeIcon from '@mui/icons-material/CallMade'
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined'
import ChatIcon from '@mui/icons-material/Chat'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloseIcon from '@mui/icons-material/Close'
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined'
import IncompleteCircleOutlinedIcon from '@mui/icons-material/IncompleteCircleOutlined'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuIcon from '@mui/icons-material/Menu'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import RemoveCircleOutlinedIcon from '@mui/icons-material/RemoveCircleOutlined'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined'
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined'
import { appIcon } from './AppIcon'

export const ChatBubbleIcon = appIcon(ChatIcon, 20)
export const ChatBubbleIconLg = appIcon(ChatIcon, 24)
export const ChatAddIcon = appIcon(AddIcon)
export const ChatLogoutIcon = appIcon(LogoutIcon)
export const ChatMessageIcon = appIcon(ChatIcon, 14)
export const ChatFileIcon = appIcon(InsertDriveFileOutlinedIcon, 14)
export const ChatAttachIcon = appIcon(AttachFileOutlinedIcon, 18)
// 16px — consistency rule: icon sizes are 16/20px only across the app.
export const ChatSummarizeIcon = appIcon(AutoAwesomeOutlinedIcon, 16)
// Composer action icons (ChatInput.tsx), shown alongside the label at every
// width — the full word is still the button's aria-label and (below 480px,
// where the label itself is abbreviated) its tooltip; these are purely
// decorative (aria-hidden).
export const ChatCategorizeIcon = appIcon(CategoryOutlinedIcon, 16)
export const ChatMetadataIcon = appIcon(AssignmentOutlinedIcon, 16)
// Small inline note icon — quiet status/disabled-reason callouts
// (ChatInput.tsx's composer blocked-reason line, ChatMessage.tsx's error
// callout) rather than a loud coloured alert box.
export const ChatInfoIcon = appIcon(InfoOutlinedIcon, 16)
// Mobile top bar hamburger (AppLayout.tsx) — opens the sidebar Drawer below
// 768px.
export const ChatMenuIcon = appIcon(MenuIcon, 20)
export const ChatCloseIcon = appIcon(CloseIcon, 12)
export const ChatSendIcon = appIcon(ArrowUpwardIcon, 16)
export const ChatExpandIcon = appIcon(ExpandMoreIcon, 14)
export const ChatChevronIcon = appIcon(ChevronRightIcon, 14)
export const ChatDescriptionIcon = appIcon(DescriptionOutlinedIcon, 14)
export const ChatOpenIcon = appIcon(OpenInNewIcon, 12)
export const ChatRedirectIcon = appIcon(CallMadeIcon, 20)
export const ChatEditIcon = appIcon(EditOutlinedIcon)
export const ChatDeleteIcon = appIcon(DeleteOutlinedIcon)
export const ChatMoreIcon = appIcon(MoreHorizIcon, 14)
export const ChatShareIcon = appIcon(ShareOutlinedIcon, 14)
export const ChatMoveIcon = appIcon(FolderOutlinedIcon, 14)
export const ChatLockIcon = appIcon(LockOutlinedIcon, 20)
export const ChatFolderIcon = appIcon(FolderOpenOutlinedIcon, 14)
export const ChatAppsIcon = appIcon(AppsIcon, 14)
export const ChatNewFolderIcon = appIcon(CreateNewFolderOutlinedIcon, 14)
export const ChatFolderSuffixIcon = appIcon(FolderOpenOutlinedIcon, 'inherit')
export const ChatAppsSuffixIcon = appIcon(AppsIcon, 'inherit')
export const ChatRefreshIcon = appIcon(RefreshOutlinedIcon, 14)

/** Query-tier menu (Fast / Normal / Accurate). Fast keeps the bolt; the
 * other two stay as simple stroke icons (clock + target) rather than the
 * heavier scales / verified-seal glyphs. P2-2 (UI polish pass): Accurate
 * used to reuse the checkmark glyph, which reads as "this is the selected
 * option" regardless of which tier is actually selected (the dropdown's
 * own highlighted-row background is what marks the real selection) — a
 * bullseye/target reads as "precision" without implying a checked state. */
export const QueryTierFastIcon = appIcon(BoltOutlinedIcon, 18)
export const QueryTierNormalIcon = appIcon(ScheduleOutlinedIcon, 18)
export const QueryTierAccurateIcon = appIcon(TrackChangesOutlinedIcon, 18)

export const StatusReadyIcon = appIcon(CheckCircleOutlinedIcon, 12)
export const StatusIndexingIcon = appIcon(ScheduleOutlinedIcon, 12)
export const StatusFailedIcon = appIcon(HighlightOffOutlinedIcon, 12)
export const StatusNotIndexedIcon = appIcon(RemoveCircleOutlinedIcon, 12)

// 14px, one per indexing status — the compact file-row icon
// (IndexingStatusBadge's `StatusIcon`), coloured distinctly per status so a
// glance at the row tells READY from FAILED without reading the tooltip.
export const StatusReadyIcon14 = appIcon(CheckCircleOutlinedIcon, 14)
export const StatusPartialIcon14 = appIcon(IncompleteCircleOutlinedIcon, 14)
export const StatusIndexingIcon14 = appIcon(AutorenewOutlinedIcon, 14)
export const StatusFailedIcon14 = appIcon(HighlightOffOutlinedIcon, 14)
export const StatusNotIndexedIcon14 = appIcon(RemoveCircleOutlinedIcon, 14)
