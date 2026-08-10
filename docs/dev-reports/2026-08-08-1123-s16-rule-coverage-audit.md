# PR #1124 / Issue #1123 — S16 업무 규칙 적용 범위 감사

- 감사일: 2026-08-08 KST
- 대상: `feat/1123-closed-date-guard`, 사용자 지정 HEAD `6fc584b6c`
- 확정 규칙: **마감된 날짜에 전표가 새로 나타나면 안 된다. 예외는 `slip.closed-date-exception` 권한자.**
- 제한 준수: 제품 코드 수정 없음, `git` 명령 없음, 컨테이너 재기동·재배포 없음, DB 직접 조작 없음
- 실측: gateway `http://127.0.0.1:8080`, `dev_manager` 실 로그인 JWT, 실 관리자/전표 API만 사용

## 결론

다음 라운드에서 적용해야 할 코드 좌표는 세 묶음이다.

1. **확정 결함 — soft-delete 복원**: `SlipRestoreService.restore()`가 마감 검사 없이 `is_deleted=false`로 되돌린다. 닫힌 날짜에서 HTTP 200과 활성행 재등장을 1/1 재현했다.
2. **날짜 회귀 후보 — revision/full-snapshot 복원**: `Slip.restoreFromSnapshot()`이 `slipDate`를 직접 덮어쓰지만 마감 검사 지점이 없다. 정식 revision 복원 endpoint가 닫힌 날짜에서 HTTP 200인 것은 1/1 재현했다. 다만 서로 다른 날짜 revision 표본은 만들 수 없어 실제 날짜 이동은 **판정 불가**다.
3. **비HTTP 후보 — dev 시작 시드**: `SlipSeeder`가 과거 날짜의 활성 Slip을 직접 저장하지만 guard를 주입하지 않는다. 재기동 금지 때문에 **판정 불가**다.

이미 확인된 운영 생성 7경로는 모두 guard와 연결돼 있다. 공개 수정 DTO에는 `slipDate`가 없고, 상태 전이는 이미 활성인 행의 `status`만 바꾸므로 확정된 한 문장 규칙의 “새로 나타남”에는 해당하지 않는다. Slip을 함께 만드는 회계·재고·세금계산서 연쇄도 찾지 못했다.

사용자가 제시한 7개 축 밖의 **여덟째 축은 “버전/스냅샷 회귀”**다. 정식 revision restore와 framework용 full-snapshot restore가 여기에 속한다.

## 1. 마감 검사 지점과 호출부 전수

가드 정의는 신규 생성 전용으로 작성돼 있다.

```java
// SlipClosedDateGuard.java:12,24-29
/** 신규 전표의 (종류, 전표일) 마감 여부를 저장 직전에 판정한다. */
public void assertCreatable(SlipType slipType, LocalDate slipDate, String requesterId) {
    if (isCreatable(slipType, slipDate, requesterId)) {
        return;
    }
    throw new SlipClosedDateException();
}
```

권한 예외를 포함한 판정 원문은 다음과 같다.

```java
// SlipClosedDateGuard.java:32-48
if (!isClosed(slipType, slipDate)) {
    return true;
}
UUID accountId = parseUuid(requesterId);
return accountId != null
        && permissionClient.check(accountId, PAGE_CODE, PermissionAction.CREATE);
...
.filter(baseline -> baseline.isEnabled()
        && slipDate.isBefore(baseline.getBaselineDate())
        && !slipDate.isAfter(LocalDate.now(clock)))
```

main 코드에서 `SlipClosedDateGuard`를 호출하는 곳은 아래 8곳이 전부다.

```text
SlipService.java:270                         assertCreatable — 직접 생성
SlipDuplicateService.java:90                assertCreatable — 복사
MobilePartnerOrderService.java:119          assertCreatable — 모바일 주문
EstimateToSlipConverter.java:67-68          assertCreatable — 견적 전환
SlipPublishService.java:140                 assertCreatable — 견적 발행
SlipPublishService.java:227                 assertCreatable — 주문 발행
SlipPublishService.java:331                 assertCreatable — 주문 병합 발행
OutboundCutoffGuard.java:125-126             isCreatable — 대체 출고일 탐색, 저장 경로 아님
```

## 2. 경로 대조표

`규칙 적용됨?`은 코드 호출 여부와 실측을 구분했다. 표본 0은 적용으로 판정하지 않았다.

