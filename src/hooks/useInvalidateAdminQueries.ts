import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { adminQueryKeys } from '../lib/adminQueryKeys'

/** Refetch overview, activity, and other admin queries after a mutation. */
export function useInvalidateAdminQueries() {
  const queryClient = useQueryClient()

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview })
    void queryClient.invalidateQueries({ queryKey: adminQueryKeys.activityEvents })
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }, [queryClient])
}
