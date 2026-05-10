# Excel Export UI 디자인 스펙 — P1-6

작성일: 2026-05-11  
담당: Designer (UI/UX)  
연관 슬라이스: P1-6 Excel 다운로드  
상태: DRAFT — FE agent 구현 대기

---

## 1. 개요

모든 list 페이지 우상단 액션 영역에 **ExcelDownloadButton** 공통 컴포넌트를 배치한다.  
이카운트 ERP UX 표준(docs/migration/ecount-reference/ 16캡처)에서 "Excel" 다운로드 버튼은  
항상 목록 헤더 우측, CTA("신규 등록") 버튼의 좌측에 위치한다.

---

## 2. ExcelDownloadButton 컴포넌트 스펙

### 2.1 Props

```typescript
interface ExcelDownloadButtonProps {
  /**
   * 다운로드 실행 함수. Promise<void> — resolve 시 완료, reject 시 error toast.
   * 컴포넌트 내부에서 isLoading 상태를 자동 관리한다.
   */
  onDownload: () => Promise<void>;

  /**
   * 저장할 파일명 (확장자 포함).
   * 규칙: {도메인}_{YYYY-MM-DD}.xlsx
   * 예: 거래처목록_2026-05-10.xlsx / 출고전표_2026-05-10.xlsx
   * 페이지에서 직접 주입 — 컴포넌트는 파일명 생성에 관여하지 않는다.
   */
  fileName: string;

  /**
   * 버튼 비활성화 (데이터 0건 시 parent 가 전달).
   * disabled=true 이면 클릭 불가 + opacity 0.45.
   */
  disabled?: boolean;

  /**
   * 추가 CSS class (parent 레이아웃 margin 조정 용도).
   */
  className?: string;
}
```

### 2.2 data-testid

```
data-testid="excel-export-button"
```

모든 페이지에서 동일한 값 사용 (E2E: 페이지 구분은 URL로 한다).

### 2.3 내부 상태

```typescript
// 컴포넌트 내부 — 외부 노출 불필요
const [isLoading, setIsLoading] = useState(false);
```

`onDownload` 호출 시 `isLoading = true` → 완료/실패 모두 `isLoading = false`.

---

## 3. 비주얼 스펙

### 3.1 기본 상태 (idle)

```
┌─────────────────────────────┐
│  [↓ Excel] Excel 다운로드   │
└─────────────────────────────┘
```

| 속성             | 값                                             |
|----------------|------------------------------------------------|
| 높이             | 32px (size="sm" — "신규 등록" 버튼과 동일)      |
| 패딩             | 0 12px                                         |
| border-radius   | 6px                                            |
| 배경             | `var(--surface-card)` (흰색 계열)               |
| 테두리           | `1px solid #107C41` (Excel green)              |
| 텍스트 색        | `#107C41`                                      |
| 폰트             | Pretendard 13px Medium (500)                   |
| 아이콘           | lucide-react `<FileSpreadsheet />` 16px, stroke `#107C41` |
| 아이콘-텍스트 간격 | 6px                                           |
| 텍스트           | "Excel 다운로드"                               |

### 3.2 hover 상태

| 속성   | 값                         |
|--------|----------------------------|
| 배경   | `#E8F5E9` (green-50 계열)  |
| 테두리 | `1px solid #107C41`        |
| cursor | `pointer`                  |
| transition | `background 120ms ease` |

### 3.3 loading 상태 (다운로드 진행 중)

```
┌──────────────────────────────┐
│  [spinner] 다운로드 중...     │
└──────────────────────────────┘
```

| 속성       | 값                                                              |
|------------|----------------------------------------------------------------|
| 아이콘     | 14px spinner (CSS animation rotate 1s linear infinite)         |
| 텍스트     | "다운로드 중..."                                                |
| 배경       | `var(--surface-card)`                                          |
| 테두리     | `1px solid #D1D5DB` (neutral — 진행 중 green 제거)             |
| 텍스트 색  | `var(--ink-secondary)`                                         |
| 클릭       | disabled (pointer-events: none)                                |

```css
/* spinner keyframes */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.excel-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #D1D5DB;
  border-top-color: #107C41;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

### 3.4 disabled 상태

| 속성       | 값                                      |
|------------|-----------------------------------------|
| 배경       | `var(--surface-card)`                   |
| 테두리     | `1px solid #D1D5DB`                     |
| 텍스트 색  | `var(--ink-tertiary)`                   |
| 아이콘 색  | `var(--ink-tertiary)`                   |
| opacity    | 0.45                                    |
| cursor     | `not-allowed`                           |

