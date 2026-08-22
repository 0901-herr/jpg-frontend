import { useMutation } from '@tanstack/react-query'
import { verifyToken } from '../../api/auth'
import type { AuthSession } from '../../api/types/auth'

export function useLogin() {
  return useMutation<AuthSession, Error, string>({
    mutationFn: verifyToken,
  })
}
