# 전표 거래처 필수화 — 생명주기 전이 가드 (기획 spec v3 · OPUS 4.8)

- 브랜치 `feat/slip-partner-required-transition-guard` · PR #853 · 결정=**전이 가드**(개발책임자 2026-07-19 배치·AskUserQuestion·[[project_pending_decisions_2026_07_19]] 결정 3)
- 기준일: 2026-07-19 · 규모=**L**(slip BE 다지점 + 주문발행 + FE + cutover 보정) · 회계체인(#823 다음)
- **v1 → SOL NO-GO(BLOCK 3·HIGH 2·MED·LOW) → v2 → SOL NO-GO(BLOCK 0·전 해소·잔여 HIGH=D-6 cutover 세부) → v3=D-6 확정(결정 고정·cutover 순서·실행 SQL·SENT 정정)**
- [[feedback_integrity_domain_policy_preconfirm]](본 배치로 선확인) · [[feedback_uuid_no_user_visibility]] · [[feedback_jeonpyo_not_slip]] · [[project_order_slip_conversion]]

## 0. 목표·비목표
- **목표**: OUTBOUND/INBOUND 전표가 **committed 상태에 진입/유지할 때 거래처(`partner_id`) 필수** 불변식 보장. 거래처 없는 committed 전표가 회계 오귀속(#823 배분 원천·세금계산서·분개)의 뿌리이므로 원천 차단.
- **DRAFT/SAVED(편집 단계)는 `partner_id` null 허용 유지**(실측 활성 DRAFT null **1926건** 정당). → **컬럼 `partner_id NOT NULL` 비채택**(DRAFT 저장 차단·배치 초안 "BE NOT NULL" 정찰 반증 폐기).
- **비목표**: 컬럼 NOT NULL · 회계전표(Sales/Purchase Accounting = `accounting_db` 별 엔티티·`partner_id nullable=false`·#823 원천 도출·본 슬라이스 무관·충돌 없음 SOL 확인) · 과할당(#850 별 슬라이스).

## 1. 불변식·필수 상태 집합 (SOL-HIGH2)
- **불변식**: `status ∈ REQUIRED_PARTNER_STATUSES ⟹ partner_id != null`.
- **`REQUIRED_PARTNER_STATUSES` = {SENT, ACCEPTED, PROCESSING, INSPECTING, COMPLETED, SHIPPING, DELIVERED, CONFIRMED, REJECTED}** (도메인 상태 집합·ordinal "SENT+" 아님).
  - **CANCELED 제외**: DRAFT/SAVED 에서도 도달 가능(거래처 null 정당). 커밋 후 취소 vs DRAFT/SAVED 취소 차이 문서화.
  - **REJECTED 포함**: SENT 이후 도달·실측 null 위반 1건 존재. legacy SENT 가 보정 전 `reject()` 되면 null 유지되므로 필수.

## 2. 정찰 (실측)
- `Slip.partnerId`(`@Column(name="partner_id")` **nullable**·`Slip.java:101`) + 별도 `partner_code`·`partner_name` snapshot(UUID 비공개).
- 전이: `save()`(DRAFT→SAVED·`:958`) · **`send()`(SAVED→SENT·`:968`·유일 SENT 진입 경로)** · `accept()`·`process()`·`complete()`·`inspect()`… `EDITABLE_STATUSES={DRAFT,SAVED}`.
- **committed 상태에서 `partner_id` 가 변할 수 있는 경로 전수**(SOL):
  - ① `send()` — SAVED→SENT 진입.
  - ② **`Slip.restoreFromSnapshot()`(`:2041`)** — revision 복원이 snapshot 의 partnerId 를 그대로 복원(상태 유지). 표준(`SlipRevisionService:196`)+**협업(`SlipDocumentCollaborationPort:234`)** 양 경로. SENT 자유·ACCEPTED/PROCESSING/CONFIRMED 승인후·COMPLETED 미차단 → **커밋 상태가 null-partner snapshot 으로 복원되면 불변식 위반**(현 DB 0건이나 코드상 허용).
  - ③ **주문→전표 발행** — `SlipPublishService.createOutbound(...,partnerId=null,...)`(`:219`) 후 `send()`(`:258`)·병합(`:314/:355`). 요청 DTO 는 `partnerCode`만·`partnerId` 없음(`PublishFromPartnerOrderRequest:27`·`PublishFromOrdersMergeRequest:37`). **가드만 넣으면 주문 발행 전면 중단**(이미 완료된 부분전환·병합 경로 회귀).
  - ※ Seeder 는 `send()` 우회 아님 — `save()`→`send()`(`:389`) 정상 경유(v1 오독 정정). production 전수 검색상 `send()` 우회 SENT 직행 경로 **없음**.
- **실측 위반 = 활성 partner null · 필수 상태 = 14건**(전부 OUTBOUND): **SENT 13 + REJECTED 1**. 이 중 **13건은 `partner_code` 有**(`partner_db` 활성 거래처로 해소 가능)·**1건(SENT·code 無)은 name `대구HVAC솔루션` → 활성 거래처 `P-2026-0005` 단일 매칭**(SOL 재실측: code 無 전표는 REJECTED 아닌 **SENT**·v2 오분류 정정). ⚠️ 14건은 고정 입력 아님 — **보정 실행 시점에 전체 위반 행 재조회**(그 사이 신규 위반 반영).
- **cross-service**: `slip_db` 에 거래처 마스터 없음 → slip 단독 SQL/Flyway 보정 불가·partner-service 조회 필요. `PartnerInternalClient`(`:233`)는 이미 검증 시 `partnerId` 반환 가능(현재 폐기).
- FE: **전송(SAVED→SENT) 액션은 `SlipDetailPage.tsx:244`**(mobile `handleTransition:1365` · desktop `handleAdvanceStage:1464`). `SlipFormPage`(`:810`)는 DRAFT 생성·저장만·전송 액션 없음(v1 오타깃 정정).

## 3. 결정
| # | 결정 | 근거 |
|---|---|---|
| D-1 | **`Slip.send()` partner 가드**: `partner_id == null` 시 `BusinessException(INVALID_INPUT,"전표 전송 전 거래처를 지정해야 합니다")`. SAVED→SENT 에서만·DRAFT/SAVED 저장 무영향 | 정찰·전이 가드 |
| D-2 | **`Slip.restoreFromSnapshot()` 공통 가드**(SOL-BLOCK2): 복원 결과 `status ∈ REQUIRED_PARTNER_STATUSES` 이고 `snapshot.partnerId == null` 이면 거부(`BusinessException`,"거래처 없는 이력으로 커밋 전표를 복원할 수 없습니다"). **도메인 공통점에 배치**(표준+협업 revision 양 경로 커버·서비스 단일 가드는 협업 우회) | SOL-BLOCK2 |
| D-3 | **주문→전표 발행 partnerId 해소**(SOL-BLOCK1): `SlipPublishService` 단일·병합 발행이 거래처 검증(`PartnerInternalClient:233`) 결과의 `partnerId` 를 `createOutbound` 에 전달(현재 폐기값 활용). **`FOUND + partnerId 존재`만 성공** — `NOT_FOUND/SERVER_ERROR/SKIPPED/FOUND-empty` 전부 **fail-closed**(커밋 전표를 거래처 없이 발행 금지·명확한 한국어 오류). 공유 helper 의 strict-off·**5xx fail-open 은 주문 발행 경로에서 우회/폐기**(SOL). 멱등 재시도·outbox 회귀 포함 | SOL-BLOCK1 |
| D-4 | **컬럼 `partner_id` nullable 유지**(NOT NULL 비채택·DRAFT 1926 정당) | 실측 |
| D-5 | **FE `SlipDetailPage` 전송 preflight partner 필수**(SOL-BLOCK3): mobile `handleTransition`+desktop `handleAdvanceStage` **공통 진입점**에 SAVED→SENT 전 partner null 차단 + 한국어 안내("거래처를 먼저 지정하세요 — 수정에서 지정"). **`SlipFormPage` DRAFT 저장은 거래처 없이 허용 유지**. BE 가드(D-1)가 권위 backstop | SOL-BLOCK3 |
| D-6 | **위반 보정 = 동일 릴리스 cutover**(SOL-HIGH1·"별도 후속 보정 NO-GO"·§8 runbook). **결정 고정**(개방 옵션 폐기): code 有 = partner-service `partner_code→partner_id` 해소 자동·**code 無 1건(SENT `대구HVAC솔루션`) = `P-2026-0005` 단건 운영 승인 매핑**(격리/취소 비채택). slip 단독 마이그 불가 → **보정 = slip-service internal 보정 엔드포인트 코드 아티팩트**(D-8·SOL R2 dim4/dim5·3모델: runbook 산문만은 prod 재현·감사 불가·머지 차단): 필수 9상태 partner_id NULL 활성 재조회→partner_code 를 `PartnerInternalClient` FOUND+partnerId 해소(미해소 skip+리포트)→멱등 갱신+audit·**dry-run 지원**·처리/미해소 count 반환. code 無(대구HVAC솔루션)=미해소 리포트→운영 승인 단건 매핑. **cutover 순서 = ①D-1~D-7 전 인스턴스 배포+구버전 drain → ②보정 엔드포인트(dry-run→실행) → ③검증 쿼리 0**(§8). 검증 0 이 별도 수용조건 | SOL-HIGH1/dim4/dim5 |

## 4. 스코프
- **BE(slip 도메인)**: `send()` 가드(D-1) + `restoreFromSnapshot()` 가드(D-2·`REQUIRED_PARTNER_STATUSES` 상수) + **전 forward 전이(accept/process/complete/inspect/ship/deliver/confirm/reject) partner 불변식 강제**(D-7·SOL R2 dim5): 공통 `requirePartnerForCommitted()` 를 각 committed 전이 진입부에 호출. legit 전표는 send() 로 이미 partner 보유라 무영향·**legacy null(배포~보정 창구) 이 committed 로 progress 하는 것 코드 차단**(불변식을 데이터+cutover 의존 아닌 코드 강제).
- **BE(slip 발행)**: `SlipPublishService` 단일·병합 partnerId 해소·fail-closed(D-3).
- **FE(desktop/mobile)**: `SlipDetailPage` 전송 preflight 공통 가드(D-5).
- **데이터**: 14건 cutover 보정 runbook + 검증 쿼리(D-6).

## 5. 검증
- **BE 단위/IT**(실 DB·mock 아닌 flush): DRAFT→SAVED(null 허용 통과)·SAVED→SENT null→거부·partner 有→통과. **restoreFromSnapshot**: 커밋 상태+null snapshot→거부·partner 有 snapshot→통과·DRAFT 상태 복원 null→허용(표준+협업 양 경로 IT). **주문 발행**: 단일·병합 partnerId 해소 후 SENT 성공·partner 미해소→fail-closed·멱등 재시도. 필수집합 각 상태 불변식.
- **FE**: SlipDetailPage 전송 시 partner null 차단(mobile+desktop 공통)·partner 有 전송 성공·SlipFormPage DRAFT null 저장 성공. design-system/전표 상세 회귀([[feedback_design_system_playwright_mock_suite]] 해당 시).
- **genuine** `--rerun-tasks --no-build-cache`·변경 모듈 전체(slip + desktop). CI ci.yml allowlist 신규 IT 등재 확인.
- **라이브 QA**: 실서버 — 거래처 없이 작성→DRAFT 저장 성공·SlipDetailPage 전송 시도→거부(스샷)·거래처 지정 후 전송→SENT partner 有. **주문→전표 발행→SENT partner 자동해소 성공**(회귀). revision 복원 거부. 14건 보정 후 검증 쿼리 0.
- **회귀**: 기존 정상 전송·주문 발행·DRAFT 1926 무영향.

## 6. 팀 배치 (구현=CODEX LUNA)
- BE(slip): send()+restoreFromSnapshot() 가드 + REQUIRED_PARTNER_STATUSES + 단위/IT(전이·복원·필수집합).
- BE(slip): SlipPublishService 단일·병합 partnerId 해소·fail-closed + IT(발행·멱등).
- FE(desktop/mobile): SlipDetailPage 전송 preflight 공통 가드 + 테스트.
- 데이터: 14건 보정 runbook(13 code·1 name-map) + 검증 쿼리 + dev 실행.

## 7. 개발책임자 flag
- **해소 완료**: code 無 1건(SENT `대구HVAC솔루션`) = `P-2026-0005` 단건 매핑 확정(격리/취소 폐기). 나머지 13 = code 해소 자동. name 자동매칭은 이 단건 운영 승인에 한정(일반 규칙 아님).

## 8. Cutover runbook (실행 절차·D-6)
1. **배포**: D-1~D-3(send/restore 가드·주문발행 partnerId 해소) 전 인스턴스 배포 + **구버전 drain**(무중단 시 신규 위반 생성 차단).
2. **동적 보정**(실행 시점 위반 재조회·고정 14 아님): partner-service 경유로 `partner_code→partner_id` 해소(13 자동)·`대구HVAC솔루션`→`P-2026-0005`(단건 승인). 미해소 잔여는 격리 후 개발책임자 보고.
3. **검증**(반환 `0` = 수용조건):
```sql
SELECT count(*) AS violations
FROM slips
WHERE partner_id IS NULL
  AND status IN ('SENT','ACCEPTED','PROCESSING','INSPECTING',
                 'COMPLETED','SHIPPING','DELIVERED','CONFIRMED','REJECTED')
  AND is_deleted = false;
```
