# Design Tokens — SP-08-5-5 매입 전표 인쇄 양식

**결정일**: 2026-05-18

## 인쇄 전용 CSS 변수 (global.css 추가 대상)

아래 변수는 기존 `--print-*` 토큰 네임스페이스에 추가.
`global.css` 의 P0-4 인쇄 양식 토큰 블록 직후 삽입.

```css
/* SP-08-5-5 매입 전표 인쇄 토큰 */
:root {
  /* A4 portrait budget — 매입 전표 */
  --print-budget-purchase-header:     30mm;
  --print-budget-purchase-partner:    25mm;
  --print-budget-purchase-table:      150mm; /* 최대, 실제는 라인 수에 따라 가변 */
  --print-budget-purchase-totals:     20mm;
  --print-budget-purchase-inspection: 30mm;
  --print-budget-purchase-footer:     12mm;

  /* 테이블 행 높이 */
  --print-purchase-row-height:        8mm;

  /* 검수란 행 높이 */
  --print-purchase-inspect-row-h:     7mm;

  /* 색상 (흑백 인쇄 안전) */
  --print-purchase-border:            #000000;
  --print-purchase-thead-bg:          #F0F0F0;
  --print-purchase-tfoot-bg:          #FAFAFA;
  --print-purchase-text:              #000000;
  --print-purchase-text-secondary:    #555555;
  --print-purchase-inspect-blank:     #FFFFFF; /* 수기 가능 영역 */
}
```

## 기존 토큰 재사용

| 기존 토큰 | 재사용 위치 |
|-----------|------------|
| `--print-page-margin: 12mm` | `@page` margin |
| `--print-content-w: 186mm` | `.purchase-print-page` width |
| `--print-text-xs: 8pt` | 푸터 |
| `--print-text-sm: 9pt` | 테이블/거래처/검수란 기본 |
| `--print-text-md: 10pt` | 합계 grand total, 거래처명 emphasis |
| `--print-text-base: 11pt` | 전표번호, 회사명 |
| `--print-thead-bg: #F0F0F0` | 테이블 헤더 (기존 토큰 중복 없이 재사용) |

## typography.ts 변경 여부

없음 — 기존 Pretendard 9 weight self-host 그대로 사용.
인쇄 양식 전용 폰트 크기는 CSS pt 단위 직접 사용 (px 환산 불필요).

## colors.ts 변경 여부

없음 — 인쇄 양식은 흑백 기준 (`#000`, `#F0F0F0`, `#555`) 사용.
design-system 컬러 토큰 (Primary/Warning/Error/Success/Neutral)은
인쇄 양식에 적용하지 않음 (프린터 호환성 우선).
