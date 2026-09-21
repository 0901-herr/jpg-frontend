import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import type { ComponentType } from 'react'
import type { SvgIconProps } from '@mui/material/SvgIcon'
import {
  ChatExpandIcon,
  QueryTierAccurateIcon,
  QueryTierFastIcon,
  QueryTierNormalIcon,
} from '../icons/chat'
import type { QueryTier } from '../api/types/query'
import { getQueryTierLabel, getQueryTierTooltip, QUERY_TIER_OPTIONS } from '../utils/queryTier'

interface QueryTierDropdownProps {
  tier: QueryTier
  onChange: (tier: QueryTier) => void
  disabled?: boolean
}

const TIER_ICONS: Record<QueryTier, ComponentType<SvgIconProps>> = {
  fast: QueryTierFastIcon,
  standard: QueryTierNormalIcon,
  accurate: QueryTierAccurateIcon,
}

export default function QueryTierDropdown({
  tier,
  onChange,
  disabled = false,
}: QueryTierDropdownProps) {
  const menuItems: MenuProps['items'] = QUERY_TIER_OPTIONS.map((option) => {
    const Icon = TIER_ICONS[option.value]
    return {
      key: option.value,
      label: (
        <div className="docu-query-tier-option">
          <span className="docu-query-tier-option-icon" aria-hidden>
            <Icon />
          </span>
          <span className="docu-query-tier-option-text">
            <span className="docu-query-tier-option-label">{option.label}</span>
            <span className="docu-query-tier-option-description">
              {getQueryTierTooltip(option.value)}
            </span>
          </span>
        </div>
      ),
    }
  })

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    onChange(key as QueryTier)
  }

  return (
    <Dropdown
      menu={{
        items: menuItems,
        selectable: true,
        selectedKeys: [tier],
        onClick: handleMenuClick,
      }}
      trigger={['click']}
      placement="top"
      transitionName=""
      destroyOnHidden
      disabled={disabled}
      classNames={{ root: 'docu-query-tier-menu' }}
    >
      <button
        type="button"
        disabled={disabled}
        className="docu-query-tier-dropdown"
        aria-label={`Query speed: ${getQueryTierLabel(tier)}`}
        aria-haspopup="listbox"
      >
        <span>{getQueryTierLabel(tier)}</span>
        <ChatExpandIcon className="docu-query-tier-dropdown-chevron" aria-hidden />
      </button>
    </Dropdown>
  )
}
