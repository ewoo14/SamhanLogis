# 슬3 — 타배송사 문자(SMS) 발송 (external_dispatch) Implementation Plan

> **실행 = canonical workflow([[feedback_canonical_workflow]])**: Opus 기획+조기PR → **Codex 개발** → Opus·Codex 순차 듀얼리뷰(각 라운드 단계별 라이브QA 스샷) → 0수렴 → PM 종합 게시 → 머지. Claude 직접 구현 금지(리뷰 라운드 fix 예외). 체크박스(`- [ ]`) 추적.

**Goal:** 검수 완료(발송 대기) 출고전표를 **외부기사/배송사(external_carrier)별로 묶어 SMS 발송**(notification-service Aligo 재사용) + `slip.dispatchStatus=DISPATCHED` 전이 + 발송 이력(`external_dispatch`) 기록.

**Architecture:** slip-service에 `external_dispatch`(1) → `external_dispatch_slip`(N) 신규 테이블(Flyway **V50**) + ExternalDispatch 도메인/Repository/Service/Controller. 발송대기 목록(슬1 `DispatchBoardAdminController` 진입점)에서 **타배송사 채널 선택 → 기사(external_carrier) 선택 → 기사별 전표 묶음 발송**: `NotificationClient.sendExternalSms`(재사용, EXTERNAL_PHONE/SMS) + `Slip.markDispatchedExternally()` 전이 + external_dispatch 기록. FE는 `routes/dispatch-board`에 채널분기 + 기사선택 모달 추가. **타배송사=단방향 종료**(회신 추적 없음 — 비목표). 인쇄(PRINT)는 슬4.

**Tech Stack:** Spring Boot 3 / Java 17 / JPA / PostgreSQL(slip-service); notification-service Aligo SMS(재사용); React + TS + design-system + react-query(clients/desktop). Testcontainers IT + MockRestServiceServer 계약테스트, vitest.

## Global Constraints
- **Flyway 신규**: slip **V50**(`external_dispatch` + `external_dispatch_slip` 2테이블). 현 최신 slip=V49 → V50. 적용 마이그 불변([[feedback_applied_migration_immutable]]) · fresh Postgres probe([[feedback_migration_fresh_postgres_probe]]).
- **slip.dispatchStatus enum 값 추가 없음**(기존 UNDISPATCHED/DISPATCHING/DISPATCHED 재사용 — CHECK 마이그 회피 [[feedback_enum_expansion_check_constraint]]).
- **권한**: 타배송사 발송 = 기존 **`dispatch.board`** page-code 재사용(슬1이 발송대기 목록을 dispatch.board에 통합 — D7). 발송 액션=`@RequirePermission(page="dispatch.board", action=CREATE)`. **신규 page-code/시드 0**. external_carrier 선택 조회=`dispatch.external-carriers`(슬2, view). account-mode([[project_dispatch_on_inspect_epic]] 슬2 교훈).
- **SMS 발송**: slip `NotificationClient`(POST `/internal/notifications/send`, X-Internal-Token, 작동 검증된 재사용 자산 — DispatchTaskConfirmService 등 사용처). **실HTTP 계약테스트**(MockRestServiceServer로 `/internal/notifications/send` 계약 검증 [[restclient-contract-test-false-green]] — @MockBean 우회 금지).
- **UUID 비노출**([[uuid-no-user-visibility]]): 발송대기/기사 선택 화면=name/phone/slipNo만. external_dispatch.id/slip_id는 내부.
- **단방향 종료**: SMS 발송 성공=DISPATCHED 종료(회신/추적 없음). 실패=external_dispatch.status=FAILED + dispatchStatus 전이 안 함(재시도 가능, [[project_dispatch_on_inspect_epic]] 슬3 spec §6).
- Role 풀네임 · 한국어 커밋/PR · `[FEAT]` prefix · 단계별 다수 스샷 QA([[feedback_canonical_workflow]]) · docs 동기화([[feedback_continuous_docs_sync]]·[[feedback_samhan_public_overview_sync]]).

