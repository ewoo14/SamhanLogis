# SP-09-1 NTS e-tax 발행 shell — FE 리뷰 (Claude, Cycle 1)

검토일: 2026-05-18
브랜치: `feat/sp-09-1-nts-etax-emit-shell` (commit `c7ba59ef`)
검토자: Claude FE subagent (cycle 1, read-only)

---

## 1. 결함 분류

### [CRITICAL] C-01 — `EmitNtsResponse` 타입이 BE 계약과 불일치

**파일**: `clients/desktop/src/renderer/api/taxInvoiceApi.ts` L317

**현황**:
```typescript
export type EmitNtsResponse = TaxInvoiceDetail
```

BE `EmitNtsResponse` record 실제 shape (서비스 반환값, `TaxInvoiceEmitService.java` L113):
```java
return new EmitNtsResponse(
    ti.getTaxInvoiceNo(),   // taxInvoiceNo: String
    ti.getStatus(),         // status: TaxInvoiceStatus
    result.eTaxExternalId(),// eTaxExternalId: String
    result.submittedAt(),   // submittedAt: Instant
    result.submitMethod()   // submitMethod: String ("DRY_RUN" | "NTS")
);
```

FE 가 `TaxInvoiceDetail` 을 기대하지만 BE 는 5개 필드만 가진 `EmitNtsResponse` 를 반환한다.
`onSuccess` 에서 `result.taxInvoiceNo` 와 `result.eTaxExternalId` 는 존재하지만,
그 이후 `queryClient.invalidateQueries` 로 캐시를 무효화하므로 실제 화면 표시에서 크래시는
발생하지 않는다. 그러나 타입 정의 자체가 잘못되어 있어 향후 result 필드 직접 접근 시
런타임 오류로 이어질 수 있다.

또한 `result.lines`, `result.partnerName` 등 `TaxInvoiceDetail` 전용 필드는 BE 응답에 없으므로
현재 코드가 해당 필드를 onSuccess 에서 읽으면 `undefined` 가 된다.

**권장 fix**:
```typescript
// taxInvoiceApi.ts — EmitNtsResponse 를 실제 BE shape 으로 교체
export interface EmitNtsResponse {
  taxInvoiceNo: string
  status: TaxInvoiceStatus
  eTaxExternalId: string
  submittedAt: string   // ISO-8601 (Instant → JSON)
  submitMethod: 'DRY_RUN' | 'NTS'
}
```

---

### [CRITICAL] C-02 — `NtsSubmitMethod` enum 값이 BE 계약과 불일치

**파일**: `clients/desktop/src/renderer/api/taxInvoiceApi.ts` L298

**현황**:
```typescript
export type NtsSubmitMethod = 'DRY_RUN' | 'REAL'
```

BE `EmitNtsRequest` 검증 패턴:
```java
@Pattern(regexp = "DRY_RUN|NTS", message = "submitMethod 는 DRY_RUN 또는 NTS 만 허용됩니다")
```

FE 가 `'REAL'` 을 보내면 BE 400 검증 오류가 발생한다. 현재 UI 에서는 `'DRY_RUN'` 고정
(`mutationFn: () => emitTaxInvoiceToNts(id, 'DRY_RUN')`)으로만 호출하고 있어 런타임에서는
문제가 없지만, 타입 정의와 주석이 BE 계약과 어긋나 있어 실 발행 전환 시 반드시 버그를 유발한다.

**권장 fix**:
```typescript
export type NtsSubmitMethod = 'DRY_RUN' | 'NTS'
```
주석의 `REAL — 국세청 API 실 호출` 문구도 `NTS` 로 정정.

---

### [HIGH] H-01 — mock.ts emit-nts handler 가 ISSUED 상태 검증 없이 임의 fallback

**파일**: `clients/desktop/src/renderer/api/mock.ts` L2611

**현황**:
```typescript
const found = MOCK_TAX_INVOICES.find((t) => t.id === id) ?? MOCK_TAX_INVOICES[0]!
```

id 가 일치하지 않을 때 MOCK_TAX_INVOICES[0] (ISSUED 상태) 으로 fallback 한다.
이는 실제 BE 동작과 다르다: BE 는 ISSUED 가 아닌 경우 422 를 반환한다. DRAFT 상태의
ti-002 (`id='ti-002'`) 에서 emit-nts 를 mock 호출하면 성공 응답을 돌려주므로 QA 에서
권한/상태 가드 검증이 불가하다.

