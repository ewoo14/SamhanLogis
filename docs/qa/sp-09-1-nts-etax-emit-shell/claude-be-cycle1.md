# SP-09-1 NTS e-Tax 발행 Shell — Claude BE 리뷰 Cycle 1

> 브랜치: `feat/sp-09-1-nts-etax-emit-shell`  
> 커밋: `c7ba59ef`  
> 리뷰 일자: 2026-05-18  
> 리뷰어: Claude BE Agent (Cycle 1, read-only)

---

## 1. 결함 목록

### CRITICAL

없음.

---

### HIGH

#### H-1. `EmitNtsRequest.submitMethod` 이 ETaxClientImpl 의 실제 분기에 무시됨

**파일**: `TaxInvoiceEmitService.java` L65, `ETaxClientImpl.java` L59  
**현상**: `EmitNtsRequest.submitMethod` 를 request body 로 받아 유효성 검증 (`@Pattern(regexp="DRY_RUN|NTS")`)까지 수행하지만, `TaxInvoiceEmitService.emitNts()` 에서 `request` 객체를 `eTaxClient.submit(ti)` 호출 시 전혀 전달하지 않는다. `ETaxClientImpl` 은 오직 `etax.submit-method` application property 를 기준으로 분기한다.

**결과**: 클라이언트가 `submitMethod=NTS` 를 요청해도 서버 property 가 `DRY_RUN` 이면 DRY_RUN 결과가 반환되고, 응답의 `submitMethod` 필드도 `"DRY_RUN"` 으로 응답된다. 즉 요청값이 실제 동작에 반영되지 않음에도 API 계약(request→response 일관성)이 깨진다.  
`TaxInvoiceEmitService` class Javadoc(L35-37)에는 이 "의도적 방어 정책"이 설명되어 있으나, **응답 DTO가 실제 수행된 `submitMethod` 를 그대로 반환하므로** 클라이언트 입장에서는 요청과 응답이 불일치하는 혼란이 발생한다. 또한 `ETaxClient.submit()` 시그니처에 `submitMethod` 파라미터가 없어, Phase 11에서 실 연동 시 인터페이스 교체가 필요하다.

**권장 fix**:
```
두 가지 선택지:
(A) ETaxClient.submit(TaxInvoice, String submitMethod) 로 시그니처 확장,
    ETaxClientImpl 이 인자를 우선으로 분기 (property 는 기본값 fallback용).
(B) submitMethod 를 request 에서 제거하고 서버 property 만으로 제어
    (Phase 11 이전 단순화). Javadoc + OpenAPI description 에 명시.
```

---

#### H-2. `TaxInvoiceEmitService` 클래스 레벨 `@Transactional` + audit `try-catch` silent rollback 문제

**파일**: `TaxInvoiceEmitService.java` L44, L128-150  
**현상**: `TaxInvoiceEmitService` 에 `@Transactional` 이 클래스 레벨로 선언되어 있다. `recordEmitAudit()` 내부에서 `auditLogService.recordBatch()` 가 `@Transactional` (L83 in AccountingAuditLogService)로 선언되어 있는데, 이는 기본적으로 `PROPAGATION_REQUIRED` 이므로 **외부 트랜잭션에 참여(join)한다**.

`recordEmitAudit()` 는 `RuntimeException` 을 캐치하여 graceful 처리한다고 설명되어 있지만, `auditLogService.recordBatch()` 가 외부 트랜잭션에 참여하는 경우 내부 예외가 `TransactionSystemException` 또는 rollback-mark 를 남길 수 있다. 즉 `try-catch` 로 예외를 삼켰어도 트랜잭션이 이미 rollback-only 로 마킹될 수 있다.

단, `AccountingAuditLogService.recordBatch()` 에 `@Transactional(propagation = REQUIRES_NEW)` 가 없는 경우 이 문제가 실제로 발생한다.

**권장 fix**:
```
auditLogService.recordBatch() 를 REQUIRES_NEW 로 선언하거나,
TaxInvoiceEmitService.recordEmitAudit() 호출을 @Transactional(propagation=NOT_SUPPORTED)
wrapper 로 격리하여 비즈니스 트랜잭션에 영향 없이 audit 만 독립 커밋되도록 보장한다.
```

---

### MEDIUM

#### M-1. DB UNIQUE 제약 미존재 — `e_tax_external_id` 컬럼

**파일**: `V2__add_tax_invoice.sql` L36, 전체 `db/migration/` 디렉토리  
**현상**: `e_tax_external_id VARCHAR(100)` 컬럼이 V2에서 이미 정의되어 있으나, 어떤 마이그레이션 파일에도 이 컬럼에 대한 UNIQUE 인덱스/제약이 없다. 또한 SP-09-1 신규 Flyway 마이그레이션(V16 이상)이 존재하지 않는다 — `e_tax_external_id` 관련 DB 레벨 가드가 전무하다.

