# Components — SP-08-5-5 매입 전표 인쇄 양식

**결정일**: 2026-05-18

## 결론: 신규 전용 컴포넌트 불필요

### 근거

1. `PrintLayout` 이미 `paper-a4-portrait` + no-print 액션바 완비
2. `global.css` `.paper-a4-portrait` (210mm × 297mm, padding 12mm) 그대로 사용
3. 기존 `InboundView` + `OutboundView` 구조 패턴이 충분히 확립되어 있음
4. `COMPANY` 상수, `krw()`, `krDate()`, `calcAmounts()` 헬퍼 `PrintLayout.tsx` 에서 재사용

### 신규 파일

| 파일 | 역할 |
|------|------|
| `clients/desktop/src/renderer/print/PurchaseSlipView.tsx` | 매입 전표 인쇄 미리보기 View |
| `clients/desktop/src/renderer/print/PurchaseSlipView.module.css` | View 전용 CSS (전역 오염 방지) |

### PurchaseSlipView.tsx 컴포넌트 구조

```tsx
// route: /purchases/:id/print
export function PurchaseSlipView() {
  // useParams, useQuery (slip + warehouses)
  // PrintLayout paper="a4-portrait" 래핑
  return (
    <PrintLayout paper="a4-portrait" backTo={`/purchases/${id}`}>
      <div className={styles.page} data-testid="purchase-print-area">
        <header className={styles.header}>          {/* §헤더 30mm */}
        <section className={styles.partner}>        {/* §거래처 25mm */}
        <table className={styles.table}>            {/* §라인 테이블 */}
        <section className={styles.totals}>         {/* §합계 20mm */}
        <section className={styles.inspection}>     {/* §검수란 30mm */}
        <footer className={styles.footer}>          {/* §푸터 12mm */}
      </div>
    </PrintLayout>
  )
}
```

### 기존 컴포넌트 재사용 체계

| 컴포넌트/헬퍼 | 출처 | 재사용 방식 |
|--------------|------|------------|
| `PrintLayout` | `print/PrintLayout.tsx` | import, paper="a4-portrait" |
| `COMPANY` | `print/PrintLayout.tsx` | 회사명/사업자번호/전화 |
| `krw()` | `print/PrintLayout.tsx` | 금액 천단위 콤마 |
| `krDate()` | `print/PrintLayout.tsx` | ISO → 한국식 날짜 |
| `calcAmounts()` | `print/PrintLayout.tsx` | 공급가/부가세/합계 계산 |
| `getSlip()` API | `api/slip.ts` | 전표 상세 fetch |
| `listWarehouses()` API | `api/inventory.ts` | 창고명 lookup |

### 기존 `<Card>`, `<Table>` 컴포넌트 미사용 이유

인쇄 양식은 px/rem 기반 design-system 컴포넌트가 아닌
mm/pt 기반 CSS Module 직접 제어가 필요하다.
`<Card>` 의 border-radius, box-shadow, padding 토큰 등이 인쇄 시 불필요.
`<Table>` 의 hover/striped/sticky 패턴도 인쇄 맥락에 맞지 않음.
