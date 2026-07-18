# #823 매출·매입전표 배분 원천 거래처 검증 (기획 spec v2 · OPUS 4.8)

- 이슈: #823 · 브랜치 `feat/823-sales-allocation-partner-validation` · PR #849 · 결정=**불일치 차단 reject**([[project_pending_decisions_2026_07_19]])
- 기준일: 2026-07-19 · **v2 = CODEX SOL 기획검수 NO-GO(B1·H5·M5·L1) 반영**
- [[feedback_defect_family_sweep_fix]] · [[feedback_restclient_contract_test_false_green]] · [[feedback_uuid_no_user_visibility]] · [[feedback_reconvergence_before_merge]]

## 0. 목표·비목표
- **목표**: 매출/매입전표 **배분(create/draft) 시점**에 원천 출고/입고전표 거래처 = 대상 헤더 거래처 검증·불일치/결손 **차단 reject**(422). 회계 오귀속(세금계산서·분개·일마감 UNIQUE 키) 원천 차단.
- **DB 마이그 0건**(양측 `partner_id` 컬럼 존재).
- **비목표(명시 스코프 경계)**:
  - **배분 이후 원천 전표 거래처 변경**(revision restore로 CONFIRMED 원천 partner 변동·`post()` 재검증)은 **본 슬라이스 밖**(H-post·§6 flag) — 배분 시점 불변식만 보장. CONFIRMED 전표 거래처 변경 자체가 별개 무결성 이슈.
  - **동일 요청 내 같은 원천 라인 중복 배분 과할당**(요청 내 누적 미반영·원천100에 60+60 통과)은 **별개 결함 계열(over-allocation)** → PM 자율 별건 이슈 등록(§6·본 슬라이스는 거래처 검증만).
  - 전표 거래처 필수화(1940 null backfill·BE NOT NULL)=별도 후속(단계적).

## 1. 결정 (SOL 기획검수 반영)
| # | 결정 | 근거 |
|---|---|---|
| D-823-01 | **`SlipLineSnapshot` += `UUID partnerId`** — slip `web/dto` + accounting `client` 양 record. `SlipInternalController.toSnapshot(slip,line)`(L374-390)가 `slip.getPartnerId()`(헤더 L101) 실음. 메시지엔 `slipNo`(UUID 금지) | 정찰 |
| D-823-02 | **배포 순서 계약 = producer(slip) → consumer(accounting)**(SOL-B). consumer-first면 구 producer 응답 partnerId 부재→null→**전 배분 reject**(D-823-04와 상호작용)이라 위험. slip 배포·readiness 확인 후 accounting 배포. accounting record `@JsonIgnoreProperties(ignoreUnknown=true)`(미지 필드 무시)는 **양방향 안전 아님·순서 계약 필수**. deploy runbook에 순서 명시 | SOL-BLOCKING |
| D-823-03 | **`verifySourceAndAllocation(AllocationRequest ar, UUID headerPartnerId)`** — slipType/status 통과 후·과할당 전 거래처 검증. **배분 루프(L58)서 원천마다 검증** | 정찰·SOL-H |
| D-823-04 | **오류 코드 2종**(SOL-M): 값 불일치=**`SAS_SOURCE_PARTNER_MISMATCH`(422)**, 원천 결손(null)=**`SAS_SOURCE_PARTNER_MISSING`(422)** — 운영 추적·조치 구분. 둘 다 형제 검증·`SAS_PARTNER_MONTH_MISMATCH`와 422 정합. null 원천=reject(무결성 우선·통과 시 오귀속 은폐) | SOL-M·결정 |
| D-823-05 | **원천 identity 권위 = 스냅샷**(SOL-H): 저장되는 `sourceSlipId/sourceSlipNo`가 client 값 그대로 신뢰되면 line은 A전표 소속인데 payload가 B전표 지칭하는 분열 가능. **`getSlipLine(sourceLineId)` 스냅샷의 `slipId/slipNo`를 저장 권위로**(또는 요청 값과 일치 검증). 거래처 검증도 이 스냅샷 기준 | SOL-HIGH |
| D-823-06 | **대상 헤더 거래처 필수 검증 선행**(SOL-M): `CreateSalesAccountingSlipRequest.partnerId`에 `@NotNull` 없고 controller `@Valid` 없음. **원천 조회 전 헤더 partner 필수 검증**(누락→명확한 400/422·"원천 불일치" 오진 방지). 매출·매입 동일 | SOL-MED |
| D-823-07 | **매출+매입 대칭**(defect-family·[[feedback_defect_family_sweep_fix]]) — `PurchaseAccountingSlipCreateAttemptService`(L71-92·INBOUND) 동일 처리. SOL 확인: 매입처=단일 헤더 partner 의미 정합 | SOL 확인 |
| D-823-08 | **조용한 회귀 정렬 = 전수 20곳**(SOL-M·14 아님): accounting `new SlipLineSnapshot(...)` = service unit 14 + controller IT 6 = **20곳** + IT helper의 헤더 random UUID → **20곳 모두 동일 partner fixture 공유**(스냅샷 partnerId==헤더 partnerId). arity는 컴파일러가 잡으나 UUID 오정렬은 미포착 | SOL-MED |