아울러 `MOCK_TAX_INVOICES[0]` 이 ISSUED 상태인 것은 현재 우연히 맞지만, 순서 변경 시
DRAFT 나 CANCELLED 를 반환할 수 있어 취약하다.

추가로 `config.data` 에 대한 `JSON.parse(config.data as string)` 파싱이 다른 handler 와
달리 `parseMockBody(config)` 헬퍼를 사용하지 않는다. 기존 헬퍼를 사용하면 일관성이 높아진다.

**권장 fix**:
```typescript
// mock.ts — ISSUED 검증 + DRAFT/CANCELLED 422 시뮬레이션
const found = MOCK_TAX_INVOICES.find((t) => t.id === id) ?? MOCK_TAX_INVOICES[0]!
if (found.status !== 'ISSUED') {
  return mockError(422, 'TAX_INVOICE_NOT_EMITTABLE', '발행(ISSUED) 상태의 세금계산서만 e-Tax 전송이 가능합니다.')
}
if (found.eTaxExternalId) {
  return mockError(409, 'TAX_INVOICE_ALREADY_EMITTED', '이미 국세청에 전송된 세금계산서입니다.')
}
const req = parseMockBody(config)
```

---

### [HIGH] H-02 — emitNts `onError` 가 BE 한국어 메시지를 추출하지 않음

**파일**: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` L185-188

**현황**:
```typescript
onError: (err: Error) => {
  setShowEmitNtsModal(false)
  setTopError(`NTS 발행 실패: ${err.message}`)
},
```

`err.message` 는 axios `AxiosError` 의 HTTP status text("Request failed with status code 422")
이다. 프로젝트 내 다른 페이지 (e.g. `WarehousesPage.tsx`, `SlipDetailPage.tsx`) 는 모두
`err.response?.data as { message?: string }` 패턴으로 BE ApiResponse 의 한국어 오류 메시지를
추출한다. 검증 항목 7 (에러 처리 — 422/409/502 사용자 친화 메시지) 와 BE 계약이 요구하는
한국어 오류 메시지 표시 기준에 미달한다.

BE 422 메시지: `"e-Tax 전송은 ISSUED 상태에서만 허용됩니다 (현재: DRAFT)"`
BE 409 메시지: `"이미 국세청에 전송된 세금계산서입니다."`
BE 502 메시지: NTS 서버 오류 (ETaxClient 에서 wrap)

**권장 fix**:
```typescript
import axios from 'axios'

onError: (err: unknown) => {
  setShowEmitNtsModal(false)
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    const status = err.response?.status
    if (status === 409) {
      setTopError(data?.message ?? '이미 국세청에 발행된 세금계산서입니다.')
    } else if (status === 422) {
      setTopError(data?.message ?? '발행(ISSUED) 상태의 세금계산서만 NTS 전송이 가능합니다.')
    } else if (status === 502) {
      setTopError('국세청(NTS) 서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.')
    } else {
      setTopError(data?.message ?? 'NTS 발행에 실패했습니다.')
    }
  } else {
    setTopError('NTS 발행에 실패했습니다.')
  }
},
```
`onError` 타입 파라미터도 `(err: Error)` → `(err: unknown)` 으로 변경.

---

### [MEDIUM] M-01 — 취소 모달의 `<textarea>` 가 design-system `Input` 을 사용하지 않음

**파일**: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` L620-639

**현황**: 취소 사유 입력에 raw `<textarea>` 사용.

design-system 에 `Textarea` 전용 컴포넌트는 현재 미존재 (`clients/web/design-system/src/` 확인).
단, 프로젝트 컨벤션 (`feedback_integrated_pr_pattern`) 은 **자체 신규 컴포넌트 작성 금지**이고
design-system 에 Textarea 가 없으므로 raw element 자체는 허용 범위이다.

그러나 `box-sizing`, `padding`, `border` 등 인라인 스타일이 design-system Input 의 스타일과
불일치하여 visual consistency 를 깨뜨린다. SP-09-1 이 NTS 발행 shell 슬라이스이므로 취소 모달은
기존 P0-4 코드이고 이번 커밋에서 변경되지 않았다. 단, design-system 에 Textarea 컴포넌트
추가를 후속 슬라이스에서 고려할 것을 권장한다.