| 경로 이름 | 진입점(파일:줄 · HTTP 메서드·URL) | 규칙 적용됨? | 근거(파일:줄 원문) |
|---|---|---|---|
| 직접 OUTBOUND/INBOUND 생성 | `SlipController.java:302-304` · `POST /api/v1/slips` | **예** | `SlipService.java:269-270` — 날짜 산출 직후 `closedDateGuard.assertCreatable(req.slipType(), slipDate, requesterId)` |
| 전표 복사 | `SlipController.java:331-333` · `POST /api/v1/slips/{id}/duplicate` | **예** | `SlipDuplicateService.java:89-90` — 오늘 날짜 산출 직후 `assertCreatable(source.getSlipType(), slipDate, requesterId)` |
| 모바일 파트너 주문 전표 | `MobileSalesController.java:137-140` · service mapping `POST /mobile/sales/partner-orders` | **예** | `MobilePartnerOrderService.java:118-120` — 전표일 산출 후 `assertCreatable(OUTBOUND, slipDate, requesterId)`; gateway `application.yml`에는 `/mobile/sales/**` route가 없어 현재 gateway 도달 URL은 확인되지 않음 |
| 견적 → 출고전표 전환 | `EstimateController.java:197-202` · `POST /api/v1/slips/estimates/{id}/convert` | **예** | `EstimateService.java:341-353`이 converter 호출, `EstimateToSlipConverter.java:66-69`가 `assertCreatable` 후 채번 |
| 견적 발행 | `SlipPublishController.java:89-96`, `InternalSlipPublishController.java:68-73` · `POST /api/v1/slips/from-estimate`, service-internal `POST /internal/slips/from-estimate` | **예** | 공통 `SlipPublishService.java:139-140` — `parseIoDate` 직후 `assertCreatable` |
| 주문 발행 | `SlipPublishController.java:124-131` · `POST /api/v1/slips/from-partner-order` | **예** | `SlipPublishService.java:226-227` — `parseIoDate` 직후 `assertCreatable` |
| 주문 병합 발행 | `SlipPublishController.java:165-173` · `POST /api/v1/slips/from-orders-merge` | **예** | `SlipPublishService.java:330-331` — `parseIoDate` 직후 `assertCreatable` |
| 판매전표 soft-delete 복원 | `SlipRestoreController.java:26-29` · `POST /api/v1/slips/{id}/restore` | **아니요 — 실 결함** | `SlipRestoreService.java:25-27`에 guard 주입이 없고, `71-97`은 삭제행 조회 → `markRestoredWithNameCleared()` → `saveAndFlush`; 닫힌 날짜 HTTP 200 실측 |
| revision 복원 | `SlipRevisionController.java:89-96` · `POST /api/v1/slips/{id}/revisions/{revisionNo}/restore` | **아니요 — 닫힌 날짜 실행 200, 날짜 이동은 판정 불가** | `SlipService.java:689-703`은 status/lock guard 뒤 revision 복원·save. `Slip.java:2232-2234`는 `this.slipDate = snapshot.slipDate();` |
| 협업 포트 full-snapshot 복원 | HTTP 진입점 없음 · `SlipDocumentCollaborationPort.java:244-249` | **아니요 — 현재 비도달, 판정 불가** | JSON snapshot 역직렬화 → `slip.restoreFromSnapshot(snapshot)` → `slipRepository.save(slip)`; main 호출부 grep 0건 |
| 헤더 부분 수정 | `SlipController.java:348-349` · `PATCH /api/v1/slips/{id}/header` | **비대상 — 날짜 필드 없음** | `EditHeaderRequest.java:14-25`의 7필드에 `slipDate` 없음 |
| V20 부분 수정 | `SlipController.java:409-410` · `PATCH /api/v1/slips/{id}/v20` | **비대상 — 날짜 필드 없음** | `UpdateSlipRequest.java:39-61`에 `slipDate` 없음 |
| 매입 direct PUT | `SlipUpdateController.java:40-48` · `PUT /api/v1/slips/{id}` | **비대상 — 날짜 필드 없음** | `SlipUpdateRequest.java:28-56`에 `slipDate` 없음; 서비스는 헤더/라인만 교체 |
| 매출 direct PUT | `SalesSlipUpdateController.java:49-57` · `PUT /api/v1/slips/{id}/sales` | **비대상 — 날짜 필드 없음** | 같은 `SlipUpdateRequest` 사용. `Slip.java`의 날짜 대입은 생성자 `661`과 snapshot 복원 `2234`뿐 |
| 일반 상태 전이 11종 | `SlipController.java:465-623` · `POST /api/v1/slips/{id}/{save,send,accept,process,inspect,complete,ship,deliver,confirm,reject,cancel}` | **비대상 — 활성 여부·날짜 불변** | `Slip.java:1096-1297`은 `status`만 전이하며 `isDeleted/slipDate`를 바꾸지 않음. 취소·반려도 soft-delete가 아니므로 이미 활성행 |
| 취소 해제·반려 재상신·일괄 발행/상태 전환 | 해당 controller endpoint 없음 | **대상 경로 없음** | `SlipController` mutation endpoint 전수에서 역방향/일괄 상태 endpoint 0건 |
| dev 시작 시드 | HTTP 없음 · `SlipSeeder.java:59-63,210-237,342-346` `CommandLineRunner` | **아니요 — 재기동 금지로 판정 불가** | 번호 존재 여부만 확인 후 `Slip.createOutbound/createInbound` 및 `slipRepository.save`; guard 주입 없음 |
| scheduler/Flyway의 신규 활성화·날짜 변경 | 진입점 없음 | **대상 경로 없음** | main Java/SQL 전수 grep에서 `INSERT INTO slips`, `UPDATE slips SET is_deleted=false`, `UPDATE slips SET slip_date=...` 실행문 0건. V117의 복원 SQL은 주석뿐이고 실제 동작은 soft-delete |
| 배송 배치·배차 확정/취소/재배차 | 배차/배송 controller 다수 | **비대상 — dispatch/batch 상태만 변경** | `DispatchTask*Service`의 `slipRepo.save`는 `dispatchStatus`만 변경. `DeliveryBatchSeeder.java:89-131`도 기존 Slip에 batch FK만 연결 |
| 회계 분개·재고 이동·세금계산서 연쇄 | 별도 accounting/inventory endpoint | **Slip 신규 생성 경로 없음** | Slip 생성/전이 코드에서 다른 `Slip.create*` 호출 0건. `complete`는 inventory 입출고를 호출할 뿐 새 Slip을 만들지 않음 |

