import { Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { ChatExpandIcon } from '../icons/chat'
import type { QueryTier } from '../api/types/query'
import { getQueryTierLabel, getQueryTierTooltip, QUERY_TIER_OPTIONS } from '../utils/queryTier'

interface QueryTierDropdownProps {
  tier: QueryTier
  onChange: (tier: QueryTier) => void
  disabled?: boolean
}

export default function QueryTierDropdown({
  tier,
  onChange,
  disabled = false,
}: QueryTierDropdownProps) {
  const menuItems: MenuProps['items'] = QUERY_TIER_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
  }))

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
      disabled={disabled}
      overlayClassName="docu-query-tier-menu"
    >
      <Tooltip title={getQueryTierTooltip(tier)} placement="top">
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
      </Tooltip>
    </Dropdown>
  )
}