## 확정 결정 (PM 정찰 종합 — spec §4·§5·§6 + 코드 근거)
| # | 결정 |
|---|---|
| D-EDS-01 | **SMS 본문(ExternalDispatchSmsComposer)**: 기사별 1 SMS. 머리말(배송사명/날짜) + 전표별 1~2줄(전표번호·배송지·수령자·품목요약). body≤2000자(NotificationClient 한도); 초과 시 전표 N건까지 + "외 M건" truncate. 품목요약=대표 모델명+총수량(라인 전체 나열 금지). |
| D-EDS-02 | **발송 단위**: 기사별 1 `external_dispatch`(channel=SMS) + N `external_dispatch_slip`(sequence) + SMS 1건. 운영자가 발송대기 목록서 전표 다중 선택 + 기사 1명 선택. |
| D-EDS-03 | **권한**: `dispatch.board`(발송 액션 CREATE) + `dispatch.external-carriers`(기사 조회 view) 재사용. 신규 시드 0. |
| D-EDS-04 | **dispatchStatus 전이**: 신규 도메인 메서드 `Slip.markDispatchedExternally()`(UNDISPATCHED→DISPATCHED, 가드: UNDISPATCHED만 허용). enum 값 추가 없음. |
| D-EDS-05 | **channel enum**: `ExternalDispatchChannel`(SMS/PRINT/BOTH) 정의하되 **슬3 발송 경로는 SMS만**(PRINT/BOTH=슬4). |
| D-EDS-06 | **발송 결과 판정**: `NotificationClient.sendExternalSms`는 graceful void → 슬3는 **결과 반환 래퍼**(`sendExternalSmsWithResult(phone,subject,body): boolean` 신규 — HTTP 2xx=true=SENT, 예외/실패=false=FAILED). external_dispatch.status 기록 근거. |

## File Structure
**slip-service (BE)** — 신규: `domain/external/{ExternalDispatch, ExternalDispatchSlip}.java`, `domain/external/{ExternalDispatchChannel, ExternalDispatchStatus}.java`(enum), `repository/external/{ExternalDispatchRepository, ExternalDispatchSlipRepository}.java`, `service/external/{ExternalDispatchService, ExternalDispatchSmsComposer}.java`, `web/external/ExternalDispatchController.java`, `dto/external/{CreateExternalDispatchRequest, ExternalDispatchResponse}.java`, `resources/db/migration/V50__external_dispatch.sql`. 수정: `domain/Slip.java`(markDispatchedExternally), `client/NotificationClient.java`(sendExternalSmsWithResult). 테스트: `it/external/ExternalDispatchControllerIT.java`, `service/external/ExternalDispatchSmsComposerTest.java`, notification 계약테스트(`it/external/NotificationDispatchSmsContractIT.java`).
**clients/desktop (FE)** — 신규: `api/externalDispatch.ts`, `routes/dispatch-board/components/ExternalCarrierDispatchModal.tsx`. 수정: `routes/dispatch-board/components/UnDispatchedSlipList.tsx`(채널 선택 버튼: 아로로지스/타배송사), `api/mock.ts`(external-dispatch 핸들러). 테스트: `routes/dispatch-board/components/ExternalCarrierDispatchModal.test.ts`.

---

## Task 1 — BE: external_dispatch 도메인 + enum + Flyway V50 + Repository
**Files:** `domain/external/{ExternalDispatch, ExternalDispatchSlip, ExternalDispatchChannel, ExternalDispatchStatus}.java`(C) · `V50__external_dispatch.sql`(C) · `repository/external/{ExternalDispatchRepository, ExternalDispatchSlipRepository}.java`(C)
**Interfaces (Produces):** `ExternalDispatch`(BaseEntity, carrierId·channel·dispatchDate·sentAt·sentBy·status, `addSlip()`/`markSent()`/`markFailed()`) · `ExternalDispatchSlip`(externalDispatchId·slipId·sequence) · `ExternalDispatchChannel{SMS,PRINT,BOTH}` · `ExternalDispatchStatus{SENT,FAILED}` · Repository(`findByCarrierIdAndIsDeletedFalse`, `save`).

- [ ] **Step 1: Flyway V50** — `external_dispatch`: id UUID PK, carrier_id UUID NOT NULL(논리 FK→external_carrier), channel VARCHAR(10) NOT NULL CHECK IN('SMS','PRINT','BOTH'), dispatch_date DATE NOT NULL, sent_at TIMESTAMP, sent_by UUID, status VARCHAR(10) NOT NULL CHECK IN('SENT','FAILED'), + BaseEntity 7 audit(V49 컬럼 타입 정확 일치). `external_dispatch_slip`: id UUID PK, external_dispatch_id UUID NOT NULL(FK→external_dispatch), slip_id UUID NOT NULL, sequence INT NOT NULL, + BaseEntity 7 audit. 인덱스: external_dispatch(carrier_id), external_dispatch_slip(external_dispatch_id), external_dispatch_slip(slip_id). fresh Postgres probe(V50)로 검증.
- [ ] **Step 2: enum 2종** — `ExternalDispatchChannel`(SMS/PRINT/BOTH), `ExternalDispatchStatus`(SENT/FAILED). 한국어 Javadoc.
- [ ] **Step 3: 엔티티** — `ExternalDispatch`(@Entity @Table("external_dispatch") @SQLRestriction("is_deleted = false") @UuidGenerator, BaseEntity 상속): 정적 팩토리 `create(carrierId, channel, dispatchDate, sentBy)`, `addSlip(slipId, sequence)`(자식 컬렉션 @OneToMany cascade 또는 별도 저장 — Warehouse류 단순 보유 패턴), `markSent(sentAt)`/`markFailed()`. `ExternalDispatchSlip`(@Entity, BaseEntity). UUID 비노출 주석.
- [ ] **Step 4: Repository 2종** + fresh probe 커밋(Claude 대행).