### 3.5 error toast (다운로드 실패)

- `onDownload` Promise reject 시 화면 우하단 toast 표시
- 텍스트: "Excel 다운로드 실패. 다시 시도하세요."
- 색상: Error red (`var(--state-danger)` 배경 + 흰색 텍스트)
- 자동 소멸: 4초

---

## 4. 위치 — list 페이지 우상단 액션 영역

### 4.1 배치 원칙

이카운트 ERP 패턴 (docs/migration/ecount-reference/ 캡처 기준):

```
┌──────────────────────────────────────────────────────────────┐
│  [페이지 제목]    실시간 자동 갱신 · 30초   [Excel 다운로드] [신규 등록] │
└──────────────────────────────────────────────────────────────┘
```

- "신규 등록" (primary CTA) 버튼이 있는 경우: **ExcelDownloadButton 이 좌측**
- "신규 등록" 버튼이 없는 경우 (조회 전용 페이지): ExcelDownloadButton 이 우측 단독 위치

### 4.2 DOM 구조 패턴

```tsx
{/* 헤더 행 — 기존 패턴 답습 (PartnersPage, SlipListPage 등) */}
<div
  style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  }}
>
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
    <h3 style={{ margin: 0 }}>{pageTitle}</h3>
    {/* 실시간 갱신 indicator (해당 페이지만) */}
  </div>

  {/* 우측 액션 그룹 */}
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <ExcelDownloadButton
      onDownload={handleExcelDownload}
      fileName={`${domainLabel}_${today}.xlsx`}
      disabled={rows.length === 0}
      data-testid="excel-export-button"
    />
    {canCreate ? (
      <Button variant="primary" size="sm" onClick={...}>
        신규 등록
      </Button>
    ) : null}
  </div>
</div>
```

---

## 5. 파일명 규칙

### 5.1 형식

```
{도메인}_{YYYY-MM-DD}.xlsx
```

### 5.2 도메인별 파일명 표

| 페이지                       | 라우트                          | 파일명 예시                          |
|-----------------------------|---------------------------------|--------------------------------------|
| 거래처 관리                  | /admin/partners                 | 거래처목록_2026-05-11.xlsx           |
| 출고전표 (판매조회)          | /sales                          | 출고전표_2026-05-11.xlsx             |
| 입고전표 (구매조회)          | /purchases                      | 입고전표_2026-05-11.xlsx             |
| 재고이동                     | /transfers                      | 재고이동_2026-05-11.xlsx             |
| 분개장                       | /accounting/journals            | 분개장_2026-05-11.xlsx               |
| 세금계산서                   | /accounting/tax-invoices        | 세금계산서_2026-05-11.xlsx           |
| 견적서                       | /sales/estimates                | 견적서_2026-05-11.xlsx               |
| 시산표                       | /accounting/balances            | 시산표_2026-05-11.xlsx               |
| 손익계산서                   | /accounting/reports/income-statement | 손익계산서_2026-05-11.xlsx     |
| 재무상태표                   | /accounting/reports/balance-sheet    | 재무상태표_2026-05-11.xlsx     |
| 거래처별 미수/미지급          | /accounting/reports/partner-aging    | 거래처미수미지급_2026-05-11.xlsx|
| 거래처별 원장                | /accounting/partner-ledger      | 거래처원장_2026-05-11.xlsx           |
| 재고 실사                    | /warehouse/audit                | 재고실사_2026-05-11.xlsx             |
| DPS 입고 비교                | /warehouse/dps-compare          | DPS입고비교_2026-05-11.xlsx          |
| 안전재고 알림                | /inventory/safety-stock-alerts  | 안전재고알림_2026-05-11.xlsx         |
| 입고 검수 목록               | /warehouse/inbound-inspections  | 입고검수_2026-05-11.xlsx             |

### 5.3 날짜 생성 헬퍼

```typescript
// pages 에서 사용하는 헬퍼 (공통 util 으로 추출 권장)
function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// 사용 예
const fileName = `거래처목록_${todayStr()}.xlsx`;
```

---

## 6. 컴포넌트 구현 가이드 (FE agent 전달용)

### 6.1 파일 위치

```
clients/desktop/src/renderer/components/ExcelDownloadButton.tsx
```

### 6.2 구현 참조 코드

