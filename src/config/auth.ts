/** Set VITE_AUTH_BYPASS=true in .env to skip login (dev only). */
export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true'

export const DEV_USER = {
  username: 'dev',
  userId: '00000000-0000-0000-0000-000000000001',
} as const