## 3. 저장·활성화·상태 변경 서비스 차집합

### 3.1 생성 factory

운영 main 코드의 `Slip.createOutbound/createInbound` 호출부는 7개 guard 적용 경로와 `SlipSeeder`뿐이다.

```text
적용: SlipService, SlipDuplicateService, MobilePartnerOrderService,
      EstimateToSlipConverter, SlipPublishService 3메서드
차집합: SlipSeeder
```

`DeliveryBatchSeeder`의 `slipRepository.save(slip)`은 조회한 기존 전표에 batch를 연결하는 저장이며 새 Slip 생성이 아니다.

### 3.2 활성화

실제 `Slip.markRestoredWithNameCleared()` 호출은 `SlipRestoreService.java:96` 한 곳이다. 검색에 같이 잡히는 `DispatchVehicleGroup`·`DispatchVehicleGroupSlip`·`Estimate` restore는 Slip 헤더 활성화가 아니다.

### 3.3 날짜 대입

```text
Slip.java:661   this.slipDate = slipDate;             // 생성자
Slip.java:2234  this.slipDate = snapshot.slipDate();  // snapshot 복원
```

따라서 공개 edit API의 직접 날짜 변경 경로는 없고, 버전/snapshot 복원만 날짜를 되돌릴 수 있다.

### 3.4 상태 대입

`Slip.java:1098-1297`의 `save/send/accept/process/complete/inspect/ship/deliver/confirm/reject/cancel`은 status를 바꾸지만 행은 전후 모두 `is_deleted=false`다. 확정 규칙은 “활성행이 새로 생기거나 다른 날짜로 이동하는 것”이므로 이 경로에 날짜 guard를 붙일 근거는 없다.

## 4. controller endpoint 전수 대조

Slip 헤더의 존재·날짜·상태에 영향을 줄 수 있는 사용자 mutation endpoint를 controller에서 다시 전수 대조했다.

