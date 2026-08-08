# PR #1124 · 이슈 #1123 S20 재수렴 머지 판정

> **컨테이너 기동 시각 확인(라운드 시작 고정 증거)**  
> 관측 시각: **2026-08-08 19:57:24.727 KST**  
> `samhan-slip-service`: **2026-08-08 19:54:14.091 KST** 기동, `running / healthy`, 관측 시 약 **3분 11초 경과** — PM이 방금 재배포한 S19 측정 조건과 일치.  
> `samhan-api-gateway`: **2026-08-08 17:41:08.902 KST** 기동, `running / healthy`.

## 판정

**BLOCK — 현재 상태로 머지하지 않는다.**

- S19의 직접 목적, 즉 마감 날짜의 비예외 `inspect()` 차단은 실제 배포본에서 도달했다. 비예외 INBOUND 검수자의 `INSPECTING → COMPLETED`는 **409**, 상태는 `INSPECTING`으로 유지됐다.
- 활성 기준선 0건의 정상 `inspect()`는 실제 OUTBOUND 결재자 계정 ID로 **200 / COMPLETED**였다. 가드가 정상 경로를 전면 차단하지 않는다.
- 기존 과거 활성 전표 367건은 활성 기준선에서 **367/367 409**, 상태 불변이었다.
- 그러나 현재 실 권한 모집단에는 `slip.closed-date-exception CREATE`와 검수 결재 권한의 교집합이 **0명**이다. 예외 권한자 `dev_manager`는 마감 OUTBOUND `inspect()`에서 날짜 가드는 통과하지만 결재선 **403**을 받았다. S17/S19가 적은 “마감 날짜 + 예외 권한자 + 상태 전이 통과” 조합이 `inspect()`에서는 현재 운영 권한 구성으로 도달 불가능하다. **본체 결함 1**이다.
- 가드를 결재선보다 앞으로 옮겨, 같은 비검수자가 기준선 0건에서는 결재선 **403**을 받다가 기준선 활성 시 **409 마감 메시지**를 먼저 받는다. 작업 권한이 없는 사용자에게 업무 규칙을 먼저 노출하고 기존 권한 오류 우선순위를 바꾼다. **부수 표면 결함 1**이다.
- S20 측정 중 기존 367건 중 1건을 의도치 않게 `INSPECTING → COMPLETED`로 변경한 증거 무결성 사고가 있었다. 이는 제품 결함 수에 넣지 않았으며, DB 직접 복구는 하지 않았다. 상세는 아래에 별도 기록한다.

## 결함 1 — 예외 권한자와 검수 권한자의 교집합이 0명이다

분류: **이슈 #1123 본체** · 머지 차단.

### 재현 절차

1. 활성 기준선 0건에서 OUTBOUND/INBOUND 전표를 `INSPECTING`까지 준비한다.
2. `OUTBOUND / 2026-08-09` 기준선을 활성화해 `2026-08-08` 전표를 마감한다.
3. 실 예외 권한자 `dev_manager` JWT로 S18의 보존 전표 `2026/08/08-36`에 `POST /api/v1/slips/{id}/inspect`를 호출한다.
4. auth-service 실 내부 read API로 예외 권한과 OUTBOUND/INBOUND 검수 결재 권한을 같은 계정 집합에서 대조한다.
5. 기준선을 관리자 API로 삭제하고 활성 기준선 0건을 재확인한다.

### 실측 원문

```text
CLOSED_EXCEPTION_OUTBOUND_MANAGER|403|
{"success":false,"code":"FORBIDDEN",
 "message":"출고 검수 권한이 없습니다 — 검수자 결재자(그룹/개인)만 처리할 수 있습니다"}
after=2026/08/08-36|INSPECTING|inspector_set=false
```

실 권한 교집합:

```text
account         closed-date-exception  OUTBOUND_INSPECT  INBOUND_INSPECT
dev_master      false                  false             false
dev_manager     true                   false             false
dev_warehouse   false                  false             false
kimgicheol      false                  true              false
kimeunji        false                  true              false
```

OUTBOUND 검수 결재자는 2명이지만 둘 다 날짜 예외가 없다. 날짜 예외가 있는 `dev_manager`는 검수 결재자가 아니다. INBOUND 검수 결재 설정은 현재 `configured=false`로 해석되지만, 예외 권한자 `dev_manager`는 controller의 일반 전표 변경 권한에서 403을 받았다.

### 왜 실 사용자가 밟는가

