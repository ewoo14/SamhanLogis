import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { FieldLockIndicator } from './FieldLockIndicator'
import type { FieldLockEntry } from '../../realtime/createPresenceClient'

describe('FieldLockIndicator', () => {
  test('빈 배열은 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(
      createElement(FieldLockIndicator, { entries: [] }),
    )).toBe('')
  })

  test('편집 중인 사용자 displayName 과 색상 dot 만 노출한다', () => {
    const entries: FieldLockEntry[] = [
      { fieldPath: 'memo', sessionId: 'session-1', displayName: '홍길동', color: 'BLUE' },
      { fieldPath: 'memo', sessionId: 'session-2', displayName: '김관리', color: 'GREEN' },
    ]

    const html = renderToStaticMarkup(
      createElement(FieldLockIndicator, { entries }),
    )

    // 한국어 어순 정정(Opus 라운드 fix): "편집 중 N명" → "N명 편집 중"
    expect(html).toContain('aria-label="다른 사용자 2명 편집 중"')
    expect(html).toContain('title="홍길동, 김관리 편집 중"')
    expect(html).toContain('편집 중')
    expect(html).toContain('홍길동')
    expect(html).toContain('김관리')
    expect(html).toContain('background:#2563EB')
    expect(html).not.toContain('session-1')
  })
})
