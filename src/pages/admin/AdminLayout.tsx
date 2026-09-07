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
      <Layout className={`min-h-screen ${surface.page}`}>
        <Sider width={220} theme="light" className="border-r border-[#ececec]">
          <div className="px-4 py-5">
            <Text strong className="text-base">
              JPG Admin
            </Text>
            <Text type="secondary" className="block text-xs mt-1">
              Ingestion operations
            </Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={selected}
            items={[
              {
                key: 'ingestion',
                icon: <DashboardOutlined />,
                label: <Link to="/admin/ingestion">Ingestion</Link>,
              },
            ]}
          />
          <div className="absolute bottom-4 left-4 right-4">
            <Link to="/chat" className="text-sm text-[#0084ff]">
              ← Back to chat
            </Link>
          </div>
        </Sider>
        <Layout>
          <Header className="!bg-[#fefdfc] border-b border-[#ececec] px-6 flex items-center">
            <Text type="secondary" className="text-sm">
              Operator dashboard — not visible to hospital users
            </Text>
          </Header>
          <Content className="p-6 max-w-7xl w-full mx-auto">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </App>
  )
}