```tsx
/**
 * ExcelDownloadButton — list 페이지 우상단 Excel 다운로드 공통 버튼.
 *
 * - idle: green outline + FileSpreadsheet 아이콘
 * - loading: spinner + "다운로드 중..." (클릭 불가)
 * - disabled: neutral outline + opacity 0.45
 * - 실패: 우하단 error toast 4초
 *
 * data-testid="excel-export-button" 고정 (E2E 식별용).
 */
import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'

interface ExcelDownloadButtonProps {
  onDownload: () => Promise<void>;
  fileName: string;
  disabled?: boolean;
  className?: string;
}

export function ExcelDownloadButton({
  onDownload,
  fileName: _fileName,
  disabled = false,
  className,
}: ExcelDownloadButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleClick() {
    if (isLoading || disabled) return
    setIsLoading(true)
    try {
      await onDownload()
    } catch {
      // error toast — react-hot-toast 또는 자체 toast 연결
      showErrorToast('Excel 다운로드 실패. 다시 시도하세요.')
    } finally {
      setIsLoading(false)
    }
  }

  const isDisabled = disabled || isLoading

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      data-testid="excel-export-button"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 32,
        padding: '0 12px',
        borderRadius: 6,
        border: isDisabled ? '1px solid #D1D5DB' : '1px solid #107C41',
        background: 'var(--surface-card)',
        color: isDisabled ? 'var(--ink-tertiary)' : '#107C41',
        fontSize: 13,
        fontFamily: 'Pretendard, sans-serif',
        fontWeight: 500,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: disabled && !isLoading ? 0.45 : 1,
        transition: 'background 120ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {isLoading ? (
        <span className="excel-btn-spinner" aria-hidden="true" />
      ) : (
        <FileSpreadsheet
          size={16}
          stroke={isDisabled ? 'var(--ink-tertiary)' : '#107C41'}
          aria-hidden="true"
        />
      )}
      {isLoading ? '다운로드 중...' : 'Excel 다운로드'}
    </button>
  )
}

/** placeholder — react-hot-toast 또는 자체 toast 시스템으로 교체 */
function showErrorToast(message: string) {
  // TODO: FE agent — react-hot-toast toast.error(message, { duration: 4000 }) 연결
  console.error('[ExcelDownload]', message)
}
```

### 6.3 CSS (global 또는 module)

```css
/* excel-btn-spinner — global.css 또는 ExcelDownloadButton.module.css */
@keyframes excel-spin {
  to { transform: rotate(360deg); }
}

.excel-btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #D1D5DB;
  border-top-color: #107C41;
  border-radius: 50%;
  animation: excel-spin 1s linear infinite;
  flex-shrink: 0;
}

button[data-testid="excel-export-button"]:hover:not(:disabled) {
  background: #E8F5E9 !important;
}
```

---

## 7. 적용 대상 페이지 (P1-6 1차 대상)

아래 페이지에 우선 적용. 각 페이지의 `onDownload` 구현은 FE + BE 슬라이스에서 별도 정의.

| 우선순위 | 페이지                    | 파일                                    | 비고                                |
|---------|--------------------------|----------------------------------------|------------------------------------|
| P0      | 거래처 관리              | routes/admin/PartnersPage.tsx          | 가장 사용 빈도 높은 목록             |
| P0      | 출고전표 (판매조회)      | routes/SlipListPage.tsx (OUTBOUND)     | 핵심 업무 목록                      |
| P0      | 입고전표 (구매조회)      | routes/SlipListPage.tsx (INBOUND)      | 핵심 업무 목록                      |
| P1      | 견적서                   | routes/EstimateListPage.tsx            | 영업 업무 목록                      |
| P1      | 세금계산서               | routes/TaxInvoiceListPage.tsx          | 회계 업무 목록                      |
| P1      | 분개장                   | routes/JournalListPage.tsx             | 회계 업무 목록                      |
| P2      | 재고이동                 | routes/TransferListPage.tsx            | 창고 업무                           |
| P2      | 재고 실사                | routes/InventoryAuditListPage.tsx      | 창고 업무                           |
| P2      | 안전재고 알림            | routes/SafetyStockAlertsPage.tsx       | 창고 업무                           |
| P3      | 시산표                   | routes/TrialBalancePage.tsx            | 회계 보고 (인쇄 외 Excel 병행)      |
| P3      | 손익계산서               | routes/IncomeStatementPage.tsx         | 재무 보고                           |
| P3      | 재무상태표               | routes/BalanceSheetPage.tsx            | 재무 보고                           |