## Task 2 — BE: Slip 전이 + SMS Composer + NotificationClient 결과 래퍼
**Files:** `domain/Slip.java`(M) · `service/external/ExternalDispatchSmsComposer.java`(C) · `client/NotificationClient.java`(M) · `service/external/ExternalDispatchSmsComposerTest.java`(Test)
**Interfaces (Consumes):** Slip 필드(deliveryAddress/destinationWarehouseName/recipientPhone/slipNo/slipDate/lines) — 정찰 `Slip.java:131-210,509-512`. (Produces): `Slip.markDispatchedExternally()` · `ExternalDispatchSmsComposer.compose(carrierName, dispatchDate, List<Slip>): String` · `NotificationClient.sendExternalSmsWithResult(phone, subject, body): boolean`.

- [ ] **Step 1: Slip.markDispatchedExternally()** — UNDISPATCHED→DISPATCHED 직접 전이(가드: 현재 UNDISPATCHED 아니면 BusinessException CONFLICT). 기존 markDispatchPending/Confirmed(`Slip.java:1747-1781`) 패턴 모방. 한국어 Javadoc("타배송사 직접 발송 — async 회신 없음").
- [ ] **Step 2: ExternalDispatchSmsComposer** — `compose(carrierName, dispatchDate, slips)`: 머리말("[배차의뢰] {carrierName} {dispatchDate}") + 전표별 1줄("{slipNo} {deliveryAddress} {대표품목} 외 {n}건"). 2000자 가드(초과 시 전표 truncate + "…외 M건"). 품목요약=lines 대표 모델명+총수량.
- [ ] **Step 3: ExternalDispatchSmsComposerTest** — 단건/다건/2000자 초과 truncate/빈 lines 케이스.
- [ ] **Step 4: NotificationClient.sendExternalSmsWithResult** — 기존 sendExternalSms 구조(`NotificationClient.java:85-130`)에 boolean 반환 추가(HTTP 2xx→true, RestClientResponseException/누락→false). 기존 void sendExternalSms 유지(다른 사용처 무회귀).
- [ ] **Step 5: 커밋**(Claude 대행).

## Task 3 — BE: ExternalDispatchService + Controller + DTO + IT + 계약테스트
**Files:** `service/external/ExternalDispatchService.java`(C) · `web/external/ExternalDispatchController.java`(C) · `dto/external/{CreateExternalDispatchRequest, ExternalDispatchResponse}.java`(C) · `it/external/ExternalDispatchControllerIT.java`(Test) · `it/external/NotificationDispatchSmsContractIT.java`(Test)
**Interfaces (Consumes):** Task1 엔티티/Repository, Task2 Slip 전이·Composer·NotificationClient. (Produces): REST `POST /admin/external-dispatches`(carrierId + slipIds[] + channel=SMS).

- [ ] **Step 1: DTO** — Create(carrierId @NotNull, slipIds @NotEmpty List<UUID>, channel default SMS), Response(id·carrierName·channel·dispatchDate·sentAt·status·slipCount·slipNos[]; UUID 비노출). 
- [ ] **Step 2: Service.dispatchBySms(req, sentBy)** — ①slipIds 로 Slip 조회(검수완료·UNDISPATCHED 검증, 아니면 409) ②external_carrier 조회(ExternalCarrierRepository, 활성·phone 확인) ③ExternalDispatch.create(SMS) + 각 slip addSlip(sequence) ④Composer.compose → NotificationClient.sendExternalSmsWithResult(carrier.phone, subject, body) ⑤성공→각 Slip.markDispatchedExternally() + dispatch.markSent(now) + status=SENT; 실패→dispatch.markFailed()(dispatchStatus 전이 안 함, 재시도 가능) ⑥save. @Transactional(발송 실패 시 status=FAILED는 커밋, 전표는 미전이 — 또는 정책: 실패 시 전체 롤백? spec=단방향, status 기록 위해 발송결과 기록은 보존). **결정: SMS 실패 시 external_dispatch.status=FAILED 기록 보존 + dispatchStatus 미전이(재시도 가능). 발송 시도 자체는 1 external_dispatch row.**
- [ ] **Step 3: Controller** — `POST /admin/external-dispatches` `@RequirePermission(page="dispatch.board", action=CREATE)`. X-User-Id→sentBy. ApiResponse.
- [ ] **Step 4: ExternalDispatchControllerIT**(AbstractPostgresIT) — ①happy(검수완료 UNDISPATCHED 전표 2건+기사1 → 발송 → dispatchStatus DISPATCHED + external_dispatch SENT + external_dispatch_slip 2건) ②검수 미완/DISPATCHED 전표 409 ③권한(dispatch.board CREATE 없는 role 403). NotificationClient @MockBean(SENT 시뮬) — **단, 계약은 Step5 실HTTP로**.
- [ ] **Step 5: NotificationDispatchSmsContractIT** — MockRestServiceServer로 slip NotificationClient.sendExternalSmsWithResult → `POST /internal/notifications/send` 요청 바디(recipientType=EXTERNAL_PHONE/channel=SMS/recipientAddress) + X-Internal-Token 헤더 + 2xx→true/4xx·5xx→false 계약 검증([[restclient-contract-test-false-green]] — 다운스트림 NotificationInternalController @PostMapping("/send") 실재 확인 근거).
- [ ] **Step 6: 커밋**(Claude 대행).

