import { useMutation } from '@tanstack/react-query'
import { sendMessage } from '../../api/query'
import type { SendMessageRequest, SendMessageResponse } from '../../api/types/query'

export function useSendQuery() {
  return useMutation<SendMessageResponse, Error, SendMessageRequest>({
    mutationFn: sendMessage,
  })
}
