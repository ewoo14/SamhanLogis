import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PartnerAutocomplete, type PartnerOption } from './PartnerAutocomplete'
import { splitHighlightMatches } from './highlight'

describe('splitHighlightMatches', () => {
  it('정규식 특수문자를 literal substring으로 대소문자 무시 매칭한다', () => {
    expect(splitHighlightMatches('abc[.*(ABC', '[.*(')).toEqual([
      { text: 'abc', matched: false },
      { text: '[.*(', matched: true },
      { text: 'ABC', matched: false },
    ])
  })

  it('한글과 영문 대소문자 다중 매치를 모두 분할하고 매치 없음은 원문을 보존한다', () => {
    expect(splitHighlightMatches('삼한 SamHAN 삼한', '삼한')).toEqual([
      { text: '삼한', matched: true },
      { text: ' SamHAN ', matched: false },
      { text: '삼한', matched: true },
    ])
    expect(splitHighlightMatches('거래처', '없는')).toEqual([
      { text: '거래처', matched: false },
    ])
  })
})

describe('PartnerAutocomplete highlight', () => {
  const partner: PartnerOption = {
    id: 'partner-internal-id',
    name: '삼한삼한',
    partnerCode: 'P-ABC',
    bizNo: '123-45-67890',
    phone: '010-1234-5678',
  }

  function renderPartner(searchResult: PartnerOption = partner) {
    const searchPartners = vi.fn<(query: string) => Promise<PartnerOption[]>>()
      .mockResolvedValue([searchResult])
    render(
      <PartnerAutocomplete
        value={null}
        onChange={vi.fn()}
        searchPartners={searchPartners}
        ariaLabel="거래처"
        debounceMs={0}
      />,
    )
    const input = screen.getByRole('combobox', { name: '거래처' })
    fireEvent.focus(input)
    return { input, searchPartners }
  }

  it('name/code/bizNo의 매치 필드 모두를 mark와 한국어 배지로 표시한다', async () => {
    renderPartner()
    const input = screen.getByRole('combobox', { name: '거래처' })
    fireEvent.change(input, { target: { value: '삼한' } })
    await waitFor(() => expect(document.querySelectorAll('mark')).toHaveLength(2))

    expect(document.querySelectorAll('mark')).toHaveLength(2)
    expect(screen.getByText('상호')).toBeTruthy()

    fireEvent.change(input, { target: { value: 'P-' } })
    await waitFor(() => expect(screen.getByText('코드')).toBeTruthy())
    expect(document.querySelector('mark')?.textContent).toBe('P-')

    fireEvent.change(input, { target: { value: '123' } })
    await waitFor(() => expect(screen.getByText('사업자번호')).toBeTruthy())
    expect(document.querySelector('mark')?.textContent).toBe('123')
  })

  it('전화번호만 매치된 후보는 원문을 표시하고 하이라이트하지 않는다', async () => {
    renderPartner()
    const input = screen.getByRole('combobox', { name: '거래처' })
    fireEvent.change(input, { target: { value: '010' } })
    await screen.findByText('삼한삼한')

    expect(document.querySelectorAll('mark')).toHaveLength(0)
    expect(screen.queryByText('상호')).toBeNull()
    expect(screen.queryByText('코드')).toBeNull()
    expect(screen.queryByText('사업자번호')).toBeNull()
  })

  it('하이픈 없는 사업자번호는 슬1에서 정규화하지 않고 강조하지 않는다', async () => {
    renderPartner()
    const input = screen.getByRole('combobox', { name: '거래처' })
    fireEvent.change(input, { target: { value: '1234567890' } })
    await screen.findByText('삼한삼한')

    expect(document.querySelectorAll('mark')).toHaveLength(0)
    expect(screen.queryByText('사업자번호')).toBeNull()
  })

  it('악성 원문을 HTML로 해석하지 않고 React text node로 렌더한다', async () => {
    renderPartner({
      ...partner,
      name: '<img onerror=x><script>alert(1)</script>',
    })
    const input = screen.getByRole('combobox', { name: '거래처' })
    fireEvent.change(input, { target: { value: '<script>' } })
    await waitFor(() => expect(screen.getByText('상호')).toBeTruthy())

    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText('<img onerror=x>')).toBeTruthy()
  })
})
