# 이슈 #1142 전표 상태 되돌리기 착수 전 조사

- 조사일: 2026-08-08
- 조사 성격: 구현 전 읽기 전용 조사
- 조사 대상: `slip-service`의 전표 상태 전이, 재고 연동, 복원·감사·권한·마감 코드와 직접 연결되는 `inventory-service`·`accounting-service` 코드
- 수행하지 않은 것: 코드 변경, DB 조회·쓰기, 전표 상태 전이 실행, Docker 조작, `git` 명령

## 0. 먼저 확정된 코드 사실

현행 상태 머신은 전진 전이와 종결 전이만 선언한다.

> `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:40` — `DRAFT → SAVED → SENT → ACCEPTED → PROCESSING → INSPECTING → COMPLETED`
>
> `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:41` — `- 출고: COMPLETED → SHIPPING → DELIVERED → CONFIRMED`
>
> `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:42` — `- 입고: COMPLETED → CONFIRMED (ship/deliver 단계 스킵)`

`Slip`에서 상태를 대입하는 곳은 생성 및 전진·반려·취소 메서드뿐이다. 과거 상태로 대입하는 공개 도메인 메서드는 없다. 예를 들어 검수 완료는 다음과 같다.

> `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:1186` — `public void inspect(String inspectorUserId) {`
>
> `services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:1189` — `this.status = SlipStatus.COMPLETED;`

따라서 이슈 #1142는 기존 상태 메서드의 노출만으로 끝나지 않는다. 최소한 역방향 상태 전이 규칙, 부수 효과 처리, 권한, 감사 기록을 새로 정해야 한다.

## 1. 전진 전이가 남기는 부수 효과 전수

### 1.1 전이별 실제 동작

| 전이 | 상태 외 변경·호출 | 현재 역연산 존재 여부 | 코드 근거 |
|---|---|---|---|
| `DRAFT → SAVED` (`save`) | 없음 | 상태 역전 메서드 없음 | `Slip.java:1096-1098` — `requireStatus(SlipStatus.DRAFT); this.status = SlipStatus.SAVED;` |
| `SAVED → SENT` (`send`) | 비출고 전표는 `revisionCountBaseline`과 redline anchor를 최초 1회 고정 | 값을 비우거나 다시 산정하는 메서드 없음 | `Slip.java:1112-1115` — 비출고이면 `captureRevisionBaselineIfAbsent()`; `SlipService.java:910-914` — 비출고이면 `captureRedlineAnchorIfAbsent(...)` |
| `SENT → ACCEPTED` (`accept`) | `acceptedBy`, `acceptedAt`, `dispatcherUserId`, `dispatcherSignedAt`; 출고는 재고 예약 | 예약은 `release`/`releaseInstances`가 있으나 서명자·시각 clear 메서드는 없음 | `Slip.java:1144-1149` — 네 필드 기록; `SlipService.java:944-957` — `reserveInstances` 또는 `reserve`, 실패 시 `releaseInstances`/`release` 보상 |
| `ACCEPTED → PROCESSING` (`process`) | 상태 외 변경 없음 | 상태 역전 메서드 없음 | `Slip.java:1157-1160` — partner 가드 후 `status = PROCESSING`만 수행 |
| `PROCESSING → INSPECTING` (`complete`) | **출고:** 예약 시리얼을 `SHIPPED` 처리하거나 예약 재고 차감. **입고:** batch lot 입고, 시리얼 인스턴스 생성, 또는 반품·회차 시리얼 회수 | 일반 차감·출고·입고의 업무상 역연산 API가 없음. 반품·회차 시리얼 회수에만 실패 보상용 `unrecallInstances`가 있음 | `SlipService.java:1125-1131` — complete 시 재고 반영 명시; `SlipService.java:1151-1157` — `shipInstances`/`deduct`; `SlipService.java:1188-1190` — `inboundInstances`; `SlipService.java:1207-1214` — batch `inbound`; `SlipService.java:1237-1240` — `recallInstances`와 실패 보상 `unrecallInstances` |
| `INSPECTING → COMPLETED` (`inspect`) | `inspectorUserId`, `inspectorSignedAt`, `completedAt`; 출고는 `revisionCountBaseline` 및 redline anchor 최초 1회 고정 | 필드를 clear하는 메서드 없음. anchor/baseline은 `IfAbsent`라 재검수해도 다시 산정되지 않음 | `Slip.java:1189-1195` — 상태·baseline·검수자·두 시각 기록; `SlipService.java:995-999` — 출고 redline anchor 기록; `Slip.java:1918-1932` — baseline/anchor는 null일 때만 기록 |
| `COMPLETED → SHIPPING` (`ship`) | 상태 외 변경 없음 | 상태 역전 메서드 없음 | `Slip.java:1203-1210` — 타입 가드 후 `status = SHIPPING`; `SlipService.java:1379-1383` — 마감 가드 후 `slip::ship`만 실행 |
| `SHIPPING → DELIVERED` (`deliver`) | 상태 외 변경 없음 | 상태 역전 메서드 없음 | `Slip.java:1218-1225` — 타입 가드 후 `status = DELIVERED`; `SlipService.java:1391-1395` — 마감 가드 후 `slip::deliver`만 실행 |
| 출고 `DELIVERED → CONFIRMED`, 입고 `COMPLETED → CONFIRMED` (`confirm`) | `confirmedAt` 기록 | clear 메서드 없음 | `Slip.java:1233-1241` — 타입별 선행 상태 가드 후 `status = CONFIRMED; confirmedAt = now()` |

