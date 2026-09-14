import AddIcon from '@mui/icons-material/Add'
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined'
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined'
import AppsIcon from '@mui/icons-material/Apps'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import CallMadeIcon from '@mui/icons-material/CallMade'
import ChatIcon from '@mui/icons-material/Chat'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import LogoutIcon from '@mui/icons-material/Logout'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import RemoveCircleOutlinedIcon from '@mui/icons-material/RemoveCircleOutlined'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import { appIcon } from './AppIcon'

export const ChatBubbleIcon = appIcon(ChatIcon, 20)
export const ChatBubbleIconLg = appIcon(ChatIcon, 24)
export const ChatAddIcon = appIcon(AddIcon)
export const ChatLogoutIcon = appIcon(LogoutIcon)
export const ChatMessageIcon = appIcon(ChatIcon, 14)
export const ChatFileIcon = appIcon(InsertDriveFileOutlinedIcon, 14)
export const ChatAttachIcon = appIcon(AttachFileOutlinedIcon, 18)
export const ChatSummarizeIcon = appIcon(AutoAwesomeOutlinedIcon, 18)
export const ChatCloseIcon = appIcon(CloseIcon, 12)
export const ChatSendIcon = appIcon(ArrowUpwardIcon, 16)
export const ChatExpandIcon = appIcon(ExpandMoreIcon, 12)
export const ChatChevronIcon = appIcon(ChevronRightIcon, 12)
export const ChatDescriptionIcon = appIcon(DescriptionOutlinedIcon, 14)
export const ChatOpenIcon = appIcon(OpenInNewIcon, 12)
export const ChatRedirectIcon = appIcon(CallMadeIcon, 20)
export const ChatEditIcon = appIcon(EditOutlinedIcon)
export const ChatDeleteIcon = appIcon(DeleteOutlinedIcon)
export const ChatMoreIcon = appIcon(MoreHorizIcon, 14)
export const ChatLockIcon = appIcon(LockOutlinedIcon, 20)
export const ChatFolderIcon = appIcon(FolderOpenOutlinedIcon, 14)
export const ChatAppsIcon = appIcon(AppsIcon, 14)
export const ChatFolderSuffixIcon = appIcon(FolderOpenOutlinedIcon, 'inherit')
export const ChatAppsSuffixIcon = appIcon(AppsIcon, 'inherit')
export const ChatRefreshIcon = appIcon(RefreshOutlinedIcon, 14)

export const StatusReadyIcon = appIcon(CheckCircleOutlinedIcon, 12)
export const StatusIndexingIcon = appIcon(ScheduleOutlinedIcon, 12)
export const StatusFailedIcon = appIcon(HighlightOffOutlinedIcon, 12)
export const StatusNotIndexedIcon = appIcon(RemoveCircleOutlinedIcon, 12)