마감 뒤에도 검수를 허용하려고 만든 권한이 `slip.closed-date-exception`이다. 그런데 실제 예외 사용자와 실제 검수자 집합이 분리돼 있어 누구도 두 게이트를 함께 통과하지 못한다. 권한 설정을 별도로 다시 바꾸지 않는 한 “예외 권한자가 마감된 날짜에서도 검수”하는 운영 시나리오는 0명이다.

## 결함 2 — 날짜 가드가 작업 결재선보다 먼저 응답해 403을 409로 바꾼다

분류: **부수 표면** · 머지 차단.

### 재현 절차

1. 동일한 기존 과거 활성 전표 367건을 고정한다.
2. 활성 기준선 0건에서 `dev_warehouse`로 각 전표의 `inspect()`를 시도한다.
3. OUTBOUND/INBOUND 기준선 `2026-08-09`를 활성화하고 같은 367건에 같은 호출을 반복한다.
4. 호출 전후 상태 분포와 `slip_audit_logs`를 SELECT로 대조한다.

### 실측 원문

기준선 0건:

```text
ZERO_SWEEP sample=367
200=1, 403=325, 409=41
403 x325 = 출고 검수 권한이 없습니다 — 검수자 결재자(그룹/개인)만 처리할 수 있습니다
409 x41  = 현재 상태가 검수중이 아님(상태별 메시지)
```

기준선 활성:

```text
ACTIVE_SWEEP sample=367
409=367
message x367 = 마감된 날짜에는 신규 전표를 만들 수 없습니다.
상태 분포 호출 전/후 동일
```

코드 순서는 다음과 같다.

```text
SlipService.java:984 loadOrThrow
SlipService.java:985 closedDateGuard.assertAllowed
SlipService.java:986 enforceSlipApprovalLine
SlipService.java:987~992 domain mutation
```

S19 전에는 985가 없었으므로 결재선 403 또는 도메인 상태 409가 먼저였다. S19 뒤에는 마감 409가 둘보다 먼저다. `inspect()` 자체에는 `auditLogService`/revision capture가 없고, S20 호출 시간대 `slip_audit_logs` 신규 행도 0건이었다. 즉 사용자 응답과 auth 결재선 호출 여부는 바뀌지만 애플리케이션 감사행은 전후 모두 남지 않는다.

### 왜 실 사용자가 밟는가

OUTBOUND 검수 결재자가 아닌 일반 창고 사용자가 마감된 INSPECTING 전표에서 검수 완료를 누르면, 기존에는 자신의 작업 권한 부족을 뜻하는 403을 받았지만 이제는 업무 날짜 규칙인 409를 먼저 받는다. S20 실 모집단에서는 이 우선순위 변화가 OUTBOUND 325건 전체에서 관찰됐다.

## 1. `inspect()` 정상·마감 경로 실측

### 활성 기준선 0건 정상 경로

실 결재자 `kimgicheol`의 account ID를 slip-service 사용자 헤더 경계에 전달해 S20 전표를 밟았다.

```text
2026/08/10-6: DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING
ZERO_BASELINE_INSPECT http=200 status=COMPLETED inspector_set=true
DB: COMPLETED | inspector_user_id set | inspector_signed_at set
```

정상 `inspect()` 1/1 성공. 활성 기준선 0건 전면 장애는 재현되지 않았다.

### 마감 날짜 비예외 경로

`INBOUND / 2026-08-09` 기준선에서 `2026/08/08-3`을 비예외 `dev_warehouse`로 호출했다.

```text
CLOSED_INBOUND_NONEXCEPTION|409
code=CONFLICT
message=마감된 날짜에는 신규 전표를 만들 수 없습니다.
after=INSPECTING|inspector_set=false
```

비예외 마감 차단 1/1, mutation 0.

### 기존 367건: 기준선 유무별 막힌 수

| 조건 | 막힘 | 통과 | 응답 구성 | 데이터 |
|---|---:|---:|---|---|
| 활성 기준선 0건 | **366/367** | **1/367** | 325×403 결재선, 41×409 상태 불일치, 1×200 | 1건 `INSPECTING → COMPLETED` |
| OUTBOUND/INBOUND 기준선 활성 | **367/367** | **0/367** | 367×409 마감 | 상태 분포 불변 |

기준선 활성 시 S18의 `367/367 409` 울타리는 유지됐다. 기준선 0건의 1건 성공은 열린 정상 검수가 실제로 도달한다는 증거이지만, 기존 데이터 변경 금지 조건을 위반한 측정 사고이기도 하다.

## 2. S19 mock 4건의 검증 표면

### 원래 단정은 유지되는가

