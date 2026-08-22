import { useQuery } from '@tanstack/react-query'
import { getCurrentUser } from '../../api/auth'
import { queryKeys } from '../../lib/queryClient'

export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: getCurrentUser,
    enabled,
  })
}
