import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('branding: index.html', () => {
  it('sets the browser tab title to exactly "Arche AI"', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')
    expect(html).toContain('<title>Arche AI</title>')
    expect(html).not.toContain('Docu Arch AI')
    expect(html).not.toContain('ARCHE AI')
  })
})

describe('responsive layout: index.html viewport meta', () => {
  it('sets width=device-width and viewport-fit=cover, for the phone/tablet layout and notch-safe-area insets', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')
    const match = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)

    expect(match).not.toBeNull()
    const content = match![1]
    expect(content).toContain('width=device-width')
    expect(content).toContain('initial-scale=1')
    expect(content).toContain('viewport-fit=cover')
  })
})