**결과**: 도메인 메서드 `markEmitted()` 의 이중 검증(service + domain)이 있더라도, 동일 트랜잭션 충돌 또는 분산 환경에서 동시 발행 시 동일한 외부 ID 가 두 행에 중복 저장될 수 있다. 특히 `e_tax_external_id` 는 홈택스 접수번호이므로 유일성 보장이 세법 준수에 필수적이다.

**권장 fix**:
```sql
-- V16__add_etax_unique_index.sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_invoices_etax_external_id
    ON tax_invoices (e_tax_external_id)
    WHERE is_deleted = FALSE AND e_tax_external_id IS NOT NULL;
```

---

#### M-2. IT Case 6 (중복 발행) 트랜잭션 경계 문제 — `@Transactional` + MockMvc 두 번 호출

**파일**: `TaxInvoiceEmitNtsIT.java` L183-209  
**현상**: IT 클래스가 `@Transactional` 로 선언되어 있다. Case 6 에서 최초 `emit-nts` 성공 후 두 번째 `emit-nts` 호출로 409 를 기대한다. 그러나 `@Transactional` 테스트는 테스트 종료 시 rollback 되므로, **첫 번째 emit 의 `markEmitted()` 결과(eTaxExternalId 세팅)가 DB 에 flush/commit 되어 있지 않을 수 있다**. MockMvc 요청은 별도 thread/connection 을 통해 서비스 레이어 트랜잭션을 독립적으로 실행하므로, 테스트 트랜잭션이 flush 를 보장하지 않으면 두 번째 요청이 동일한 클린 스냅샷을 조회해 409 대신 200 이 반환될 수 있다.

**권장 fix**:
```
Case 6 및 Case 7(audit 간접 검증)에서 @Transactional 을 분리하거나
TestEntityManager.flush() / entityManager.flush() 로 중간 상태를 강제 commit 한다.
혹은 @Transactional 을 IT 클래스에서 제거하고 개별 픽스처 클린업으로 대체한다.
```

---

#### M-3. `linkETaxExternalId()` 잔여 메서드 — `markEmitted()` 와 이중 접근자 충돌

**파일**: `TaxInvoice.java` L413, L431  
**현상**: `markEmitted(String eTaxExternalId)` 도메인 메서드(SP-09-1 신규, 검증 포함)가 추가되었음에도, 이전에 정의된 `linkETaxExternalId(String eTaxExternalId)` 메서드(L413)가 그대로 남아 있다. `linkETaxExternalId()` 는 아무런 사전 검증 없이 직접 필드를 설정한다 — 상태 검증도 없고 중복 발행 방지도 없다.

**결과**: 실수로 `linkETaxExternalId()` 를 호출하면 CANCELLED 상태의 세금계산서에 외부 ID 를 무방비로 설정할 수 있다. 컨벤션 상 도메인 메서드만 사용해야 하므로, `linkETaxExternalId()` 는 `@Deprecated` 처리 또는 제거가 필요하다.

**권장 fix**:
```java
/** @deprecated SP-09-1 이후 {@link #markEmitted(String)} 을 사용하세요. */
@Deprecated
public void linkETaxExternalId(String eTaxExternalId) { ... }
```
또는 호출부(없으면) 확인 후 완전 제거.

---

#### M-4. IT Case 7 audit log 직접 검증 없음

**파일**: `TaxInvoiceEmitNtsIT.java` L212-241  
**현상**: Case 7 `testEmitAuditLogRecorded()` 는 audit log 기록을 직접 조회하지 않고 두 번째 emit-nts 의 409 응답으로 "eTaxExternalId 가 설정됐음을 간접 검증"한다. 이는 사실상 Case 6 (중복 발행 409) 와 동일한 시나리오를 중복 테스트하는 것이며, audit log 실제 기록 여부는 전혀 검증되지 않는다.

**권장 fix**:
```
AccountingAuditLogRepository 를 @Autowired 로 주입하여
auditLogRepository.findByEntityId(UUID.fromString(id)) 로 TAX_INVOICE_EMIT_NTS
action 의 ChangeEntry 가 실제로 존재하는지 assertion 한다.
```

---

#### M-5. `ETaxClientImpl.submitDryRun()` UUID fallback — `id.toString().substring(0,8)` 취약성

**파일**: `ETaxClientImpl.java` L73-75  
**현상**: `invoice.getTaxInvoiceNo()` 가 null 이면 `invoice.getId().toString().substring(0,8)` 을 사용한다. 실제 서비스 흐름에서 `emit-nts` 는 ISSUED 상태(taxInvoiceNo 존재)에서만 호출되므로 이 경로는 도달 불가하지만, 테스트/오용 시 UUID 일부가 `eTaxExternalId` 로 노출된다. UUID 비공개 원칙(메모리 가드 `feedback_uuid_no_user_visibility.md`) 위반 가능성이 있다. `submittedAt` 의 epochMilli 와 조합해도 가역 추론이 어렵지만 원칙적으로 UUID fragment 노출이다.