### 1.2 부수 효과 종류별 되돌림 판단

| 무엇이 바뀌나 | 되돌릴 수 있나 / 되돌리면 안 되는가 | 근거 `파일:줄` |
|---|---|---|
| `inspectorUserId`, `inspectorSignedAt`, `completedAt` | **기술적으로 nullable 컬럼이지만 현행 clear 경로는 없다. 정책 미확정.** `COMPLETED → INSPECTING`에서 세 필드를 지울지, 원 검수 사실로 보존할지 개발책임자 결정이 필요하다. | `Slip.java:251-278` — `completedAt`, `inspectorUserId`, `inspectorSignedAt`이 nullable 매핑; `Slip.java:1193-1195` — 검수 완료 때 대입 |
| `acceptedBy`, `acceptedAt`, `dispatcherUserId`, `dispatcherSignedAt` | **현행 clear 경로 없음.** `ACCEPTED` 이전으로 되돌리는 B안에서만 직접 문제가 된다. 과거 수락·출고인 사실을 지울지 보존할지 결정 필요. | `Slip.java:245-267` — 네 컬럼; `Slip.java:1144-1149` — 수락 때 기록 |
| `confirmedAt` | **현행 clear 경로 없음.** `CONFIRMED`에서 되돌릴 경우 null 처리 여부가 필요하다. 원 확정 사실을 감사 이력으로 옮기고 현재값을 비울지 여부는 코드만으로 확정 불가. | `Slip.java:254-255` — 컬럼; `Slip.java:1240-1241` — 확정 때 기록 |
| 출고 batch 재고 예약 | **기존 역연산 있음.** `reserve` ↔ `release`. 다만 이 역연산은 현재 `ACCEPTED`에서 `reject`할 때만 호출된다. | `InventoryClient.java:76-94` — `/inventory/reserve`, `/inventory/release`; `SlipService.java:1425-1437` — 직전 상태가 `ACCEPTED`일 때 release |
| 출고 serial 예약 | **기존 역연산 있음.** `reserveInstances` ↔ `releaseInstances`, 역시 현재는 실패 보상 또는 `ACCEPTED` 반려에 사용한다. | `InventoryClient.java:190-196` — `reserve-batch`; `InventoryClient.java:223-235` — `release-batch`; `SlipService.java:1430-1433` — `ACCEPTED` 반려 시 release |
| 출고 batch 차감 (`deduct`) | **현행 역연산 없음.** `InventoryClient`에는 차감 API만 있고 복구 API가 없다. B안이 `INSPECTING`보다 앞으로 돌아가면 새 재고 보상 계약이 필요하다. | `InventoryClient.java:97-113` — complete 시 `/inventory/deduct`; `SlipService.java:1155-1157` — `fromReservation=true` 차감 |
| 출고 serial 출고 (`shipInstances`) | **현행 역연산 없음.** `releaseInstances`는 `RESERVED → AVAILABLE` 용이며 이미 `SHIPPED`인 인스턴스의 unship 근거가 아니다. | `InventoryClient.java:199-220` — `RESERVED` 인스턴스를 `SHIPPED` 처리; `InventoryClient.java:223-235` — release는 예약 해제로 설명 |
| 입고 batch lot 생성·잔량 가산 (`inbound`) | **현행 역연산 없음.** 코드가 batch inbound에는 inverse API가 없다고 직접 명시한다. | `InventoryClient.java:116-148` — 새 lot 생성+balance 가산; `SlipService.java:1244-1245` — `원격 batch inbound 는 현재 inverse API 가 없으므로` |
| 입고 serial 인스턴스 생성 (`inboundInstances`) | **현행 역연산 없음.** 동일 전표번호+품목 기준 멱등 생성은 있으나 삭제/취소 호출은 없다. | `InventoryClient.java:151-177` — 인스턴스 멱등 생성; `SlipService.java:1186-1190` — complete에서 호출 |
| 반품·회차 serial 회수 (`recallInstances`) | **실패 보상용 역연산만 있음.** `unrecallInstances`는 complete 도중 이후 단계 실패를 보상하는 코드이며, 사용자 상태 되돌림 경로는 아니다. | `InventoryClient.java:238-269` — `RECALLED → SHIPPED` 회수 취소; `SlipService.java:1237-1253` — 실패 시 보상 목록 실행 |
| `revisionCountBaseline` | **현행 복원/clear 대상 아님.** 출고는 최초 검수 완료 때 1회 고정되므로 A안에서 그대로 두면 재검수 때 원 anchor가 유지된다. 재산정 여부 결정 필요. | `Slip.java:629-635` — 출고는 `COMPLETED` 시점 기준선; `Slip.java:1915-1921` — 상태 전이는 revision을 늘리지 않고 최초 1회 보존 |
| `redlineAnchorRevisionNo` | **현행 복원/clear 대상 아님.** 출고 검수 완료 때 최초 1회만 고정한다. A안에서 기존 anchor 보존/재설정 중 선택 필요. | `Slip.java:638-645` — 출고 `COMPLETED` 시점 anchor; `Slip.java:1925-1932` — null일 때만 기록 |
| revision 스냅샷 | **삭제하거나 과거 행을 고치는 구조가 아니다.** 복원도 새 `RESTORE` revision을 추가한다. 다만 현재 스냅샷에는 `status`가 없고 lifecycle 메타는 복원 대상이 아니다. | `SlipRevisionType.java:12-15` — `CREATE, EDIT, RESTORE`; `SlipRevisionService.java:238-240` — 복원 후 `RESTORE` capture; `Slip.java:2207-2209` — `status / version / revisionCount 등 라이프사이클 메타는 복원 대상이 아니며` |
| 인수자·기사 전자서명 | **상태와 직교하며 자동 되돌림 대상이 아니다.** 서명은 `INSPECTING/COMPLETED/SHIPPING`에서 가능하므로 A/C안 대상 전표에 이미 존재할 수 있다. 인수자 서명은 별도 무효화 경로와 감사가 있으나 상태 되돌림이 이를 호출하지 않는다. 보존/별도 무효화 여부 결정 필요. | `Slip.java:1448-1457` — 세 상태에서 서명 가능, `SlipStatus 자체는 변경 없음`; `Slip.java:1524-1535` — 별도 서명 무효화와 audit 명시 |
| 배송 첨부·사진 | **상태 되돌림과 분리된 기존 자료일 수 있다.** `COMPLETED/SHIPPING/DELIVERED/CONFIRMED`에서 첨부가 허용된다. 삭제 여부를 코드가 상태 전이에 연결하지 않는다. 보존 여부 결정 필요. | `services/slip-service/src/main/java/com/samhanair/logis/slip/attachment/web/DeliveryAttachmentController.java:54-57` — 허용 상태에 `SHIPPING`, `DELIVERED`, `COMPLETED`, `CONFIRMED` 포함 |
| 회계 분개·원장 | **상태 전이 자체는 회계 서비스에 쓰지 않는다.** `SlipService`의 lifecycle 의존·본문에는 accounting/journal client가 없고, `confirm`도 엔티티 전이만 한다. 그러나 별도 accounting-service의 매출·매입전표 생성은 원천 전표가 `CONFIRMED`여야 하므로 C안의 `CONFIRMED` 되돌림 시 이미 파생 회계전표가 있는지 확인해야 한다. 자동 취소/역분개 연결은 확인되지 않았다. | `SlipService.java:104-144` — lifecycle 서비스 의존 목록에 accounting client 없음; `SlipService.java:1398-1403` — confirm은 마감 가드+`slip::confirm`; `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipCreateAttemptService.java:118-132` — 원천 조회 후 `CONFIRMED` 아니면 거부; `PurchaseAccountingSlipCreateAttemptService.java:113-127`도 동일 계약 |
| 세금계산서 | **직접 상태 전이 부수 효과는 확인되지 않음.** 세금계산서는 accounting-service의 별도 매출/매입전표 흐름이므로 `CONFIRMED` 이후 파생 문서 존재 여부와 처리 정책을 별도로 정해야 한다. 상태 되돌림이 발행 취소를 호출하는 코드는 없다. | `SalesAccountingSlipService.java:71-82` — 별도 accounting 전표 `DRAFT → POSTED`; `PurchaseAccountingSlipService.java:71-82` — 매입도 별도 post |
| 알림·SMS·push | **`complete/inspect/ship/deliver/confirm` 자체는 발송하지 않는다.** 각 메서드 본문은 상태·재고·anchor만 다룬다. 다만 전표 수정요청·서명 링크·배차 등 별도 흐름에서 이미 발송된 메시지는 회수할 수 없으므로 C안에서는 잔존 사실을 고려해야 한다. | `SlipService.java:991-1001` — inspect 본문; `SlipService.java:1140-1195` — complete 본문; `SlipService.java:1379-1403` — ship/deliver/confirm 본문 |
| 이카운트 외부 연동 | **현재 전표 lifecycle에서 호출 없음.** 엔티티 설명이 e-Count API 호출은 완전 제거됐다고 명시한다. 따라서 되돌릴 e-Count 전송 부수 효과는 현재 코드에서 확인되지 않는다. | `Slip.java:443-446` — `e-Count API 호출은 완전 제거 (사용자 결정)` |

