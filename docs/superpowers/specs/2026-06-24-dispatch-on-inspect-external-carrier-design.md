# 검수 완료 → 배차 발송 (아로로지스 / 타배송사) — 에픽 설계 spec

> 작성일: 2026-06-24 · 작성: PM(Opus) brainstorming(superpowers) + 2 라운드 Explore 정찰 종합 · 상태: **개발책임자 설계 승인("우선 진행요청") → spec 박제 → writing-plans**
>
> 상위 맥락: A2 "전 전표 명시 결재 enforcement" 에픽([project_approval_enforcement_epic](../../../.claude/memory/project_approval_enforcement_epic.md))의 잔여 검토 중, 개발책임자가 **견적 결재는 불필요로 스코프 제외**하고 **배차는 "enforcement"가 아니라 "검수 완료 → 배차 발송" 워크플로우 연동**으로 재정의. 본 에픽은 그 재정의의 설계.
>
> 관련 메모리: [[feedback_canonical_workflow]] · [[restclient-contract-test-false-green]] · [[migration-fresh-postgres-probe]] · [[applied-migration-immutable]] · [[uuid-no-user-visibility]] · [[feedback_no_fake_data_ever]] · [[feedback_qa_docker_real_test]] · [[project_arologis_independent]] · [[feedback_slip_order_number_format]] · [[feedback_chip_ui_multi_input]]

---

## 0. 검증 출처 (이 설계가 근거하는 사실 — 추측 아님)

2 라운드 Explore 정찰(① 결재 enforcement 잔여 3종 비교, ② 검수↔배차 연결 + 발송 채널)로 도출. file:line 근거.

- **출고전표 검수 게이트**: `SlipService.inspect(slipId, inspectorUserId)` (slip-service `SlipService.java:838-843`) — `enforceSlipApprovalLine(OUTBOUND_INSPECT)` B-게이트(approval_line_config 결재자 검증, opt-in) 후 `slip.inspect()` 도메인 호출, `inspectorUserId`/`inspectorSignedAt` 기록. ⚠️ 검수 후 slip 상태값(INSPECTING vs COMPLETED)은 정찰 2 에이전트 간 표기가 엇갈림 → **슬1 착수 시 `SlipService.inspect()`/`complete()` 실코드로 정확 확인**. 본 설계는 "발송 대기" 판정을 **상태 enum이 아니라 `inspectorUserId`/`inspectorSignedAt` 기록 여부**(검수인 결재 확정 신호)로 정의해 모호성 회피.
- **slip.dispatchStatus**: `SlipDispatchStatus` enum = `UNDISPATCHED` / `DISPATCHING` / `DISPATCHED` (slip-service `domain/dispatch/SlipDispatchStatus.java`). `Slip.markDispatchPending()`/`markDispatchConfirmed()`/`markDispatchReleased()` 로 전이.
- **slip → 배차 역참조**: `DispatchVehicleGroupSlipRepository.findBySlipIdAndIsDeletedFalse(slipId)` — 주어진 전표가 어느 배차(차량그룹)에 속하는지 조회 가능(연결 hook 자리 존재).
- **arologis 발송(현행, 무변경 대상)**: 운영자가 배차 메뉴에서 수동 DispatchTask(DRAFT) 생성 → 차량그룹에 전표 배정(`DispatchVehicleGroupSlip`) → `DispatchTaskCompletionService.dispatch(taskId, groupIds)` (`DispatchTaskCompletionService.java:60-145`) → `ArologisDispatchClient.send()` (`ArologisDispatchClient.java:79`, POST `/internal/arologis/dispatches`, X-Internal-Token) → arologis-service `DispatchReceiveService.receive()` → `DriverMatcher.match()`(Phase A Mock) → `confirm` 콜백 → `DispatchTask.markDispatched(arologisDispatchId)` + `slip.dispatchStatus`. `DispatchTask.arologisDispatchId`=단일 UUID(arologis 결합).
- **타배송사(외부 배송업체/개별 기사) 채널 = 현재 코드에 전무**. arologis 내부 `MatchSource`(INTERNAL_APP/EXTERNAL_INSUNG_QUICK/EXTERNAL_SMS/EXTERNAL_KAKAO/MANUAL)는 "어디서 매칭했나"만 구분, "일반 외부배송사" 추상화 아님. `Vehicle.vendorOrderId`/`vendorStatus`는 인성데이타 전용.
- **배차안내 SMS 인프라(재사용 가능)**: notification-service `DispatchBatchSendService.java:54` → `NotificationService.send()` → `SmsAdapter`(Aligo). 현재 SMS 단일 채널(이메일/카톡/인쇄 없음). RecipientType.EXTERNAL_PHONE, NotificationChannel.SMS, type=DISPATCH_BATCH.
- **그룹웨어 결재(참고, 본 에픽 비대상)**: 이미 approval-core ApprovalLine/ApprovalStep 자체 순차 chain으로 enforce 중 → 추가 불필요(정찰 결론).

