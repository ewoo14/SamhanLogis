# SP-09-4 KFTC 오픈뱅킹 — QA 리뷰 (Claude cycle 1)

**브랜치**: feat/sp-09-4-kftc-shell (commit dee1f20c)  
**작성**: Claude QA agent  
**날짜**: 2026-05-18

---

## 결함 분류 요약

| ID | 심각도 | 파일 | 항목 |
|---|---|---|---|
| QA-01 | CRITICAL | DepositMatchShellIT.java | case 9: `partnerLookupClient.findByPartnerCode(anyString())` lenient stub 순서 문제 — when("(주)삼성상사") 먼저, lenient anyString 나중 → Mockito 정확 일치 stub 우선. 실제 "(주)삼성상사" 매칭 성공하나 lenient stub 순서가 정확 stub 이후라 덮어쓰기 위험 |
| QA-02 | HIGH | sp-09-4-kftc-shell.spec.ts | T4 RED — row 클릭 modal 미구현. T4 fail 사유가 spec 주석에만 있고 dev-report 에 별도 항목 없음. Phase 11 이관 명기 불충분 |
| QA-03 | HIGH | sp-09-4-kftc-shell.spec.ts T3 | T3 Playwright: `fromInput.fill('2026-05-31')` — 2026-05-18 기준 미래 날짜. FE `@PastOrPresent` mock server 없이 순수 FE validation → FE handleSubmit 에서 `from > to` 체크 먼저 실행되어 API 미호출. T3 는 실제로 FE 클라이언트 사이드 검증만 테스트하고 BE 422 DEPOSIT_DATE_RANGE_INVALID 는 미검증 |
| QA-04 | MEDIUM | DepositMatchShellIT.java | case 9: 거래처 매칭 성공 + 세금계산서 없는 경우 — `matchedCount` 가 0 인지 단언하지 않음. 주석에 "matchedCount >= 0 검증" 만 있어 음수 방지만 확인. UNMATCHED 케이스 단언 미약 |
| QA-05 | MEDIUM | sp-09-4-kftc-shell.spec.ts T3 | T3 step5: `summaryVisible == false` 단언 — 에러 상태에서 요약 카드 미표시를 검증하나, FE validation 에러가 먼저 처리된 경우(API 미호출) 이 단언이 trivially true 될 수 있어 실제 422 처리 검증이 되지 않음 |
| QA-06 | LOW | DepositMatchShellIT.java | `@Transactional` 클래스 레벨 선언 + case 10 `auditRecorder.recordFetchAndMatch()` — REQUIRES_NEW 트랜잭션은 외부 커밋되지만 `@Transactional` IT 롤백 후 audit row가 있을지 Testcontainers 환경에서 불확실 |
| QA-07 | WARN | dev-report | SP-09-4 dev-report 에 IT 10 case 목록 있으나 T4 RED 상태가 "PASS 예정 — Phase 11" 로만 표시되고 구체적 이관 issue 번호 없음 |
| QA-08 | WARN | sp-09-4-kftc-shell.spec.ts | `page.waitForTimeout(1500)` / `waitForTimeout(800)` 사용 — Playwright 권장 `waitForSelector` 대신 sleep 패턴 (SP-09-3 회귀 가드 참고) |

---

## 검증 항목별 PASS/FAIL/WARN

### 1. SP-09-3 회귀 가드 — false green 방지

**PASS**

```typescript
// sp-09-4-kftc-shell.spec.ts
test.beforeEach(async () => {
    const ok = await isServerAvailable()
    expect(ok, `dev server 미접근: ${BASE_URL}...`).toBe(true)
    // ← test.skip(!ok) 아님, expect(ok).toBe(true) 로 false green 방지
})
```

`|| true` / `test.skip(!ok)` / `page.setContent()` fallback 패턴 없음.  
SP-09-3 가드 준수 확인.

`PLAYWRIGHT_SKIP_UI=1` 로 전체 skip 가능하나 이는 CI 환경 skip 용도 — false green 아님.

### 2. false green 점검 — `|| true`