| controller 묶음 | endpoint | 대조 결과 |
|---|---|---|
| `SlipController` | create, duplicate | 생성 2경로 모두 guard 연결 |
| `SlipController` | header/driver/V20/line 수정 | 날짜·활성 여부 불변 |
| `SlipController` | lifecycle 11종 | status만 변경, 활성 여부·날짜 불변 |
| `SlipUpdateController`, `SalesSlipUpdateController` | 매입/매출 PUT | 날짜 필드 없음 |
| `SlipRestoreController` | soft-delete restore | **guard 차집합** |
| `SlipRevisionController` | revision restore | **날짜 guard 차집합** |
| `EstimateController` | estimate convert | converter guard 연결 |
| `SlipPublishController`, `InternalSlipPublishController` | publish 3종 + internal estimate | 공통 publish service guard 연결 |
| `MobileSalesController` | mobile partner order | service guard 연결; gateway route 미확인 |

## 5. 미적용 경로 실측

### 5.1 soft-delete 복원 — 확정 결함 1/1

#### 절차

1. 활성 기준선 0건에서 실 관리자 계정으로 `OUTBOUND / 2026-08-08 / S16-1123-audit-softrestore-r2` 전표를 생성한다.
2. `DELETE /api/v1/slips/{id}/sales`로 정상 soft-delete한다.
3. `POST /admin/slip-closing-baselines`로 `OUTBOUND / 2026-08-09` 기준선을 만든다. strict-before 규칙에 따라 2026-08-08이 닫힌다.
4. `POST /api/v1/slips/{id}/restore`를 호출한다.
5. 복원된 행을 상세 조회한 최신 `updatedAt`으로 다시 정상 soft-delete한다.

#### 응답 원문(UUID 제외)

```json
{"step":"create","marker":"S16-1123-audit-softrestore-r2","http":201,"code":"OK","slipNo":"2026/08/08-29","date":"2026-08-08","status":"DRAFT"}
{"step":"cleanup-slip","marker":"S16-1123-audit-softrestore-r2-preclose","http":200,"code":"OK"}
{"step":"create-baseline","http":200,"code":"OK","type":"OUTBOUND","baselineDate":"2026-08-09"}
{"step":"restore-soft-deleted","http":200,"code":"OK","message":"성공","slipNo":"2026/08/08-29","date":"2026-08-08","status":"DRAFT"}
```

#### 실제 업무 상황

판매전표 목록에서 삭제 실수를 되돌리는 정식 RESTORE 기능이다. 관리자가 삭제 이후 기준선을 앞으로 옮기면 사용자는 같은 날짜의 신규 생성에서는 409를 받지만 삭제 전표는 200으로 복원할 수 있다. 복원 직후 목록·집계에 `is_deleted=false` 행이 다시 참여하므로 확정 규칙을 직접 위반한다.

### 5.2 revision 복원 — 무가드 실행 1/1, 날짜 이동은 판정 불가

#### 절차

1. 기준선 생성 전에 `OUTBOUND / 2026-08-08 / S16-1123-audit-revision-r2`를 생성해 CREATE revision 1을 남긴다.
2. `OUTBOUND / 2026-08-09` 기준선을 활성화한다.
3. `GET /api/v1/slips/{id}/revisions`에서 revision 1을 확인한다.
4. `POST /api/v1/slips/{id}/revisions/1/restore`를 호출한다.

#### 응답 원문(UUID 제외)

```json
{"step":"list-revisions","http":200,"code":"OK","revisionCount":1}
{"step":"restore-revision","http":200,"code":"OK","message":"성공","date":"2026-08-08","status":"DRAFT"}
```

#### 실제 업무 상황

전표 수정이력 화면에서 과거 버전으로 되돌리는 정식 `slip.audit-revert` RESTORE 작업이다. 구현은 헤더와 라인을 full snapshot으로 역적용하며 날짜도 포함한다. 현재 공개 DTO로 전표일을 바꿀 수 없어 서로 다른 날짜 revision을 새로 만들 수 없었다. 따라서 닫힌 날짜에서 restore가 허용된 사실은 확정하지만, 열린 날짜의 활성 전표가 과거 revision 때문에 닫힌 날짜로 이동하는 실 사례는 표본 0이므로 **판정 불가**다.

### 5.3 협업 full-snapshot 복원 — 실측 불가

`SlipDocumentCollaborationPort.restoreSnapshot()`은 같은 `Slip.restoreFromSnapshot()`을 호출하지만 main 코드 호출부와 HTTP endpoint가 0건이다. gateway 실 JWT로 호출할 방법이 없어 **판정 불가**다. 향후 이 framework port가 workflow에 연결되면 revision restore와 같은 날짜 guard 적용 좌표다.

