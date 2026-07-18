# #823 매출·매입전표 배분 원천 거래처 검증 (기획 spec · OPUS 4.8)

- 이슈: #823 · 브랜치 `feat/823-sales-allocation-partner-validation` · 결정=**불일치 차단 reject**(개발책임자 2026-07-19 배치·[[project_pending_decisions_2026_07_19]])
- 기준일: 2026-07-19 · 진실원: #823 이슈 본문 + 정찰(실 파일:라인) + repo reject 선례 3곳
- [[feedback_defect_family_sweep_fix]] · [[feedback_restclient_contract_test_false_green]] · [[feedback_uuid_no_user_visibility]] · [[feedback_it_mockbean_external_clients]]

## 0. 목표·비목표
- **목표**: 매출/매입전표에 원천 출고/입고전표를 배분할 때 **원천 전표 거래처 = 대상 전표 헤더 거래처** 를 검증하고 불일치 시 **차단 reject**(4xx). 회계 오귀속(세금계산서·분개·**일마감 `UNIQUE(closing_date, partner_id, closing_kind, source_kind)`**) 원천 차단.
- **핵심 결함**: `SlipLineSnapshot` 이 `partnerId` 를 안 실어와 검증이 **구조적으로 불가**. → 스냅샷에 거래처 추가 + 배분 검증 추가.
- **DB 마이그 = 0건**(양측 `partner_id` 컬럼 이미 존재·헤더 레벨).
- **비목표**: 전표 거래처 필수화(기존 1942 null backfill·BE NOT NULL)=별도 후속 슬라이스(단계적·핸드오프). 본 슬라이스는 **배분 시점 검증만**.

## 1. 결정 (OPUS 기획)
| # | 결정 | 근거 |
|---|---|---|
| D-823-01 | **`SlipLineSnapshot` += `UUID partnerId`** — slip-service `web/dto/SlipLineSnapshot.java` + accounting `client/SlipLineSnapshot.java` **양 record 동시**(같은 PR). `SlipInternalController.toSnapshot(slip,line)`(L374-390) 단일 빌더가 `slip.getPartnerId()` 실음(거래처=Slip 헤더·L101). 메시지엔 UUID 대신 `slipNo` 노출([[feedback_uuid_no_user_visibility]]) | 정찰 계약점 1·2 |
| D-823-02 | **롤링 배포 안전**: accounting 소비 record에 **`@JsonIgnoreProperties(ignoreUnknown=true)`** 부여(RestClient 기본 FAIL_ON_UNKNOWN=true라 producer/consumer 필드 비대칭 시 역직렬화 500). 양 record 동시 추가 + 이 애노테이션으로 순서 무관 안전 | 정찰 계약점 6 |
| D-823-03 | **`verifySourceAndAllocation(AllocationRequest ar, UUID headerPartnerId)`** 로 시그니처 확장 — slipType/status 통과 후·과할당 전에 **거래처 일치 검증**. 비교 = 헤더 `req.partnerId()`(NOT NULL) ↔ 스냅샷 `src.partnerId()`. 호출부(L58) 인자 추가 | 정찰 계약점 3·4 |
| D-823-04 | **원천 `partnerId == null`(legacy) → reject**(distinct 메시지 "원천 전표(전표번호) 거래처 정보 없음 — 거래처 확정 후 배분"). 검증 불가=오귀속 허용 불가(무결성 우선)·전표 필수화 backfill 유도. null 을 통과시키면 오귀속 은폐 | 결정 "차단 reject"·정찰 결정포인트 1 |
| D-823-05 | **신규 `ErrorCode.SAS_SOURCE_PARTNER_MISMATCH` = HTTP 422**(형제 검증 SAS_SOURCE_SLIP_TYPE_MISMATCH/NOT_CONFIRMED/OVER_ALLOCATION·기존 `SAS_PARTNER_MONTH_MISMATCH` 전부 422와 로컬 정합). 병합 미러(409)는 도메인 다름 | 정찰 계약점 5·결정포인트 2 |
| D-823-06 | **매출+매입 대칭 fix**(defect-family sweep·[[feedback_defect_family_sweep_fix]]) — `PurchaseAccountingSlipCreateAttemptService.verifySourceAndAllocation`(L71-92)에 **동일 결함**(INBOUND 배분·partner_id NOT NULL·분개/일마감 전파). 스냅샷 필드 추가가 이미 매입 소비자/테스트를 건드리므로 **같은 슬라이스에서 대칭 처리**(매출만 고치면 비일관). 매입은 원천=입고(INBOUND) | 정찰 결정포인트 3 |
| D-823-07 | **조용한 회귀 정렬**(컴파일러 미포착) — 기존 해피패스 테스트가 헤더 partnerId=`random UUID`·스냅샷 거래처 없음. 검증 추가 시 **스냅샷 partnerId 를 헤더와 동일 UUID 로 정렬**해야 정상생성/과할당/상태 테스트 green 유지(14곳 스냅샷 생성부) | 정찰 계약점 6 |

