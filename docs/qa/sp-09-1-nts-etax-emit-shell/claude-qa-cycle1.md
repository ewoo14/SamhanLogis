# SP-09-1 NTS e-Tax 발행 shell — Claude QA Cycle 1 결과

브랜치: `feat/sp-09-1-nts-etax-emit-shell` (commit `c7ba59ef`)
검토일: 2026-05-18
검토자: Claude QA agent (cycle 1, read-only)

---

## 1. 검증 항목 요약 (PASS / FAIL / WARN)

| # | 항목 | 결과 | 비고 |
|---|---|---|---|
| V1 | IT 8 case 도메인 시나리오 정합성 | WARN | case 7 (audit) 간접 검증만 — 직접 revision 조회 미검증 |
| V2 | Playwright T1~T5 계약 일관성 | FAIL | T5 권한 가드 assertion `|| true` 로 항상 통과 — 실 검증 없음 |
| V3 | cross-DB 정합성 (slip ↔ accounting) | WARN | SlipServiceClient @MockBean 격리 완료, 단 emit-nts 흐름은 slip 연결 없음 — 누락 여부 명시 필요 |
| V4 | 권한 매트릭스 SP-03 §4.2 적용 | FAIL | FE `NtsSubmitMethod = 'DRY_RUN' \| 'REAL'` 인데 BE `@Pattern(DRY_RUN\|NTS)` 로 불일치 |
| V5 | PR 본문 QA 스크린샷 의무 (4 PNG 인라인) | FAIL | 4장 모두 단색 배경 빈 이미지 (5.2KB, UI 콘텐츠 없음) |
| V6 | 회귀 영향 — 기존 발행 흐름 무영향 | PASS | cancel endpoint MANAGER 포함 유지, emit-nts 는 신규 endpoint 분리 |
| V7 | edge case — timeout / 부분 실패 / 재시도 | WARN | RuntimeException 502 wrap 있음, 단 네트워크 timeout 별도 처리 없음 |

---

## 2. 결함 분류

### [CRITICAL] C1 — FE/BE NtsSubmitMethod 불일치

**위치:**
- FE: `clients/desktop/src/renderer/api/taxInvoiceApi.ts` 라인 298
- BE: `services/accounting-service/src/main/java/.../web/dto/EmitNtsRequest.java` 라인 15

**현상:**
FE 타입 정의는 `NtsSubmitMethod = 'DRY_RUN' | 'REAL'` 이다. BE `EmitNtsRequest.submitMethod` 는 `@Pattern(regexp = "DRY_RUN|NTS")` 로 허용 값이 `NTS` 이다. FE 에서 `REAL` 을 전송하면 BE 400 validation error 가 발생한다.

추가로 `TaxInvoiceDetailPage.tsx` 의 `emitNtsMutation` 은 하드코딩 `'DRY_RUN'` 만 호출하므로 현재 시나리오에서는 실 오류가 발생하지 않지만, `NtsSubmitMethod` 타입을 외부에서 `'REAL'` 로 사용하는 순간 런타임 400 이 발생한다.

`dev-report` §3-1 의 FE 함수 시그니처 주석도 `REAL` 로 기재되어 있어 문서-코드 불일치도 함께 발생한다.

**권장 fix:**
BE `EmitNtsRequest` 의 `@Pattern` 을 `DRY_RUN|NTS|REAL` 로 확장하거나, FE `NtsSubmitMethod` 를 `'DRY_RUN' | 'NTS'` 로 통일. 팀 합의 후 한쪽 기준으로 단일화 필요.

---

### [CRITICAL] C2 — QA 스크린샷 4장 전부 빈 이미지 (단색 배경)

**위치:** `docs/qa/sp-09-1-nts-etax-emit-shell/screenshots/01~04_*.png`

**현상:**
4장 모두 파일 크기 5,215~5,216 bytes. 실제 이미지 확인 시 각각 밝은 회청색 / 밝은 아이보리 / 밝은 크림색 / 연한 분홍색 단색 배경만 존재하며 UI 콘텐츠(버튼, 텍스트, 폼, 모달 등)가 전혀 없다. 이는 dev server 미가용 상태에서 Playwright 가 빈 페이지를 캡처하거나, mock 이미지를 생성한 것으로 판단된다.

`feedback_pr_qa_screenshots.md` 가드: "모든 PR 본문에 QA 결과 스크린샷 1장 이상 인라인 첨부 의무". 빈 이미지는 가드 조건 위반이다. PR 본문에는 4장 인라인 첨부가 있으나 내용이 없어 검증 증거로 인정 불가.