### 5.4 dev 시드 — 실측 불가

`SlipSeeder`는 `@Profile("dev")`, seed toggle, 애플리케이션 재기동 시에만 실행된다. 컨테이너 재기동 금지 때문에 실행하지 않았다. 코드에는 guard가 없으므로 기준선이 존재하는 dev DB에서 누락된 고정 전표를 시작 시 생성할 수 있는 후보이나, 이번 실측 표본은 0이다.

## 6. 만든 데이터·정리 결과·부작용

### 전표

첫 시도는 삭제 API의 낙관적 잠금 필드를 `createdAt/modifiedAt`으로 잘못 읽어 400이 났다. 기준선 생성 전 중단됐고, 상세 응답의 실제 `updatedAt`을 확인한 뒤 두 행 모두 정상 API로 즉시 정리했다. 재실행 표본까지 총 4행이 이력으로 남는다.

| 전표번호 | 표식 | 종료 상태 |
|---|---|---|
| `2026/08/08-27` | `S16-1123-audit-softrestore` | soft-delete, 비활성 |
| `2026/08/08-28` | `S16-1123-audit-revision` | soft-delete, 비활성 |
| `2026/08/08-29` | `S16-1123-audit-softrestore-r2` | 마감 중 복원 확인 후 재 soft-delete, 비활성 |
| `2026/08/08-30` | `S16-1123-audit-revision-r2` | 마감 중 revision restore 후 soft-delete, 비활성 |

종료 재조회 원문:

```json
{"step":"cleanup-slip","marker":"S16-1123-audit-softrestore-r2","http":200,"code":"OK"}
{"step":"cleanup-slip","marker":"S16-1123-audit-revision-r2","http":200,"code":"OK"}
{"step":"cleanup-baseline","http":200,"code":"OK"}
{"step":"verify-cleanup","activeBaselines":0,"remainingActiveProbeSlips":0}
```

### 기준선과 기존 데이터 보호

- 새 `OUTBOUND / 2026-08-09` 기준선 1행을 관리자 POST로 만들고 관리자 DELETE로 정리했다.
- 종료 시 활성 기준선 0건을 재확인했다.
- `S14-1123-*` 전표 4건, S14 soft-delete OUTBOUND 기준선, S15 비활성 INBOUND 기준선은 수정·삭제하지 않았다.

### 남는 부작용

- 정상 정리가 hard delete가 아니므로 비활성 Slip 4행과 라인·audit·revision 이력이 남는다.
- 전표번호 `2026/08/08-27~30`이 소비됐다.
- revision 복원은 RESTORE revision을 한 건 추가했다.
- 최초 삭제 400 두 건은 데이터 mutation을 일으키지 않았다.

## 7. 이 감사가 보지 않은 것

- 서로 다른 `slipDate`를 가진 실제 revision 표본이 없어 revision 복원에 의한 날짜 이동을 재현하지 못했다.
- HTTP 진입점이 없는 `SlipDocumentCollaborationPort.restoreSnapshot()`을 실행하지 못했다.
- 컨테이너 재기동 금지 때문에 `SlipSeeder`를 실행하지 못했다.
- 이미 guard가 연결된 모바일 주문·견적 전환·publish 3종을 각각 외부 원본부터 새로 만들어 재호출하지 않았다. 이들은 정적 호출부 전수와 factory 차집합으로 확인했다.
- lifecycle 11종을 각각 live 실행하지 않았다. 이들은 행을 새로 활성화하거나 날짜를 바꾸지 않아 확정 규칙의 대상이 아니며, 일부는 실 재고 부작용과 정리 불가 상태를 만든다.
- accounting-service 자체의 회계기간 마감, 세금계산서 일괄 발행, inventory 데이터의 날짜 정책은 별도 엔티티 규칙이므로 기능 실측하지 않았다.
- 동시 restore/기준선 생성 race, KST 자정 경계, 예외 권한 변경과 restore의 동시성은 보지 않았다.
- gateway route가 없는 모바일 service mapping과 gateway 비노출 internal publish endpoint의 네트워크 도달성은 별도 라우팅 감사 대상으로 남겼다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1123-s16-rule-coverage-audit.md`