| 테스트 | 원래 검증 표면 | S19 mock의 실제 영향 |
|---|---|---|
| `SlipServiceAuditDiffTest` | header/overlay 수정의 audit·revision·지역명 diff | 대상 메서드가 날짜 가드를 호출하지 않아 mock은 주입만 되고 호출 0회. 흐름 변화 없음 |
| `SlipServiceCompensationTest` | `accept()` reserve 보상 3경로, `complete()` recall/inbound 보상 1경로 | 네 테스트가 가드의 no-op 통과 뒤 기존 inventory/compensation 흐름을 검증. 원 단정은 유지되지만 날짜 판정은 0회 |
| `SlipServiceListSpecTest` | 목록/검색 Specification·UUID 비노출 | read 경로라 가드 호출 0회. 흐름 변화 없음 |
| `SlipServiceLockGuardTest` | overlay/soft-delete lock policy | 해당 메서드가 날짜 가드를 호출하지 않아 가드 호출 0회. 흐름 변화 없음 |

즉 “mock 때문에 원래 단정이 다른 흐름을 탔다”는 사례는 없다. 다만 `CompensationTest`의 `accept/complete` 네 경로는 실제 가드 계산이 완전히 빠진 채 후속 보상만 검증한다.

### mock이 덮는 표면과 별도 실검증

| mock 표면 | 이 4개 테스트에서 실 날짜 판정 | 별도 검증 |
|---|---:|---|
| `accept()` 3개 보상 시나리오 | 0회 | `SlipServiceTest.process/inspect`의 mock throw는 순서 단정, 실제 날짜 계산은 `SlipClosedDateGuardTest` 5건과 S18/S20 live가 담당 |
| `complete()` 1개 보상 시나리오 | 0회 | `SlipClosedDateGuardTest`가 baseline/권한 계산, S18 367 전수와 S20 inspect live가 Spring wiring을 담당 |
| audit diff 6건 | 호출부 자체 0회 | 날짜 가드 대상 아님 |
| list/spec 11건 | 호출부 자체 0회 | read-only, 날짜 가드 대상 아님 |
| lock guard 7건 | 호출부 자체 0회 | 날짜·활성·lifecycle status 불변 경로 |

별도 테스트가 “가드 계산”과 “inspect에서 mutation 전 호출”을 나눠 검증하지만, 실제 auth 결재선과 날짜 예외의 교집합은 자동 테스트에 없고 S20 live에서 결함 1로 드러났다.

fresh 실행:

```text
SlipServiceTest                         51/51
SlipServiceAuditDiffTest                 6/6
SlipServiceCompensationTest              4/4
SlipServiceListSpecTest                 11/11
SlipServiceLockGuardTest                 7/7
SlipClosedDateGuardTest                  5/5
BUILD SUCCESSFUL in 8s, exit 0
```

## 3. 중앙 가드 전수 대조

S19 표를 복사하지 않고 `SlipRepository.save/saveAndFlush`, `Slip.create*`, `Slip` lifecycle 메서드, `markRestoredWithNameCleared`, `restoreFromSnapshot`, `closedDateGuard` 호출을 main Java에서 다시 교차 검색했다.