## Task 4 — FE: 발송대기 목록 채널분기 + 기사선택 모달 + mock + vitest
**Files:** `api/externalDispatch.ts`(C) · `routes/dispatch-board/components/ExternalCarrierDispatchModal.tsx`(C) · `routes/dispatch-board/components/UnDispatchedSlipList.tsx`(M) · `api/mock.ts`(M) · `routes/dispatch-board/components/ExternalCarrierDispatchModal.test.ts`(Test)
**Interfaces (Consumes):** Task3 REST + 슬2 `api/externalCarrier.ts`(기사 목록).

- [ ] **Step 1: api/externalDispatch.ts** — `dispatchExternalSms({carrierId, slipIds, channel:'SMS'}): Promise<ExternalDispatchResponse>` (POST /admin/external-dispatches). 타입.
- [ ] **Step 2: UnDispatchedSlipList.tsx** — 전표 다중 선택(체크박스) + "타배송사 발송"(SMS) 버튼(아로로지스 기존 흐름과 병기). canAccess('dispatch.board','create') 게이트. 버튼→ExternalCarrierDispatchModal open.
- [ ] **Step 3: ExternalCarrierDispatchModal.tsx** — 선택 전표 요약 + 기사 선택(슬2 externalCarrier 목록 AsyncAutocomplete/select, name/phone 표시 — UUID 비노출) + 채널(SMS 고정, 슬4서 PRINT) + 발송 버튼. react-query mutation → invalidate 발송대기 목록(발송 후 목록 이탈). 성공/실패 토스트.
- [ ] **Step 4: mock.ts** — `POST /admin/external-dispatches`(권한 mock dispatch.board create, 전표 DISPATCHED 처리 + external_dispatch 기록 시뮬, non-null envelope). 3원칙([[feedback_inprocess_mock_principles]]).
- [ ] **Step 5: vitest** — 모달 렌더·기사 선택·필수(기사/전표) 검증·canAccess 가드. `npm run typecheck`+vitest GREEN(design-system dist 선빌드).
- [ ] **Step 6: 커밋**(Claude 대행).

## Task 5 — docs 동기화
- [ ] README/ROADMAP/`docs/samhan-public-overview.html`에 슬3(타배송사 SMS) 진행 반영 + dev-report `docs/dev-reports/2026-06-24-external-dispatch-sms-s3.md`(3-layer). 슬3 PR에 포함(별도 docs PR 금지).

## QA (각 리뷰 라운드 Docker 라이브 + 단계별 다수 스샷)
①발송대기 목록(검수완료 전표) 진입 ②전표 다중 선택 + "타배송사 발송" 클릭 ③기사 선택 모달 ④SMS 발송 실행(Aligo placeholder=stub success) ⑤발송 후 전표 목록 이탈(dispatchStatus DISPATCHED) ⑥external_dispatch SENT 기록 확인(DB/조회). 실 게이트웨이:8080·mock OFF·각 단계 별도 캡처. 가짜 금지([[feedback_no_fake_data_ever]]). Aligo 실발송 불가 시 placeholder stub(외부 호출 skip) + 사유 정직 기록.

## Self-Review (spec §4·§5·§6 대조)
- external_dispatch/external_dispatch_slip 2테이블 = §4 커버. SMS 발송(Aligo 재사용)+dispatchStatus DISPATCHED = §5·§3 커버. 단방향/실패 status=FAILED = §6 커버. ✓
- 인쇄(PRINT)=슬4 명시(channel enum만 정의, 발송경로 SMS 한정). ✓
- 권한 dispatch.board/dispatch.external-carriers 재사용(신규 시드 0), enum 값 추가 없음(CHECK 마이그 회피). ✓
- 실HTTP 계약테스트(/internal/notifications/send), UUID 비노출, Flyway V50 fresh probe. ✓
