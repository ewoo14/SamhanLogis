/** Excel 다운로드 실패 상태를 사용자에게 알리는 공통 안내. */
export interface ExcelDownloadErrorProps {
  /** hook이 보관한 마지막 다운로드 오류 문구. */
  error: string | null
  /** 화면별 접근성·QA 식별자. */
  testId?: string
}

export function ExcelDownloadError({ error, testId = 'excel-download-error' }: ExcelDownloadErrorProps) {
  if (!error) return null

  return (
    <div
      className="error-banner"
      role="alert"
      data-testid={testId}
      style={{ marginBottom: 12, padding: 12, color: 'var(--color-danger-700)' }}
    >
      {error}
    </div>
  )
}