## 2. 스코프

### ① slip-service (producer)
- `web/dto/SlipLineSnapshot.java` += `UUID partnerId`. `web/SlipInternalController.toSnapshot(slip,line)` → `slip.getPartnerId()` 포함. **slip-service IT**(getSlipLine/getSlipLines 응답에 partnerId 노출 단언·응답 shape 강제).

### ② accounting-service (consumer)
- `client/SlipLineSnapshot.java` += `UUID partnerId` + `@JsonIgnoreProperties(ignoreUnknown=true)`.
- `service/SalesAccountingSlipCreateAttemptService.verifySourceAndAllocation` + 매출 create 흐름(L58 호출) — 거래처 일치 검증(null→reject).
- `service/PurchaseAccountingSlipCreateAttemptService.verifySourceAndAllocation` — 동일(매입 대칭·D-823-06).
- `shared/common/.../exception/ErrorCode.java` += `SAS_SOURCE_PARTNER_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY, ...)` (SAS 블록).
- **계약테스트** `client/SlipServiceClientTest.java` — JSON fixture에 `partnerId` 추가 + `assertThat(snapshot.partnerId())` 단언([[feedback_restclient_contract_test_false_green]] — fixture 수동 동기화 필수·미하면 false-green).

## 3. 검증 매트릭스
- **accounting 단위/IT**: 거래처 불일치 배분→`SAS_SOURCE_PARTNER_MISMATCH`(422) 거부 · null 원천→거부 · 일치→정상 통과(매출+매입 각). 기존 14곳 스냅샷 생성부 헤더 UUID 정렬로 정상생성/과할당/상태 테스트 green(회귀 0). `SlipServiceClientTest` partnerId 파싱 단언.
- **slip 단위/IT**: `toSnapshot` partnerId 포함·`SlipInternalController` 응답 partnerId 노출(@MockBean 외부클라이언트 [[feedback_it_mockbean_external_clients]]).
- **크로스서비스**: producer(slip)↔consumer(accounting) 필드 정합·@JsonIgnoreProperties 역직렬화 안전.
- **genuine**: `--rerun-tasks`([[feedback_gradle_test_cache_false_green]])·변경 모듈 전체([[feedback_changed_module_full_test_before_push]]). **CI ci.yml `--tests` allowlist**에 신규 테스트 등재([[feedback_ci_test_filter_false_green]]).
- **라이브QA**: 실서버 — 거래처 A 출고전표를 거래처 B 매출전표에 배분 시도→거부(스샷)·동일 거래처→정상. 매입 동일.

## 4. 리스크
- **최대=조용한 회귀**(14곳 스냅샷 헤더 UUID 미정렬 시 기존 테스트 오탐 실패) → D-823-07 정렬 + genuine 전체 실행.
- 롤링 배포 역직렬화 비대칭(FAIL_ON_UNKNOWN)→@JsonIgnoreProperties+동시 추가. 계약테스트 false-green→fixture 수동 동기화+단언.
- legacy null 원천 배분 차단이 정상 업무 차단?→전표 필수화 backfill 슬라이스가 해소(단계적·본 슬라이스는 무결성 우선 reject).

## 5. 팀 배치 (구현=CODEX LUNA)
- BE(slip): SlipLineSnapshot+toSnapshot partnerId + slip IT.
- BE(accounting): 양 record + 매출/매입 verify + ErrorCode + 계약테스트 fixture + 14곳 정렬 + 신규 reject/pass 테스트.

---
연관 Issue: #823