---

## 8. 접근성 (a11y)

| 항목         | 스펙                                                               |
|--------------|--------------------------------------------------------------------|
| role         | 기본 `<button>` — 별도 role 불필요                                  |
| aria-label   | `aria-label="Excel 파일 다운로드"` (icon-only 아닌 경우도 명시적 추가)|
| aria-busy    | `aria-busy={isLoading}`                                            |
| aria-disabled| `aria-disabled={disabled}` (disabled prop true 시)                |
| focus ring   | 기본 브라우저 focus ring 유지 (`:focus-visible` outline 제거 금지)  |
| keyboard     | `Enter` / `Space` — 클릭과 동일 동작 (`<button>` 기본 동작)        |

---

## 9. 디자인 토큰 사용

| 용도              | 토큰                        | 폴백값     |
|-------------------|-----------------------------|------------|
| 버튼 배경         | `--surface-card`            | `#FFFFFF`  |
| 비활성 테두리     | `--line-default`            | `#D1D5DB`  |
| 비활성 텍스트     | `--ink-tertiary`            | `#9CA3AF`  |
| 보조 텍스트 (로딩)| `--ink-secondary`           | `#6B7280`  |
| Excel 그린 (고정) | 고정값 `#107C41`            | —          |
| hover 배경 (고정) | 고정값 `#E8F5E9`            | —          |

Excel green(`#107C41`)은 Microsoft Excel 브랜드 컬러이므로 design-system 토큰화하지 않고  
컴포넌트 내부 고정값으로 사용한다.

---

## 10. QA 체크리스트

| 항목                                   | 확인 방법                                          |
|---------------------------------------|---------------------------------------------------|
| data-testid="excel-export-button" 존재 | Playwright `getByTestId('excel-export-button')`   |
| idle 상태: 아이콘 + 텍스트 표시        | 시각 확인 + screenshot                             |
| 클릭 시 loading spinner 전환           | `onDownload` 에 1000ms delay mock 후 확인          |
| 성공 후 idle 복귀                      | resolve 후 버튼 상태 확인                           |
| 실패 시 error toast 표시               | reject 후 toast 표시 확인                           |
| disabled=true 시 클릭 불가             | rows.length=0 조건 시뮬레이션                       |
| "신규 등록" 버튼 좌측 배치             | DOM 순서 + 시각 확인                               |
| 파일명 규칙 준수                       | 브라우저 다운로드 파일명 확인                       |
| 키보드 Enter/Space 동작                | focus 후 키 입력 테스트                             |
| aria-busy=true (loading 중)            | devtools Accessibility 탭 확인                    |

---

## 11. 이카운트 ERP 패턴 참조

docs/migration/ecount-reference/ 캡처 분석 결과:
- 이카운트는 목록 우상단에 "Excel" 버튼을 툴바 형태로 제공
- SamhanLogis 는 이카운트의 툴바 패턴을 버튼 단위로 채택 (툴바 전체 미도입)
- 이카운트의 "Option / 도움말" 버튼 영역 = SamhanLogis 의 "Excel 다운로드 / 신규 등록" 액션 영역에 대응
- 버튼 크기 (32px height, sm size) 는 이카운트 목록 툴바 버튼 높이 기준과 일관

---

## 12. 개발 연동 참고

### 12.1 BE API 연동 패턴 (FE agent 참고)

```typescript
// api/excelExport.ts 신규 생성 예시 — P1-6 BE 슬라이스와 협의
async function downloadPartnersExcel(): Promise<void> {
  const response = await apiClient.get('/admin/partners/export/excel', {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = `거래처목록_${todayStr()}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}
```

### 12.2 Electron 환경 고려사항

- Electron renderer process 에서 `URL.createObjectURL` + `<a>.click()` 패턴 정상 동작 확인 필요
- 대안: `ipcRenderer.invoke('save-file', buffer, fileName)` — IPC 경유 저장 다이얼로그 (사용자 지정 경로)
- P1-6 BE/FE 슬라이스 협의 시 Electron IPC vs Blob 다운로드 방식 확정 필요

---

*산출물 경로: `clients/desktop/src/renderer/EXCEL-EXPORT-DESIGN.md`*  
*다음 단계: FE agent → ExcelDownloadButton.tsx 구현 + 각 ListPage 통합 → QA agent 시나리오 검증*
