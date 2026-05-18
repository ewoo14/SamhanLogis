# SP-09-1 NTS e-Tax 발행 shell — DevOps 리뷰 (Claude, Cycle 1)

브랜치: `feat/sp-09-1-nts-etax-emit-shell`  
커밋: `c7ba59ef`  
리뷰 일자: 2026-05-18  
리뷰어: DevOps agent (Claude)

---

## 1. 검증 항목 요약 (PASS / FAIL / WARN)

| # | 항목 | 결과 | 비고 |
|---|---|---|---|
| V1 | credential-plaintext guard 통과 | PASS | sk-/AKIA/eyJ 패턴 없음. `${NTS_API_KEY:}` 빈 값 — placeholder 필터 통과 |
| V2 | placeholder 패턴 (`${VAR:default}`) | PASS | 3개 신규 키 모두 `${...}` 형식, 기본값 명시 |
| V3 | ENV docs — `accounting-service.env` 갱신 | FAIL | 신규 3개 ENV 미등재 (결함 D1) |
| V4 | ENV docs — `dev-environment-setup-multi-pc.md` | FAIL | ETAX 관련 섹션 없음 (결함 D1 연장) |
| V5 | Flyway V16 필요 여부 | WARN | e_tax_external_id 는 V2 기존 컬럼 — V16 불필요. 단 partial UNIQUE 인덱스 미존재 (결함 D3) |
| V6 | @MockBean 격리 — TaxInvoiceEmitNtsIT | PASS | `@MockBean ETaxClient` + `@MockBean SlipServiceClient` 올바르게 선언 |
| V7 | @MockBean 격리 — 기존 IT 전체 영향 | WARN | 7개 IT(`TaxInvoiceControllerIT`, `TaxInvoiceP04IT`, `TaxInvoiceBatchIT`, `TaxInvoiceBatchEndToEndIT`, `HometaxExportPreviewIT`, `DailyClosingIT`, `ApplicationContextLoadIT`) 에 `ETaxClient @MockBean` 미추가 (결함 D2) |
| V8 | Phase 11 AWS 호환 — RDS auto backup | PASS | `etax.submit-method=DRY_RUN` 기본값으로 DB 컬럼(`e_tax_external_id`) 만 업데이트. RDS backup 영향 없음 |
| V9 | CI matrix — accounting+partner 그룹 | PASS | `TaxInvoiceEmitNtsIT` 는 `accounting+partner` 그룹에 포함됨. 별도 추가 불필요 |
| V10 | FE / BE 타입 계약 정합 | FAIL | FE `NtsSubmitMethod = 'DRY_RUN' \| 'REAL'`, BE `@Pattern(regexp="DRY_RUN\|NTS")` — 불일치 (결함 D4, P1) |
| V11 | Notion-zero-guard 통과 | PASS | 신규 코드에 Notion 의존 없음 |
| V12 | 동시성 — 중복 NTS 전송 위험 | WARN | DRY_RUN 단계 무해하나, Phase 11 NTS 활성 시 optimistic lock 전 두 번 API 호출 가능 (결함 D3 연장) |

---

## 2. 결함 분류

### D1 — FAIL | ENV 템플릿 및 설정 문서 미갱신

**파일**: `infrastructure/env-templates/accounting-service.env`, `docs/dev-environment-setup-multi-pc.md`

**내용**: `application.yml` 에 신규 추가된 3개 환경변수가 env 템플릿과 개발 환경 설정 문서에 등재되어 있지 않다.

```yaml
# application.yml 신규 블록
etax:
  submit-method: ${ETAX_SUBMIT_METHOD:DRY_RUN}
  nts-api-key: ${NTS_API_KEY:}
  nts-base-url: ${NTS_BASE_URL:}
```

현재 `accounting-service.env` 에는 아래 주석만 있고 실제 키 선언이 없다:

```
#   - 국세청 홈택스 e-tax 인증 (FUTURE_TAX_API_KEY)   ← 구 이름, 갱신 안 됨
```

다른 PC나 Phase 11 AWS 배포 담당자가 환경변수를 모르면 `NTS_API_KEY` / `NTS_BASE_URL` 공백으로 서비스 기동 — DRY_RUN 기본값으로 무음 처리되어 오인 운영 위험이 있다.

