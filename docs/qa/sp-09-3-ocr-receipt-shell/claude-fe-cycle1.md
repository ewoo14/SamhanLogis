# SP-09-3 OCR Receipt Shell — FE Review (Claude, Cycle 1)

> 브랜치: `feat/sp-09-3-ocr-receipt-shell` commit `b0428441`
> 리뷰 날짜: 2026-05-18
> 리뷰어: Claude FE Agent

---

## 검증 항목 체크리스트

| # | 검증 항목 | 결과 | 비고 |
|---|---|---|---|
| F1 | ApiErrorEnvelope 타입 정의 및 활용 | PASS | receiptOcrApi.ts 에 `ApiErrorEnvelope` interface 정의 + parseReceipt 에서 활용 |
| F2 | UUID 비공개 — slipId 화면 미노출 | WARN | slipId 필드가 FE type에 정의되어 있으나 href path 전용으로만 사용 중 — 화면 미노출은 맞으나 type에 명시 필요 |
| F3 | 드롭존 keyboard 접근성 | PASS | role="button", tabIndex={0}, onKeyDown Enter/Space 처리 있음 |
| F4 | 422 한국어 에러 메시지 | PASS | ReceiptValidationError, toUserMessage() 에서 422 한국어 처리 |
| F5 | 502 한국어 에러 메시지 | PASS | OcrGatewayError 기본 메시지 한국어 |
| F6 | 10MB+ 클라이언트 reject | PASS | acceptFile 에서 `incoming.size > MAX_FILE_SIZE_BYTES` 즉시 에러 |
| F7 | TypeScript strict 준수 | PASS (WARN) | type import 정상, 다만 receiptOcrApi.ts 와 BE DTO 필드 불일치 |
| F8 | BE DTO 필드 1:1 매핑 정합 | FAIL | FE `receiptDate` ≠ BE `issuedAt`, FE `ocrText` ≠ BE `parseRawJson`, FE `slipId` 는 BE DTO 미포함 |
| F9 | RECEIPT_OCR_ROLES 권한 일관성 | PASS | FE RECEIPT_OCR_ROLES = ['WAREHOUSE','MANAGER','MASTER'] — BE @PreAuthorize 일치 |
| F10 | HashRouter URL — /purchases/receipt-ocr 정적 등록 | PASS | routes/index.tsx 에서 `/purchases/:id` 보다 먼저 등록 확인 (L488~494) |
| F11 | role="alert" — API 에러 배너 | PASS | receipt-ocr-error div 와 fileError div 모두 role="alert" |
| F12 | role="status" — OCR 결과 카드 | FAIL | ResultCard div 에 role="status" 없음 (성공 결과 aria-live 미연결) |
| F13 | previewUrl 메모리 해제 | PASS | useEffect cleanup + handleReset 에서 URL.revokeObjectURL 호출 |
| F14 | 파일 확장자 검증 우선순위 | WARN | acceptFile 에서 확장자 검사가 크기 검사보다 먼저 수행 (UX 상 크기 먼저가 더 자연스럽지만 기능적으로는 정상) |
| F15 | mock.ts OCR handler 완결성 | PASS | 빈 파일 / 10MB 초과 / 502 시나리오 모두 구현 |

---

## 결함 목록

### CRITICAL

없음.

### HIGH

#### H1 — BE DTO 필드 불일치 (런타임 렌더링 오류 가능)

**파일**: `receiptOcrApi.ts` L54~77, `PurchaseSlipOcrUploadPage.tsx` L164, L187

**문제**: FE ReceiptParseResponse 의 필드명이 BE ReceiptParseResponse 와 다르다.

| FE 필드명 | BE 필드명 | 영향 |
|---|---|---|
| `receiptDate: string` | `issuedAt: LocalDate` (→ JSON 직렬화 시 "issuedAt") | 날짜 표시 항상 undefined |
| `ocrText: string \| null` | `parseRawJson: string` | OCR raw 텍스트 미수신 |
| `slipId: string` | (없음 — BE DTO 미포함) | 링크 path param 항상 undefined |

