import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { PresenceIndicator } from './PresenceIndicator'
import type { PresenceEntry } from '../../realtime/createPresenceClient'

describe('PresenceIndicator', () => {
  test('비배열 entries 를 빈 목록처럼 처리한다', () => {
    expect(() => renderToStaticMarkup(
      createElement(PresenceIndicator, { entries: { success: true } }),
    )).not.toThrow()
    expect(renderToStaticMarkup(
      createElement(PresenceIndicator, { entries: { success: true } }),
    )).toBe('')
  })

  test('빈 배열은 렌더하지 않는다', () => {
    expect(renderToStaticMarkup(
      createElement(PresenceIndicator, { entries: [] }),
    )).toBe('')
  })

  test('정상 배열은 displayName+color 기준으로 중복을 접어 렌더한다', () => {
    const entries: PresenceEntry[] = [
      { sessionId: 's1', displayName: '홍길동', color: 'BLUE' },
      { sessionId: 's2', displayName: '홍길동', color: 'BLUE' },
      { sessionId: 's3', displayName: '김관리', color: 'GREEN' },
      { sessionId: 's4', displayName: '홍길동', color: 'AMBER' },
    ]

    const html = renderToStaticMarkup(
      createElement(PresenceIndicator, { entries }),
    )

    expect(html).toContain('현재 보고 있음 3명')
    expect(html).toContain('현재 보는 중:')
    expect(html).toContain('>홍길동</span>')
    expect(html).toContain('>김관리</span>')
    expect(html).toContain('홍길동 현재 보고 있음')
    expect(html).toContain('김관리 현재 보고 있음')
    expect(html.match(/title="홍길동 현재 보고 있음"/g)).toHaveLength(2)
  })

  test('접힌 시청자 명단은 +N Badge title 과 aria-label 에 displayName 만 노출한다', () => {
    const entries: PresenceEntry[] = [
      { sessionId: 's1', displayName: '오병승', color: 'BLUE' },
      { sessionId: 's2', displayName: '김관리', color: 'GREEN' },
      { sessionId: 's3', displayName: '박출고', color: 'AMBER' },
      { sessionId: 's4', displayName: '이검수', color: 'ROSE' },
      { sessionId: 's5', displayName: '최물류', color: 'CYAN' },
    ]

    const html = renderToStaticMarkup(
      createElement(PresenceIndicator, { entries }),
    )

    expect(html).toContain('title="이검수, 최물류"')
    expect(html).toContain('aria-label="이검수, 최물류"')
    expect(html).toContain('+2')
  })

  test('칩은 DEV-SEED 접두사를 제거한 displayName과 aria-label을 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(PresenceIndicator, {
        entries: [{ sessionId: 's1', displayName: '[DEV-SEED] 오병승', color: 'BLUE' }],
      }),
    )

    expect(html).toContain('오병승')
    expect(html).not.toContain('[DEV-SEED]')
    expect(html).toContain('aria-label="오병승 현재 보고 있음"')
  })

  test('lg size 는 상단 문서 presence 용 확대 스타일을 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(PresenceIndicator, {
        entries: [{ sessionId: 's1', displayName: '오병승', color: 'BLUE' }],
        size: 'lg',
      }),
    )

    expect(html).toContain('font-size:14px')
    expect(html).toContain('padding:4px 10px')
    expect(html).toContain('width:10px')
    expect(html).toContain('height:10px')
  })

  test('lg size 는 모바일 다중 시청자에서 줄바꿈 가능한 루트 flex 를 렌더한다', () => {
    const html = renderToStaticMarkup(
      createElement(PresenceIndicator, {
        entries: [
          { sessionId: 's1', displayName: '오병승', color: 'BLUE' },
          { sessionId: 's2', displayName: '김관리', color: 'GREEN' },
          { sessionId: 's3', displayName: '박출고', color: 'AMBER' },
        ],
        size: 'lg',
      }),
    )

    expect(html).toContain('flex-wrap:wrap')
    expect(html).toContain('row-gap:8px')
    expect(html).toContain('max-width:100%')
    expect(html).toContain('min-width:0')
  })

  test('PresenceColor hex 는 BE enum 대비 보정된 AA 색상을 사용한다', () => {
    const entries: PresenceEntry[] = [
      { sessionId: 's1', displayName: '초록', color: 'GREEN' },
      { sessionId: 's2', displayName: '호박', color: 'AMBER' },
      { sessionId: 's3', displayName: '청록', color: 'CYAN' },
    ]

    const html = renderToStaticMarkup(
      createElement(PresenceIndicator, { entries }),
    )

    expect(html).toContain('width:8px')
    expect(html).toContain('height:8px')
    expect(html).toContain('background:#15803D')
    expect(html).toContain('background:#B45309')
    expect(html).toContain('background:#0E7490')

    const limeHtml = renderToStaticMarkup(
      createElement(PresenceIndicator, {
        entries: [{ sessionId: 's4', displayName: '라임', color: 'LIME' }],
      }),
    )
    expect(limeHtml).toContain('background:#4D7C0F')
  })
})