**권장 fix:**
dev server를 `VITE_MOCK_MODE=1 npx vite --port 5173` 로 기동한 후 Playwright 를 재실행하거나, 수동으로 브라우저 캡처하여 UI 콘텐츠가 포함된 PNG 4장으로 교체.

---

### [HIGH] H1 — T5 권한 가드 assertion `|| true` 하드코딩 — 실 검증 없음

**위치:** `clients/desktop/playwright/sp-09-1-nts-etax-emit-shell/sp-09-1-nts-etax-emit-shell.spec.ts` 라인 543~550

**현상:**
```typescript
expect(
  salesBlocked || true,  // shell 단계: mock 모드에서 role 차단 미구현 시 허용
  'SALES ...',
).toBeTruthy()

expect(
  managerNtsBtnCount === 0 || true,  // shell 단계
  'MANAGER ...',
).toBeTruthy()
```
두 assertion 모두 `|| true` 로 인해 조건에 관계없이 항상 통과한다. SALES/MANAGER 권한 가드가 실제 작동하지 않아도 테스트가 통과하므로 권한 회귀를 잡지 못한다. shell 단계 허용이라고 주석이 있으나, 이 경우 `test.skip()` 또는 별도 TODO 마커로 처리하는 것이 의도를 명확히 한다.

**권장 fix:**
`|| true` 제거 후 실제 mock 모드에서 SALES 접근 시 403 또는 redirect 가 발생하도록 `mock.ts` 핸들러 추가. 단기적으로 `test.skip('shell 단계: role 차단 미구현 — TODO')` 로 교체하여 false green 방지.

---

### [HIGH] H2 — IT case 7 (testEmitAuditLogRecorded) 감사 로그 직접 검증 없음

**위치:** `TaxInvoiceEmitNtsIT.java` 라인 214~241

**현상:**
case 7 은 emit-nts 성공 후 재시도 409를 통해 `eTaxExternalId` 가 저장됐음을 간접 검증하고 있다. 이는 case 6과 거의 동일한 흐름이다. `TAX_INVOICE_EMIT_NTS` audit revision 이 실제로 기록됐는지 직접 DB 조회나 audit API 응답으로 검증하지 않는다. 주석에 "별도 조회 endpoint 가 없으므로 간접 확인"이라고 명시되어 있으나, `AccountingAuditLogService.recordBatch()` 의 graceful 처리(`try-catch` 로 audit 실패 시 비즈니스 트랜잭션 차단 안 함) 때문에 audit 자체가 실패해도 case 7 은 통과한다.

**권장 fix:**
`AccountingAuditLogService` 또는 audit 저장 repository 를 `@Autowired` 로 주입하여 emit-nts 호출 후 해당 taxInvoice ID 에 대한 audit log row 존재 여부를 직접 assert 하는 검증 추가. 또는 audit 서비스를 `@SpyBean` 으로 선언 후 `verify(auditLogService).recordBatch(...)` 호출.

---

### [HIGH] H3 — e_tax_external_id DB UNIQUE 제약 미적용

**위치:** `services/accounting-service/src/main/resources/db/migration/V2__add_tax_invoice.sql` 라인 36

**현상:**
`e_tax_external_id VARCHAR(100)` 컬럼이 있으나 UNIQUE INDEX 가 없다. 도메인 레이어의 `markEmitted()` 에서 중복 검증을 하고 있지만, 동시 요청 경합 조건(race condition)에서는 두 트랜잭션이 동시에 `eTaxExternalId == null` 을 확인한 후 모두 통과하여 동일 세금계산서에 두 번 외부 발행이 이루어질 수 있다. `dev-report` §8-3 에서도 "DB 레벨 unique 제약 추가 권고"라고 언급하고 있으나 미이행.

**권장 fix:**
V16 Flyway 마이그레이션으로 partial UNIQUE INDEX 추가:
```sql
CREATE UNIQUE INDEX uq_tax_invoice_etax_external_id
    ON tax_invoices (e_tax_external_id)
    WHERE e_tax_external_id IS NOT NULL AND is_deleted = false;
```

---

### [MEDIUM] M1 — T1 ErrorCode 검증이 BE 계약 검증이 아닌 page.route() mock 자기 참조

**위치:** `sp-09-1-nts-etax-emit-shell.spec.ts` T1 (라인 132~209)

