# SP-09-4 KFTC 오픈뱅킹 — FE 리뷰 (Claude cycle 1)

**브랜치**: feat/sp-09-4-kftc-shell (commit dee1f20c)  
**작성**: Claude FE agent  
**날짜**: 2026-05-18

---

## 결함 분류 요약

| ID | 심각도 | 파일 | 항목 |
|---|---|---|---|
| FE-01 | HIGH | mock.ts L4043 | results[].fields 주석에 `journalDraftId?` 포함 — UUID 노출 의도 암시 (실제 응답 데이터에는 없으나 주석이 계약 오해 유발) |
| FE-02 | HIGH | DepositMatchPage.tsx | summary 섹션 `role="status"` 미구현 — decisions.md §5 명시 요건 불이행 |
| FE-03 | MEDIUM | DepositMatchPage.tsx | `aria-live` 미선언 — role="alert" 에러 배너에 `aria-live="assertive"` + `aria-atomic="true"` 누락 |
| FE-04 | MEDIUM | DepositMatchPage.tsx | 조회 결과 테이블 금액 컬럼 `fontVariantNumeric: 'tabular-nums'` 적용됐으나 요약 카드 숫자(SummaryBadge)에는 적용 안 됨 |
| FE-05 | LOW | DepositMatchPage.tsx | `ResultRow` — `style={rowStyle}` 에서 `display: 'contents'` 사용: 일부 브라우저에서 `<tr>` 에 `display: contents` 적용 시 레이아웃 깨짐 가능 |
| FE-06 | LOW | depositMatchApi.ts | `ApiErrorEnvelope` 와 `ApiEnvelope` 타입 각각 로컬 정의 — `client.ts` 의 `ApiEnvelope` 를 재사용하지 않아 타입 중복 |
| FE-07 | WARN | routes/index.tsx | RoleGuard 래핑 방식 코드 미확인 (행 947 snippet 만 확인) — DEPOSIT_MATCH_ROLES 가 실제 RoleGuard prop 으로 전달되는지 추가 확인 필요 |
| FE-08 | WARN | mock.ts L4063 | 두 번째 결과: `matchedPartnerCode: 'P-002'` + `matchedTaxInvoiceNo: null` + `status: 'MATCHED'` — BE 비즈니스 로직상 세금계산서 없이 MATCHED 가 되는 경우는 거래처만 매칭된 경우이나, DepositMatchService 는 세금계산서 없으면 UNMATCHED 반환. FE mock 이 BE 실제 동작과 불일치 |

---

## 검증 항목별 PASS/FAIL/WARN

### 1. BE DTO shape 1:1 정합 (SP-09-3 H-FE-01 회귀 가드)

**PASS (주의 사항 있음)**

BE `DepositMatchResultDto`:
```
depositorName / amount / transactionDate / matchedPartnerCode / matchedTaxInvoiceNo / status
```

FE `DepositMatchResult`:
```typescript
depositorName: string
amount: number
transactionDate: string
matchedPartnerCode?: string
matchedTaxInvoiceNo?: string
status: 'MATCHED' | 'UNMATCHED'
```

필드명 1:1 일치 확인. `journalDraftId` 가 FE 타입에 없음 — UUID 비공개 원칙 준수 확인.

**단, FE-08 WARN:** FE mock 두 번째 결과(`△△인테리어`)에서 `matchedTaxInvoiceNo: null` + `status: 'MATCHED'` 가 공존.  
실제 BE `DepositMatchService.matchAndCreateJournal()` 는 세금계산서 매칭 실패 시 UNMATCHED 반환하므로  
taxInvoiceNo 없이 MATCHED 가 되는 케이스는 현재 BE 로직상 불가능.  
Playwright T2 mock 데이터에서는 올바르게 정의됨 (matchedTaxInvoiceNo 있는 MATCHED).  
FE mock.ts 의 불일치는 향후 혼란 야기 가능.

### 2. ApiErrorEnvelope 처리

**PASS**

```typescript
if (status === 422) {
    throw new DepositValidationError(data?.message ?? '...', data?.code ?? 'VALIDATION_ERROR')
}
if (status === 502) {
    throw new KftcGatewayError(data?.message)
}
```

422/502 분기 처리 명확. `DepositValidationError` / `KftcGatewayError` 커스텀 에러 클래스 생성.  
`DepositMatchPage.toUserMessage()` 에서도 두 에러를 한국어로 변환.

### 3. UUID 비공개 원칙 준수

**PASS**

- `depositMatchApi.ts` `DepositMatchResult` 인터페이스에 `journalDraftId` 없음
- `DepositMatchPage.tsx` 화면 출력 컬럼: 입금자명 / 금액 / 거래일 / 매칭 거래처코드 / 매칭 세금계산서번호 / 상태
- `mock.ts` L4018: "UUID 비공개: journalDraftId 는 내부 전용 — 화면 미노출" 명시
- Playwright T2 step8에서 UUID 텍스트 미노출 검증

**다만 FE-01:** `mock.ts` L4043 주석에 `journalDraftId?` 가 포함됨:
```javascript
// results[].fields: depositorName / amount / transactionDate / matchedPartnerCode? / matchedTaxInvoiceNo? / journalDraftId? / status
```
이 주석은 실제 응답에 `journalDraftId` 가 포함될 것 같은 인상을 준다.  
BE `DepositMatchResultDto` 에 `journalDraftId` 가 없으므로 주석 삭제 필요.

