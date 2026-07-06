import { describe, expect, it } from 'vitest'
import { sanitizeLegacyTableHtmlPassthrough } from './samhanApi'

describe('sanitizeLegacyTableHtmlPassthrough', () => {
  it('removes script, event handlers, javascript URLs, and disallowed tags from raw legacy HTML', () => {
    const html = `
      <table onclick="alert(1)" class="stock">
        <tbody>
          <tr>
            <td onmouseover="alert(1)" style="color:red;background-image:url(javascript:alert(1))">A</td>
            <td style="color:blue">B<script>alert(1)</script></td>
            <td><img src=x onerror=alert(1)>C</td>
          </tr>
        </tbody>
      </table>
    `

    const sanitized = sanitizeLegacyTableHtmlPassthrough(html)

    expect(sanitized).toContain('<table class="stock">')
    expect(sanitized).toContain('<td>A</td>')
    expect(sanitized).toContain('<td style="color:blue">B</td>')
    expect(sanitized).toContain('C')
    expect(sanitized).not.toMatch(/<script|onclick|onmouseover|javascript:|<img/i)
  })
})