### 1.3 A안에 직접 해당하는 최소 부수 효과

`COMPLETED → INSPECTING`만 허용하는 A안은 `complete()`가 이미 수행한 재고 반영을 되돌리는 전이가 아니다. 재고 반영은 그보다 앞선 `PROCESSING → INSPECTING`에서 발생한다.

> `SlipService.java:1125-1131` — `처리완료 — PROCESSING → INSPECTING`이며 `재고 차감 시점은 그대로 complete 시점 유지`

따라서 A안에서 직접 정할 것은 최소한 다음 네 가지다.

1. `inspectorUserId`, `inspectorSignedAt`, `completedAt`의 clear/보존.
2. `revisionCountBaseline`, `redlineAnchorRevisionNo`의 보존/재산정.
3. 기존 전자서명·배송첨부의 보존/무효화.
4. 상태 되돌림 감사행 및 realtime event 형식.

재고를 그대로 둔 채 `INSPECTING`으로 돌아가는 것이 도메인 의미상 맞는지는 코드가 확정하지 않는다. 다만 현행 `INSPECTING` 자체가 이미 재고 반영 이후 단계라는 점은 코드로 확정된다.

## 2. 현행 되돌림 계열 수단

| 현행 수단 | 허용 상태/대상 | 실제로 되돌리는 것 | 상태 되돌림으로 재사용 가능한가 | 근거 |
|---|---|---|---|---|
| `cancel()` | `DRAFT/SAVED/SENT`만. `PARTNER_ORDER` 전환 전표는 상태와 무관하게 금지 | 과거 상태로 복귀하지 않고 `CANCELED` 종결 상태로 전이 | 직접 재사용 불가. `COMPLETED`에서 허용되지 않음 | `Slip.java:88-89` — cancelable 상태 3종; `Slip.java:1273-1297` — 가드와 `status = CANCELED` |
| `reject(reason)` | `SENT/ACCEPTED/INSPECTING` | 과거 상태로 복귀하지 않고 `REJECTED`; memo에 사유 prepend. 직전 상태가 `ACCEPTED`인 출고만 예약 해제 | 직접 재사용 불가. 특히 `INSPECTING` 반려는 이미 complete 재고 반영 뒤인데 inventory 복구 분기가 없음 | `Slip.java:1254-1268` — 허용 상태와 memo; `SlipService.java:1421-1437` — `previous == ACCEPTED`일 때만 release |
| soft-delete 복원 | soft-delete된 **OUTBOUND 판매전표** | `is_deleted`, `deletedAt`, `deletedBy`와 같은 시각에 cascade 삭제된 라인 복원. **원래 status는 그대로 유지** | 상태 되돌림과 별개. 복원 권한/page-code·마감 가드 패턴은 후보 | `SlipRestoreService.java:78-90` — OUTBOUND 제한+마감 가드; `SlipRestoreService.java:96-128` — 헤더/라인 복원; `SlipRestoreController.java:28-32` — `sales.slip.list` `RESTORE` |
| revision 복원 | `slip.audit-revert`의 `RESTORE` 권한, 상태별 `guardLockPolicy` 및 마감 가드 통과 필요 | 특정 시점의 헤더·라인 콘텐츠를 덮어쓰고 새 `RESTORE` revision 추가. **status/lifecycle 메타는 복원하지 않음** | 감사·권한·SSE 패턴은 후보지만 상태 되돌림 자체는 수행하지 못함 | `SlipRevisionController.java:89-96` — endpoint와 권한; `SlipRevisionService.java:234-240` — 마감 가드, snapshot 복원, RESTORE capture; `Slip.java:2207-2209` — lifecycle 메타 제외 |
| audit overlay “revert” 성격의 patch | `slip.audit-overlay` `UPDATE` 권한, 지원 헤더 필드 한정 | 지정 필드를 과거 값으로 다시 patch하고 audit row+SSE를 추가할 수 있는 구조. 상태 필드는 지원 목록에 없음 | 상태 변경 감사 서비스의 패턴 후보. 현행 상태 되돌림은 아님 | `Slip.java:1951-1979` — audit revert용 지원 필드와 마감 lock; `SlipAuditLogService.java:76-90` — audit row+SSE |
| 인수자 서명 무효화 | 서명 존재 시, 별도 권한 경로 | 서명 본문·토큰을 null 처리하고 INVALIDATE audit을 남김. 상태는 변경하지 않음 | 되돌림 시 서명 정책을 분리할 때만 관련 | `Slip.java:1524-1535` — null 처리, 상태 불변, audit 명시 |
| 재고 실패 보상 | `accept` 또는 반품·회차 `complete` 중 일부 원격 호출 성공 후 후속 호출 실패 | 예약 release 또는 serial unrecall | 사용자 요청에 따른 정상 상태 되돌림 API가 아니라 saga 실패 보상 | `SlipService.java:934-960` — accept 실패 보상; `SlipService.java:1230-1253` — recall 실패 보상 |

