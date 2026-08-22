import { Button, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/http'
import { useAuth } from '../context/AuthContext'
import { type, typeColor } from '../styles/typography'

const { Title } = Typography

interface LoginFormValues {
  username: string
  password: string
}

export default function LoginPage() {
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const onFinish = async (values: LoginFormValues) => {
    setError(null)
    try {
      await login(values.username, values.password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.detail) {
        setError(err.detail)
      } else {
        setError('Login failed — is the API running? Try: make start')
      }
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Title level={4} className="!text-center !mb-8 !font-semibold !text-gray-900">
          Login to Docu Arch AI
        </Title>

        <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Please enter your username' }]}
          >
            <Input
              placeholder="Username"
              className="!rounded-none !border-gray-300 !py-2.5"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password
              placeholder="Password"
              className="!rounded-none !border-gray-300 !py-2.5"
            />
          </Form.Item>

          {error && <p className={`text-red-500 ${type.body} mb-3`}>{error}</p>}

          <p className={`${type.caption} ${typeColor.muted} mb-4 text-center`}>
            Dev login: <span className="font-mono">admin</span> /{' '}
            <span className="font-mono">admin</span>
          </p>

          <Form.Item className="!mb-0">
            <Button
              type="primary"
              htmlType="submit"
              loading={isLoading}
              block
              className="!bg-black !border-black hover:!bg-gray-800 !rounded-none !h-11 !font-normal"
            >
              Login
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}