**상태**: WARN (기존 코드, 이번 PR 변경 범위 외)

---

### [MEDIUM] M-02 — `submitMethod` 가 UI 에서 DRY_RUN 고정이나 confirm modal 에 선택 UI 없음

**파일**: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` L170, L656-704

**현황**: `mutationFn: () => emitTaxInvoiceToNts(id, 'DRY_RUN')` 으로 DRY_RUN 고정.
confirm modal 에는 방법 선택 UI 없이 DRY_RUN 고정 안내만 표시.

SP-09-1 이 "shell" 단계이므로 현재 DRY_RUN 고정은 의도적 설계이다. 단, 검토 항목 6번
(confirm modal — DRY_RUN/NTS 선택 가능) 이 요구한 "선택 가능" 기능은 미구현이다.

shell 단계에서 REAL/NTS 버튼을 숨기는 것은 올바른 점진적 접근이지만, 그렇다면 PR 설명에서
"DRY_RUN/NTS 선택 가능" 항목을 "SP-09-2 에서 구현 예정" 으로 명시해야 한다.

**상태**: WARN (shell 의도 범위 내이나 검토 기준 6번 충족 여부 불명확)

---

### [MEDIUM] M-03 — `eTaxExternalId` 가 UUID 비공개 원칙 관점에서 부분 노출

**파일**: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` L489-491

**현황**:
```tsx
<span>NTS 수신 ID: {t.eTaxExternalId}</span>
```

DRY_RUN 모드에서는 `"DRY_RUN_OK"` 또는 `"DRY_RUN_OK_xxxxxx"` 이 표시된다.
실 발행(NTS) 모드에서 BE 가 반환하는 `eTaxExternalId` 는 국세청 접수번호로서
비즈니스 식별자에 해당하므로 노출 자체는 UUID 비공개 원칙(`feedback_uuid_no_user_visibility`)
위반이 아니다. 단, `TaxInvoiceDetailPage.tsx` 파일 상단 JSDoc (L24) 이
`eTaxExternalId` 를 "코드 표시 전용" 으로 분류한 것과 화면 표시가 일치한다.

실 발행 시 BE `EmitNtsResponse.eTaxExternalId` 가 실제로 국세청 접수번호인지 내부 UUID 인지는
`ETaxClient` 구현을 추가 확인해야 한다.

**상태**: WARN (현재 shell 단계는 안전하나 실 발행 전 BE ETaxClient 반환값 재확인 필요)

---

### [LOW] L-01 — `NtsSubmitMethod` 주석에 `submitMethod` optional 로 설명하나 BE 는 `@NotNull`

**파일**: `clients/desktop/src/renderer/api/taxInvoiceApi.ts` L303-304, L307-309

**현황**:
```typescript
// submitMethod 를 생략하면 BE 가 DRY_RUN 으로 처리.
export interface EmitNtsRequest {
  submitMethod?: NtsSubmitMethod  // optional
}
```

BE:
```java
@NotNull(message = "submitMethod 는 필수입니다")
```

BE 는 `submitMethod` 가 없으면 400 반환한다. 실제 `emitTaxInvoiceToNts` 함수에서는 기본값으로
항상 채워 보내므로 런타임 오류는 없지만, 타입 정의에서 `?` 가 허용하는 범위와 BE 계약이
불일치하여 문서 혼란을 야기한다.

**권장 fix**: `submitMethod?: NtsSubmitMethod` → `submitMethod: NtsSubmitMethod` (required).
주석 "생략하면 DRY_RUN으로 처리" 제거.

---

### [LOW] L-02 — 발행 완료 alert 에서 `result.eTaxExternalId` 접근이 `TaxInvoiceDetail` 기반

