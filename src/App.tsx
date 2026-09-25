import { App as AntApp, ConfigProvider, Spin } from 'antd'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import QueryProvider from './providers/QueryProvider'
import { FONT_FAMILY_SANS } from './config/typography'

// Admin dashboard (antd Table, admin-only icon set, mock data) is rarely
// visited by end users — split it into its own chunk so chat-only users
// don't pay for it on first load (audit FE-02). One Suspense boundary
// above the whole /admin subtree covers every lazy chunk below it, since
// AdminLayout/IngestionOverviewPage render through AdminRoute's own
// <Outlet /> — still inside this same boundary.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminRoute = lazy(() =>
  import('./pages/admin/AdminRoute').then((m) => ({ default: m.AdminRoute })),
)
const AdminIndexRedirect = lazy(() =>
  import('./pages/admin/AdminRoute').then((m) => ({ default: m.AdminIndexRedirect })),
)
const IngestionOverviewPage = lazy(() => import('./pages/admin/IngestionOverviewPage'))

function AdminLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spin size="large" />
    </div>
  )
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#0084ff',
          colorBgContainer: '#fefdfc',
          colorBgLayout: '#fefdfc',
          colorBorder: '#ececec',
          colorBorderSecondary: '#f0f0f0',
          colorText: '#0d0d0d',
          // Darkened to Tailwind gray-700 (client feedback, round 2: text
          // still read as thin/light). Kept in sync with
          // --docu-text-secondary in src/index.css and typeColor.secondary
          // in src/styles/typography.ts.
          colorTextSecondary: '#374151',
          colorTextTertiary: '#8e8e8e',
          borderRadius: 10,
          borderRadiusLG: 12,
          borderRadiusSM: 8,
          fontFamily: FONT_FAMILY_SANS,
          fontSize: 16,
          fontSizeSM: 14,
          fontSizeLG: 18,
          controlHeight: 40,
          controlHeightLG: 48,
          controlHeightSM: 32,
          motion: false,
        },
        components: {
          Button: {
            borderRadius: 10,
            controlHeight: 40,
            primaryShadow: 'none',
          },
          Input: {
            borderRadius: 10,
            controlHeight: 40,
            activeShadow: 'none',
          },
          Dropdown: {
            borderRadiusLG: 12,
            controlItemBgHover: '#f4f4f4',
            paddingBlock: 6,
          },
          Menu: {
            itemBorderRadius: 8,
            itemHeight: 36,
            iconMarginInlineEnd: 10,
          },
          Tree: {
            directoryNodeSelectedBg: 'transparent',
            directoryNodeSelectedColor: 'inherit',
            nodeSelectedBg: 'transparent',
            nodeHoverBg: 'transparent',
          },
          Tag: { borderRadiusSM: 6 },
          Alert: { borderRadiusLG: 12 },
          Modal: { borderRadiusLG: 16 },
          Checkbox: { borderRadiusSM: 4 },
        },
      }}
    >
      {/* Antd deprecation warnings (UI polish pass): the static `message`/
          `notification`/`Modal` functions used across the chat side of the
          app (AppLayout.tsx, useChatStore.ts, useBrowseTree.ts, ChatInput.tsx,
          FolderSidebar.tsx) "can not consume context like dynamic theme" —
          antd's own fix is this `<App>` provider, which every one of those
          call sites now reads its `message` instance from via
          `App.useApp()` instead of importing the static function directly.
          The admin side (AdminLayout.tsx) already wraps its own subtree in
          a nested `<App>` for the same reason — antd supports nesting, so
          this doesn't change that. */}
      <AntApp>
        <QueryProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<Navigate to="/chat" replace />} />
                  <Route path="/chat" element={<AppLayout />} />
                  <Route path="/chat/demo/composer" element={<AppLayout />} />
                  <Route path="/chat/demo/share" element={<AppLayout />} />
                </Route>
                <Route
                  element={
                    <Suspense fallback={<AdminLoadingFallback />}>
                      <AdminRoute />
                    </Suspense>
                  }
                >
                  <Route path="/admin" element={<AdminIndexRedirect />} />
                  <Route element={<AdminLayout />}>
                    <Route path="/admin/ingestion" element={<IngestionOverviewPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/chat" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </QueryProvider>
      </AntApp>
    </ConfigProvider>
  )
}
