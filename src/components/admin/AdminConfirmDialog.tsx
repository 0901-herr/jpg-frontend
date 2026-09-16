import { Button, Modal } from 'antd'

interface AdminConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function AdminConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}: AdminConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      centered
      closable={false}
      width={440}
      className="admin-confirm-modal admin-panel"
      transitionName=""
      maskTransitionName=""
      mask={{ closable: !loading }}
      keyboard={!loading}
      onCancel={onCancel}
      footer={
        <div className="admin-confirm-modal-actions">
          <Button disabled={loading} onClick={onCancel}>
            {cancelText}
          </Button>
          <Button
            type="primary"
            className="admin-control-btn--primary"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      <p className="admin-confirm-modal-description">{description}</p>
    </Modal>
  )
}
