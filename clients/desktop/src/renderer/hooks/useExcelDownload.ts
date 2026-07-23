/**
 * useExcelDownload — P1-6 슬라이스.
 *
 * Excel export API 를 호출하고 blob 다운로드를 트리거하는 공통 hook.
 *
 * <p>내부적으로 `excelExportApi` 의 export 함수를 호출하고,
 * `triggerDownload` (design-system) 으로 파일 저장을 수행한다.
 *
 * <p>loading 상태 + 에러 처리를 포함하므로 각 페이지는 단일 hook 호출만으로
 * Excel 다운로드를 구현할 수 있다.
 *
 * @example
 * ```tsx
 * const { downloading, download } = useExcelDownload()
 *
 * <Button
 *   loading={downloading}
 *   onClick={() => download(() => exportPartners({ status: 'ACTIVE' }), '거래처목록_2026-05-11.xlsx')}
 * >
 *   Excel 다운로드
 * </Button>
 * ```
 */
import { useState } from 'react'

// ---------------------------------------------------------------------------
// 내부 유틸 — design-system ExcelDownloadButton.triggerDownload 와 동일 로직
// ---------------------------------------------------------------------------

/**
 * Blob 을 objectURL 로 변환하고 임시 anchor 클릭으로 저장 트리거.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// ---------------------------------------------------------------------------
// Hook 타입
// ---------------------------------------------------------------------------

/** useExcelDownload 반환값. */
export interface UseExcelDownloadReturn {
  /** 다운로드 진행 중 여부 — 버튼 loading prop 에 직접 연결. */
  downloading: boolean
  /** 마지막 다운로드 실패 시 화면에 표시할 안내 문구. */
  error: string | null
  /**
   * 다운로드 실행 함수.
   *
   * @param fetcher  Blob 을 반환하는 async 함수 (excelExportApi 의 export 함수)
   * @param filename 저장 파일명 (확장자 포함)
   */
  download: (fetcher: () => Promise<Blob>, filename: string) => void
}

/**
 * Excel/CSV 파일 다운로드 상태 및 실행 함수를 제공하는 hook.
 *
 * <p>에러 발생 시 화면용 안내 문구와 콘솔 로그를 함께 남긴다.
 */
export function useExcelDownload(): UseExcelDownloadReturn {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function download(fetcher: () => Promise<Blob>, filename: string): void {
    if (downloading) return
    setError(null)
    setDownloading(true)
    fetcher()
      .then((blob) => {
        triggerDownload(blob, filename)
      })
      .catch((err: unknown) => {
        setError('Excel 다운로드에 실패했습니다. 다시 시도해 주세요.')
        console.error('[useExcelDownload] 다운로드 실패', err)
      })
      .finally(() => {
        setDownloading(false)
      })
  }

  return { downloading, error, download }
}

// ---------------------------------------------------------------------------
// 파일명 유틸
// ---------------------------------------------------------------------------

/**
 * 오늘 날짜 기반 파일명 생성. 예: `"거래처목록_2026-05-11.xlsx"`
 *
 * @param prefix 파일명 앞 부분
 * @param ext    확장자 (기본 'xlsx')
 */
export function makeExportFilename(
  prefix: string,
  ext: 'xlsx' | 'csv' = 'xlsx',
): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${prefix}_${yyyy}-${mm}-${dd}.${ext}`
}
