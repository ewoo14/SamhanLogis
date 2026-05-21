# MIG-19 이카운트 cutover 가이드

> 날짜: 2026-05-21
> 브랜치: `spec/2026-05-21-mig-19-cutover-guide`
> 범위: docs only

---

## 1. 배경

MIG-1~11로 이카운트 raw 적재, 도메인 변환, Cash → Journal, Partner aging snapshot, DailyClosing 대조가 완성됐고 MIG-14~18로 운영자 admin UI가 준비됐다. MIG-19는 운영자가 실제 cutover 순서를 따라갈 수 있도록 사전 준비, 11단계 실행, UI 확인, 롤백, 사후 검증을 한 문서로 묶는다.

---

## 2. 변경 요약

| 파일 | 변경 |
|---|---|
| `docs/migration/ECOUNT-CUTOVER-GUIDE.md` | 운영자용 이카운트 cutover 절차 신규 작성 |
| `docs/dev-reports/mig-19-cutover-guide.md` | 본 dev-report 신규 작성 |
| `migration/decisions/DECISIONS.md` | D-MIG-19 결정 6건 추가 |
| `docs/handoff/CURRENT-WORK.md` | MIG-19 docs-only 진행 블록 추가 |
| `docs/samhan-public-overview.html` | Phase 10.6 진행 현황과 MIG-19 운영 가이드 링크 갱신 |

---

## 3. 가이드 구성

- 사전 준비: raw 11종 다운로드 위치, DB 백업, `X-Internal-Token`, 운영자 권한 검증
- 단계별 절차: MIG-1~11 순서, endpoint, 응답 sample, 로그 위치
- admin UI 트레이닝: Cash, Order, AgingSnapshot, Ledger 화면 사용법
- 롤백: soft-delete 복구, `JD-`/`JR-` journal 번호 충돌 확인, staging `PENDING` 재실행
- 사후 검증: DailyClosing SQL, sample 5건 cross-check, ErrorCode 분포 통계
- FAQ: REJECTED 다량 발생, ACCOUNTANT 403, AgingSnapshot refresh 실패

---

## 4. 결정

| 결정 | 내용 |
|---|---|
| D-MIG-19-01 | cutover 문서는 개발자가 아닌 운영자 대상 한국어 문서로 작성한다. |
| D-MIG-19-02 | MIG-1~11 실행 순서를 그대로 유지하고, 각 단계에 endpoint와 응답 sample을 둔다. |
| D-MIG-19-03 | admin UI 트레이닝은 MIG-14~18의 Cash / Order / AgingSnapshot / Ledger 화면 기준으로 정리한다. |
| D-MIG-19-04 | 롤백은 hard delete가 아니라 soft-delete 복구와 staging `PENDING` 재실행 중심으로 안내한다. |
| D-MIG-19-05 | cutover 가이드의 ground truth는 spec 초안이 아니라 실 BE 코드/Flyway grep 결과로 둔다. endpoint, record 필드, ErrorCode status, SQL 컬럼은 문서 작성 전 실제 코드에서 확인한다. |
| D-MIG-19-06 | 사이클 2는 옵션 C의 가치를 입증했다. 사이클 1 1c/1e/1f가 잡지 못한 transform/journal/backfill DTO sample 결함을 재검토 단계에서 잡았다. |
| D-MIG-19-07 | ground truth 의무를 실 BE record/DTO grep까지 강화한다. 응답 sample은 controller 추정이나 spec 초안이 아니라 shared/common record 정의와 test fixture를 확인한 뒤 작성한다. |
| D-MIG-19-08 | Journal 번호 충돌 회피는 MIG-13 정정 결과인 CashDisbursement `JD-`, CashReceipt `JR-` 접두사를 명시한다. |
| D-MIG-19-09 | MIG-19는 docs-only 슬라이스로 유지하고 코드, Flyway, 권한 seed를 변경하지 않는다. |

---

## 5. Cycle 1c CRITICAL 정정

docs-review에서 운영자 즉시 실패 risk가 확인됐다. 원인은 spec 작성 시 실 BE 코드/Flyway를 먼저 확인하지 않고 sample JSON과 SQL을 가공한 것이다. MIG-17에서 enum 라벨을 실 enum 확인 없이 덮어쓴 패턴이 반복됐으므로, MIG-19 문서 ground truth를 실 코드 grep으로 격상했다.

정정 내용:

| 항목 | 정정 |
|---|---|
| C19-P0-1 | 롤백/검증 SQL을 `modified_at`/`modified_by`, `reject_reason` 기준으로 정정 |
| C19-P0-2 | accounting schema prefix 제거, cross-DB `partner.partners` JOIN 제거, partner-service batch lookup 안내 |
| C19-P0-3 | MIG-1 응답 sample을 `EcountPartnerImportResult` record 필드와 `reason/rawPartnerCode/rawName` sample로 정정 |
| C19-P1-1 | MIG-2 product upload multipart를 `itemFile` 필수, `relationFile`/`groupFile` 선택 3-part로 정정 |
| C19-P1-2 | `MIG9_AGING_REFRESH_FAILED` status를 ErrorCode.java 기준 422로 정정 |
| C19-P1-3 | DailyClosing SQL에 `source_kind` 의도를 명시하고 V21 unique index 구조와 맞춤 |
| C19-P2/MIN | `X-Internal-Token`은 운영자 호출이 아닌 service-to-service 헤더로 분리하고, `pg_dump` 인증/ACCOUNTANT seed/Rejection sample message를 보강 |

---

## 6. Cycle 2c DTO sample 정정

Claude 2a 5-agent 재실행에서 transform/journal/backfill 결과 DTO 샘플 불일치가 추가 확인됐다. 사이클 1 1c/1e/1f는 SQL, ErrorCode, endpoint, rollback 중심 결함을 잡았지만, MIG-8/9/10/11 응답 sample의 실제 record 필드 대조가 누락됐다.

정정 내용:

| 항목 | 정정 |
|---|---|
| C19-CLAUDE-2A-P1-1 | MIG-8 sample을 `EcountMig8TransformResult` 기준 `completedLinkedSlipCount`, `samples`, `level/code/businessKey/rawValue` 구조로 정정 |
| C19-CLAUDE-2A-P1-2 | MIG-9 sample을 `EcountMig9JournalResult` 기준 `samples`와 `level/code` 포함 구조로 정정 |
| C19-CLAUDE-2A-P1-3 | MIG-10 sample을 `EcountMig10Result` 기준 `backfilled`, `lookupMissCount`, `ambiguousCount`, `samples` 구조로 정정 |
| C19-CLAUDE-2A-P2-1 | MIG-11 `dailyClosingMismatchSamples`를 `closingValue`, `diffValue`, `message` 필드 기준으로 정정 |

회고:

- 옵션 C 사이클 2 재검토가 사이클 1에서 놓친 DTO sample 결함을 잡아냈다.
- cutover 가이드의 endpoint 응답 sample은 반드시 `shared/common/src/main/java/.../ecount/*Result.java` record를 grep한 뒤 작성한다.
- controller/service 흐름만 확인하면 응답 field name drift를 놓칠 수 있으므로, record 정의와 IT fixture를 함께 확인한다.

---

## 7. 검증

- `git diff --check` PASS 예정
- docs-only 변경이라 Gradle, npm, Playwright 실행 대상 없음
- 실 BE 코드 grep 확인 대상:
  - `shared/common/.../ErrorCode.java` — `MIG9_AGING_REFRESH_FAILED(HttpStatus.UNPROCESSABLE_ENTITY)`
  - `services/product-service/.../EcountProductImportController.java` — `@RequestPart("itemFile")`, `relationFile`, `groupFile`
  - `services/partner-service/.../EcountPartnerImportResult.java` — MIG-1 record 필드
  - `services/accounting-service/.../V27/V31` — `modified_at`/`modified_by`, `reject_reason`, default public schema
  - `services/accounting-service/.../V21` — DailyClosing unique index `closing_date, partner_id, closing_kind, source_kind`
  - `shared/common/.../EcountMig8TransformResult.java` — MIG-8 응답 record와 `Sample`
  - `shared/common/.../EcountMig9JournalResult.java` — MIG-9 응답 record와 `Sample`
  - `shared/common/.../EcountMig10Result.java` — MIG-10 backfill 응답 record와 `Sample`
  - `shared/common/.../EcountMig11Result.java` — `DailyClosingMismatchSample` 필드

---

## 8. 운영 메모

- 운영 raw 파일은 `docs/migration/ecount-data/raw/`에 보관하되 Git에는 올리지 않는다.
- cutover 전 `pg_dump accounting_db` 백업을 완료해야 한다.
- `ACCOUNTANT`는 조회 중심 권한이므로 import/transform/refresh 실행은 MASTER/MANAGER 계정으로 진행한다.
- AgingSnapshot refresh는 `REFRESH MATERIALIZED VIEW CONCURRENTLY` 계약 때문에 대량 변환이 끝난 뒤 실행한다.