### `cancel()`이 `COMPLETED`에서 허용되는가

허용되지 않는다.

> `Slip.java:88-89` — `CANCELABLE_STATUSES = EnumSet.of(SlipStatus.DRAFT, SlipStatus.SAVED, SlipStatus.SENT);`
>
> `Slip.java:1292-1294` — 집합 밖이면 `취소 가능한 상태가 아닙니다` CONFLICT

서비스 주석도 동일하게 `ACCEPTED`부터 cancel 불가임을 명시한다.

> `SlipService.java:1450-1453` — `ACCEPTED 단계는 cancel 불가`이며 release 분기는 사실상 reject에서만 동작

## 3. 회계 마감과의 관계

### 코드로 확정되는 답

현재 작업 트리의 날짜 마감 가드는 **복원·수정·상태 전이도 신규 생성과 동일한 규칙**을 사용한다고 명시한다.

> `services/slip-service/src/main/java/com/samhanair/logis/slip/service/closing/SlipClosedDateGuard.java:28` — `복원·수정·상태 전이도 신규 생성과 동일한 마감일 예외 권한을 사용한다.`
>
> `SlipClosedDateGuard.java:29-33` — `assertAllowed(...)`가 통과하지 못하면 `SlipClosedDateException`

실제 모든 전진 상태 서비스도 이 가드를 호출한다.

