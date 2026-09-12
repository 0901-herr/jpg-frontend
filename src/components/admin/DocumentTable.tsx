import { Table } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { AdminDocumentSummary } from '../../api/types/admin'
import { ADMIN_EMPTY, ADMIN_TABLE_SCROLL } from '../../config/adminStyles'
import { formatDateTime } from '../../utils/lifecycle'
import CategoryTag from '../CategoryTag'
import AdminCard from './AdminCard'
import DocumentStatusBadge from './DocumentStatusBadge'
import IngestionPipelineWaterfall from './IngestionPipelineWaterfall'

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
      ellipsis: true,
      width: 200,
      render: (value: string | null, row) => value ?? `(doc ${row.source_document_id})`,
    },
    {
      title: 'LogicalDOC ID',
      dataIndex: 'source_document_id',
      key: 'source_document_id',
      width: 110,
    },
    {
      title: 'Pipeline',
      key: 'pipeline',
      width: 280,
      render: (_value, row) => (
        <IngestionPipelineWaterfall status={row.lifecycle_status} doc={row} />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'lifecycle_status',
      key: 'lifecycle_status',
      width: 100,
      render: (status) => <DocumentStatusBadge status={status} />,
    },
    {
      title: 'Category',
      dataIndex: 'classification_category',
      key: 'classification_category',
      width: 100,
      render: (category: string | null) => <CategoryTag category={category} />,
    },
    {
      title: 'Source',
      dataIndex: 'discovery_source',
      key: 'discovery_source',
      width: 100,
      ellipsis: true,
      render: (v: string | null) => v ?? ADMIN_EMPTY,
    },
    {
      title: 'Retry',
      dataIndex: 'retry_count',
      key: 'retry_count',
      width: 64,
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
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
    <AdminCard title="Documents">
      <div className="min-w-0 overflow-x-auto -mx-1">
        <Table
          rowKey="source_document_id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={pagination}
          scroll={ADMIN_TABLE_SCROLL}
          size="middle"
          onRow={(record) => ({
            onClick: () => onSelect(record),
            className: 'cursor-pointer',
          })}
          locale={{ emptyText: 'No documents match your search' }}
        />
      </div>
    </AdminCard>
  )
}