**현상:**
T1 은 `page.route('**/accounting/tax-invoices/**/emit-nts', ...)` 로 API 를 인터셉트하여 mock 응답을 반환하고, 그 응답의 `errorCode` 필드 값으로 계약을 검증한다. 실제 BE 가 해당 ErrorCode 를 반환하는지 검증하지 않으며, Playwright 가 직접 구성한 JSON 을 확인하는 것이다. IT(TaxInvoiceEmitNtsIT)가 별도로 BE 검증을 수행하므로 전체 커버리지에 공백은 아니나, Playwright T1 의 검증 목적이 모호해진다.

**권장 fix:**
T1 을 "FE 에러 핸들링 렌더링 검증"으로 목적을 재정의하고, 422/409 응답 수신 시 화면에 에러 메시지가 노출되는지 (`page.locator('[data-testid="error-banner"]')` 등) 추가 assert. 현재는 `expect(isPageLoaded).toBeTruthy()` 만 검증.

---

### [MEDIUM] M2 — T3 `etaxIdDisplayed` 변수 선언 후 미사용

**위치:** `sp-09-1-nts-etax-emit-shell.spec.ts` 라인 390~395

**현상:**
```typescript
const etaxIdDisplayed =
  bodyText.includes('DRY-') ||
  bodyText.includes('eTaxExternalId') ||
  ...
```
`etaxIdDisplayed` 를 선언하고 나서 아무 `expect()` 에서 사용하지 않는다. 실제 assertion 은 라인 407~410 의 별도 `expect(bodyText.includes(...)).toBeTruthy()` 이며, `etaxIdDisplayed` 는 dead code 이다.

**권장 fix:**
`expect(etaxIdDisplayed, 'eTaxExternalId 화면 미표시').toBeTruthy()` assertion 추가하거나 변수 제거 후 assertion 으로 교체.

---

### [MEDIUM] M3 — T2 NtsSubmitMethod 타입 검증 주석이 BE 계약과 불일치 언급 없음

**위치:** `sp-09-1-nts-etax-emit-shell.spec.ts` T2 주석 (라인 228)

**현상:**
T2 주석에 "NtsSubmitMethod = 'DRY_RUN' | 'REAL'" 로 기재되어 있다. BE `@Pattern(DRY_RUN|NTS)` 와 불일치가 있음에도 스펙 내에서 이 불일치를 인지하거나 가드하는 코드가 없다.

**권장 fix:**
C1 결함 수정 후 주석도 일관된 값으로 갱신.

---

### [MEDIUM] M4 — TaxInvoice.linkETaxExternalId() deprecated 메서드 잔류

**위치:** `TaxInvoice.java` 라인 413~415

**현상:**
```java
public void linkETaxExternalId(String eTaxExternalId) {
    this.eTaxExternalId = eTaxExternalId;
}
```
SP-09-1 이 `markEmitted()` 를 신규 도메인 메서드로 도입했는데, 기존 `linkETaxExternalId()` 가 그대로 남아 있다. 이 메서드는 ISSUED 상태 검증도 중복 검증도 하지 않으므로 잘못 호출되면 비즈니스 불변성을 우회한다. `@Deprecated` 가 없고 삭제도 안 되어 있다.

**권장 fix:**
`linkETaxExternalId()` 에 `@Deprecated` 추가하고 Javadoc 에 "SP-09-1 이후 `markEmitted()` 사용" 명시. 중기적으로 호출처 없음 확인 후 제거.

---

### [LOW] L1 — IT sampleBody() 에서 partnerId 랜덤 UUID 사용 — partner-service 정합성 없음

**위치:** `TaxInvoiceEmitNtsIT.java` 라인 301

