import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { type, typeColor } from '../styles/typography'
import { radius } from '../styles/theme'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/** Catches uncaught render errors anywhere in the tree below it and shows a
 * friendly full-page fallback instead of letting React unmount everything
 * (a blank white tab with no way to recover — UX P0-1). Reloading is the
 * only way out of a broken render tree, but it doesn't cost the user
 * anything real: selected documents and chat history are both persisted to
 * localStorage independently of this component. */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught render error', error, errorInfo)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className={`${type.body} font-semibold text-[#0d0d0d]`}>Something went wrong</h1>
        <p className={`${type.body} ${typeColor.muted} max-w-md leading-relaxed`}>
          The page hit an unexpected error. Reload to continue; your selected documents and chat
          history are kept.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className={`mt-2 px-4 py-2 ${radius.md} bg-[#0084ff] text-white hover:bg-[#0077e6] ${type.body}`}
        >
          Reload
        </button>
      </div>
    )
  }
}
