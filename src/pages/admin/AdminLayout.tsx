import { AdminDashboardIcon } from '../../icons/admin'
import { App, Layout, Menu, Typography } from 'antd'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ADMIN_PANEL_CLASS } from '../../config/adminStyles'

const { Sider, Content } = Layout
const { Text } = Typography

export default function AdminLayout() {
  const location = useLocation()
  const selected = location.pathname.startsWith('/admin/ingestion') ? ['ingestion'] : []

  return (
    <App>
      <Layout className={`${ADMIN_PANEL_CLASS} h-screen overflow-hidden overflow-x-hidden`}>
        <Sider
          width={240}
          theme="light"
          className="admin-primary-nav !bg-white border-r shrink-0"
        >
          <div className="px-6 py-6">
            <Text strong className="admin-sidebar-title">
              Admin console
            </Text>
          </div>
          <Menu
            mode="inline"
            selectedKeys={selected}
            className="!bg-transparent !border-none px-3 pt-4"
            items={[
              {
                key: 'ingestion',
                icon: <AdminDashboardIcon />,
                label: <Link to="/admin/ingestion">Ingestion</Link>,
              },
            ]}
          />
        </Sider>
        <Layout className="admin-page min-w-0 flex flex-col">
          <Content className="flex-1 min-h-0 min-w-0 overflow-hidden">
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </App>
  )
}
