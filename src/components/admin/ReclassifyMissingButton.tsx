import { AdminTagIcon } from '../../icons/admin'
import { App, Button, Popconfirm } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { reingestMissingClassification } from '../../api/admin'
import { adminQueryKeys } from '../../lib/adminQueryKeys'

export default function ReclassifyMissingButton() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => reingestMissingClassification(),
    onSuccess: (result) => {
      message.success(`Re-queued ${result.queued} document${result.queued === 1 ? '' : 's'} for classification`)
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'documents'] })
    },
    onError: (err: Error) => message.error(err.message),
  })

  return (
    <Popconfirm
      title="Re-ingest documents missing classification?"
      description="Re-submits every READY document with no classification category (up to 500) so it gets re-classified."
      onConfirm={() => mutation.mutate()}
    >
      <Button icon={<AdminTagIcon />} loading={mutation.isPending}>
        Re-ingest missing classification
      </Button>
    </Popconfirm>
  )
}
