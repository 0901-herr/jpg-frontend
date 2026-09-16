import { AdminTagIcon } from '../../icons/admin'
import { App, Button } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { reingestMissingClassification } from '../../api/admin'
import { adminQueryKeys } from '../../lib/adminQueryKeys'
import AdminConfirmDialog from './AdminConfirmDialog'

export default function ReclassifyMissingButton() {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () => reingestMissingClassification(),
    onSuccess: (result) => {
      message.success(`Re-queued ${result.queued} document${result.queued === 1 ? '' : 's'} for classification`)
      void queryClient.invalidateQueries({ queryKey: adminQueryKeys.overview })
      void queryClient.invalidateQueries({ queryKey: ['admin', 'documents'] })
    },
    onError: (err: Error) => message.error(err.message),
  })

  async function confirmReingestion() {
    try {
      await mutation.mutateAsync()
      setConfirmOpen(false)
    } catch {
      // Mutation error messaging is handled by onError.
    }
  }

  return (
    <>
      <Button
        icon={<AdminTagIcon />}
        loading={mutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        Re-ingest missing classification
      </Button>
      <AdminConfirmDialog
        open={confirmOpen}
        title="Re-ingest documents missing classification?"
        description="Re-submits up to 500 ready documents without a classification so they can be classified."
        confirmText="Re-ingest"
        loading={mutation.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmReingestion()}
      />
    </>
  )
}
