import { describe, expect, it } from 'vitest'
import orderHtml from '../../index.html?raw'

describe('주문서웹 서버 가격 수렴 회귀', () => {
  it('최종확인 클릭은 IIFE 지역 변수가 아니라 전역 서버 가격 상태를 읽는다', () => {
    const handler = orderHtml.match(
      /el\('#btnSendOrder'\)\.addEventListener\('click',\(\)=>\{([\s\S]*?)\n  \}\);/,
    )?.[1] ?? ''

    expect(handler).toContain('window.__SAMHAN_LATEST_SERVER_PRICE_PAYLOAD__')
    expect(handler).not.toContain('latestServerPricePayload')
  })

  it('서버 미리보기 라인은 선택 품목표의 가격 셀과 소계를 갱신한다', () => {
    expect(orderHtml).toContain('applyServerPricesToCatalogTables(items, lines)')
    expect(orderHtml).toContain('#homeBody [data-unit="${escapedModel}"]')
    expect(orderHtml).toContain('#commBody [data-cunit="${escapedModel}"]')
    expect(orderHtml).toContain('#singleBody [data-ssu="${escapedModel}"]')
  })
})
