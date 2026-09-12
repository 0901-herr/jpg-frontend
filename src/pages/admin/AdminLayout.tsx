import { DashboardOutlined } from '@ant-design/icons'
import { App, Layout, Menu, Typography } from 'antd'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ADMIN_PANEL_CLASS, ADMIN_TEXT_MUTED } from '../../config/adminStyles'

const { Sider, Content } = Layout
const { Text } = Typography

export default function AdminLayout() {
  const location = useLocation()
  const selected = location.pathname.startsWith('/admin/ingestion') ? ['ingestion'] : []

  return (
    <App>
      <Layout className={`${ADMIN_PANEL_CLASS} h-screen overflow-hidden overflow-x-hidden bg-[#f4f6f9]`}>
        <Sider
          width={240}
          theme="light"
          className="!bg-white border-r border-[#e8edf2] shrink-0"
        >
          <div className="px-6 py-6 border-b border-[#eef1f5]">
            <Text strong className="admin-sidebar-title">
              JPG Admin
            </Text>
            <Text className={`block mt-1 ${ADMIN_TEXT_MUTED}`}>Operator console</Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={selected}
            className="!bg-transparent !border-none px-3 pt-4"
            items={[
              {
                key: 'ingestion',
                icon: <DashboardOutlined />,
                label: <Link to="/admin/ingestion">Ingestion</Link>,
              },
            ]}
          />
        </Sider>
        <Layout className="min-w-0 flex flex-col bg-[#f4f6f9]">
          <Content className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </App>
  )
}