> `SlipService.java:973-974` — process 전 `closedDateGuard.assertAllowed(...)`
>
> `SlipService.java:994-1000` — inspect 전 같은 가드
>
> `SlipService.java:1140-1143` — complete 전 같은 가드
>
> `SlipService.java:1381-1402` — ship/deliver/confirm 전 같은 가드

revision 복원은 현재 전표일뿐 아니라 **복원 대상 snapshot의 전표일**도 검사한다.

> `SlipRevisionService.java:234-238` — `targetSnapshot.slipDate()`로 `assertAllowed` 후 복원

예외 권한 후보도 코드로 확정된다.

> `SlipClosedDateGuard.java:17` — `PAGE_CODE = "slip.closed-date-exception"`
>
> `SlipClosedDateGuard.java:41-43` — 해당 page-code의 `CREATE` 권한이 있으면 마감일 예외 통과

따라서 이슈 #1142의 되돌림도 현재 코드 정책을 일관되게 따르려면 `SlipClosedDateGuard.assertAllowed` 대상이다. 이는 이미 코드 주석이 “상태 전이”까지 포함하므로 단순 추정이 아니다.

### 개발책임자 확인 항목

1. 날짜 마감 예외 권한 `slip.closed-date-exception / CREATE`가 **되돌림에도 그대로 적용**되는 현 정책을 유지할지.
2. 날짜 마감과 별개인 `lock_flag=true` 전표는 현행처럼 절대 차단할지. 현재 revision 복원은 `restoreFromSnapshot()` 첫 줄에서 `requireNotLocked()`를 호출한다.
   - 근거: `Slip.java:2216-2224` — lock 전표는 복원도 CONFLICT.
