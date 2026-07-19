# 전표 거래처 필수화 — 생명주기 전이 가드 (기획 spec v1 · OPUS 4.8)

- 브랜치 `feat/slip-partner-required-transition-guard` · 결정=**전이 가드**(개발책임자 2026-07-19 배치·AskUserQuestion·[[project_pending_decisions_2026_07_19]] 결정 3)
- 기준일: 2026-07-19 · 규모=M(slip BE + FE + 데이터 보정) · 회계체인(#823 다음)
- [[feedback_integrity_domain_policy_preconfirm]](본 배치로 선확인) · [[feedback_uuid_no_user_visibility]] · [[feedback_spec_cross_check_prior_decisions]]

## 0. 목표·비목표
- **목표**: OUTBOUND/INBOUND 전표가 **committed 단계(SENT 이후)로 전이할 때 거래처(`partner_id`) 필수** 보장. 거래처 없는 committed 전표가 회계 오귀속(#823 배분 원천 거래처·세금계산서·분개)의 뿌리이므로 전이 시점에 원천 차단.
- **DRAFT/SAVED(편집 단계)는 `partner_id` null 허용 유지**(실측 활성 DRAFT null **1926건** = 미완성 작성중·정당). → **컬럼 `partner_id NOT NULL` 비채택**(DRAFT 저장 차단이라 부적합·배치 초안 "BE NOT NULL" 정찰 반증 폐기).
- **비목표**:
  - 컬럼 `NOT NULL` 제약(위 사유).
  - 회계전표(Sales/Purchase Accounting)는 이미 #823 에서 원천 거래처 도출·검증하므로 본 슬라이스 밖(별 폼·별 경로).
  - 배분/과할당(#850)은 별 슬라이스.

## 1. 정찰 (실측)
- `Slip.partnerId`(`@Column(name="partner_id")` **nullable**·`Slip.java:101`) + 별도 `partner_code`·`partner_name` snapshot(UUID 비공개 가드).
- 전이 메서드: `save()`(DRAFT→SAVED·`:958`) · **`send()`(SAVED→SENT·`:968`)** · `accept()`(SENT→ACCEPTED·`:984`) · `process()` · `complete()` · `inspect()` …. `EDITABLE_STATUSES={DRAFT,SAVED}`.
- **전이 가드 지점 = `send()`**(편집 단계 → committed 진입 = SAVED→SENT). send() 통과 후 하위 상태는 partner 불변(편집 불가)이라 하나의 가드로 전 committed 라이프사이클 커버.
- **실측 위반 = SENT null 13 + REJECTED null 1**(전부 OUTBOUND): `created_by=00000000`(seed) 13 + dev_manager 1. **partner_code 有·partner_id null**(예 `P-2026-0002` 등) = 레거시 경로가 code 캡처했으나 id 미해소. → **backfill 후보**(code→partner_id 해소).
- `SlipSeeder`는 SENT 슬립을 `send()` 우회 직접 생성(`:259/287/300`)하나 **partnerId 설정함**(`:328` deterministicUuid) → 신규 seed 는 정상, 13은 stale legacy.
- FE `SlipFormPage.tsx`: `PartnerAutocomplete` 거래처 선택·**해제 가능**(D-R4-4·현재 선택적).

## 2. 결정
| # | 결정 | 근거 |
|---|---|---|
| D-1 | **`Slip.send()` 에 partner 가드**: `partner_id == null` 시 `BusinessException(INVALID_INPUT, "전표 전송 전 거래처를 지정해야 합니다")`(한국어). SAVED→SENT 전이에서만·DRAFT/SAVED 저장 무영향 | 정찰·전이 가드 |
| D-2 | **하위 전이 방어**: `accept()`(SENT→ACCEPTED) 진입에도 partner 불변식 재확인(레거시 13이 보정 전 partner 없이 progress 하는 것 차단). send() 가 1차·accept() 가 2차 방어 | 무결성 |
| D-3 | **컬럼 `partner_id` nullable 유지**(NOT NULL 비채택). DRAFT 1926 null 정당 | 실측 |
| D-4 | **FE `SlipFormPage` 전송 시 partner 필수**: 전송(send) 액션 전 partner 미선택이면 차단 + 한국어 안내. **DRAFT 저장은 partner 없이 허용**(편집 단계 유지). 폼 필드에 "전송 시 거래처 필수" 힌트 | 결정·DRAFT 유지 |
| D-5 | **13 legacy SENT/REJECTED null 보정 = 별도(best-effort backfill)**: partner_code 有 행은 partner-service 조회로 partner_id 해소·보정 runbook. dev seed 는 재시드 or 보정 스크립트. **본 슬라이스는 조사+runbook·prod cutover 시 실행**(코드 가드가 신규 위반 차단이 우선) | 결정 "별도 보정" |

## 3. 스코프
- **BE(slip)**: `Slip.send()` partner 가드(D-1) + `accept()` 방어(D-2). `SlipService`/컨트롤러 전송 경로 확인(가드가 도메인에 있어 전 경로 커버).
- **FE(desktop)**: `SlipFormPage` 전송 액션 partner 필수 검증(D-4) + 힌트. 전송 트리거(폼 내 or 목록/상세) 위치 확인해 그 지점 가드.
- **데이터**: 13 legacy 조사 + backfill runbook(D-5·별도).

## 4. 검증
- **BE 단위/IT**: DRAFT→SAVED(partner null 허용·통과) · SAVED→SENT partner null → **INVALID_INPUT 거부** · partner 有 → 통과 · SENT null(레거시 재현)→accept() 거부(D-2). 실 DB IT(Testcontainers·mock 아닌 flush).
- **FE**: 전송 시 partner 미선택 차단 · DRAFT 저장 partner 없이 성공 · design-system mock 스위트([[feedback_design_system_playwright_mock_suite]] 해당 시).
- **genuine** `--rerun-tasks --no-build-cache`·변경 모듈 전체.
- **라이브 QA**: 실서버 — 거래처 없이 전표 작성→DRAFT 저장 성공·전송 시도→거부(스샷)·거래처 지정 후 전송→성공(SENT partner 有).
- **회귀**: 기존 정상 전송(partner 有) 무영향·DRAFT 1926 무영향.

## 5. 팀 배치 (구현=CODEX LUNA)
- BE(slip): send() 가드 + accept() 방어 + 단위/IT(전이별 partner 불변식).
- FE(desktop): SlipFormPage 전송 partner 필수 + 힌트 + 테스트.
- 데이터: 13 조사 + backfill runbook(별도).

## 6. 개발책임자 flag / 열린 질문 (SOL 기획검수 대상)
- **13 보정 범위**: 본 슬라이스에 backfill 코드 포함 vs 별도 runbook(현 spec=별도). partner_code→partner_id 해소가 cross-service(partner-service)라 slip 마이그 단독 불가 — 보정 스크립트/엔드포인트 방식 검토.
- **하위 전이 가드 범위**: send()+accept() 2중이면 충분한가, 아니면 전 forward 전이(process/complete/…)마다 재확인 필요한가(편집 불가라 partner 불변이면 불요).
- **직접 생성 경로**: 주문→전표 전환([[project_order_slip_conversion]])이 send() 우회로 SENT 직행하나? (전환이 DRAFT 생성 후 send() 경유면 가드 적용·직접 SENT면 별 가드 필요).