**권장 fix**:
```java
String taxInvoiceNo = invoice.getTaxInvoiceNo() != null
        ? invoice.getTaxInvoiceNo()
        : "UNKNOWN";  // UUID substring 제거
```

---

### LOW

#### L-1. `TaxInvoiceController.cancel()` 권한 — MANAGER 포함, emit-nts 와 불일치

**파일**: `TaxInvoiceController.java` L128  
**현상**: `cancel` endpoint 는 `hasAnyRole('ACCOUNTANT','MANAGER','MASTER')` 로 MANAGER 도 취소 가능하다. 반면 `emit-nts` 는 `hasAnyRole('ACCOUNTANT','MASTER')` 로 MANAGER 제외다. 이 불일치는 의도적 권한 정책이라면 Javadoc에 명시가 필요하고, 의도치 않은 것이라면 정책 검토가 필요하다.

현재 코드 자체가 특별히 잘못된 것은 아니나, SP-03 §4.2 권한 매트릭스 문서와의 정합성 확인이 필요하다.

**권장 fix**:
```
docs/manual/03-회계/03-세금계산서.md 또는 SP-03 §4.2 기준으로
취소(cancel)의 MANAGER 허용이 의도적인지 확인 후 Javadoc 또는 문서에 사유 명시.
```

---

#### L-2. `EmitNtsResponse` 에 `taxInvoiceId` (UUID) Javadoc 설명 불일치

**파일**: `EmitNtsResponse.java` L10-11  
**현상**: Javadoc에 "UUID 는 taxInvoiceId 만 포함"이라고 명시되어 있으나, 실제 record 필드에 `taxInvoiceId` 는 없다. `taxInvoiceNo` + `eTaxExternalId` 만 포함한다. Javadoc 설명이 구현과 불일치한다.

**권장 fix**:
```
Javadoc 에서 "UUID 는 taxInvoiceId 만 포함" 문구를 제거하고
"응답 본문에 UUID 는 포함되지 않음 — 사용자 식별은 taxInvoiceNo 사용" 으로 정정.
```

---

#### L-3. `TaxInvoiceEmitService` 클래스 레벨 `@Transactional` — 읽기 전용 분기 미분리

**파일**: `TaxInvoiceEmitService.java` L44  
**현상**: 현재는 `emitNts()` 단일 public 메서드만 존재하므로 문제없으나, 향후 조회용 메서드 추가 시 클래스 레벨 `@Transactional` 이 쓰기 트랜잭션을 강제하는 문제가 생길 수 있다. 선제적 조치로 메서드 레벨 `@Transactional` 로 이동을 권장한다.

---

#### L-4. IT `sampleBody()` — `partnerId` UUID 랜덤 생성, SlipServiceClient lenient stub 의존

**파일**: `TaxInvoiceEmitNtsIT.java` L293-308  
**현상**: `partnerId` 를 `UUID.randomUUID()` 로 생성하므로 partner-service 연동 없이도 동작한다. 이는 의도적이고 `@MockBean SlipServiceClient` 로 격리되어 있으나, `lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0)` 스텁이 일부 케이스(Case 2, 3, 4, 5)에는 `eTaxClient.submit` mock 없이 선언되어 있다. Case 2·3 은 403 이전에 서비스 레이어에 도달하지 않으므로 실제 문제는 없으나, Case 4·5(DRAFT/CANCELLED → 422)는 service 레이어에 진입하지만 `eTaxClient.submit` 이 호출되지 않는 경로이므로 lenient 처리가 올바르다. 다만 명시적 주석이 있으면 가독성이 향상된다.

---

## 2. 각 검증 항목 평가