**권장 fix**:

`infrastructure/env-templates/accounting-service.env` 하단에 추가:

```bash
# --- e-Tax NTS 홈택스 실 발행 (SP-09-1) --------------------------------------
# DRY_RUN (기본) = 실 API 호출 없음. NTS = Phase 11 sandbox/운영 시 변경.
ETAX_SUBMIT_METHOD=DRY_RUN
# NTS 실 발행 모드 전용 — 운영 PC .env 또는 AWS SSM Parameter Store 에서 주입.
# 코드 내 하드코딩 금지. DRY_RUN 모드에서는 미사용.
NTS_API_KEY=PLACEHOLDER_DEV_ONLY
NTS_BASE_URL=PLACEHOLDER_DEV_ONLY
```

`docs/dev-environment-setup-multi-pc.md` 의 accounting-service 섹션에 동일 3개 키 기술 추가.

---

### D2 — WARN | 기존 IT 7개에 ETaxClient @MockBean 미추가

**파일**: `TaxInvoiceControllerIT.java`, `TaxInvoiceP04IT.java`, `TaxInvoiceBatchIT.java`, `TaxInvoiceBatchEndToEndIT.java`, `HometaxExportPreviewIT.java`, `DailyClosingIT.java`, `ApplicationContextLoadIT.java`

**내용**: SP-09-1 에서 `ETaxClientImpl` (`@Component`) 가 신규 등록되었으나, 위 7개 `@SpringBootTest` IT 는 `ETaxClient` 를 `@MockBean` 으로 격리하지 않는다.

메모리 가드 `feedback_it_mockbean_external_clients.md` 는 "모든 외부 client 를 @MockBean 격리" 를 의무화한다.

**현재 안전한 이유 (WARN 에 그치는 이유)**: `ETaxClientImpl.submitDryRun()` 은 HTTP 연결 없이 즉시 성공을 반환하므로 Eureka 비활성 5xx 패턴과 달리 런타임 실패는 발생하지 않는다. 단, Phase 11 에서 `ETAX_SUBMIT_METHOD=NTS` 로 전환 시 IT 환경에서 실제 NTS API 호출을 시도하여 `ETAX_SUBMIT_FAILED` 예외가 발생하는 회귀 위험이 있다.

**권장 fix**: 위 7개 IT 에 아래 한 줄 추가:

```java
@MockBean private ETaxClient eTaxClient;
```

`ApplicationContextLoadIT` 에도 다른 외부 client 목록에 동일하게 추가하여 가드 역할 유지.

---

### D3 — WARN | e_tax_external_id partial UNIQUE 인덱스 미존재

**파일**: `services/accounting-service/src/main/resources/db/migration/` (V1~V15 전체 검색)

**내용**: `e_tax_external_id` 컬럼은 V2 DDL 에 `VARCHAR(100)` NULLable 로 존재하나, V1~V15 어느 마이그레이션에도 해당 컬럼에 대한 UNIQUE 인덱스가 없다.

현재 중복 발행 방어는 `markEmitted()` 도메인 로직 + `@Version` 낙관적 락에만 의존한다. 두 트랜잭션이 동시에 `eTaxExternalId == null` 검증을 통과한 후 각각 `ETaxClient.submit()` 을 호출하면:

1. DRY_RUN 모드: 서로 다른 `eTaxExternalId` 가 생성되므로 optimistic lock exception 으로 한 쪽만 commit 성공 — DB 정합 보장됨.
2. NTS 실 발행 모드 (Phase 11): optimistic lock 전에 NTS API 가 **두 번** 호출될 수 있다. 이때 하나는 commit 실패(rollback)하지만 NTS 서버에는 두 접수번호가 생성될 위험이 있다.

**권장 fix**: V16 신규 마이그레이션 추가 — Phase 11 sandbox 연동 전에 완료:

```sql
-- V16__add_etax_external_id_unique.sql
-- SP-09-1 방어층: e_tax_external_id 중복 발행 DB 레벨 차단.
-- partial UNIQUE: is_deleted=FALSE + NOT NULL (DRY-* 값 포함).
-- NTS 실 발행 활성화(Phase 11) 전 적용 의무.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_invoices_etax_external_id
    ON tax_invoices (e_tax_external_id)
    WHERE is_deleted = FALSE AND e_tax_external_id IS NOT NULL;
```

---

### D4 — FAIL | FE NtsSubmitMethod 'REAL' vs BE Pattern 'NTS' 불일치

**파일**: `clients/desktop/src/renderer/api/taxInvoiceApi.ts` (FE), `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/EmitNtsRequest.java` (BE)

**내용**: FE 타입과 BE 검증 패턴 사이에 허용 값이 불일치한다.

| 측 | 허용 값 |
|---|---|
| FE `NtsSubmitMethod` | `'DRY_RUN'` \| `'REAL'` |
| BE `@Pattern(regexp = "DRY_RUN\|NTS")` | `"DRY_RUN"` \| `"NTS"` |

FE 에서 `submitMethod = 'REAL'` 로 emit-nts API 를 호출하면 BE `@Valid` 가 즉시 400 Bad Request 를 반환한다 (`"submitMethod 는 DRY_RUN 또는 NTS 만 허용됩니다"` 메시지 포함). 현재 FE UI 의 "NTS 발행" 버튼이 `'REAL'` 을 보내도록 구현되어 있다면 실운영 시 완전히 차단된다.

**권장 fix (두 가지 중 하나 선택)**:

옵션 A (BE 패턴 확장 — 권장하지 않음, BE 계약 변경 필요):
```java
@Pattern(regexp = "DRY_RUN|NTS|REAL", ...)
```

옵션 B (FE 값 수정 — 권장):
```typescript
// taxInvoiceApi.ts
export type NtsSubmitMethod = 'DRY_RUN' | 'NTS'
```
주석의 `REAL — 운영 PC .env.ops 에서만 활성` 설명도 `NTS` 로 수정.  
mock.ts 에서 `submitMethod === 'NTS'` 분기도 동일하게 수정.

---

## 3. 항목별 상세 검증 기록

### V1/V2 — Credential guard + Placeholder 검증

`application.yml` 신규 블록 전체:

```yaml
etax:
  submit-method: ${ETAX_SUBMIT_METHOD:DRY_RUN}   # ${...} placeholder → guard 통과
  nts-api-key: ${NTS_API_KEY:}                   # 빈 기본값, 하드코딩 없음 → guard 통과
  nts-base-url: ${NTS_BASE_URL:}                 # 빈 기본값, 하드코딩 없음 → guard 통과
```

`check-credential-plaintext.sh` 검사 패턴:
- `AKIA[0-9A-Z]{16}` — 없음
- `sk-[A-Za-z0-9]{20,}` — 없음
- `eyJ...` JWT — 없음
- Notion/Aligo 패턴 — 없음

`scan_pattern()` 의 inline 허용 규칙 `\$\{` 패턴이 세 줄 모두 적용되어 통과한다.

`ETaxClientImpl.java` 의 `@Value("${etax.nts-api-key:}")` 선언도 동일하게 통과.

**결론**: credential-plaintext-guard CI job 은 PASS.

---

### V5 — Flyway 마이그레이션 상태

V1~V15 전체 검색 결과:
- `e_tax_external_id VARCHAR(100)` — V2 기 등재, 현재 PR 에서 컬럼 추가 마이그레이션 불필요
- `submittedAt`, `submitMethod` — TaxInvoice 엔티티 필드로 **미존재**. EmitNtsResponse 에 포함되는 두 값은 `ETaxSubmitResult` 인메모리 레코드에서 가져오며 DB 에 저장되지 않음 — DDL 변경 필요 없음.

V16 불필요 여부: **신규 컬럼 추가는 불필요**. 단 D3 의 partial UNIQUE 인덱스 추가는 Phase 11 이전에 별도 V16 으로 권장.

---

### V6 — TaxInvoiceEmitNtsIT @MockBean 완결성

```java
@MockBean private SlipServiceClient slipServiceClient;  // 기존 격리 유지
@MockBean private ETaxClient eTaxClient;                // SP-09-1 신규 격리
```