**PASS**

전체 스펙 파일 검색 결과 `|| true` 없음.  
mock 데이터 준비가 `buildDepositMatchResponse()` 함수로 분리되어 정의 오염 없음.

### 3. URL HashRouter 정합

**PASS**

```typescript
const DEPOSIT_MATCH_URL_ACCOUNTANT = `${BASE_URL}/#/accounting/deposit-match?mockRole=ACCOUNTANT`
```

`/#/accounting/deposit-match` — HashRouter 형식 준수.  
routes/index.tsx: `path: '/accounting/deposit-match'` 와 일치.

### 4. data-testid 실 구현 일치

**PASS**

spec 파일 사용 testid vs DepositMatchPage.tsx 구현 testid 대조:

| spec 에서 사용 | DepositMatchPage 구현 | 일치 |
|---|---|---|
| `deposit-match-from` | L423 `data-testid="deposit-match-from"` | PASS |
| `deposit-match-to` | L439 `data-testid="deposit-match-to"` | PASS |
| `deposit-match-account-fin-no` | L456 `data-testid="deposit-match-account-fin-no"` | PASS |
| `deposit-match-submit-btn` | L487 `data-testid="deposit-match-submit-btn"` | PASS |
| `deposit-match-reset-btn` | L479 `data-testid="deposit-match-reset-btn"` | PASS |
| `deposit-match-summary` | L519 `data-testid="deposit-match-summary"` | PASS |
| `deposit-match-table` | L249 `data-testid="deposit-match-table"` | PASS |
| `deposit-match-row-${n}` | L202 `data-testid={\`deposit-match-row-${index + 1}\`}` | PASS |
| `deposit-match-error` | L501 `data-testid="deposit-match-error"` | PASS |
| `deposit-match-detail-modal` | 미구현 | T4 RED (정당) |
| `deposit-match-journal-debit` | 미구현 | T4 RED (정당) |
| `deposit-match-journal-credit` | 미구현 | T4 RED (정당) |

### 5. T4 RED 처리 정당성

**PASS (QA-02 WARN)**

T4 spec 주석:
```
// NOTE: 현 shell 단계에서 DepositMatchPage 는 row 클릭 modal 을 미구현.
//       T4 는 Phase 11 에서 구현될 기능의 사전 계약 검증 테스트.
//       테스트 FAIL = 기능 미구현 RED 상태 (정상) — false green 금지.
```

Phase 11 이관 명시 확인. `test.skip()` 사용 안 함 (false green 아님, 의도된 RED).

