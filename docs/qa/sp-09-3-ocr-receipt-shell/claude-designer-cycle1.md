# SP-09-3 OCR Receipt Shell — Designer Review (Claude, Cycle 1)

> 브랜치: `feat/sp-09-3-ocr-receipt-shell` commit `b0428441`
> 리뷰 날짜: 2026-05-18
> 리뷰어: Claude Designer Agent

---

## 검증 항목 체크리스트

| # | 검증 항목 | 결과 | 비고 |
|---|---|---|---|
| D1 | --color-clova-primary #03C75A 토큰 정의 | PASS | tokens.css L71 정의 확인 |
| D2 | --color-clova-* 6종 전체 정의 | PASS | primary/50/100/200/700/text 6종 모두 정의 (L71~76) |
| D3 | colors.clova index.ts 내보내기 | PASS | index.ts L80~87 일치 |
| D4 | 드롭존 dashed border | PASS | PurchaseSlipOcrUploadPage.tsx L378 `2px dashed` |
| D5 | 금액/부가세 monospace + tabular-nums | PASS | ResultCard L154/L159 `fontVariantNumeric: 'tabular-nums'` |
| D6 | Pretendard 9 weight 지원 | PASS | tokens.css L90 Pretendard Variable 선언 (variable font = 가변 weight) |
| D7 | role="alert" 접근성 (에러 배너) | PASS | fileError div L414 + apiError div L486 모두 role="alert" |
| D8 | role="status" (성공 결과 공지) | FAIL | ResultCard 에 role="status" 미적용 (FE 검토와 동일 결함) |
| D9 | HTML mock Clova 토큰 일관 | PASS | 03-ocr-result-success.html 내 --color-clova-* 6종 tokens.css 와 값 일치 |
| D10 | HTML mock 실 구현 정합 — 드롭존 상태 | PASS | 01/02 html mock 에 dashed border + hover state 반영 |
| D11 | HTML mock 실 구현 정합 — ResultCard 레이아웃 | WARN | HTML mock ResultCard 는 Clova green 배경 사용; 실 구현은 success-200 teal 계열 사용 |
| D12 | SP-09-2 cycle 1 Designer HIGH 회귀 가드 | PASS | 이번 슬라이스는 per-message vs 실 구현 불일치 없음 (HTML mock 자체적으로 수정) |
| D13 | Clova 토큰 실 컴포넌트 활용 여부 | FAIL | PurchaseSlipOcrUploadPage.tsx 에서 --color-clova-* 미사용; success/warning/danger/neutral 토큰 사용 |
| D14 | WCAG AA 대비율 확인 — Clova 토큰 | PASS | tokens.css 주석 WCAG AAA 10.8:1 (#014A22 on #F0FDF6) 명시 |
| D15 | 드롭존 drag-over 시각 피드백 | PASS | dragOver 상태에서 brand-500 dashed + brand-50 배경 전환 |

---

## 결함 목록

### CRITICAL

없음.

### HIGH

없음.

### MEDIUM

#### M1 — ResultCard 가 Clova 토큰 미사용 — HTML mock 과 실 구현 색상 계열 불일치

**파일**: `PurchaseSlipOcrUploadPage.tsx` L125~126, `docs/qa/.../03-ocr-result-success.html` L62~63

HTML mock 의 OCR 성공 카드는 `--color-clova-50` (연녹색, #F0FDF6) 배경 + `--color-clova-200` 보더를 사용한다.
실 구현 ResultCard 는 `--color-success-200` (#a7f3d0, teal 계열) 보더 + `--color-success-50` (#ecfdf5) 배경을 사용한다.

HTML mock 의도는 Clova 브랜드 녹색 (#03C75A 계열) 으로 Naver Clova 연동임을 시각적으로 표현하는 것이었다.
실 구현은 success 토큰(teal)으로 대체되어 Clova 브랜드 일관성이 깨진다.

**영향**: 디자인 의도 전달 실패. Naver Clova 기능임을 색상으로 표현하려는 설계 미반영.

**권장 fix**:
```tsx
// ResultCard 배경/보더를 Clova 토큰으로 교체
border: '1px solid var(--color-clova-200, #BBF7D0)',
background: 'var(--color-clova-50, #F0FDF6)',
// 타이틀 색상도 Clova text로
color: 'var(--color-clova-text, #014A22)',
```

---

### LOW

#### L1 — 업로드 중 로딩 상태 시각 피드백 미흡

**파일**: `PurchaseSlipOcrUploadPage.tsx` L509

`isLoading` 시 버튼 텍스트를 'OCR 분석 중…' 으로 변경하지만 스피너나 progress indicator 없음.
OCR 처리 시간이 수 초에 달할 수 있어 시각적 피드백이 부족하다.

**권장**: 버튼 내 `aria-busy="true"` + spinner SVG 또는 pulsing dot 추가.

#### L2 — HTML mock 04-ocr-failure.html 배경색 일관성

**파일**: `docs/qa/.../04-ocr-failure.html`

실 구현에서 `--color-danger-50` (#fef2f2) + `--color-danger-300` 보더를 사용하는 에러 배너가
HTML mock에서는 동일하게 구현되어 있어 일치. 다만 mock 의 페이지 배경색(`#F5F7FA`)이
실 구현 기본 배경과 다를 수 있음 — 시각적 일관성 LOW 이슈.

---

## HTML mock 실 구현 정합 요약

| mock 파일 | 대응 실 구현 상태 | 정합 여부 |
|---|---|---|
| 01-upload-empty.html | 드롭존 빈 상태 + DRY_RUN 안내 | PASS |
| 02-upload-uploading.html | 업로드 중 상태 | PASS |
| 03-ocr-result-success.html | ResultCard — Clova 토큰 색상 불일치 | WARN (M1) |
| 04-ocr-failure.html | 에러 배너 422/502 — role="alert" 일치 | PASS |

---

## 종합

- **CRITICAL 0건, HIGH 0건, MEDIUM 1건, LOW 2건**
- M1 (ResultCard Clova 토큰 미사용) 은 HTML mock 과 실 구현의 색상 계열 불일치
- Clova 토큰 6종 정의는 완전하나 실 컴포넌트에서 success 토큰으로 대체하여 브랜드 정체성 약화
- role="status" 미적용은 FE 섹션과 동일 결함 — FE fix 시 함께 해결