8개 시나리오 모두 `eTaxClient` mock 을 사용한다:
- 시나리오 1/6/7 — `when(eTaxClient.submit(...)).thenReturn(ETaxSubmitResult.success(...))`
- 시나리오 8 — `when(eTaxClient.submit(...)).thenThrow(BusinessException(ETAX_SUBMIT_FAILED))`
- 시나리오 2/3/4/5 — ETaxClient 호출 전 guard 검증으로 종료, mock 불필요

IT 격리 의무 (`feedback_it_mockbean_external_clients.md`) 준수 확인. **PASS**.

---

### V9 — CI matrix 영향

`ci.yml` `accounting+partner` 그룹:
```yaml
test-tasks: ':services:accounting-service:test :services:partner-service:test ...'
```

`TaxInvoiceEmitNtsIT` 는 `services/accounting-service/src/test/java/.../it/` 경로에 위치하므로 `:services:accounting-service:test` 에 자동 포함된다. 별도 그룹 추가 또는 test-tasks 수정 불필요.

timeout 30분 — 8개 IT 추가 (AbstractPostgresIT Docker skip 포함 시 평균 2~4초/건 추정) — 기존 timeout 내 수용 가능.

---

### V8 — Phase 11 AWS 호환성

`etax.submit-method` 기본값 `DRY_RUN` 이므로 Phase 11 이전까지 외부 NTS API 호출 없음. RDS automated backup (7일 retention) 은 `e_tax_external_id` 컬럼 단순 문자열 저장이라 backup 성능/용량 영향 없다. Phase 11 에서 `NTS_API_KEY` + `NTS_BASE_URL` 을 AWS SSM Parameter Store 에서 주입하는 방식은 코드 설계와 일치한다.

---

## 4. 결함 우선순위 요약

| 결함 | 심각도 | 설명 | 머지 차단 여부 |
|---|---|---|---|
| D4 — FE/BE 타입 불일치 (`REAL` vs `NTS`) | P1 | NTS 실 발행 시도 → 400 차단. UI 버튼 무력화 | **차단 권고** |
| D1 — ENV 템플릿 미갱신 | P2 | 신규 PC 또는 Phase 11 배포 시 무음 DRY_RUN 오인 위험 | 머지 전 수정 권고 |
| D2 — 기존 IT ETaxClient @MockBean 누락 | P3 | Phase 11 NTS 전환 시 IT 회귀 위험. 현재 DRY_RUN 에선 무해 | 머지 전 수정 권고 |
| D3 — e_tax_external_id UNIQUE 인덱스 미존재 | P3 | Phase 11 NTS 동시성 이슈 가능. V16 Phase 11 이전 완료 의무 | 별도 PR 허용 |

---

## 5. 긍정 평가

- `application.yml` 의 `etax` 블록은 설명 주석이 충실하며 모든 ENV 키가 `${VAR:default}` 형식을 준수한다.
- `ETaxClientImpl` 은 DRY_RUN / NTS 분기를 명확히 분리하고, 미지원 값 입력 시 DRY_RUN 으로 fallback 하는 방어 코드가 있다.
- `TaxInvoiceEmitService` 에서 ETaxClient 호출 **전** 상태 사전 검증 후 호출 — 불필요한 외부 API 호출 방지 설계 양호.
- `ErrorCode` 3건(`TAX_INVOICE_NOT_EMITTABLE` 422, `TAX_INVOICE_ALREADY_EMITTED` 409, `ETAX_SUBMIT_FAILED` 502) 적절한 HTTP 상태 코드 매핑.
- `TaxInvoice.markEmitted()` 도메인 메서드 내 이중 검증(상태 + eTaxExternalId null) 으로 도메인 불변식 보호.
- `AbstractPostgresIT` 에 `etax.submit-method` 를 별도 주입하지 않아도 application.yml 기본값 `DRY_RUN` 이 IT 에 적용되어 ETaxClientImpl 이 mock 없이도 기동 가능.
- GitGuardian / credential-plaintext-guard 모두 통과 — Phase 8 가드 정책 준수.
