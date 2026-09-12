import { createElement, type ComponentType } from 'react'
import type { SvgIconProps } from '@mui/material/SvgIcon'

type IconSize = number | 'inherit'

/** Wrap an MUI icon with a default pixel size for Ant Design buttons and nav rows. */
export function appIcon(
  Icon: ComponentType<SvgIconProps>,
  defaultSize: IconSize = 14,
): ComponentType<SvgIconProps> {
  return function AppIcon({ sx, fontSize, ...props }: SvgIconProps) {
    const size = fontSize ?? defaultSize

    if (size === 'inherit') {
      return createElement(Icon, { fontSize: 'inherit', sx, ...props })
    }

    return createElement(Icon, {
      fontSize: 'inherit',
      sx: (sx ? [{ fontSize: size }, sx] : { fontSize: size }) as SvgIconProps['sx'],
      ...props,
    })
  }
}
