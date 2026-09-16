import AppsIcon from '@mui/icons-material/Apps'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import CloudSyncIcon from '@mui/icons-material/CloudSync'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder'
import FindInPageOutlinedIcon from '@mui/icons-material/FindInPageOutlined'
import HourglassTopOutlinedIcon from '@mui/icons-material/HourglassTopOutlined'
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined'
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import SendOutlinedIcon from '@mui/icons-material/SendOutlined'
import SyncIcon from '@mui/icons-material/Sync'
import TuneIcon from '@mui/icons-material/Tune'
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined'
import { appIcon } from './AppIcon'

export const AdminPlayIcon = appIcon(PlayArrowIcon)
export const AdminPauseIcon = appIcon(PauseIcon)
export const AdminSyncIcon = appIcon(SyncIcon)
export const AdminTagIcon = appIcon(LocalOfferOutlinedIcon)
export const AdminOpenIcon = appIcon(OpenInNewIcon)
export const AdminRefreshIcon = appIcon(RefreshIcon)
export const AdminSearchIcon = appIcon(SearchIcon)
export const AdminFilterIcon = appIcon(TuneIcon)
export const AdminDescriptionIcon = appIcon(DescriptionOutlinedIcon)
export const AdminDashboardIcon = appIcon(DashboardOutlinedIcon)

export const AdminAppsNavIcon = appIcon(AppsIcon, 18)
export const AdminListNavIcon = appIcon(ListAltOutlinedIcon, 18)
export const AdminFindNavIcon = appIcon(FindInPageOutlinedIcon, 18)
export const AdminWarningNavIcon = appIcon(WarningAmberOutlinedIcon, 18)
export const AdminHealthNavIcon = appIcon(FavoriteBorderIcon, 18)
export const AdminCloudSyncNavIcon = appIcon(CloudSyncIcon, 18)

export const PipelineCheckIcon = appIcon(CheckIcon, 10)
export const PipelineCloseIcon = appIcon(CloseIcon, 10)
export const PipelineCheckIconLg = appIcon(CheckIcon, 16)
export const PipelineCloseIconLg = appIcon(CloseIcon, 16)

export const PipelineDiscoveredIcon = appIcon(FindInPageOutlinedIcon, 16)
export const PipelineQueuedIcon = appIcon(HourglassTopOutlinedIcon, 16)
export const PipelinePreparingIcon = appIcon(DownloadOutlinedIcon, 16)
export const PipelineStagedIcon = appIcon(CloudUploadOutlinedIcon, 16)
export const PipelineSubmittedIcon = appIcon(SendOutlinedIcon, 16)
export const PipelineIndexingIcon = appIcon(SyncIcon, 16)
export const PipelineReadyIcon = appIcon(CheckCircleOutlinedIcon, 16)

export const PIPELINE_STAGE_ICONS = [
  PipelineDiscoveredIcon,
  PipelineQueuedIcon,
  PipelinePreparingIcon,
  PipelineStagedIcon,
  PipelineSubmittedIcon,
  PipelineIndexingIcon,
  PipelineReadyIcon,
] as const
