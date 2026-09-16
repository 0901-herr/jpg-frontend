import { AdminRefreshIcon, AdminSearchIcon } from '../../icons/admin'
import { Button, Checkbox, Col, Form, Input, Row, Select, Space } from 'antd'
import type { AdminDocumentQuery, LifecycleStatus } from '../../api/types/admin'
import { LIFECYCLE_LABELS } from '../../utils/lifecycle'

export interface DocumentSearchValues {
  search: string
  searchBy: 'docId' | 'filename'
  lifecycleStatus?: LifecycleStatus
  discoverySource?: string
  failedOnly: boolean
}

interface DocumentSearchProps {
  initialValues?: Partial<DocumentSearchValues>
  loading?: boolean
  onSearch: (query: AdminDocumentQuery) => void
}

const lifecycleOptions = Object.entries(LIFECYCLE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export function buildDocumentQuery(values: DocumentSearchValues, page: number, pageSize: number): AdminDocumentQuery {
  const query: AdminDocumentQuery = { offset: (page - 1) * pageSize, limit: pageSize }
  const term = values.search.trim()
  if (term) {
    if (values.searchBy === 'docId') query.docId = term
    else query.filename = term
  }
  if (values.failedOnly) query.lifecycleStatus = 'FAILED'
  else if (values.lifecycleStatus) query.lifecycleStatus = values.lifecycleStatus
  if (values.discoverySource) query.discoverySource = values.discoverySource
  return query
}

export default function DocumentSearch({ initialValues, loading, onSearch }: DocumentSearchProps) {
  const [form] = Form.useForm<DocumentSearchValues>()

  const submit = (page = 1, pageSize = 50) => {
    const values = form.getFieldsValue()
    onSearch(buildDocumentQuery(values, page, pageSize))
  }

  return (
    <Form
      className="w-full"
      form={form}
      layout="vertical"
      initialValues={{
        search: '',
        searchBy: 'docId',
        failedOnly: false,
        ...initialValues,
      }}
      onFinish={() => submit()}
    >
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item label="Search" name="search">
            <Input placeholder="docId or filename" allowClear prefix={<AdminSearchIcon />} />
          </Form.Item>
        </Col>
        <Col xs={24} md={4}>
          <Form.Item label="Search by" name="searchBy">
            <Select
              options={[
                { value: 'docId', label: 'LogicalDOC ID' },
                { value: 'filename', label: 'Filename' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={4}>
          <Form.Item label="Status" name="lifecycleStatus">
            <Select allowClear placeholder="Any" options={lifecycleOptions} />
          </Form.Item>
        </Col>
        <Col xs={24} md={4}>
          <Form.Item label="Source" name="discoverySource">
            <Select
              allowClear
              placeholder="Any"
              options={[
                { value: 'bfs', label: 'Bulk (BFS)' },
                { value: 'audit', label: 'Audit sync' },
                { value: 'manual', label: 'Manual' },
                { value: 'reconciliation', label: 'Reconciliation' },
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={4}>
          <Form.Item name="failedOnly" valuePropName="checked">
            <Checkbox>Failed only</Checkbox>
          </Form.Item>
        </Col>
      </Row>
      <Space>
        <Button type="primary" htmlType="submit" loading={loading} icon={<AdminSearchIcon />}>
          Search
        </Button>
        <Button
          icon={<AdminRefreshIcon />}
          onClick={() => {
            form.resetFields()
            onSearch({ offset: 0, limit: 50 })
          }}
        >
          Reset
        </Button>
      </Space>
    </Form>
  )
}
