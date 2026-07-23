// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ExcelDownloadError } from './ExcelDownloadError'

afterEach(cleanup)

describe('ExcelDownloadError', () => {
  it('오류가 있으면 role=alert로 다운로드 실패를 안내한다', () => {
    render(<ExcelDownloadError error="Excel 다운로드에 실패했습니다. 다시 시도해 주세요." />)

    expect(screen.getByRole('alert').textContent).toBe(
      'Excel 다운로드에 실패했습니다. 다시 시도해 주세요.',
    )
  })

  it('오류가 없으면 아무 안내도 렌더링하지 않는다', () => {
    render(<ExcelDownloadError error={null} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
