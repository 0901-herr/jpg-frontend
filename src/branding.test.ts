import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('branding: index.html', () => {
  it('sets the browser tab title to exactly "ARCHE AI"', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf-8')
    expect(html).toContain('<title>ARCHE AI</title>')
    expect(html).not.toContain('Docu Arch AI')
  })
})
