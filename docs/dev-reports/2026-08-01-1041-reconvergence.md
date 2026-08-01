# #1041 가입고 멱등 키 수정 재수렴 검증

## 확인 1 — 작업 경계

```text
git branch --show-current
feat/1011-provisional-receipt

git log --oneline -1
8752d0437 [FIX] #1041 가드가 정상 복수 라인을 막던 결함 — 멱등 키에 라인 추가
```

- 지정 브랜치와 fix 커밋을 확인했다.
- 허용된 유일한 파일 변경은 이 검증 보고서 신규 작성뿐이다. 코드·git·Docker·DB 쓰기는 하지 않는다.

## 확인 2 — 라인 식별자 없는 요청의 계약

정적 전수 검색:

```text
rg -n --glob '*.java' 'new InboundRequest\(|\.inbound\(|inventoryClient\.inbound\(|InboundRequest\(' services
```

원문 핵심:

```text
InboundRequest.java:23: 기존 외부 입고 호출과의 소스 호환용 생성자
InventoryClient.java:125: 기존 5-인자 inbound overload
StockService.java:80: ? stockLotRepository.findFirstByProductIdAndWarehouse_IdAndLotNoAndIsDeletedFalse(
StockService.java:82: : stockLotRepository.findFirstByProductIdAndWarehouse_IdAndLotNoAndInboundLineIdAndIsDeletedFalse(
```

- 라인 식별자가 없는 HTTP/Java 요청은 validation으로 거부되지 않는다. `InboundRequest.inboundLineId`에는 `@NotNull`이 없고, 기존 7-인자 생성자와 `InventoryClient` 5-인자 overload는 `null`을 보낸다.
- `StockService.inbound`는 `null`이면 기존 `(품목·창고·lotNo)` 조회로 폴백한다. 따라서 “라인 정보가 없다는 이유로 정상 입고가 거부되는 새 결함”은 정적 계약상 없다.
- 단, 실제 사용자 경로의 영속 라인 ID가 null이 되는지와 동시 재시도의 DB 방어는 별도 확인한다.

## 확인 3 — production 호출부 전수

```text
services/inventory-service/.../StockController.java:219: stockService.inbound(request, ...)
services/slip-service/.../SlipService.java:1085: inventoryClient.inbound(...)
services/slip-service/.../SlipService.java:1089: inventoryClient.inbound(...)
```

- `StockService.inbound`의 production 진입점은 공개 inventory 입고 API 1곳이다. 요청 JSON이므로 `inboundLineId` 생략이 가능하다.
- repo 내부에서 그 API를 호출하는 production Java 코드는 `SlipService`의 두 호출뿐이다. 나머지 검색 결과는 테스트 또는 serial 전용 `StockInstance.inbound`로, V22 lot 키 표면이 아니다.

## 확인 4 — 라인 없는 실 API 경로와 핵심 멱등 실행

실행 명령:

```text
.\gradlew :services:inventory-service:test
  --tests '...StockServiceTest.inbound_createsLotAndAddsBalance_andLogsMovement'
  --tests '...StockServiceTest.inbound_sameSlipProductWarehouse_differentLines_appliesBothQuantities'
  --tests '...StockServiceTest.inbound_sameLineKey_calledByBothPaths_appliesOnlyOnce'
  --tests '...InboundInspectionServiceTest*slipThenInspection_sameLineKey_appliesOnce'
  --tests '...InventoryControllerIT.warehouseRole_inbound_thenDeduct_succeeds'
  --rerun-tasks --no-daemon --console=plain
```

출력 원문:

```text
> Task :services:inventory-service:test

BUILD SUCCESSFUL in 54s
18 actionable tasks: 18 executed

Suite                                                  Tests Failures Errors Skipped
com.samhanair.logis.inventory.it.InventoryControllerIT 1     0        0      0
completeInspection                                     1     0        0      0
com.samhanair.logis.inventory.service.StockServiceTest 3     0        0      0

A: 수량 2+3 = 5
B: 두 경로 합산 반영 수량 = 2 (1회)
B: 전표+검수 동일 라인 = 1회
```