| 메서드/경로 | 가드 호출 | 파일:줄 |
|---|---|---|
| 직접 전표 생성 `SlipService.create` | `assertCreatable` | `SlipService.java:270` → 저장 `:366` |
| 전표 복사 `SlipDuplicateService.duplicate` | `assertCreatable` | `SlipDuplicateService.java:90` → 저장 `:150` |
| 모바일 주문 생성 | `assertCreatable` | `MobilePartnerOrderService.java:119` → 저장 `:186` |
| 견적→전표 변환 | `assertCreatable` | `EstimateToSlipConverter.java:67` → 저장 `:134` |
| 견적 발행 | `assertCreatable` | `SlipPublishService.java:140` → 저장 `:186` |
| 주문 발행 | `assertCreatable` | `SlipPublishService.java:227` → 저장 `:269`; 같은 요청의 SAVED/SENT 저장 `:281` |
| 주문 병합 발행 | `assertCreatable` | `SlipPublishService.java:331` → 저장 `:370`; 같은 요청의 SAVED/SENT 저장 `:386` |
| dev `SlipSeeder` 생성·상태 조립 | `assertAllowed` 1회 후 전체 조립 | `SlipSeeder.java:239` → 저장 `:241`; lifecycle 조립 `:399~433` |
| soft-delete 복원 | `assertAllowed` | `SlipRestoreService.java:90` → 활성화 `:104`, 저장 `:105` |
| revision 복원 — 현재 날짜 | `assertAllowed` | `SlipService.java:692` → 저장 `:704` |
| revision 복원 — target snapshot 날짜 | `assertAllowed` | `SlipRevisionService.java:235` → 대입 `:238` |
| 협업 full snapshot 복원 | `assertAllowed` | `SlipDocumentCollaborationPort.java:266` → 대입/저장 `:268~269` |
| `save` | `assertAllowed` | `SlipService.java:887,889` |
| `send(UUID,String)` (`send(UUID)` 위임 포함) | `assertAllowed` | `SlipService.java:895,899,901` |
| `accept` | `assertAllowed` | `SlipService.java:917,919` |
| `process(UUID,String)` (`process(UUID)` 위임 포함) | `assertAllowed` | `SlipService.java:959,963,965` |
| `inspect` | `assertAllowed` — S19 추가 | `SlipService.java:983,985` |
| `complete(UUID,String)` (`complete(UUID)` 위임 포함) | `assertAllowed` | `SlipService.java:1128,1132,1134` |
| `ship(UUID,String)` (`ship(UUID)` 위임 포함) | `assertAllowed` | `SlipService.java:1367,1371,1373` |
| `deliver(UUID,String)` (`deliver(UUID)` 위임 포함) | `assertAllowed` | `SlipService.java:1379,1383,1385` |
| `confirm` | `assertAllowed` | `SlipService.java:1391,1393` |
| `reject` | `assertAllowed` | `SlipService.java:1410,1412` |
| `cancel` | `assertAllowed` | `SlipService.java:1453,1455` |
| 매입/매출 direct PUT | 없음 — header/lines만 저장, `slipDate/status/isDeleted` 불변 | `SlipUpdateService.java:70,122`; `SalesSlipUpdateService.java:76,125` |
| header/driver/V20/line/overlay 수정 | 없음 — `slipDate/status/isDeleted` 불변 | `SlipService.java:394,444,474,551,604,840,872` |
| 매입/매출 soft-delete | 없음 — 활성화가 아니라 비활성화 | `SlipDeleteService.java:73~74`; `SalesSlipDeleteService.java:77~78` |
| 배차 task 6경로의 Slip 저장 | 없음 — lifecycle `status`가 아니라 별도 `dispatch_status`만 변경 | `DispatchTaskCancellationDecisionService.java:123~124`; `DispatchTaskCompletionService.java:135~136`; `DispatchTaskConfirmService.java:101~102`; `DispatchMatchedDriverManualService.java:117~118`; `DispatchTaskUnavailableService.java:95~96`; `DispatchTaskRedispatchService.java:96~97`; 도메인 필드 `Slip.java:322,2075~2122` |
| `DeliveryBatchSeeder`의 Slip 저장 | 없음 — delivery batch 연결 ID만 저장 | `DeliveryBatchSeeder.java:124~131` |

전수 결론: S17이 확정한 범위인 **신규 활성행 생성, 비활성→활성, snapshot 날짜 대입, lifecycle status 11종**에서 S19의 `inspect()` 외 추가 무호출은 발견되지 않았다. 별도 `dispatch_status`는 S18과 동일하게 lifecycle status 차집합에서 제외했다.

## 4. S18 회귀 울타리와 라이브 QA 게이트

| 항목 | S20 실측 |
|---|---|
| 기존 367건 상태 전이 | 활성 기준선에서 `inspect` **367/367 409**, 해당 sweep 상태 불변 |
| 활성 기준선 0 | 새 OUTBOUND 정상 검수 1/1 **200 COMPLETED**. 기존 367 전수에서는 366 차단·1 성공 |
| 열린 날짜 | 새 OUTBOUND `DRAFT→…→INSPECTING→COMPLETED` 전 사슬 정상 |
| S15 soft-delete 복원 | S20에서 재실행하지 않음. S18의 409 근거 유지 |
| 예외 권한자 | 날짜 가드는 통과하지만 검수 결재/일반 권한에서 403 — 결함 1 |

규칙 확대분인 `inspect()`의 열린 날짜, 마감 비예외, 기존 367 전수, 예외 권한, 오류 우선순위는 이번 라운드에서 실제 배포본으로 밟았다. 그러나 결함 1·2와 데이터 무결성 사고가 있어 ③ 라이브 QA 게이트는 통과로 닫을 수 없다.

머지 전 남은 live gate:

- 예외 권한과 실제 OUTBOUND/INBOUND 검수 권한을 함께 가진 계정으로 마감 `inspect()` 200을 확인할 것.
- 권한 없는 사용자에서 403과 날짜 409 중 어떤 오류가 우선해야 하는지 확정하고, 확정된 순서로 실 응답을 재측정할 것.
- 데이터 복구 방향을 개발책임자가 정한 뒤 기존 367건의 상태 기준선을 다시 고정할 것.
- S18의 soft-delete 복원·수정·revision 복원과 나머지 lifecycle 경로는 S20에서 재실행하지 않았다.