3. `CONFIRMED` 전표를 되돌릴 때 이미 생성·POSTED된 accounting-service 전표가 있으면 선차단할지, 회계 역분개/취소 절차와 묶을지. 이 연계 정책은 현행 slip-service 코드에 없다.

## 4. 권한 후보

누가 가져야 하는지는 확정하지 않는다. 현행 대응 후보만 나열한다.

| 후보 권한/가드 | 현재 용도 | 후보가 되는 근거 |
|---|---|---|
| `slip.audit-revert / RESTORE` | revision 콘텐츠 복원 | 이름과 action이 가장 직접적으로 “되돌림”에 대응한다. `SlipRevisionController.java:89-96` |
| `slip.audit-overlay / UPDATE` | 필드 단위 과거값 재적용+감사 | 상태 되돌림 감사 및 SSE 패턴 후보. `SlipAuditLogController.java:73-89` |
| `sales.slip.list / RESTORE` | 삭제된 OUTBOUND 판매전표 복원 | soft-delete restore의 기존 권한. 상태 되돌림과 의미가 다르므로 동일 권한 재사용 여부는 결정 필요. `SlipRestoreController.java:28-32` |
| `slip.transfer.process / UPDATE` | accept/process/complete 및 기본 inspect, ship/deliver | 창고 처리 lifecycle 권한 후보. `SlipController.java:497-553`, `SlipController.java:563-575` |
| `sales.slip.confirm / UPDATE` | 출고 confirm | `CONFIRMED` 관련 C안의 후보. `SlipController.java:578-591` |
| `sales.slip.cancel / UPDATE` | OUTBOUND cancel | 명칭은 취소지만 현행 cancel은 초기 상태 전용이므로 상태 되돌림과 동일시할 수 없다. `SlipController.java:617-625` |
| `slip.reject / UPDATE` | SENT/ACCEPTED/INSPECTING 종결 반려 | 검수 단계 오류 처리 권한 후보이나, “이전 단계 복귀”가 아니라 종결 반려다. `SlipController.java:594-609` |
| `inbound.inspection / UPDATE` | INBOUND inspect 추가 가드 | 입고 `COMPLETED → INSPECTING` 후보 권한 검토 시 관련. `SlipController.java:530-540` |
| 결재라인 action (`OUTBOUND_INSPECT`, `INBOUND_INSPECT`) | 검수 완료 실행자 제한 | 원 검수 완료 권한과 되돌림 권한을 결합할지 분리할지 결정 필요. `SlipService.java:1097-1107` |
| `slip.closed-date-exception / CREATE` | 마감일 생성·복원·수정·상태 전이 예외 | 마감일 전표를 되돌릴 때 별도로 필요한 보조 권한. `SlipClosedDateGuard.java:17,28-43` |

역할명 주석은 오래된 정적 설명이고 실제 endpoint는 동적 page-code를 사용한다. 역할 후보 참고로만 볼 수 있다.

> `SlipController.java:70-73` — 취소는 `SALES, MANAGER, MASTER`, 처리·완료·배송은 `WAREHOUSE, INVENTORY, MANAGER, MASTER`, 확정은 `ACCOUNTANT, MANAGER, MASTER`, 반려는 `MANAGER, MASTER`

개발책임자 확인 항목: 전용 `slip.status-revert` 같은 새 page-code를 만들지, 위 기존 권한 중 하나를 재사용할지 결정이 필요하다.

## 5. 감사

### 현행 기제

`SlipAuditLogService`는 범용 상태머신 감사가 아니라 **콘텐츠 overlay 변경** 감사 서비스다.

> `SlipAuditLogService.java:23-29` — 책임은 단일/다중 필드 변경 audit와 timeline 조회
>
> `SlipAuditLogService.java:84-90` — revision 증가, `SlipAuditLog.record(...)`, `slip:edit` SSE