### 4. TypeScript strict 준수

**PASS (부분 WARN)**

- 명시적 타입 어노테이션 사용 (`DepositFetchRequest`, `DepositMatchResponse` 등)
- Optional 필드 `?` 처리 적절 (`matchedPartnerCode?: string`)
- `const` assertion `as const` 사용 (`DEPOSIT_MATCH_ROLES`)

**FE-06 WARN:**  
`depositMatchApi.ts` 에 `ApiErrorEnvelope` 를 로컬 정의. `api/client.ts` 의 `ApiEnvelope` 재사용 여부 불분명.  
타입 이름 충돌 위험.

### 5. RBAC (역할 기반 접근 제어)

**PASS (추가 확인 필요)**

```typescript
// depositMatchApi.ts
export const DEPOSIT_MATCH_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER'] as const

// routes/index.tsx (확인된 스니펫)
path: '/accounting/deposit-match',
// ... <DepositMatchPage />
```

`DEPOSIT_MATCH_ROLES` import 가 `routes/index.tsx` 에 존재함을 확인 (L285 `import { DEPOSIT_MATCH_ROLES }`).  
`RoleGuard` 컴포넌트로 래핑되는 방식은 행 950 에서 확인되나 RoleGuard allow prop 전달 방식 전체 코드 확인 필요 (FE-07).

Playwright T5에서 SALES/WAREHOUSE 차단 검증 포함.

### 6. FE mock 응답 구조 (BE DepositMatchResponse 1:1)

**PASS (FE-08 WARN)**

mock.ts 정상 응답 구조:
```javascript
{
  totalCount: 5,
  matchedCount: 3,
  unmatchedCount: 2,
  results: [...]
}
```

BE `DepositMatchResponse`:
```java
record DepositMatchResponse(int totalCount, int matchedCount, int unmatchedCount, List<DepositMatchResultDto> results)
```

필드명/구조 1:1 일치 확인. ApiResponse wrapper (`success: true`, `data: {...}`) 적용 확인.

### 7. role="status" / role="alert" 접근성

**FAIL (FE-02, FE-03)**

decisions.md §5 명시:
```
조회 결과 요약 → role="status" + aria-label
에러 배너 → role="alert" + aria-live="assertive" + aria-atomic="true"
```

**FE-02:** `DepositMatchPage.tsx` summary 섹션:
```jsx
<section
  data-testid="deposit-match-summary"
  aria-label="입금 매칭 요약"
  // role="status" 없음 ← 누락
>
```

**FE-03:** 에러 배너:
```jsx
<div
  role="alert"
  data-testid="deposit-match-error"
  // aria-live="assertive" 없음 ← 누락
  // aria-atomic="true" 없음 ← 누락
>
```

`role="alert"` 만으로도 일부 스크린리더에서 동작하지만, `aria-live="assertive"` 명시가 더 안전하고 decisions.md 에 명시된 요건.

### 8. tabular-nums 적용 범위

**WARN (FE-04)**

ResultRow 금액 셀:
```jsx
<td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
```
적용됨. 그러나 `SummaryBadge` 의 대형 카운트 숫자:
```jsx
<div style={{ fontSize: 22, fontWeight: 700, color: colorMap[variant] }}>
  {count.toLocaleString('ko-KR')}
</div>
```
`fontVariantNumeric: 'tabular-nums'` 미적용. decisions.md §3 에 요약 카드 대형 숫자도 포함 여부가 명시되지 않았으나, 일관성 측면에서 권장.

### 9. DRY_RUN 고정 submitMethod

**PASS**

```typescript
mutationFn: ({ from: f, to: t, accountFinNo: fin }) =>
    fetchAndMatchDeposits(f, t, fin, 'DRY_RUN'),
```

submitMethod UI 선택 없이 DRY_RUN 고정. shell 단계 정책 준수.  
DRY_RUN 배너 표시 (warning 색상 배너). Phase 11 안내 텍스트 포함.

---

## 권장 fix 우선순위

1. **[MUST FIX]** FE-01: mock.ts L4043 주석에서 `journalDraftId?` 제거
2. **[MUST FIX]** FE-02: summary 섹션에 `role="status"` 추가
3. **[SHOULD FIX]** FE-03: 에러 배너에 `aria-live="assertive"` + `aria-atomic="true"` 추가
4. **[SHOULD FIX]** FE-08: mock.ts 두 번째 결과 `status: 'MATCHED'` → `'UNMATCHED'` 수정 (taxInvoiceNo null 케이스)
5. **[CONSIDER]** FE-04: SummaryBadge 숫자에 tabular-nums 추가
6. **[CONSIDER]** FE-05: ResultRow tr에 `display: contents` 제거 후 기본 table display 유지
7. **[CONSIDER]** FE-06: `ApiErrorEnvelope` 타입 중복 제거 → `client.ts` 재사용

---

## 총평

BE DTO shape 1:1 정합, UUID 비공개 원칙, 422/502 에러 처리 모두 SP-09-1~3 패턴을 잘 따르고 있다.  
주요 문제는 접근성(FE-02/03 — decisions.md 명시 요건 미이행)과 mock.ts 주석의 UUID 노출 암시(FE-01).  
FE-08 mock 데이터 불일치는 실제 런타임 오류는 아니나 향후 혼란 방지를 위해 수정 권장.
