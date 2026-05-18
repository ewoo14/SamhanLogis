# SP-09-1 NTS e-Tax 발행 shell — Codex BE Cycle 1 후반 리뷰

브랜치: `feat/sp-09-1-nts-etax-emit-shell`  
HEAD: `7363a729`  
범위: Section A — `accounting-service` read-only cross-check

## 결론

**cycle 2 진입 권고.** Claude cycle 1의 주요 BE 지적 중 `ETaxClient` 2-인자 시그니처, V16 partial unique index, `markEmitted()` 도메인 가드, audit 직접 검증은 대체로 반영되었다. 다만 `REQUIRES_NEW` audit 격리가 같은 bean 내부 self-invocation으로 적용되지 않아 설계 의도와 테스트 설명이 틀린 상태다.

## 결함

### HIGH — `recordEmitAudit()`의 `REQUIRES_NEW`가 self-invocation으로 적용되지 않음

- 위치: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceEmitService.java:68`, `:113`, `:135`
- 현상: `emitNts()`가 같은 클래스의 `recordEmitAudit()`를 직접 호출한다. Spring proxy 기반 `@Transactional(propagation = REQUIRES_NEW)`는 외부 proxy 호출에서만 적용되므로, 현재 audit 기록은 비즈니스 트랜잭션과 독립 커밋되지 않는다.
- 영향: Javadoc의 “audit 예외가 비즈니스 롤백을 유발하지 않음 / 독립 커밋” 보장이 실제와 다르다. audit 저장이 rollback-only를 만들거나 외부 트랜잭션에 묶이면 `markEmitted()`와 audit의 실패/커밋 경계가 의도와 달라진다.
- 권고: `TaxInvoiceEmitAuditRecorder` 같은 별도 `@Service`로 분리하고 그 public method에 `REQUIRES_NEW`를 적용하거나, `TransactionTemplate(REQUIRES_NEW)`로 명시 실행한다.

### MEDIUM — DB unique 위반이 API 409 계약으로 surface되지 않음

- 위치: `TaxInvoiceEmitService.java:110`, `V16__tax_invoice_etax_external_id_unique.sql:6`
- 현상: V16은 `e_tax_external_id` partial unique index를 추가했지만, `ti.markEmitted(result.eTaxExternalId())` 이후 flush/commit 시 발생할 수 있는 `DataIntegrityViolationException`을 도메인 `TAX_INVOICE_ALREADY_EMITTED` 409로 변환하지 않는다.
- 영향: 동일 NTS 접수번호가 두 세금계산서에 반환되는 race/외부 중복 상황에서 500 계열로 노출될 가능성이 있다. 검토 기준의 “중복 발행 이중 가드(DB UNIQUE + 도메인)”는 DB 가드만 추가됐고 HTTP 계약은 미완성이다.
- 권고: 저장/flush 경계에서 unique violation을 catch해 `TAX_INVOICE_ALREADY_EMITTED` 또는 별도 도메인 error로 변환하고 IT를 추가한다.

### MEDIUM — NTS 모드는 env template 기본값만으로도 “키 설정됨”으로 통과함

- 위치: `ETaxClientImpl.java:105`, `infrastructure/env-templates/accounting-service.env:38`
- 현상: `submitNts()`는 `ntsApiKey.isBlank()`만 검사한다. env template은 `NTS_API_KEY=PLACEHOLDER_DEV_ONLY`를 제공하므로, 운영자가 `ETAX_SUBMIT_METHOD=NTS`만 바꾸면 placeholder가 실제 키처럼 통과하고 이후 “미구현” 502로만 실패한다.
- 영향: Phase 11 전환 시 설정 오류를 빠르게 구분하지 못한다. credential guard 관점에서 placeholder는 안전하지만, 런타임 guard로는 불충분하다.
- 권고: `PLACEHOLDER_DEV_ONLY`, `changeme`, `dummy` 계열을 명시 차단하거나 NTS 모드 활성화 flag/프로파일을 분리한다.

### LOW — `ETaxClientImpl` Javadoc과 구현의 submitMethod 우선순위가 서로 충돌

- 위치: `ETaxClientImpl.java:55-57`, `:67-74`
- 현상: Javadoc은 “서버 property가 DRY_RUN이면 요청이 NTS여도 DRY_RUN 실행”이라고 설명하지만 구현은 요청 `submitMethod`를 우선해 `NTS` 분기로 진입한다.
- 영향: 운영 정책 오해 가능. 실제 코드는 Claude H-1 fix 방향(요청 파라미터 우선)에 맞다.
- 권고: Javadoc에서 서버 property override 설명을 제거하고 “request 우선, null/blank만 property fallback”으로 정정한다.

## Claude cycle 1 fix cross-check

| Claude 항목 | Codex 판정 | 근거 |
|---|---|---|
| H-1 submitMethod 미전달 | FIXED | `ETaxClient.submit(TaxInvoice, String)`와 `TaxInvoiceEmitService` 전달 반영 |
| H-2 audit rollback 위험 | PARTIAL / 재결함 | `REQUIRES_NEW`를 붙였지만 self-invocation이라 적용 안 됨 |
| M-1 DB UNIQUE 미존재 | FIXED + 후속 MEDIUM | V16 추가. 단 unique violation HTTP 변환 없음 |
| M-3 `linkETaxExternalId` 잔류 | PARTIAL | `@Deprecated(forRemoval=true)` 처리됨. 호출부 제거는 후속 |
| M-4 audit 직접 검증 없음 | FIXED(테스트 의도) / 구현 재검토 필요 | repository 직접 조회 추가. 단 self-invocation 때문에 “독립 트랜잭션” 설명은 틀림 |
| M-5 UUID fallback | FIXED | `UNKNOWN` fallback으로 UUID substring 제거 |

## TM 결정안

**cycle 2 진입 권고.** Merge blocker: `REQUIRES_NEW` self-invocation 수정. 권고 blocker: DB unique violation 409 변환, placeholder runtime guard, Javadoc 정정.