현재 lifecycle 메서드 `complete/inspect/ship/deliver/confirm/cancel`은 `SlipAuditLogService`를 호출하지 않는다. `inspect`는 redline anchor만 기록한다.

> `SlipService.java:991-1001` — inspect 본문에 audit 호출 없음
>
> `SlipService.java:1136-1195` — complete 본문은 상태+inventory만 수행
>
> `SlipService.java:1374-1403` — ship/deliver/confirm은 상태 전이만 수행

revision 복원은 감사 흔적을 별도 `SlipRevisionType.RESTORE`로 남기지만 audit row는 만들지 않는다고 명시한다.

> `SlipService.java:704-708` — `audit row 는 만들지 않고 slip_revisions RESTORE 행`과 표시 카운트만 증가

### 착수 전 결정 필요

되돌림은 별도 유형으로 식별 가능하게 기록할 필요가 있다. 다만 저장 위치와 형식은 미확정이다.

선택지는 다음과 같이 코드상 나뉜다.

1. `slip_revisions`에 새 상태용 revision type을 추가한다. 현 enum은 `CREATE/EDIT/RESTORE`뿐이고 snapshot에는 status가 없다.
2. `slip_audit_logs`에 `fieldName=status`, `oldValue=COMPLETED`, `newValue=INSPECTING` 형태로 기록한다. 현 테이블 factory는 old/new 문자열을 받을 수 있다.
   - 근거: `SlipAuditLog.java:149-153` — `fieldName, oldValue, newValue` 저장.
3. 상태 전이 전용 audit entity/event를 만든다.
4. 1과 2를 함께 사용하되 revision 번호 중복 의미를 정한다.

필수 기록 후보는 `fromStatus`, `toStatus`, actor ID/표시명, 시각, 사유, 전표번호, 마감 예외 사용 여부, 재고·회계 보상 결과다. 어느 저장소/유형을 쓸지는 개발책임자 확인 항목이다.

또한 원 검수 흔적을 지우더라도 감사행 자체를 수정·삭제하는 방식은 기존 누적형 복원 철학과 맞지 않는다.

> `SlipRevisionService.java:208-213` — 복원 자체를 신규 RESTORE revision으로 캡처하고 최신 항목으로 누적

## 6. 범위 후보 비교

어느 안을 선택할지는 이 보고서에서 정하지 않는다.

| 안 | 코드상 난이도 | 반드시 다룰 부수 효과 | 주요 위험/결정 |
|---|---|---|---|
| A. `COMPLETED → INSPECTING`만 | **낮음~중간.** 단일 역전이와 단일 endpoint/권한/감사 추가가 중심. 재고는 이미 `PROCESSING → INSPECTING`에서 반영됐으므로 직접 역연산하지 않음. | 검수자·검수시각·완료시각, revision baseline, redline anchor, 기존 서명·첨부, 날짜 마감/lock, audit/SSE | 세 timestamp/actor clear 여부; 재검수 시 anchor 재산정 여부; 같은 전표의 반복 `inspect`가 원 검수 기록을 덮는 방식; `INSPECTING` 상태에 이미 재고 반영이 유지되는 의미 확인 |
| B. 임의의 이전 단계로 | **매우 높음.** 상태 간 경로마다 역연산 표가 필요하고 임의 점프를 허용하면 중간 단계 불변식을 재구성해야 함. | A 전부 + accept 예약/해제, complete의 batch/serial 차감·입고·회수, accepted/dispatcher 메타, sourceType별 가드, 결재라인 | batch deduct, serial ship, batch/serial inbound에 일반 inverse API가 없음; 일부 단계만 역연산 가능; `PARTNER_ORDER` cancel 금지 불변식; 임의 점프와 한 단계씩 되돌리기의 동시성·멱등성 차이 |
| C. `SHIPPING/DELIVERED/CONFIRMED`에서도 되돌리기 | **높음~매우 높음.** SHIPPING/DELIVERED 자체는 상태만 바꾸지만 그 상태에서 서명·첨부가 쌓일 수 있고, CONFIRMED는 회계 파생 문서의 원천 자격을 부여함. | A 전부 + `confirmedAt`, 배송 서명/첨부, lock_flag, 날짜 마감, accounting-service 매출·매입전표·세금계산서 존재 확인 | `lock_flag=true` 차단/예외 정책; 이미 생성 또는 POSTED된 회계전표 처리; 발송된 외부 메시지 회수 불가; 배송 완료 사실과 UI/리포트 집계 변경; 출고와 입고의 선행 상태가 다름 |

