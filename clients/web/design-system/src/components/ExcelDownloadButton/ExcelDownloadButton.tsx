/**
 * Excel 다운로드 버튼 컴포넌트 — P1-6 슬라이스.
 *
 * <p>호출 측(desktop/mobile-staff)이 제공하는 `onFetch` 콜백을 통해
 * Blob 을 수신한 뒤, `URL.createObjectURL` + `<a download>` 패턴으로
 * 파일 저장을 트리거한다.
 *
 * <p>design-system 은 UI 라이브러리이므로 axios/fetch 직접 사용 금지.
 * 네트워크 호출 책임은 호출 측 (`onFetch`) 에게 위임한다.
 *
 * <p>동작 흐름:
 * <ol>
 *   <li>버튼 클릭 → loading 상태 진입 + 버튼 비활성화</li>
 *   <li>`onFetch()` 호출 → 호출 측이 Blob 반환</li>
 *   <li>Blob URL 생성 → 임시 &lt;a&gt; 클릭 → 100ms 후 URL 해제</li>
 *   <li>성공/실패 시 loading 해제</li>
 * </ol>
 *
 * <p>UUID 비공개 가드: 이 컴포넌트 자체는 어떤 식별자도 렌더링하지 않는다.
 *
 * @example
 * ```tsx
 * <ExcelDownloadButton
 *   onFetch={() => exportPartners({ type: 'CUSTOMER' })}
 *   filename="거래처목록_2026-05-11.xlsx"
 *   data-testid="excel-export-button"
 * />
 * ```
 */
import { useState, type ButtonHTMLAttributes } from 'react'
import { Button } from '../Button/Button'

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

export interface ExcelDownloadButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  /**
   * Blob 을 반환하는 비동기 fetcher.
   * 호출 측(desktop)이 axios blob 요청 등을 래핑해 전달한다.
   */
  onFetch: () => Promise<Blob>
  /** 저장 파일명 (확장자 포함). 예: `"거래처목록_2026-05-11.xlsx"` */
  filename: string
  /**
   * 다운로드 실패 시 호출되는 콜백.
   * 미전달 시 `console.error` 만 실행.
   */
  onError?: (err: unknown) => void
  /** 버튼 variant — 기본 'secondary'. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** 버튼 size — 기본 'sm'. */
  size?: 'sm' | 'md' | 'lg'
  /** 버튼 라벨 — 기본 'Excel 다운로드'. */
  children?: React.ReactNode
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

/**
 * Excel/CSV 파일을 blob 스트림으로 다운로드하는 범용 버튼.
 *
 * <p>design-system 의 Button 을 래핑하므로 loading / disabled 시맨틱을
 * 그대로 제공한다.
 */
export function ExcelDownloadButton({
  onFetch,
  filename,
  onError,
  variant = 'secondary',
  size = 'sm',
  children = 'Excel 다운로드',
  disabled,
  ...rest
}: ExcelDownloadButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (loading) return
    setLoading(true)
    try {
      const blob = await onFetch()
      triggerDownload(blob, filename)
    } catch (err) {
      console.error('[ExcelDownloadButton] 다운로드 실패', err)
      if (onError) {
        onError(err)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      loading={loading}
      disabled={disabled || loading}
      onClick={() => void handleClick()}
      {...rest}
    >
      {children}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// 내부 유틸 — DOM 조작 (테스트 대체 가능하도록 export)
// ---------------------------------------------------------------------------

/**
 * Blob 을 objectURL 로 변환하고 임시 anchor 클릭으로 저장 트리거.
 *
 * @param blob      다운로드 대상 Blob
 * @param filename  저장 파일명 (확장자 포함)
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // GC 를 위해 100ms 후 URL 해제
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

export default ExcelDownloadButton