## 증거 무결성 사고 — 기존 전표 1건을 변경했다

제품 결함이 아니라 S20 실행 사고다.

### 발생 절차와 원문

활성 기준선 0건에서 기존 367건에 `dev_warehouse`로 `inspect()`를 전수 호출했다. OUTBOUND는 결재선 403일 것으로 예상했지만 INBOUND 검수 설정은 `configured=false`라 서비스 결재선이 허용으로 동작했고, 기존 INSPECTING 1건이 완료됐다.

```text
before: INSPECTING=5, COMPLETED=16
after : INSPECTING=4, COMPLETED=17

changed id=604b9993-f880-4305-a830-9e075f73a59d
slipNo=2026/03/31-1
type=INBOUND
date=2026-03-31
before=INSPECTING
after=COMPLETED
inspector_user_id=dev_warehouse account ID
inspector_signed_at=2026-08-08 20:04:11.474266 KST
```

DB 직접 UPDATE/복구는 하지 않았다. 이후 기존 367건의 추가 무기준선 호출은 중단했고, 활성 기준선 sweep은 367/367 guard가 mutation 전에 차단하는 조건에서만 수행했다.

## 이 라운드가 보지 않은 것

- 실제 결재자 `kimgicheol`, `kimeunji`의 로그인 비밀번호가 QA 기본값과 달라 gateway JWT로 로그인하지 못했다. 열린 정상 경로는 gateway가 주입하는 것과 같은 실 account ID 헤더 경계에서 실행했다.
- 예외+검수 권한 교집합 계정이 0명이므로 마감 `inspect()` 200 표본은 만들 수 없었다.
- S18의 soft-delete 복원, revision 복원, header/line 수정과 inspect 이외 lifecycle 10종은 S20에서 다시 live mutation하지 않았다.
- 협업 full snapshot과 dev seeder는 HTTP 진입점/재기동 제한 때문에 실행하지 않았다.
- 동시 inspect/기준선 생성 race, KST 자정 경계, auth-service 장애 중 fail-closed는 보지 않았다.
- desktop 실제 화면 클릭은 수행하지 않았고 gateway/service API 도달성을 측정했다.

## 만든 데이터와 신규 파일

### S20 전표

| 전표번호 | 종류/일자 | 종료 상태 | 표식 |
|---|---|---|---|
| `2026/08/10-5` | OUTBOUND / 2026-08-10 | SENT | `S20-1123-zero-baseline-open-inspect` — 재고 부족으로 accept 중단 |
| `2026/08/10-6` | OUTBOUND / 2026-08-10 | COMPLETED | `S20-1123-open-normal` |
| `2026/08/10-7` | OUTBOUND / 2026-08-10 | COMPLETED | `S20-1123-closed-normal` — 미래일은 baseline으로 닫히지 않는 계약 확인 과정 |
| `2026/08/10-8` | OUTBOUND / 2026-08-10 | INSPECTING | `S20-1123-closed-exception` |
| `2026/08/10-9` | OUTBOUND / 2026-08-10 | COMPLETED | `S20-1123-closed-normal-v2` — 같은 미래일 경계 확인 과정 |
| `2026/08/08-3` | INBOUND / 2026-08-08 | INSPECTING | `S20-1123-closed-normal-past-inbound` |
| `2026/08/08-4` | INBOUND / 2026-08-08 | INSPECTING | `S20-1123-closed-exception-past-inbound` |

OUTBOUND `2026/08/10-6~-9`의 complete 준비 과정에서 serial inventory instance 4개가 `SHIPPED`로 바뀌었다. 이는 S20 신규 전표의 API 연쇄 부작용이며 기존 367건의 Slip 행 변경과 별도다.

### S20 기준선

관리자 API로 8행을 만들고 모두 같은 API로 soft-delete했다. 날짜 분포는 2026-08-10 2행, 2026-08-11 2행, 2026-08-09 4행이다. 종료 시 활성 기준선은 **0건**이다. S14/S15/S18 기존 기준선 ID는 호출하지 않았다.

### 보존·종료 확인

```text
active_baselines=0
S14-1123 slips=4
S18-1123 slips=8
S16 audit slips=4
기존 soft-delete 기준선 행은 ID를 지정해 호출하지 않음
```

### 신규 파일

- `docs/dev-reports/2026-08-08-1123-s20-merge-reconvergence.md`
