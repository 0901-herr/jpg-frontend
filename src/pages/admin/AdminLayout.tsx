import { DashboardOutlined } from '@ant-design/icons'
import { App, Layout, Menu, Typography } from 'antd'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { surface } from '../../styles/theme'

const { Header, Sider, Content } = Layout
const { Text } = Typography

export default function AdminLayout() {
  const location = useLocation()
  const selected = location.pathname.startsWith('/admin/ingestion') ? ['ingestion'] : []

  return (
    <App>
      <Layout className={`h-screen overflow-hidden overflow-x-hidden ${surface.page}`}>
        <Sider
          width={240}
          theme="light"
          className="!bg-[#fafafa] border-r border-[#ececec] shrink-0"
        >
          <div className="px-5 py-6 border-b border-[#ececec]">
            <Text strong className="text-lg tracking-tight">
              JPG Admin
            </Text>
            <Text type="secondary" className="block text-xs mt-1">
              Operator console
            </Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={selected}
            className="!bg-transparent !border-none px-2 pt-3"
            items={[
              {
                key: 'ingestion',
                icon: <DashboardOutlined />,
                label: <Link to="/admin/ingestion">Ingestion</Link>,
              },
            ]}
          />
          <div className="absolute bottom-5 left-5 right-5">
            <Link
              to="/chat"
              className="text-sm text-[#0084ff] hover:text-[#0066cc] no-underline"
            >
              ← Back to chat
            </Link>
          </div>
        </Sider>
        <Layout className="min-w-0 flex flex-col">
          <Header className="!bg-[#fefdfc] !h-14 border-b border-[#ececec] px-5 flex items-center shrink-0">
            <Text type="secondary" className="text-sm truncate">
              Operator dashboard — not visible to hospital users
            </Text>
          </Header>
          <Content className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </App>
  )
}
