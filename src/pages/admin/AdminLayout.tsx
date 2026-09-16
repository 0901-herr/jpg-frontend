import { AdminDashboardIcon } from '../../icons/admin'
import { App, Layout, Typography } from 'antd'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ADMIN_PANEL_CLASS } from '../../config/adminStyles'

const { Sider, Content } = Layout
const { Text } = Typography

export default function AdminLayout() {
  const location = useLocation()
  const ingestionSelected = location.pathname.startsWith('/admin/ingestion')

  return (
    <App>
      <Layout className={`${ADMIN_PANEL_CLASS} h-screen overflow-hidden overflow-x-hidden`}>
        <Sider
          width={220}
          theme="light"
          className="admin-primary-nav !bg-white border-r shrink-0"
        >
          <div className="px-6 py-6">
            <Text strong className="admin-sidebar-title">
              Admin console
            </Text>
          </div>
          <nav className="flex flex-col gap-1 px-3 pt-4" aria-label="Admin sections">
            <Link
              to="/admin/ingestion"
              className={`admin-section-nav-link${ingestionSelected ? ' is-active' : ''}`}
            >
              <span className="shrink-0">
                <AdminDashboardIcon />
              </span>
              <span className="flex-1 truncate">Ingestion</span>
            </Link>
          </nav>
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