**파일**: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` L178-183

C-01 의 파생 결함. `EmitNtsResponse = TaxInvoiceDetail` 로 타입이 정의되어 있어
`result.eTaxExternalId` 접근은 TypeScript 상 오류가 없다. 그러나 실제 BE 응답에는
`TaxInvoiceDetail` 전체 구조가 없으므로 `result.taxInvoiceNo` 는 동작하지만 `result.lines`,
`result.partnerName` 등은 `undefined` 가 된다. 현재 코드에서는 이 두 필드만 사용하므로
런타임 오류가 없으나, C-01 fix 와 함께 해결된다.

---

## 2. 검증 항목 PASS / FAIL / WARN

| # | 검증 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | ApiResponse wrapper 준수 | PASS | `apiClient.post<ApiEnvelope<EmitNtsResponse>>(...)` 패턴 정확. `res.data.data` unwrap 일관. |
| 2 | UUID 사용자 비공개 | PASS | `id` 는 path param 전용, 화면에 `taxInvoiceNo` / `eTaxExternalId` (비즈니스 식별자) 만 표시. `journalId`/`reverseJournalId` 는 href 에만 사용. |
| 3 | design-system 컴포넌트 우선 | WARN | Button / Card / Modal / Badge / DataTable / Spinner 모두 `@samhan/design-system` import. 취소 모달의 raw `<textarea>` 는 design-system 미존재 컴포넌트이므로 허용 범위 (M-01). |
| 4 | 권한 가드 — SALES/MANAGER 비활성 | PASS | `canAccessTaxInvoice(role)` = ACCOUNTANT/MASTER 만 `true`. `canEmitNts = isIssued && canMutate && !t.eTaxExternalId`. MANAGER 도 취소 버튼(`canMutate`)에서 실수로 포함되지 않음 — `canMutate` 는 ACCOUNTANT/MASTER 전용. |
| 5 | 상태 기반 렌더링 | PASS | DRAFT: 편집/발행 버튼 표시. ISSUED: NTS 발행/취소/인쇄 표시. CANCELLED: 인쇄 표시. EMITTED(eTaxExternalId 설정) 후: NTS 발행 버튼 숨김. `canEmitNts = isIssued && canMutate && !t.eTaxExternalId` 로 중복 발행 차단. |
| 6 | confirm modal — DRY_RUN/NTS 선택 | WARN | DRY_RUN 고정이며 NTS 선택 UI 없음. Shell 단계 의도이나 검토 기준 "선택 가능" 충족 안 됨 (M-02). |
| 7 | 에러 처리 — 422/409/502 사용자 친화 | FAIL | `err.message` (HTTP status text) 표시, BE 한국어 메시지 미추출. 422/409/502 별 분기 없음 (H-02). |
| 8 | TypeScript strict — any/unknown 금지 | FAIL | `EmitNtsResponse = TaxInvoiceDetail` 타입 불일치 (C-01). `NtsSubmitMethod = 'DRY_RUN' \| 'REAL'` — BE 계약 불일치 (C-02). `onError: (err: Error)` — unknown 이어야 함 (H-02 파생). |

---

## 3. 종합 평가

전체 결함 수: CRITICAL 2 건 / HIGH 2 건 / MEDIUM 3 건 / LOW 2 건

**머지 블로커**: C-01 (EmitNtsResponse 타입 미스매치), C-02 (NtsSubmitMethod 'REAL' → 'NTS')
는 BE 계약을 직접 위반하며 실 발행 전환 시 400 오류를 유발한다. 반드시 이번 사이클에서 fix
해야 한다.

H-02 (에러 메시지 추출) 는 사용자 친화 요구사항 위반이며 프로젝트 내 다른 16+ 화면과의
일관성 파괴이므로 머지 전 fix 권장.

H-01 (mock ISSUED 검증 누락) 은 QA 신뢰도에 영향하므로 fix 권장.

M-01/M-02/M-03 및 L-01/L-02 는 shell 단계 허용 범위 내이나 SP-09-2 (REAL 발행) 로
전환 전에 반드시 해결해야 한다.

---

## 4. Fix 우선순위 요약

| 우선순위 | ID | 파일 | 1줄 요약 |
|---|---|---|---|
| 1 | C-01 | `taxInvoiceApi.ts` L317 | `EmitNtsResponse = TaxInvoiceDetail` → 실제 BE 5-필드 인터페이스로 교체 |
| 2 | C-02 | `taxInvoiceApi.ts` L298 | `'REAL'` → `'NTS'` (BE @Pattern `DRY_RUN\|NTS` 일치) |
| 3 | H-02 | `TaxInvoiceDetailPage.tsx` L185 | onError 에서 `err.response?.data.message` 추출 + 422/409/502 분기 |
| 4 | H-01 | `mock.ts` L2611 | emit-nts mock 에 ISSUED 상태 검증 + 409 중복 발행 시뮬레이션 추가 |
| 5 | L-01 | `taxInvoiceApi.ts` L308 | `submitMethod?: NtsSubmitMethod` → required + 주석 정정 |