| # | 검증 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | BaseEntity 7 audit + Soft Delete 준수 | **PASS** | `TaxInvoice extends BaseEntity`. `@SQLRestriction("is_deleted = false")` 선언. `markDeleted()` 상속. hard delete 미사용. SP-09-1 슬라이스 자체에서 delete 호출 없음. |
| 2 | 도메인 메서드 chain (직접 set 금지) | **PASS** | `markEmitted(String)` 도메인 메서드 사용. `TaxInvoiceEmitService.emitNts()` 에서 `ti.markEmitted(result.eTaxExternalId())` 으로 호출. 직접 setter 없음. 단 `linkETaxExternalId()` 잔여 메서드(M-3) 는 검증 우회 위험으로 주의 필요. |
| 3 | @MockBean 외부 client 격리 일관성 | **PASS** | `@MockBean ETaxClient` + `@MockBean SlipServiceClient` 양쪽 모두 선언. `lenient` stub 으로 기존 IT 와 호환. 메모리 가드 `feedback_it_mockbean_external_clients.md` 준수. |
| 4 | 권한 매트릭스 SP-03 §4.2 (ACCOUNTANT/MASTER OK, SALES/MANAGER 403) | **PASS** | `@PreAuthorize("hasAnyRole('ACCOUNTANT','MASTER')")` 선언. IT Case 2(SALES 403), Case 3(MANAGER 403) 커버. `HeaderAuthenticationFilter` 가 `ROLE_` prefix 자동 부여. |
| 5 | 트랜잭션 경계 — 성공 후 markEmitted commit, 실패 시 rollback | **WARN** | `@Transactional` 클래스 레벨 선언으로 정상 흐름은 OK. 그러나 audit `recordEmitAudit()` 의 `PROPAGATION_REQUIRED` join 특성으로 audit 예외가 비즈니스 트랜잭션을 rollback-only 로 마킹할 가능성 존재 (H-2). |
| 6 | 중복 발행 방지 — DB UNIQUE 제약 vs 도메인 검증 이중 가드 | **FAIL** | 도메인 이중 검증(service pre-check + `markEmitted` 내 검증)은 존재하나, DB 레벨 `e_tax_external_id` UNIQUE 인덱스 없음 (M-1). 신규 V16 마이그레이션 파일 미존재. |
| 7 | HTTP status code (422/409/502 정확성) | **PASS** | `TAX_INVOICE_NOT_EMITTABLE` → `HttpStatus.UNPROCESSABLE_ENTITY` (422). `TAX_INVOICE_ALREADY_EMITTED` → `HttpStatus.CONFLICT` (409). `ETAX_SUBMIT_FAILED` → `HttpStatus.BAD_GATEWAY` (502). `GlobalExceptionHandler` 가 `ErrorCode.httpStatus` 그대로 반환. |
| 8 | 한국어 Javadoc 의무 | **PASS** | `ETaxClient`, `ETaxClientImpl`, `ETaxSubmitResult`, `TaxInvoiceEmitService`, `TaxInvoiceController.emitNts()`, `TaxInvoice.markEmitted()`, `EmitNtsRequest`, `EmitNtsResponse` 모두 한국어 Javadoc 작성됨. `ErrorCode` 3건 추가도 한국어 Javadoc 포함. |

---

## 3. 권장 Fix 우선순위 요약

| 우선순위 | 결함 ID | 한 줄 설명 | 예상 작업량 |
|---|---|---|---|
| P0 (merge 전 필수) | M-1 | V16 마이그레이션으로 `e_tax_external_id` UNIQUE 인덱스 추가 | SQL 10행 |
| P0 (merge 전 필수) | H-1 | `EmitNtsRequest.submitMethod` 이 ETaxClient 에 전달되도록 인터페이스 정비 또는 명시적 정책 변경 | 인터페이스 변경 or DTO 재설계 |
| P1 (권장) | H-2 | audit `REQUIRES_NEW` propagation 또는 트랜잭션 격리 보장 | Service 1~3행 |
| P1 (권장) | M-3 | `linkETaxExternalId()` `@Deprecated` 처리 또는 제거 | 1행 annotation |
| P2 (선택) | M-2 | IT Case 6·7 의 `@Transactional` + MockMvc flush 경계 검토 | IT 리팩토링 |
| P2 (선택) | M-4 | IT Case 7 audit repository 직접 assertion 추가 | IT 10~15행 |
| P3 (문서) | L-1 | cancel MANAGER 허용 vs emit-nts MANAGER 금지 불일치 Javadoc 명시 | Javadoc 2행 |
| P3 (문서) | L-2 | `EmitNtsResponse` Javadoc UUID 설명 오류 수정 | 1행 |
| P3 (개선) | M-5 | DRY_RUN fallback ID 에서 UUID substring 제거 | 1행 |

---

## 4. 종합 평가

SP-09-1 shell 구현은 전반적으로 프로젝트 컨벤션을 준수하고 있다. BaseEntity 상속, 도메인 메서드 체인, @MockBean 격리, HTTP 상태 코드, 한국어 Javadoc 모두 양호하다.

**merge blocker** 는 두 가지다:

1. **M-1** (DB UNIQUE 제약 미존재): 홈택스 접수번호 유일성은 세법 준수 요건이므로 Flyway V16 신규 마이그레이션이 반드시 추가되어야 한다.
2. **H-1** (`submitMethod` 미전달): API 계약상 요청 파라미터가 실제 동작에 무시되는 것은 사용자/프론트엔드 혼란을 야기하며 Phase 11 실 연동 전에 인터페이스 설계를 확정해야 한다.

H-2 (audit 트랜잭션 격리)는 프로덕션 안정성에 영향을 주므로 P1 으로 함께 처리를 권장한다.