---

## 1. 에픽 목표

출고전표의 **검수인 결재(OUTBOUND_INSPECT) 완료** 건을 **"배차 발송 대기"** 목록으로 모으고, 운영자가 채널을 선택해 발송한다:
- **아로로지스(자체배송)**: 현행 배차 흐름(차량그룹·다중정차·async 콜백) **그대로 재사용**.
- **타배송사(외부 배송업체/개별 기사)**: 신규 채널. **외부기사/배송사 마스터**에서 선택 → 기사별 묶음 → **문자(SMS) + 인쇄(배차의뢰서)** 로 발송.

### 비목표 (YAGNI — 명시 제외)
- **견적 결재**: 개발책임자 "견적은 결재 불필요" → 에픽 스코프 제외.
- **외부배송사 시스템 REST 연동**(대한통운/로젠 등 API): 제외. 임의 외부기사 대응엔 문자/인쇄로 충분(각 사별 계약 무거움).
- **타배송사 배송완료 회신·추적(async callback)**: 제외. 문자/인쇄=단방향, 발송 시점이 종료.
- **자동 채널 결정 규칙·자동 발송**: 제외. 검수 완료=발송 대기, 채널 선택·발송=운영자 수동.
- **arologis 배차 흐름 재설계**: 제외. DispatchTask/차량그룹/async 무변경(무회귀).
- **slip.dispatchStatus enum 신규 값 추가**: 제외(기존 3값 재사용, enum CHECK 마이그 회피 — [[feedback_enum_expansion_check_constraint]]).

---

## 2. 확정 결정 (브레인스토밍 — 개발책임자 2026-06-24)

| # | 항목 | 확정 |
|---|---|---|
| D1 | 스코프 | **견적 제외, 배차만**. 배차는 enforcement 아님 = **검수 완료 → 배차 발송 워크플로우 연동**. |
| D2 | 트리거 흐름 | **검수 완료 → "발송 대기" 목록 → 운영자가 채널 선택 후 발송**(자동 발송 아님). |
| D3 | 발송 채널 | **아로로지스(자체) / 타배송사(외부)** 2채널. |
| D4 | 타배송사 발송 형식 | **문자(SMS) + 인쇄(배차의뢰서) 둘 다**(채널별 선택). |
| D5 | 타배송사 정보 | **외부기사/배송사 마스터 등록** 후 발송 시 선택. |
| D6 | 발송 단위(묶음) | **arologis=기존 차량그룹 / 타배송사=기사별 묶음**. arologis 현행 재사용, 타배송사 별도 경량 모델. |
| D7 | QA 증빙 | **실 리뷰는 추후 스크린샷으로 판단. 스크린샷은 한 장이 아니라 과정을 단계별로 여러 장**(개발책임자 2026-06-24 명시). → §8. |

---

## 3. 아키텍처 — 진입점 + 채널 분기

```
[출고전표 검수인 결재 완료(OUTBOUND_INSPECT)]   inspectorUserId/inspectorSignedAt 기록, dispatchStatus=UNDISPATCHED
        │
        ▼
[배차 발송 대기 목록]  ← (slipType=OUTBOUND) AND (검수 완료) AND (dispatchStatus=UNDISPATCHED)
        │  운영자: 건/묶음 선택 + 채널 선택
        ├─(아로로지스)─▶ 기존 배차 흐름[차량그룹 배정 → DispatchTaskCompletionService.dispatch() → ArologisDispatchClient → async confirm]   ★재사용·무변경
        │
        └─(타배송사)──▶ 외부기사 마스터에서 기사 선택 → 기사별 묶음 → ExternalDispatch 생성
                             ├─ 문자(SMS): notification-service 재사용(기사 연락처로 배차의뢰 문자)
                             └─ 인쇄(배차의뢰서): FE PrintLayout A4 출력/PDF
                          → slip.dispatchStatus = DISPATCHED (종료·회신 없음)
```

