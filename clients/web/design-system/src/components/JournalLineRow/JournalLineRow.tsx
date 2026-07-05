import { forwardRef, type ReactNode } from 'react'
import styles from './JournalLineRow.module.css'
import { AccountCodeSelect, type Account } from '../AccountCodeSelect/AccountCodeSelect'
import { MoneyInput } from '../MoneyInput/MoneyInput'

/**
 * 분개 라인 1건의 데이터 형태 (FE 입력 모델).
 *
 * BE `JournalLineRequest` 와 1:1 매핑되며, 본 컴포넌트는 라인 단위 편집 UI
 * (계정 select + 거래처 + 차변 + 대변 + 메모 + 삭제) 만 담당한다.
 *
 * 회계 규칙:
 * - 같은 라인에서 `debit` 과 `credit` 중 하나만 0 보다 커야 한다 (양 쪽 동시 입력 금지).
 * - 각 라인의 `accountCode` 는 필수.
 * - `partnerName` / `note` 는 선택.
 *
 * 본 컴포넌트는 위 규칙을 enforce 하지 않고 (header 검증은 부모 책임), 단순히
 * 사용자가 입력한 값을 그대로 onChange 로 전달한다. 단, MoneyInput 자체가
 * 음수/소수를 차단한다.
 */
export interface JournalLineDraft {
  /** 계정 코드 (4자리). 미선택 시 빈 문자열. */
  accountCode: string
  /** 차변 금액 (KRW 정수). 빈 셀은 0. */
  debit: number
  /** 대변 금액 (KRW 정수). 빈 셀은 0. */
  credit: number
  /** 거래처명 (자유 입력). 미입력 시 빈 문자열. */
  partnerName: string
  /** 거래처 UUID (저장 payload 내부용). 화면 표시 금지. */
  partnerId?: string | null
  /** 메모 (자유 입력). 미입력 시 빈 문자열. */
  note: string
}

export interface JournalLineRowProps {
  /** 1-based 라인 번호 (시각 표시용). */
  index: number
  /** 라인 데이터. */
  line: JournalLineDraft
  /** 마스터 계정 목록 — `AccountCodeSelect` 에 그대로 전달. */
  accounts: Account[]
  /** 부분 변경 사항 patch 형태로 부모에 통지. */
  onChange: (patch: Partial<JournalLineDraft>) => void
  /** 라인 제거 콜백. 부모가 이 라인을 배열에서 제거. */
  onRemove: () => void
  /** 거래처 입력 영역 대체 렌더러. 지정 시 자유텍스트 input 대신 호출자가 주입한 피커를 렌더한다. */
  renderPartnerField?: () => ReactNode
  /** 비활성화 — 분개 status=POSTED 인 경우. */
  disabled?: boolean
  /**
   * 계정 카테고리 prefix 필터 (옵션). 보통 분개에서는 미지정 (전체 노출).
   * 사용자가 카테고리를 좁혀 검색하고 싶을 때만 사용.
   */
  category?: string
}

/**
 * JournalLineRow — 분개 1라인 편집 UI.
 *
 * 6 셀 구성 (좌→우):
 * 1. 라인번호 (자동, 1-based)
 * 2. 계정과목 (AccountCodeSelect)
 * 3. 거래처명 (text)
 * 4. 차변 (MoneyInput)
 * 5. 대변 (MoneyInput)
 * 6. 메모 (text) + 삭제 버튼
 *
 * 부모 (`JournalFormPage`) 가 라인 배열을 관리하며, 본 컴포넌트는 단일 라인의
 * 시각/입력만 담당. 차/대변 합계 검증은 부모 책임.
 *
 * @example
 * ```tsx
 * <JournalLineRow
 *   index={1}
 *   line={lines[0]}
 *   accounts={accounts}
 *   onChange={(patch) => updateLine(0, patch)}
 *   onRemove={() => removeLine(0)}
 * />
 * ```
 */
export const JournalLineRow = forwardRef<HTMLDivElement, JournalLineRowProps>(
  function JournalLineRow(
    { index, line, accounts, onChange, onRemove, renderPartnerField, disabled = false, category },
    ref,
  ) {
    return (
      <div ref={ref} className={styles['row']} data-line-index={index}>
        <div className={styles['cellIndex']} aria-label="라인 번호">
          {index}
        </div>
        <div className={styles['cellAccount']}>
          <AccountCodeSelect
            value={line.accountCode}
            onChange={(code) => onChange({ accountCode: code })}
            accounts={accounts}
            disabled={disabled}
            required
            {...(category ? { category } : {})}
          />
        </div>
        <div className={styles['cellText']}>
          {renderPartnerField ? (
            renderPartnerField()
          ) : (
            <input
              type="text"
              className={styles['textInput']}
              value={line.partnerName}
              onChange={(e) => onChange({ partnerName: e.target.value })}
              placeholder="거래처"
              disabled={disabled}
              aria-label={`라인 ${index} 거래처`}
            />
          )}
        </div>
        <div className={styles['cellMoney']}>
          <MoneyInput
            value={line.debit}
            onChange={(n) => onChange({ debit: n })}
            disabled={disabled}
            ariaLabel={`라인 ${index} 차변`}
          />
        </div>
        <div className={styles['cellMoney']}>
          <MoneyInput
            value={line.credit}
            onChange={(n) => onChange({ credit: n })}
            disabled={disabled}
            ariaLabel={`라인 ${index} 대변`}
          />
        </div>
        <div className={styles['cellNote']}>
          <input
            type="text"
            className={styles['textInput']}
            value={line.note}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="메모"
            disabled={disabled}
            aria-label={`라인 ${index} 메모`}
          />
          <button
            type="button"
            className={styles['removeBtn']}
            onClick={onRemove}
            disabled={disabled}
            aria-label={`라인 ${index} 삭제`}
            title="라인 삭제"
          >
            ×
          </button>
        </div>
      </div>
    )
  },
)

export default JournalLineRow