실제 BE JSON 응답은 `{ slipNo, vendorName, totalAmount, vatAmount, issuedAt, submitMethod, parseRawJson }` 이지만
FE는 `receiptDate` / `ocrText` / `slipId` 를 읽으므로 날짜 표시, 링크 href 가 `undefined` 로 렌더된다.

**권장 fix (옵션 A — FE 필드명 BE 맞춤)**:
```typescript
export interface ReceiptParseResponse {
  slipNo: string
  vendorName: string
  totalAmount: number
  vatAmount: number | null
  issuedAt: string          // BE: issuedAt (LocalDate → "YYYY-MM-DD")
  submitMethod: ReceiptSubmitMethod
  parseRawJson: string | null  // BE: parseRawJson
  // slipId 는 BE DTO 에 없음 — href 생성 시 slipNo 기반으로 대체하거나 BE DTO에 추가
}
```

**권장 fix (옵션 B — BE DTO에 slipId 추가 + 필드명 통일)**:
BE `ReceiptParseResponse` 에 `slipId` 필드 추가 (href link 전용임을 Javadoc 명시) 후 FE 매핑 정렬.

mock.ts (L3984~3995) 도 `receiptDate` / `slipId` / `ocrText` 로 반환하므로 실 BE 연동 시 전혀 다른 필드명이 된다.
**mock과 실 BE 계약 불일치가 발견되지 않는 구조** — mock 도 함께 수정 필수.

---

### MEDIUM

#### M1 — ResultCard role="status" 미연결 (스크린리더 결과 미공지)

**파일**: `PurchaseSlipOcrUploadPage.tsx` L122~206

`ResultCard` div 에 `role="status"` 또는 `aria-live="polite"` 가 없어
스크린리더 사용자에게 OCR 성공 결과가 동적으로 공지되지 않는다.
에러 배너는 `role="alert"` 로 즉시 공지하는 반면 성공 결과는 접근성 미흡.

**권장 fix**:
```tsx
<div
  data-testid="receipt-ocr-result"
  role="status"
  aria-live="polite"
  aria-label="OCR 분석 결과"
  ...
>
```

#### M2 — receiptDate undefined 시 formatDate 빈 문자열 표시

**파일**: `PurchaseSlipOcrUploadPage.tsx` L82~87, L164

BE 응답 필드명이 `issuedAt` 인데 FE가 `result.receiptDate` 를 읽으면 `undefined`.
`formatDate(undefined)` → 내부에서 `undefined.split('-')` 로 에러 없이 `""` 반환하지만
사용자에게 날짜가 표시되지 않는 silent failure.

(H1 fix 시 자동 해결됨)

---

### LOW

#### L1 — 드롭존 aria-label이 role="button" 기능을 충분히 설명하지 못함

**파일**: `PurchaseSlipOcrUploadPage.tsx` L369

`aria-label="영수증 이미지 파일 업로드"` — drag-and-drop 또는 click 모두 가능하다는 점을
사용자에게 명확히 안내하는 것이 좋다.

**권장**: `aria-label="영수증 이미지를 끌어다 놓거나 클릭하여 업로드"` 로 구체화.

#### L2 — CLOVA 모드 진입 경로 미제공 (shell 단계 한계)

shell 단계에서 DRY_RUN 고정이 명시되어 있으나, `submitMethod` state 가 `useState<ReceiptSubmitMethod>('DRY_RUN')` 의 setter 없이 선언되어 Phase 11 에서 CLOVA 활성화 시 state 변경 UI를 추가하는 것만으로 충분히 확장 가능. 현재는 의도적 제약으로 LOW.

---

## 종합

- **CRITICAL 0건, HIGH 1건, MEDIUM 2건, LOW 2건**
- H1 (BE DTO 필드명 불일치) 은 런타임에서 날짜/링크가 undefined 로 렌더되어 사용성 손상 — cycle 2 fix 필수
- mock.ts 반환 필드도 함께 수정해야 mock 환경에서 H1 이 발견되지 않는 문제가 해소됨
