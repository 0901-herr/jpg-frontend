import { ConfigProvider } from 'antd'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AdminLayout from './pages/admin/AdminLayout'
import { AdminIndexRedirect, AdminRoute } from './pages/admin/AdminRoute'
import IngestionOverviewPage from './pages/admin/IngestionOverviewPage'
import QueryProvider from './providers/QueryProvider'

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
          fontFamily:
            "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          fontSize: 16,
          fontSizeSM: 14,
          fontSizeLG: 18,
          fontSizeHeading4: 20,
          lineHeight: 1.5,
          lineHeightLG: 1.6,
          controlHeight: 40,
          controlHeightLG: 44,
        },
        components: {
          Button: {
            borderRadius: 10,
            primaryShadow: 'none',
            defaultShadow: 'none',
          },
          Input: { borderRadius: 10 },
          TreeSelect: {
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
      <QueryProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="/chat" element={<AppLayout />} />
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
    </ConfigProvider>
  )
}