## 2. 스코프
### ① slip-service (producer·먼저 배포)
- `web/dto/SlipLineSnapshot.java` += partnerId. `toSnapshot` → `slip.getPartnerId()`. **slip IT**: `getSlipLine`/`getSlipLines` 응답에 partnerId 정확 UUID 단언(단건+목록·응답 shape 강제).
### ② accounting-service (consumer·나중 배포)
- `client/SlipLineSnapshot.java` += partnerId + `@JsonIgnoreProperties(ignoreUnknown=true)`.
- `SalesAccountingSlipCreateAttemptService`·`PurchaseAccountingSlipCreateAttemptService`: verify 시그니처 확장·거래처 검증(불일치/결손/원천 identity)·헤더 partner 필수 선검증.
- `ErrorCode.java` += `SAS_SOURCE_PARTNER_MISMATCH(422)`·`SAS_SOURCE_PARTNER_MISSING(422)`.
- **계약테스트** `SlipServiceClientTest`(SOL-M): partnerId 파싱 + **필드 누락→null 파싱 + unknown-field 허용 + `getSlipLines` 목록 파싱** 단언(단순 fixture 필드 추가만은 롤링 미검증).

## 3. 검증 매트릭스
- **accounting 단위/IT**: 매출·매입 각 — 불일치→MISMATCH(422)·null 원천→MISSING(422)·일치→통과·**다중 원천 혼합 `[A일치, B불일치]`→2번째서 전 트랜잭션 rollback·전원 일치→통과**(SOL-H·루프 전원 검증 증명)·헤더 partner 누락→선검증 거부·**원천 identity(payload sourceSlipId≠스냅샷 slipId) 거부/권위화**. 기존 20곳 스냅샷 헤더 UUID 정렬로 정상생성/과할당/상태 green(회귀 0).
- **slip IT**: toSnapshot partnerId·응답 노출(@MockBean 외부클라이언트).
- **착수 preflight**(SOL-M): 배포 대상 환경 `SELECT count(*) FROM slips WHERE status='CONFIRMED' AND partner_id IS NULL` = 0 확인 + 보정 runbook. (실측 로컬: 활성 null 1940[DRAFT 1926·SENT 13·REJECTED 1]·**CONFIRMED null 0**·배분가능 OUTBOUND 4/INBOUND 1 → 현 과차단 0. SENT 13은 partner 없이 CONFIRMED 전이 가능 주의.)
- **genuine**: `--rerun-tasks`·변경 모듈 전체([[feedback_changed_module_full_test_before_push]]). accounting/slip 모듈 full 테스트(신규 테스트 자동 포함·별도 ci.yml allowlist 수정 불요·SOL-L). JUnit report 존재·skipped=0 확인.
- **라이브QA**: 실서버 — 거래처 A 출고를 B 매출에 배분→거부(스샷)·동일→정상. 매입 동일.

## 4. 리스크
- **최대=배포 순서**(consumer-first→전 배분 reject)→D-823-02 순서 계약. **조용한 회귀**(20곳 미정렬)→D-823-08 전수 정렬+genuine.
- 원천 identity 미검증(분열 배분)→D-823-05 스냅샷 권위. 계약테스트 false-green→롤링 4-단언.

## 5. 팀 배치 (구현=CODEX LUNA)
- BE(slip): SlipLineSnapshot+toSnapshot partnerId + slip IT.
- BE(accounting): 양 record + 매출/매입 verify(거래처·identity·헤더필수) + ErrorCode 2종 + 계약테스트 롤링 + 20곳 정렬 + 다중원천/혼합 테스트.

## 6. 개발책임자 flag / 별건 (PM 자율 등록)
- **[별건·over-allocation 계열]** 동일 요청 내 같은 원천 라인 중복 배분 시 요청 내 누적 미반영(원천100에 60+60 통과) — #823(거래처) 범위 밖·별개 결함 → PM 자율 이슈 등록([[feedback_fix_in_current_pr_no_split]]).
- **[스코프 경계]** 배분 이후 원천 CONFIRMED 전표 거래처 변경(revision restore)+`post()` 미재검증 — 배분 시점 불변식만 보장(§0). 필요 시 후속(source partner snapshot 또는 post 재검증).

---
연관 Issue: #823