**QA-02 WARN:** dev-report 에 T4 RED 항목을 별도 섹션으로 기재하고 Phase 11 issue 번호(예: #TODO-Phase11) 연결 권장.

### 6. DepositMatchShellIT 10 case 커버리지

**PASS with WARN**

| case | 내용 | 결과 |
|---|---|---|
| 1 | DRY_RUN 성공 (ACCOUNTANT) 5건 | PASS |
| 2 | SALES 403 | PASS |
| 3 | WAREHOUSE 403 | PASS |
| 4 | DRIVER 403 | PASS |
| 5 | DISPATCH 403 | PASS |
| 6 | from > to 422 DEPOSIT_DATE_RANGE_INVALID | PASS |
| 7 | accountFinNo blank 422 INVALID_INPUT | PASS |
| 8 | KFTC mode + placeholder 502 | PASS |
| 9 | 거래처 매칭 성공 시 matchedPartnerCode 설정 | WARN (QA-01/04) |
| 10 | audit REQUIRES_NEW bean 존재 + audit row | WARN (QA-06) |

MANAGER/MASTER 403 허용 케이스가 없음 (ACCOUNTANT 1건만). 권한 허용 3개 역할 중 1개만 검증.  
추가 권장: MANAGER/MASTER 200 성공 케이스.

### 7. @MockBean 격리 완전성

**PASS**

IT에서 격리된 @MockBean:
- `KftcClient` (신규 SP-09-4)
- `PartnerLookupClient`
- `SlipServiceClient`
- `ETaxClient`
- `ProductClient`
- `ChatRoomMappingClient`

`SlipQueryClient` 별도 존재 여부는 `/dev/SamhanLogis/services/accounting-service/src/main/java/.../client/` 목록에서 확인됨 (`SlipServiceClient` + `SlipQueryClient` 2개). IT 에서 `SlipQueryClient` @MockBean 누락 여부 추가 확인 권장.

### 8. case 9 Mockito stub 순서 (QA-01)

**WARN**

```java
when(partnerLookupClient.findByPartnerCode("(주)삼성상사"))
        .thenReturn(Optional.of(new PartnerSummary(...)));
lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
        .thenReturn(Optional.empty());
```

Mockito 는 가장 최근에 등록된 stub 이 우선순위를 가지므로  
`anyString()` lenient stub 이 `"(주)삼성상사"` 정확 stub 이후에 등록되어 덮어쓰기 가능성이 있음.

정확 stub 이 `anyString()` 보다 구체적이므로 Mockito 는 정확 일치를 우선 선택하지만,  
lenient() 와 정상 when() 혼용 시 동작이 보장되지 않을 수 있음.  
stub 순서를 `anyString()` 먼저, 정확 값 나중으로 변경:

```java
// 권장 순서
lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
        .thenReturn(Optional.empty());
when(partnerLookupClient.findByPartnerCode("(주)삼성상사"))
        .thenReturn(Optional.of(new PartnerSummary(...)));
```

### 9. dev-report 커버리지

**PASS with WARN (QA-07)**

`docs/dev-reports/sp-09-4-kftc-shell.md` 존재 확인.  
IT 10 case 목록, BE 아키텍처, FE 연결, DevOps 정책 기재.  
T4 RED 상태가 기재되어 있는지 별도 확인 필요 (dev-report 60행 이후 미열람).

### 10. waitForTimeout 사용 (QA-08)

**WARN**

```typescript
await page.waitForTimeout(1500)  // T1/T2/T3/T4/T5 각각
await page.waitForTimeout(800)   // T3 step3
```

Playwright 가이드라인에서 `waitForTimeout` 은 flaky test 원인으로 지양 권장.  
대신 `waitForSelector`, `waitForLoadState`, `expect().toBeVisible()` 사용 권장.  
현재 `expect(...).toBeVisible({ timeout: 5000 })` 을 별도로 사용하고 있으므로 `waitForTimeout` 은 중복.

---

## 권장 fix 우선순위

1. **[MUST FIX]** QA-01: case 9 Mockito stub 순서 — `anyString()` lenient 먼저, 정확 값 나중으로 변경
2. **[SHOULD FIX]** QA-03: T3 날짜 범위 문서화 — "FE 클라이언트 사이드 검증만 테스트" 명확 주석 추가
3. **[SHOULD FIX]** QA-02: dev-report T4 RED Phase 11 이관 issue 번호 연결
4. **[CONSIDER]** QA-04: case 9 matchedCount 단언 강화 (`hasSizeGreaterThanOrEqualTo(1)` 등)
5. **[CONSIDER]** QA-06: @Transactional IT 에서 REQUIRES_NEW audit row 가시성 확인 (Testcontainers)
6. **[CONSIDER]** QA-08: `waitForTimeout` → `waitForSelector` / `toBeVisible` 대체
7. **[CONSIDER]** MANAGER/MASTER 허용 케이스 IT 추가

---

## 총평

SP-09-3 회귀 가드(false green 금지, dev server 체크, data-testid 실 구현 일치)를 충실히 준수한다.  
T4 RED 는 Phase 11 미구현 의도된 상태이며 false green 이 아님을 주석으로 명시하여 정당하다.  
주요 문제는 QA-01(Mockito stub 순서)과 QA-03(T3 날짜 범위 시나리오 명확화).  
전체 10 case 커버리지는 양호하나 MANAGER/MASTER 허용 케이스 추가 및 SlipQueryClient MockBean 누락 여부 확인 권장.
