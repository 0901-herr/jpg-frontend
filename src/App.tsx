import { App as AntApp, ConfigProvider } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AdminLayout from './pages/admin/AdminLayout'
import { AdminIndexRedirect, AdminRoute } from './pages/admin/AdminRoute'
import IngestionOverviewPage from './pages/admin/IngestionOverviewPage'
import QueryProvider from './providers/QueryProvider'
import { FONT_FAMILY_SANS } from './config/typography'

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
          colorTextSecondary: '#676767',
          colorTextTertiary: '#8e8e8e',
          borderRadius: 10,
          borderRadiusLG: 12,
          borderRadiusSM: 8,
          fontFamily: FONT_FAMILY_SANS,
          fontSize: 16,
          fontSizeSM: 14,
          fontSizeLG: 18,
          fontSizeHeading4: 20,
          lineHeight: 1.5,
          lineHeightLG: 1.6,
          controlHeight: 40,
          controlHeightLG: 44,
          // Instant open/close for Dropdown/Modal/etc. — matches the
          // query-tier menu feel (no slide/fade on menus).
          motion: false,
        },
        components: {
          Button: {
            borderRadius: 10,
            primaryShadow: 'none',
            defaultShadow: 'none',
          },
          Input: {
            borderRadius: 10,
            activeShadow: 'none',
            hoverBorderColor: '#ececec',
            activeBorderColor: '#ececec',
          },
          Tree: {
            borderRadius: 10,
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
                <Route element={<AdminRoute />}>
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