원칙: **두 채널은 진입점(발송 대기 목록)만 공유하고 발송 경로는 분리**. arologis는 검증된 기존 자산을 손대지 않고, 타배송사는 별도 경량 도메인으로 추가해 회귀 위험 최소화.

---

## 4. 데이터 모델 (신규 최소, slip-service)

기존 `DispatchTask`(arologis 결합: `arologisDispatchId` 단일 UUID, 차량그룹, async 상태머신)는 **무변경**. 타배송사는 별도 경량 엔티티로 분리.

### `external_carrier` (외부기사/배송사 마스터)
- `id`(UUID PK), `name`(VARCHAR, 화면 노출), `phone`(VARCHAR, SMS 발송 대상), `email`(VARCHAR nullable), `default_vehicle_type`(VARCHAR nullable), `memo`(TEXT nullable), `active`(BOOL), BaseEntity 7 audit + soft delete.
- 화면 노출 = 이름/전화(**UUID 비노출** [[uuid-no-user-visibility]]).

### `external_dispatch` (타배송사 발송 기록)
- `id`(UUID PK), `carrier_id`(FK→external_carrier), `channel`(VARCHAR CHECK `SMS`|`PRINT`|`BOTH`), `dispatch_date`(DATE), `sent_at`(TIMESTAMP), `sent_by`(UUID, 발송 운영자), `status`(VARCHAR CHECK `SENT`|`FAILED`), BaseEntity 7 audit + soft delete.

### `external_dispatch_slip` (발송 ↔ 전표 N:1+)
- `id`(UUID PK), `external_dispatch_id`(FK), `slip_id`(UUID, 출고전표), `sequence`(INT), BaseEntity.

### slip.dispatchStatus 연동
- 타배송사 발송 성공 시 `slip.dispatchStatus = DISPATCHED`(종료, async 회신 없음). 기존 enum 재사용.
- 어느 채널/기사로 발송됐는지 추적 = `external_dispatch`/`external_dispatch_slip` 기록(이력). (slip에 채널 표시가 필요하면 슬5 검토.)

### Flyway
- 신규 테이블 3종 = 신규 V## 마이그(checksum/적용 불변 [[applied-migration-immutable]], fresh Postgres probe 검증 [[migration-fresh-postgres-probe]]).
- slip.dispatchStatus는 enum 값 추가 없음 → CHECK 마이그 불필요.

---

## 5. 발송 채널 상세

| 채널 | 구현 | 재사용 자산 |
|---|---|---|
| **아로로지스** | 발송 대기 목록 → 아로로지스 선택 시 **기존 배차 화면/흐름으로 라우팅**(차량그룹 배정·다중정차·async confirm). 신규 코드 최소. | `DispatchTaskCompletionService`, `ArologisDispatchClient`, 차량그룹 도메인 전부 |
| **타배송사 문자(SMS)** | 수신자=`external_carrier.phone`. 내용=배차의뢰(배송지·품목 요약·수령자·연락처·날짜·기사/배송사명). 신규 메시지 타입(예 `DISPATCH_REQUEST`). | notification-service `NotificationService.send()` → `SmsAdapter`(Aligo) |
| **타배송사 인쇄(배차의뢰서)** | 신규 FE A4 양식(문자와 동일 정보 + 기사/배송사명). PDF/인쇄. | FE `PrintLayout` / `DispatchView`·print-renderer 패턴 ([[project_print_preview_standardization]]) |

- 타배송사 발송 시 운영자가 채널(SMS/PRINT/BOTH)을 선택. 외부기사/배송사는 마스터에서 선택(미등록 즉석 입력은 비목표 — D5).

---

## 6. 에러 / 상태 정책

- **타배송사 = 단방향 종료**: SMS 발송 실패 → `external_dispatch.status=FAILED` + 재시도 가능. 인쇄는 출력물(항상 성공). 배송완료 회신 추적 없음(비목표).
- **중복 발송 방지**: 발송 대기 목록 = `dispatchStatus=UNDISPATCHED`만 → 발송 즉시 목록 이탈. 한 전표 = 한 채널 1회(이미 발송된 전표 재발송 차단).
- **arologis 발송 실패(unavailable)**: 현행 정책 유지(무변경).
- **권한 게이트**: 발송·마스터 관리는 page-code 권한. 발송 자체는 검수 완료(결재 통과) 전제(검수 안 된 전표는 발송 대기에 안 뜸).

---

## 7. 권한 / 메뉴

