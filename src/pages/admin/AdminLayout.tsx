import { AdminDashboardIcon } from '../../icons/admin'
import { App, Drawer, Layout, Typography } from 'antd'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { ADMIN_PANEL_CLASS } from '../../config/adminStyles'
import { NARROW_LAYOUT_QUERY } from '../../config/layout'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { ChatCloseIcon, ChatMenuIcon } from '../../icons/chat'

const { Sider, Content } = Layout
const { Text } = Typography

function AdminPrimaryNav({ ingestionSelected }: { ingestionSelected: boolean }) {
  return (
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
  )
}

/** P0-1 (UI polish pass): below 768px this fixed 220px `Sider` used to
 * consume the whole phone viewport by itself (never mind the second nav
 * level, `IngestionSectionNav` below it), squeezing the actual page
 * content to 0px with no way to scroll to it. Reuses the same
 * hamburger-top-bar + antd Drawer pattern the chat sidebar already uses
 * below the same breakpoint (`AppLayout.tsx`) — the Sider only renders at
 * desktop widths, and its content moves into a Drawer opened from the top
 * bar's hamburger, so the page content underneath gets the full viewport
 * width. */
export default function AdminLayout() {
  const location = useLocation()
  const ingestionSelected = location.pathname.startsWith('/admin/ingestion')
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY)
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <App>
      <div
        className={`${ADMIN_PANEL_CLASS} flex flex-col h-screen overflow-hidden overflow-x-hidden`}
      >
        {isNarrowLayout && (
          <div className="flex items-center gap-2 h-12 px-3 shrink-0 border-b border-[var(--admin-border)] bg-white">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="docu-mobile-topbar-menu"
              aria-label="Open admin menu"
            >
              <ChatMenuIcon />
            </button>
            <Text strong className="admin-sidebar-title">
              Admin console
            </Text>
          </div>
        )}

        <Layout className="flex-1 min-h-0">
          {!isNarrowLayout && (
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
              <AdminPrimaryNav ingestionSelected={ingestionSelected} />
            </Sider>
          )}
          <Layout className="admin-page min-w-0 flex flex-col">
            <Content className="flex-1 min-h-0 min-w-0 overflow-hidden">
              <Outlet />
            </Content>
          </Layout>
        </Layout>

        {/* Nested inside the `.admin-panel` div (unlike AppLayout.tsx's own
            chat-sidebar Drawer, which is a sibling of its equivalent
            wrapper) rather than after it: this Drawer's content reads
            `--admin-*` custom properties that are scoped to `.admin-panel`
            (index.css), not declared at `:root` the way the chat
            sidebar's `--docu-*` tokens are. antd's default Drawer portals
            to `document.body` regardless of where it's written in JSX, so
            without both `getContainer={false}` (render in place, still an
            overlay via its own `position: fixed`) AND actually being a DOM
            descendant of `.admin-panel` here, every `var(--admin-*)`
            reference inside it would resolve to nothing. */}
        {isNarrowLayout && (
          <Drawer
            placement="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            size="min(88vw, 320px)"
            closable={{ placement: 'end', 'aria-label': 'Close menu' }}
            closeIcon={<ChatCloseIcon />}
            classNames={{ close: 'docu-mobile-drawer-close' }}
            title={
              <span className="admin-sidebar-title" style={{ fontWeight: 600 }}>
                Admin console
              </span>
            }
            styles={{ header: { padding: '0.625rem 1rem' }, body: { padding: 0 } }}
            getContainer={false}
          >
            <AdminPrimaryNav ingestionSelected={ingestionSelected} />
          </Drawer>
        )}
      </div>
    </App>
  )
}