- 라인 식별자를 보내지 않는 WAREHOUSE 권한 `POST /inventory/lots/inbound` 실 HTTP 경로가 201 입고 후 출고까지 통과했다. 새 필드 누락으로 막히는 사용자 경로는 재현되지 않았다.
- 서로 다른 라인 2+3은 5로 반영되고, 같은 라인 요청을 두 번 보내거나 전표→검수로 재호출하면 1회만 반영됐다.
- 이 선택 실행에서 막힌 건수는 0/5건이다. 실 운영 데이터 영향 건수는 별도 read-only SQL로 센다.

## 확인 5 — 검수·batch 반품·취소·수정·serial 반품 정상 경로

실행 명령:

```text
.\gradlew :services:slip-service:test
  --tests '...SlipServiceTest.complete_inbound_returnTag_batchDuplicateLines_passesEachLineToInventory'
  --tests '...SlipServiceTest.complete_inbound_returnTripTag_serialProduct_callsRecallInstances'
  --tests '...SlipServiceTest.cancel_fromSaved_succeeds_noInventoryCall'
  --tests '...SlipInboundInstanceIT.complete_batchLine_callsLotInbound'
  --tests '...SlipInboundInstanceIT.complete_returnTag_batchLine_callsLotInbound'
  --tests '...SlipInboundInstanceIT.complete_returnTripTag_serialLine_callsRecallInstances'
  --tests '...SlipUpdateIT.testUpdateSuccess'
  --rerun-tasks --no-daemon --console=plain
```

출력 원문:

```text
> Task :services:slip-service:test
BUILD SUCCESSFUL in 1m 13s
18 actionable tasks: 18 executed

Suite                                             Tests Failures Errors Skipped
com.samhanair.logis.slip.it.SlipInboundInstanceIT 3     0        0      0
com.samhanair.logis.slip.it.SlipUpdateIT          1     0        0      0
com.samhanair.logis.slip.service.SlipServiceTest  3     0        0      0

C: batch 반품 복수 라인 2+3 = 5 (각 라인 1회)
```

- 검수 경로는 확인 4의 전표→검수 교차 실행으로 통과했다.
- batch 일반 입고, batch 반품 단일/복수 라인, serial 반품/회차, SAVED 취소, DRAFT 매입 수정의 실 서비스/HTTP 경로가 모두 통과했다.
- 취소는 입고 호출 전 상태에서 끝나고 serial 반품은 `stock_instances` 경로이므로 새 lot 키를 사용하지 않는다. 선택 실행에서 정상 경로 차단은 0/7건이다.

## 확인 6 — 실 DB V22 충돌·NULL read-only 재측정

실행은 공유 `samhan-postgres`의 `inventory_db`에 대한 단일 `BEGIN READ ONLY` 트랜잭션이다.

출력 원문:

```text
BEGIN
      db      | read_only
--------------+-----------
 inventory_db | on

 v22_success_rows
------------------
                0

 inbound_line_column_present
-----------------------------
                           0

 qualifying_active_lots
------------------------
                      0

 current_key_duplicate_groups | current_key_duplicate_rows
------------------------------+----------------------------
                            0 |                          0

 inspection_lines_with_null_slip_line_id
-----------------------------------------
                                       0
COMMIT
```

- fix 보고서와 동일하게 V22 미적용, 컬럼 미존재, 대상 활성 lot 0건, 기존 3열 키 중복 0그룹/0행이 재현됐다.
- 컬럼 자체가 아직 없고 V22가 기존 행에 추가할 값은 모두 null이며, index predicate가 `inbound_line_id IS NOT NULL`인 행만 포함한다. 따라서 기존 데이터의 새 4열 키 충돌도 0건이다(대상 모수 0건).
- 기존 검수 라인의 `slip_line_id` null은 0건이다. 검수 정상 경로가 라인 키 누락으로 막힐 실 데이터는 0건이다.
- 선택 실행의 `InventoryControllerIT`가 fresh 테스트 DB 기동 시 전체 Flyway 뒤 애플리케이션 컨텍스트와 입고 API를 통과했으므로 V22는 빈 DB에 실제 적용 가능했다. 공유 DB에는 적용하지 않았다.

## 확인 7 — 라인 ID 재생성·재사용과 재시도 도달성

코드 추적 결과:

```text
SlipUpdateService.update -> toLine(...) -> SlipLine.create(...)
Slip.replaceLines -> 기존 라인 markDeleted -> 새 라인 컬렉션 교체
SlipLine.id -> @GeneratedValue
Slip.requireEditable -> DRAFT/SAVED 외 CONFLICT
SlipService.complete -> @Transactional, PROCESSING에서만 진입
```

- **전표를 수정하면 활성 라인 ID는 바뀐다.** direct PUT은 요청의 기존 `lineId`를 소유권 검증에만 쓰고 `toLine`에서 모든 라인을 새 엔티티로 만든다. 리비전 복원도 라인을 재생성한다.
- 그러나 두 경로 모두 `DRAFT/SAVED`에서만 허용되고 실제 lot 입고는 `PROCESSING -> INSPECTING`의 `complete`에서 처음 일어난다. 입고가 한 번 반영된 뒤 라인을 재생성해 같은 입고를 새 키로 다시 보내는 사용자 경로는 상태 가드에 막힌다.
- 네트워크 실패가 inventory commit 이후 응답 전에 발생하면 slip 트랜잭션은 예외로 롤백되어 `PROCESSING`에 남지만, 영속 라인 자체는 교체되지 않는다. 사용자가 `complete`를 재호출하면 같은 라인 ID를 다시 보내며 확인 4의 동일 키 no-op으로 수렴한다.

실 DB read-only 출력 원문:

```text
BEGIN
   db    | read_only
---------+-----------
 slip_db | on

 active_inbound_lines | active_inbound_lines_without_id
----------------------+---------------------------------
                  110 |                               0

   status   | inbound_slips | active_lines
------------+---------------+-------------
 ACCEPTED   |             6 |          21
 CANCELED   |             4 |           4
 COMPLETED  |             6 |          17
 CONFIRMED  |             1 |           3
 DRAFT      |            11 |          22
 INSPECTING |             2 |           6
 PROCESSING |             5 |          12
 REJECTED   |             2 |           9
 SAVED      |             3 |          10
 SENT       |             2 |           6

 inbound_slips_with_active_and_deleted_lines | progressed_after_line_regeneration
---------------------------------------------+------------------------------------
                                          12 |                                  4
COMMIT
```

- 실 데이터의 활성 입고 라인 110건은 전부 ID가 있다. 라인 교체 흔적이 있는 입고전표는 12건, 그 뒤 진행 상태로 넘어간 전표는 4건이지만, 진행 시 전달되는 것은 교체 후의 단일 활성 ID다.
- 재생성 때문에 동일 입고가 두 번 반영될 수 있는 도달 가능한 실 데이터는 0건으로 판정한다. 현재 inventory DB의 V22 대상 lot 모수도 0건이라 실 발생 중복은 0건이다.

## 확인 8 — inventory-service 전체 546 재현

실행 명령과 출력 원문:

```text
.\gradlew :services:inventory-service:test --rerun-tasks --no-daemon --console=plain

> Task :services:inventory-service:test
BUILD SUCCESSFUL in 2m 7s
18 actionable tasks: 18 executed

InventoryTests=546 Failures=0 Errors=0 Skipped=1
A: 수량 2+3 = 5
B: 두 경로 합산 반영 수량 = 2 (1회)
B: 전표+검수 동일 라인 = 1회
```

- fix 보고서의 inventory 546건과 전표 2+3=5 수치가 fresh 전체 실행에서 일치했다.

## 확인 9 — slip-service 전체 1,533 및 batch 2+3 재현

실행 명령과 출력 원문:

```text
.\gradlew :services:slip-service:test --rerun-tasks --no-daemon --console=plain

> Task :services:slip-service:test
BUILD SUCCESSFUL in 8m 18s
18 actionable tasks: 18 executed

SlipTests=1533 Failures=0 Errors=0 Skipped=0
C: batch 반품 복수 라인 2+3 = 5 (각 라인 1회)
```

- fix 보고서의 slip 1,533건과 batch 반품 2+3=5 수치가 fresh 전체 실행에서 일치했다.

## 확인 10 — V22 실제 적용 로그와 NULL unique 동작

fresh inventory 전체 실행의 `ApplicationContextLoadIT` 원문:

```text
Migrating schema "public" to version "22 - add inbound slip lot idempotency index"
Successfully applied 22 migrations to schema "public", now at version v22
```

