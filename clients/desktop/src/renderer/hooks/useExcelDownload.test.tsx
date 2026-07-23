// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useExcelDownload, type UseExcelDownloadReturn } from './useExcelDownload'

describe('useExcelDownload', () => {
  it('실패 시 사용자 안내용 error 상태를 노출한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = renderHook(() =>
      useExcelDownload() as UseExcelDownloadReturn & { error: string | null },
    )

    try {
      act(() => {
        result.current.download(
          async () => {
            throw new Error('export failed')
          },
          '거래처목록.xlsx',
        )
      })

      await waitFor(() => {
        expect(result.current.error).toBe('Excel 다운로드에 실패했습니다. 다시 시도해 주세요.')
      })
      expect(consoleError).toHaveBeenCalledOnce()
    } finally {
      consoleError.mockRestore()
    }
  })
})
