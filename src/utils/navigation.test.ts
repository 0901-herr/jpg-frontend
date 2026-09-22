import { describe, expect, it } from 'vitest'
import { safeNewTabUrl } from './navigation'

describe('safeNewTabUrl', () => {
  it('allows LogicalDOC http(s) links and relative paths', () => {
    expect(safeNewTabUrl('https://logicaldoc.example/doc/1')).toBe(
      'https://logicaldoc.example/doc/1',
    )
    expect(safeNewTabUrl('/documents/1')).toBe('/documents/1')
  })

  it('rejects script and non-web URL schemes', () => {
    expect(safeNewTabUrl('javascript:alert(1)')).toBeNull()
    expect(safeNewTabUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })
})
