import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    globals: true,
    // .worktrees/mvp-scope is a git worktree of another branch, checked out
    // inside this repo tree. vitest's default exclude list doesn't know
    // about it, so it collects that branch's test files too.
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
})