- V22의 DDL은 fresh PostgreSQL에 실제 적용됐다. 적용 가능성은 단순 구문 검토가 아니라 실행으로 확인했다.
- V22 index predicate에는 `inbound_line_id IS NOT NULL`이 명시되어 있다. 따라서 기존 행과 라인 식별자 없는 신규 행은 index에 들어가지 않으며, PostgreSQL의 NULL unique 의미와 무관하게 DB unique 방어 대상이 아니다.
- 라인 없는 요청의 순차 재호출은 애플리케이션의 기존 3열 조회로 1회 수렴한다. 반면 두 요청이 조회와 insert 사이를 동시에 통과하는 경쟁에서는 DB index가 최종 방어하지 않는다.
- 이 동시성 표면은 코드/DDL상 열려 있으나, 코드 수정 금지와 실 DB 쓰기 금지 범위에서 동시 HTTP 사용자 경로로 실행 재현하지 못했다. 사용자 지시상 직접 SQL만으로는 게이트가 아니므로 **확정 결함으로 게이트하지 않고 미검증 축으로 남긴다.**

## 결함별 도달성 판정

### 확정 결함

- **0건.** 정상 경로 차단과 순차 중복 반영은 실 사용자 HTTP/서비스 경로에서 재현되지 않았다.

### 비게이트 관찰 — 라인 없는 동시 입고의 DB 최종 방어 부재

1. **실 사용자 경로 재현 여부**: 라인 없는 WAREHOUSE 입고 API의 단일 호출과 순차 동작은 실행했다. 두 동시 호출은 실행 재현하지 못했으므로 결함 게이트가 아니다.
2. **재현 명령과 출력 원문**: 확인 4의 `InventoryControllerIT`는 `BUILD SUCCESSFUL in 54s`, 확인 10의 V22 원문은 `inbound_line_id IS NOT NULL` predicate다.
3. **실 데이터 영향 건수**: 현재 V22 대상 활성 lot 0건, 기존 키 중복 0그룹/0행이다. 현재 확인 가능한 영향은 0건이다.

## 최종 판정

- fix가 만든 키 표면 전체에서 **BLOCKER 재현 0건**이다.
- 라인 식별자 없는 요청은 거부되지 않았고, repo 내부 영속 전표/검수 호출은 모두 라인 ID를 전달했다.
- 동일 라인 순차 재호출과 전표→검수 교차 재호출은 1회, 서로 다른 라인과 batch 반품은 2+3=5로 수렴했다.
- V22는 실 DB 충돌 0건이고 fresh PostgreSQL에 적용됐다.
- 전체 집계는 inventory 546건(실패 0, 오류 0, skip 1), slip 1,533건(실패 0, 오류 0, skip 0)이다.

## 이 라운드가 보지 않은 축

- 라인 없는 입고 API의 **동시** 두 HTTP 요청과 실제 패킷 유실 주입은 실행하지 않았다.
- 공유 실행 서비스는 fix 코드로 재빌드·재기동하지 않았으므로 라이브 서비스 호출은 하지 않았다.
- repo 밖 외부 소비자가 `inboundLineId`를 보내는지 여부는 확인하지 못했다.
- 실 DB에 V22를 실제 적용하는 쓰기와 운영 데이터 mutation은 하지 않았다.
- 가입고→DPS 계승(#1011)은 별도 범위라 보지 않았다.

## 준수 사항

- 코드·git 쓰기 없음. 공유 Docker 재빌드·재기동 없음. 실 DB 쓰기 없음.
- 사용자 식별자 원문을 기록하지 않았고, 전표 식별은 전표번호 형식과 집계 수치로만 기록했다.

## 확인 11 — 완료 직전 검증

```text
ReportExists       : True
RequiredChecks     : 10
MissingChecks      : 0
GuidValueMatches   : 0
UuidWordMatches    : 0
CodeFencesBalanced : True
InventoryTests     : 546
InventoryFailures  : 0
InventoryErrors    : 0
InventorySkipped   : 1
SlipTests          : 1533
SlipFailures       : 0
SlipErrors         : 0
SlipSkipped        : 0

git status --short
?? docs/dev-reports/2026-08-01-1041-reconvergence.md
```

- git 상태상 변경은 이 신규 보고서 1개뿐이며 코드 변경은 없다.
