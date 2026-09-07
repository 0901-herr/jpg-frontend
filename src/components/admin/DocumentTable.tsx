import { Table } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { AdminDocumentSummary } from '../../api/types/admin'
import { formatDateTime } from '../../utils/lifecycle'
import DocumentStatusBadge from './DocumentStatusBadge'

interface DocumentTableProps {
  items: AdminDocumentSummary[]
  total: number
  loading?: boolean
  page: number
  pageSize: number
  onPageChange: (page: number, pageSize: number) => void
  onSelect: (doc: AdminDocumentSummary) => void
}

export default function DocumentTable({
  items,
  total,
  loading,
  page,
  pageSize,
  onPageChange,
  onSelect,
}: DocumentTableProps) {
  const columns: ColumnsType<AdminDocumentSummary> = [
    {
      title: 'Filename',
      dataIndex: 'filename',
      key: 'filename',
      render: (value: string | null, row) => value ?? `(doc ${row.source_document_id})`,
    },
    {
      title: 'LogicalDOC ID',
      dataIndex: 'source_document_id',
      key: 'source_document_id',
      width: 120,
    },
    {
      title: 'Status',
      dataIndex: 'lifecycle_status',
      key: 'lifecycle_status',
      width: 120,
      render: (status) => <DocumentStatusBadge status={status} />,
    },
    {
      title: 'Source',
      dataIndex: 'discovery_source',
      key: 'discovery_source',
      width: 100,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Retry',
      dataIndex: 'retry_count',
      key: 'retry_count',
      width: 70,
    },
    {
      title: 'Last updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (v: string | null) => formatDateTime(v),
    },
  ]

  const pagination: TablePaginationConfig = {
    current: page,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: ['25', '50', '100'],
    showTotal: (t) => `${t.toLocaleString()} documents`,
    onChange: onPageChange,
  }

  return (
    <Table
      rowKey="source_document_id"
      columns={columns}
      dataSource={items}
      loading={loading}
      pagination={pagination}
      onRow={(record) => ({
        onClick: () => onSelect(record),
        className: 'cursor-pointer',
      })}
      locale={{ emptyText: 'No documents match your search' }}
    />
  )
}