- **외부기사/배송사 관리** 메뉴: 신규 page-code(예 `dispatch.external-carriers`) — 마스터 CRUD. 배차 관련 메뉴 하위.
- **배차 발송 대기 목록** 화면: 신규 page-code(예 `dispatch.send-queue`) 또는 기존 배차 메뉴 통합(슬1 정찰 시 메뉴 위치 확정).
- 시드(V## auth) + 역할 grant + FE `canAccess`(page-code=실제 BE @RequirePermission 정확 일치 [[feedback_fe_canaccess_pagecode_be_match]]).

---

## 8. 슬라이싱 + 테스트/QA

### 슬라이스 분해 (각 슬라이스 [[feedback_canonical_workflow]] 엄수)
| 슬 | 내용 | 비고 |
|---|---|---|
| **슬1** | **배차 발송 대기 목록 + 아로로지스 경로 연결**(진입점). BE 조회 엔드포인트(검수완료·미발송 OUTBOUND), FE 목록 + 아로로지스 발송 라우팅. | arologis 발송 자체는 기존 재사용. 검수 완료 판정 정확 확인. |
| **슬2** | **외부기사/배송사 마스터**(external_carrier CRUD + 관리 메뉴 + page-code 권한/시드 + FE 등록/목록). | Flyway V## 신규. |
| **슬3** | **타배송사 문자(SMS) 발송**(external_dispatch/external_dispatch_slip + notification-service 재사용 + dispatchStatus 전이 + 발송 대기에서 타배송사 선택 UI). | 실HTTP 계약(notification client). |
| **슬4** | **타배송사 인쇄 배차의뢰서**(A4 양식, FE PrintLayout). | print 미리보기 표준. |
| 슬5(옵션) | 발송 채널/이력 조회·표시. | YAGNI 후순위. |

### canonical workflow (슬라이스 1건당)
Opus 기획 + 조기 PR 개설 → Codex 개발 + 리뷰 게시 → **(Opus 5-agent[FE/BE/Design/DevOps/QA]+Opus 직접 fix+라이브QA+TM 통합리뷰 게시 → Codex 5-agent+Codex fix+라이브QA+TM 통합리뷰 게시)** error/skip/backlog **0 수렴까지 반복** → PM 확인+CI green → PM 머지. 듀얼리뷰 **순차**(병렬 금지), 단축 금지, 각 라운드 즉시 독립 게시.

### QA 증빙 — 🚨 단계별 다수 스크린샷 (개발책임자 D7)
- **실 리뷰는 추후 스크린샷으로 판단**. 각 리뷰 라운드(Opus·Codex)는 fix 이후 **Docker 라이브 실 QA**(실 게이트웨이:8080 / 실 서비스 / 실 시드, mock OFF) 수행.
- **스크린샷은 한 장이 아니라 과정을 단계별로 한 장씩 여러 장**: 예) ①검수 완료 화면 → ②발송 대기 목록에 뜬 모습 → ③채널 선택 → ④(타배송사) 기사 선택 → ⑤SMS 발송 결과 / ⑥인쇄 배차의뢰서 출력물 → ⑦발송 후 목록 이탈. 각 단계 별도 캡처를 그 라운드 PR 코멘트에 인라인.
- 가짜/합성 캡처 금지([[feedback_no_fake_data_ever]]). 실연동 불가 시 "사유" 정직 보고.

### 테스트
- 실HTTP 계약테스트(notification/arologis client 다운스트림 선검증, [[restclient-contract-test-false-green]]) — @MockBean 우회/fabricated stub 금지.
- Flyway fresh Postgres probe(신규 테이블, [[migration-fresh-postgres-probe]]).
- 변경 모듈 전체 test 완주 후 push([[feedback_changed_module_full_test_before_push]]). CI green ≠ 전 통과(필터 allowlist 주의 [[feedback_ci_test_filter_false_green]]).

---

## 9. 미해결 — 착수 시 확인(슬1 정찰)
- 검수 완료 후 slip 정확 상태값(INSPECTING vs COMPLETED) + 발송 대기 판정 쿼리(inspectorUserId/inspectorSignedAt + dispatchStatus).
- 배차 발송 대기 목록 메뉴 위치(기존 배차 메뉴 통합 vs 신규) + page-code 명.
- arologis 경로 "라우팅" 구체(발송 대기에서 arologis 선택 시 기존 배차 생성/배정 화면으로 보내는 방식).
- SMS 메시지 본문 템플릿 + 길이/포맷(품목 요약 방식).
