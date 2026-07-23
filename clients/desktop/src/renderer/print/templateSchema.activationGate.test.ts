import { describe, expect, it } from 'vitest'

import { ACTIVATION_BLOCKED_ELEMENT_TYPES, hasActivationBlockedElements, type DocumentPayload } from './templateSchema'

/**
 * H10(R5) — `hasActivationBlockedElements` 는 BE `DocumentPayloadValidator.containsActivationBlockedElements`
 * 와 같은 판정(DETAIL/IMAGE 존재 여부)을 FE 에서 미리 내려, 편집기가 되돌리기 어려운 상태(사용 중
 * 양식을 내림)에 들어가기 전에 사용자에게 경고할 수 있게 한다.
 *
 * 라이브 QA 참고: 이 라운드 시점의 groupware-service 컨테이너 이미지가 DETAIL/IMAGE BE 지원 커밋
 * (b688addad/b7f3fccc5)보다 먼저 빌드되어(docker image Created=2026-07-22T07:48Z, 두 커밋은
 * 2026-07-23 04:01/05:45 KST) DETAIL/IMAGE 를 포함한 신규 저장이 BE 에서 400 으로 막힌다(재현:
 * curl 직접 호출) — 그래서 "저장 성공 후 활성화만 막힌다" 실제 라운드트립은 이 세션에서 실서버로
 * 끝까지 재현할 수 없었다. 이 유닛 테스트가 그 갭을 좁히는 최선의 결정적 증거다(BE 목록과 FE 목록이
 * 어긋나면 여기서 즉시 RED).
 */
function band(kind: DocumentPayload['bands'][number]['kind'], elements: DocumentPayload['bands'][number]['elements']): DocumentPayload['bands'][number] {
  return { key: `${kind}-band`, kind, elements }
}

describe('hasActivationBlockedElements / ACTIVATION_BLOCKED_ELEMENT_TYPES', () => {
  it('BE 게이트 대상과 정확히 같다 — DETAIL, IMAGE 두 개뿐', () => {
    expect(Array.from(ACTIVATION_BLOCKED_ELEMENT_TYPES).sort()).toEqual(['DETAIL', 'IMAGE'])
  })

  it('DETAIL 요소가 있으면 true', () => {
    const document: DocumentPayload = {
      paper: 'A4_PORTRAIT',
      bands: [band('BODY', [{ key: 'd', type: 'DETAIL', repeatBinding: 'body.lineItems', columns: ['productName'] }])],
    }
    expect(hasActivationBlockedElements(document)).toBe(true)
  })

  it('IMAGE 요소가 있으면 true', () => {
    const document: DocumentPayload = {
      paper: 'A4_PORTRAIT',
      bands: [band('HEADER', [{ key: 'i', type: 'IMAGE', src: '/print-logo.svg', alt: '로고' }])],
    }
    expect(hasActivationBlockedElements(document)).toBe(true)
  })

  it('DETAIL/IMAGE가 다른 밴드(HEADER/BODY/FOOTER)에 있어도 전 밴드를 훑어 찾는다', () => {
    const document: DocumentPayload = {
      paper: 'A4_PORTRAIT',
      bands: [
        band('HEADER', [{ key: 'title', type: 'TITLE' }]),
        band('BODY', [{ key: 'content', type: 'CONTENT_PARAGRAPHS' }]),
        band('FOOTER', [
          { key: 'closing', type: 'CLOSING' },
          { key: 'footer-image', type: 'IMAGE', src: '/print-logo.svg', alt: '로고' },
        ]),
      ],
    }
    expect(hasActivationBlockedElements(document)).toBe(true)
  })

  it('DETAIL/IMAGE가 전혀 없으면(레거시 + FIELD/TEXT만) false', () => {
    const document: DocumentPayload = {
      paper: 'A4_PORTRAIT',
      bands: [
        band('HEADER', [{ key: 'title', type: 'TITLE' }, { key: 'grid', type: 'APPROVAL_GRID' }]),
        band('BODY', [
          { key: 'content', type: 'CONTENT_PARAGRAPHS' },
          { key: 'f', type: 'FIELD', binding: 'header.docNo' },
          { key: 't', type: 'TEXT', text: '문구' },
        ]),
        band('FOOTER', [{ key: 'closing', type: 'CLOSING' }]),
      ],
    }
    expect(hasActivationBlockedElements(document)).toBe(false)
  })

  it('밴드가 0개면 false(빈 문서를 잘못 차단하지 않는다)', () => {
    expect(hasActivationBlockedElements({ paper: 'A4_PORTRAIT', bands: [] })).toBe(false)
  })
})