### 난이도 근거 보강

- A안은 `inspect()`가 만든 직접 필드가 세 개이고 재고 호출이 없다.
  - `Slip.java:1189-1195` — 상태, baseline, 검수자/시각/완료시각.
  - `SlipService.java:995-1000` — redline anchor 외 원격 호출 없음.
- B안은 `complete()` 경계를 넘는 순간 inventory-service에 업무상 inverse가 없는 호출들을 되돌려야 한다.
  - `SlipService.java:1151-1190` — outbound ship/deduct, inbound instance 생성.
  - `SlipService.java:1244-1245` — batch inbound inverse API 없음 명시.
- C안에서 `CONFIRMED`는 accounting-service 원천 전표 생성의 필수 조건이다.
  - `SalesAccountingSlipCreateAttemptService.java:129-132` — `CONFIRMED`가 아니면 원천 사용 거부.
  - `PurchaseAccountingSlipCreateAttemptService.java:124-127` — 입고 원천도 같은 조건.

## 7. 착수 전에 개발책임자가 정해야 하는 항목

1. 허용 범위: A/B/C 중 어느 범위인지, B라면 임의 점프인지 한 단계씩인지.
2. A안 메타: `inspectorUserId`, `inspectorSignedAt`, `completedAt`을 null로 비울지 보존할지.
3. anchor: A안 되돌림 후 `revisionCountBaseline`, `redlineAnchorRevisionNo`를 보존할지 재검수 시 재산정할지.
4. 서명·첨부: 기존 전자서명·배송첨부를 보존할지, 별도 무효화 절차를 강제할지.
5. 재고: B안에서 inverse가 없는 `deduct`, `shipInstances`, `inbound`, `inboundInstances`를 범위 밖으로 둘지 새 보상 API를 만들지.
6. 회계: `CONFIRMED` 되돌림 전에 파생 accounting 전표 존재 여부를 검사할지, POSTED/세금계산서 존재 시 차단할지, 역분개 절차와 결합할지.
7. 마감: `slip.closed-date-exception / CREATE` 예외를 되돌림에도 그대로 적용할지; `lock_flag=true`는 절대 차단할지.
8. 권한: 기존 `slip.audit-revert / RESTORE`를 재사용할지 전용 page-code를 만들지; 원 검수자 본인 제한/4-eye 제한 여부.
9. 감사: `slip_revisions`, `slip_audit_logs`, 전용 상태 audit 중 저장 위치와 별도 유형; 사유 필수 여부.
10. 실시간/UI: `slip:restored`를 재사용할지 `slip:status-reverted` 같은 별도 event를 만들지.

## 8. 확정하지 못한 것

다음은 코드만으로 정책을 확정할 수 없다.

1. 검수 완료를 되돌릴 때 검수자·검수시각·완료시각을 삭제해야 하는지, 과거 사실로 유지해야 하는지.
2. redline anchor와 revision baseline을 최초 검수 기준으로 영구 보존할지, 재검수 기준으로 다시 잡을지.
3. 이미 존재하는 인수자/기사 서명 및 배송 첨부를 자동 무효화해야 하는지.
4. `INSPECTING`에서 `REJECTED`로 가는 현행 경로가 재고를 되돌리지 않는 것이 의도된 운영 정책인지 결함인지.
5. accounting-service에 이미 만들어진 매출·매입전표, POSTED 분개, 세금계산서가 있을 때 원천 slip 상태 되돌림을 허용할지.
6. B안의 일반 재고 역연산 API를 새로 만들 수 있는지, 또는 inverse 없는 경계를 범위 밖으로 둘지.
7. 되돌림 권한을 어떤 역할/계정에 부여할지.
8. 되돌림 사유를 필수로 받을지와 감사 저장소·event schema.
9. 상태를 한 단계씩만 되돌릴지, 지정 과거 단계로 직접 점프를 허용할지.
10. 발송 완료된 SMS/push/외부 배차 통지를 운영적으로 어떻게 표시할지. 현 코드에는 메시지 회수 기제가 없다.

## 9. 신규 파일

- `docs/dev-reports/2026-08-08-1142-slip-revert-feasibility.md`

이 조사에서는 위 보고서 외 신규 파일을 만들지 않았고 기존 파일을 수정하지 않았다.