**현상:**
```java
body.put("partnerId", UUID.randomUUID().toString());
```
매 테스트마다 존재하지 않는 partnerId 가 생성된다. 현재 accounting-service 가 partner-service 를 동기 호출하지 않으므로 테스트는 통과하지만, 추후 partner 검증이 추가될 때 기존 IT 가 전부 실패할 위험이 있다. 또한 cross-DB Slip.partnerId ↔ partner.id 정합성 시나리오(표준 시나리오 #4)와 연결이 없다.

**권장 fix:**
seeder 또는 Testcontainers 초기화 시 알려진 partnerId 를 상수로 정의하여 테스트 데이터 일관성 확보. 현재 단계에서는 LOW 등급으로 유지.

---

### [LOW] L2 — TaxInvoiceEmitService 에서 request.submitMethod() 미사용

**위치:** `TaxInvoiceEmitService.java` 라인 65~120

**현상:**
`emitNts(UUID id, EmitNtsRequest request, String actorUserId)` 메서드에서 `request.submitMethod()` 를 전혀 사용하지 않는다. ETaxClient 의 분기는 `ETaxClientImpl` 내부의 `etax.submit-method` property 로만 제어된다. 즉, 사용자가 request body 에 `submitMethod=NTS` 를 보내도 서버 property 가 `DRY_RUN` 이면 DRY_RUN 으로 실행된다.

`TaxInvoiceEmitService` 주석에 "request.submitMethod = NTS 인데 impl 이 DRY_RUN 으로 설정 → DRY_RUN 결과 반환 (Phase 11 이전 방어 정책)" 이라고 명시하고 있어 의도적인 설계이나, 사용자 입력 `submitMethod` 가 무시됨을 알기 어렵다. API 문서에도 이 동작이 명시되지 않아 혼동 가능성이 있다.

**권장 fix:**
`EmitNtsResponse` 에 실제 적용된 `submitMethod` 를 반환하고 있으므로 응답으로 확인 가능. API Swagger 문서에 "request.submitMethod 는 Phase 11 이전까지 서버 설정에 의해 override 됨" 주석 추가 권고.

---

### [LOW] L3 — Playwright T1 에서 `url.includes('draftTest')` 조건이 실 FE 코드와 무관

**위치:** `sp-09-1-nts-etax-emit-shell.spec.ts` 라인 141~151

**현상:**
T1 의 page.route 핸들러에서 422/409 분기 조건이 `url.includes('draftTest')` / `url.includes('duplicateTest')` 파라미터 기반이다. 실제 `TaxInvoiceDetailPage.tsx` 의 `emitTaxInvoiceToNts` 는 이런 파라미터를 전송하지 않는다. 이 분기는 never-executed 경로로, 정상 응답(DRY_RUN 200) 이외에 422/409 시나리오는 Playwright T1 에서 실제로 테스트되지 않는다.

**권장 fix:**
422/409 시나리오를 별도 테스트케이스로 분리하고, 각 케이스에서 page.route 를 status별로 독립 설정하여 FE 에러 핸들링을 실제로 검증.

---

## 3. 도메인 정합성 검증

### 3-1. slip-service ↔ accounting-service cross-DB 흐름

emit-nts 엔드포인트는 slip-service 와 직접 연결되지 않는다. `SlipServiceClient` 는 `MonthEndCloseService` 에서만 사용하며, `TaxInvoiceEmitService` 는 독립적으로 동작한다. cross-DB 정합성 측면에서 "ISSUED 세금계산서 → NTS 발행" 흐름은 slip-service 의 slip 상태와 직접 연동되지 않는 설계임을 확인했다. 이는 의도된 설계이나 docs 에 명시가 없다.

`dev-report` §6 의 도메인 정합성 SQL 은 적절하다:
- ISSUED + eTaxExternalId 존재 건 조회
- eTaxExternalId 중복 탐지
- DRAFT/CANCELLED 에 eTaxExternalId 이상 설정 탐지

단, `e_tax_external_id` 에 DB UNIQUE INDEX 가 없어 중복 탐지 SQL 이 실제로 행을 반환할 가능성이 있다 (H3 참조).

### 3-2. Journal 복식부기 불변성

emit-nts 흐름에서 추가 분개 생성이 없다. ISSUED 상태 유지, `eTaxExternalId` 컬럼만 갱신. 기존 ISSUED 시 생성된 분개(110/255/400)는 변경 없음. 복식부기 불변성 영향 없음 — PASS.

---

## 4. 권한 매트릭스 SP-03 §4.2 적용 일관성

| Role | emit-nts BE (`@PreAuthorize`) | cancel BE (`@PreAuthorize`) | 비고 |
|---|---|---|---|
| MASTER | 허용 | 허용 | 정상 |
| MANAGER | 금지 (403) | 허용 | 정상 — emit-nts 는 ACCOUNTANT/MASTER 전용 |
| ACCOUNTANT | 허용 | 허용 | 정상 |
| SALES | 금지 (403) | 금지 | 정상 |
| WAREHOUSE | 금지 (403) | 금지 | 정상 (미명시지만 MANAGER/ACCOUNTANT/MASTER 미포함) |
| DRIVER | 금지 (403) | 금지 | 정상 |

IT case 2 (SALES 403), case 3 (MANAGER 403) 모두 커버됨. WAREHOUSE / DRIVER IT case 누락이나 PR §4.2 matrix 에서 모두 ❌ 로 명시 — 허용 가능.

FE `canEmitNts` 조건: `isIssued && canMutate && !t.eTaxExternalId` — `canMutate`는 `canAccessTaxInvoice(role)` = `ACCOUNTANT || MASTER`. FE 권한 가드 구현 일관성 PASS.

---

## 5. 회귀 영향

| 구성 요소 | 변경 유무 | 회귀 평가 |
|---|---|---|
| 기존 issue 엔드포인트 (`POST /{id}/issue`) | 미변경 | PASS — 기존 흐름 무영향 |
| cancel 엔드포인트 (`POST /{id}/cancel`) | 미변경 | PASS — MANAGER 포함 권한 유지 |
| TaxInvoice.cancel(), issue() | 미변경 | PASS |
| TaxInvoice.markEmitted() | 신규 추가 | PASS — 기존 메서드 무관 |
| TaxInvoice.linkETaxExternalId() | 잔류 (미삭제) | WARN — M4 결함 참조 |
| ErrorCode 3건 신규 | 기존 코드 무관 | PASS |
| TaxInvoiceController 생성자 | TaxInvoiceEmitService 추가 주입 | PASS — 기존 엔드포인트 무관 |

---

## 6. edge case 누락 여부

| edge case | 현황 | 평가 |
|---|---|---|
| ETaxClient BusinessException 502 | IT case 8 커버 | PASS |
| ETaxClient RuntimeException → 502 wrap | `TaxInvoiceEmitService` 에 `catch(RuntimeException)` 있음 | PASS |
| ETaxClient success=false 응답 | `TaxInvoiceEmitService` 라인 97~102 처리 | PASS |
| 네트워크 timeout (RestClient read timeout) | 별도 timeout 설정 없음. Phase 11 NTS 실 호출 전까지 DRY_RUN 이므로 현재 무관 | WARN |
| 동시 요청 race condition (중복 발행) | 도메인 체크 있으나 DB UNIQUE 없음 | WARN (H3 참조) |
| `eTaxExternalId` 100자 초과 | `markEmitted()` 에서 `IllegalArgumentException` 발생. 컨트롤러에서 처리 미확인 | WARN |
| submitMethod null / 빈 문자열 | `@NotNull` + `@Pattern` 400 처리 | PASS |
| taxInvoice soft-delete 후 emit-nts 호출 | `@SQLRestriction("is_deleted = false")` + `findById` → 404 | PASS |
| WAREHOUSE/DRIVER 역할 emit-nts 시도 | IT 미커버이나 `@PreAuthorize` 로 차단 | PASS (단 IT 미커버) |

---

## 7. 전체 결함 등급 집계

| 등급 | 건수 | 항목 |
|---|---|---|
| CRITICAL | 2 | C1 (FE/BE NtsSubmitMethod 불일치), C2 (빈 스크린샷) |
| HIGH | 3 | H1 (T5 assertion `\|\| true`), H2 (audit 간접 검증), H3 (DB UNIQUE 미적용) |
| MEDIUM | 4 | M1 (T1 자기 참조 mock), M2 (etaxIdDisplayed dead code), M3 (주석 불일치), M4 (linkETaxExternalId 잔류) |
| LOW | 3 | L1 (랜덤 partnerId), L2 (request.submitMethod 미사용), L3 (T1 never-executed 분기) |
| **합계** | **12** | |

---

## 8. 머지 가능 여부 판단

**현재 상태: 조건부 HOLD**

CRITICAL 2건 (C1 FE-BE 계약 불일치, C2 빈 스크린샷) 과 HIGH 1건 (H1 false green assertion) 해소 전 머지 비권장.

- C1: BE 또는 FE 한쪽 수정으로 해결 가능 (1~2시간)
- C2: dev server 기동 후 Playwright 재실행으로 해결 가능 (30분)
- H1: `|| true` 제거 또는 `test.skip()` 교체로 해결 가능 (10분)
- H3: V16 Flyway 마이그레이션 1 SQL 추가 (15분)

H2/M*/L* 는 이번 슬라이스에서 반드시 해결 필요는 없으나 cycle 2 진입 전 H2 는 해소 권장.
