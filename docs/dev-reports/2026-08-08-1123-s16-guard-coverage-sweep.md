# PR #1124 / Issue #1123 — S16 마감일 가드 전수 조사

- 조사일: 2026-08-08 KST
- 대상: `feat/1123-closed-date-guard`, 사용자 지정 HEAD `edd7ef8b9`
- 조사 범위: `slip-service`의 전표 생성·복원·전표일 변경·상태 전이·배치/시드·전환·연쇄 경로
- 제한 준수: 제품 코드 수정 없음, `git` 명령 없음, 컨테이너 재기동·재배포 없음, DB 직접 INSERT/UPDATE/DELETE 없음
- 실 호출: gateway `http://127.0.0.1:8080`, `dev_manager` 실 로그인 JWT, 관리자 기준선 API와 사용자 전표 API만 사용

## 결론

**BLOCK은 유지한다. soft-delete 복원 결함을 다시 1/1 재현했다.**

추가로, 사용자가 제시한 여섯 축과 별도로 **일곱째 축인 “버전/스냅샷 회귀”**가 있다. 정식 사용자 endpoint인 revision 복원은 닫힌 날짜에서 200을 반환했고, 내부 구현은 스냅샷의 `slipDate`를 엔티티에 직접 다시 대입한다. 다만 현재 사용자 수정 DTO에는 `slipDate`가 없어 이번에 만든 revision 1의 날짜는 현재 전표와 같았다. 따라서 **닫힌 날짜에서 revision 복원이 실행되는 사실은 재현**, **열린 날짜 전표가 과거 revision 때문에 닫힌 날짜로 이동하는 사례는 표본 0이라 판정 불가**다.

상태 전이는 날짜 마감 가드를 호출하지 않는다. 대표로 `DRAFT → SAVED`를 닫힌 날짜에서 200으로 재현했다. 이는 기존 전표가 닫힌 날짜에 남은 채 업무 흐름을 계속 타는 경로다. 이 동작을 결함으로 볼지는 “마감은 신규/재활성화만 막는가, 기존 전표의 후속 처리도 막는가”라는 정책 결정이 필요하다.

반대로 현재 공개 수정 DTO에는 전표일 필드가 없다. 열린 날짜 전표에 `PATCH /header`로 `slipDate=2026-08-08`을 추가해 보냈지만 서버는 이를 적용하지 않고 실제 날짜 `2026-08-10`을 유지했다. 현재 사용자 API에서 전표일을 직접 바꾸는 도달 경로는 찾지 못했다.

## 1. 가드 정의와 호출부 전수

가드는 이름과 문서부터 신규 생성 전용이다.

```java
// SlipClosedDateGuard.java:12,24-28
/** 신규 전표의 (종류, 전표일) 마감 여부를 저장 직전에 판정한다. */
public void assertCreatable(SlipType slipType, LocalDate slipDate, String requesterId) {
    if (isCreatable(slipType, slipDate, requesterId)) {
        return;
    }
    throw new SlipClosedDateException();
}
```

기준선 판정은 기준일보다 엄격히 이전이고 오늘보다 미래가 아닌 날짜다.

```java
// SlipClosedDateGuard.java:41-48
return dateRuleRepository.findBySlipTypeAndClosingDateAndIsDeletedFalse(slipType, slipDate)
        .map(rule -> rule.getRuleType() == SlipClosingDateRuleType.MANUAL_CLOSED)
        .orElseGet(() -> baselineRepository.findBySlipTypeAndIsDeletedFalse(slipType)
                .filter(baseline -> baseline.isEnabled()
                        && slipDate.isBefore(baseline.getBaselineDate())
                        && !slipDate.isAfter(LocalDate.now(clock)))
                .isPresent());
```

`closedDateGuard` 호출은 main 코드 전체에서 다음 8곳뿐이다.

```text
SlipService.java:270                         assertCreatable
SlipDuplicateService.java:90                assertCreatable
MobilePartnerOrderService.java:119          assertCreatable
EstimateToSlipConverter.java:67-68          assertCreatable
SlipPublishService.java:140                 assertCreatable
SlipPublishService.java:227                 assertCreatable
SlipPublishService.java:331                 assertCreatable
OutboundCutoffGuard.java:125-126             isCreatable (대체 출고일 탐색용, 저장 경로 아님)
```

## 2. 경로 대조표

아래 표는 가드가 있는 경로와 없는 경로를 한 표에 합쳤다. 줄 번호는 이 조사 대상 파일의 원문 기준이다. gateway가 `/slips` controller에 `/api/v1`을 붙이는 경로는 실제 호출 URL로 적었다.

| 경로 이름 | 진입점(파일:줄 · HTTP 메서드·URL) | 가드가 걸려 있는가 | 근거(파일:줄 원문) |
|---|---|---|---|
| 직접 OUTBOUND/INBOUND 생성 | `SlipController.java:302-304` · `POST /api/v1/slips` | **있음** | `SlipService.java:269-270` — `LocalDate slipDate = ...; closedDateGuard.assertCreatable(req.slipType(), slipDate, requesterId);` |
| 전표 복사 | `SlipController.java:331-333` · `POST /api/v1/slips/{id}/duplicate` | **있음** | `SlipDuplicateService.java:89-90` — 오늘 날짜 산출 직후 `assertCreatable(source.getSlipType(), slipDate, requesterId)` |
| 모바일 파트너 주문 전표 생성 | `MobileSalesController.java:137-140` · `POST /mobile/sales/partner-orders` | **있음** | `MobilePartnerOrderService.java:118-120` — 전표일 산출 후 `assertCreatable(OUTBOUND, slipDate, requesterId)` |
| 견적 → 출고전표 전환 | `EstimateController.java:197-202` · `POST /api/v1/slips/estimates/{id}/convert` | **있음** | `EstimateService.java:341-353`이 converter를 호출하고, `EstimateToSlipConverter.java:66-69`가 오늘 날짜에 `assertCreatable` 후 채번 |
| 견적 발행 | `SlipPublishController.java:89-91` 및 `InternalSlipPublishController.java:68-69` · `POST /api/v1/slips/from-estimate`, `POST /internal/slips/from-estimate` | **있음** | 공통 `SlipPublishService.java:139-140` — `parseIoDate` 직후 `assertCreatable` |
| 주문 발행 | `SlipPublishController.java:124-126` · `POST /api/v1/slips/from-partner-order` | **있음** | `SlipPublishService.java:226-227` — `parseIoDate` 직후 `assertCreatable` |
| 주문 병합 발행 | `SlipPublishController.java:165-168` · `POST /api/v1/slips/from-orders-merge` | **있음** | `SlipPublishService.java:330-331` — `parseIoDate` 직후 `assertCreatable` |
| 판매전표 soft-delete 복원 | `SlipRestoreController.java:26-29` · `POST /api/v1/slips/{id}/restore` | **없음 — 실 결함** | `SlipRestoreService.java:25-27` 주입 필드에 guard가 없고, `71-97`에서 삭제행 조회 → `markRestoredWithNameCleared()` → `saveAndFlush` |
| 특정 revision 복원 | `SlipRevisionController.java:89-96` · `POST /api/v1/slips/{id}/revisions/{revisionNo}/restore` | **날짜 가드 없음 — 실 200** | `SlipService.java:689-703`은 status/lock용 `guardLockPolicy` 뒤 revision 복원·save. `guardLockPolicy` 원문 `758-781`에는 날짜 판정이 없다. `Slip.java:2232-2234`는 `this.slipDate = snapshot.slipDate();` |
| 협업 포트 full snapshot 복원 | HTTP endpoint 없음; `SlipDocumentCollaborationPort.java:242-254`의 framework port | **없음, 현재 HTTP 비도달** | `244-249` — snapshot 역직렬화 → `restoreFromSnapshot` → `slipRepository.save`; main 코드에서 이 메서드를 호출하는 controller/service는 0곳 |
| 헤더 부분 수정 | `SlipController.java:348-349` · `PATCH /api/v1/slips/{id}/header` | **전표일 변경 자체가 없음** | `EditHeaderRequest.java:14-25`의 7필드에 `slipDate`가 없다. 실 요청의 unknown `slipDate`는 적용되지 않았다. |
| V20 부분 수정 | `SlipController.java:409-410` · `PATCH /api/v1/slips/{id}/v20` | **전표일 변경 자체가 없음** | `UpdateSlipRequest.java:39-61`에 `slipDate`가 없다. |
| 매입 direct PUT | `SlipUpdateController.java:40-48` · `PUT /api/v1/slips/{id}` | **전표일 변경 자체가 없음** | `SlipUpdateRequest.java:28-56`에 `slipDate`가 없다. |
| 매출 direct PUT | `SalesSlipUpdateController.java:49-57` · `PUT /api/v1/slips/{id}/sales` | **전표일 변경 자체가 없음** | 매입과 같은 `SlipUpdateRequest`; `Slip.java`의 `slipDate` 대입은 생성자 `661`과 snapshot 복원 `2234`뿐이다. |
| 일반 상태 전이 11종 | `SlipController.java:465-617` · `POST .../{save,send,accept,process,inspect,complete,ship,deliver,confirm,reject,cancel}` | **없음 — save 실 200, 나머지 실측 표본 0** | `SlipService.java:886-900,910-913,1114-1116,1348-1425`는 각 도메인 전이만 호출. `Slip.java:1096-1297`의 상태 전이에도 날짜 guard가 없다. |
| dev 시작 시드 | HTTP 없음; `SlipSeeder.java:59-63,210-237` · `CommandLineRunner` | **없음 — 재기동 금지로 실측 불가** | `SlipSeeder.java:230-237`은 동일 번호 존재 여부만 확인하고 `buildAndTransition` 후 `slipRepository.save`; `SlipClosedDateGuard` 주입 없음 |
| 스케줄러·migration의 Slip 신규 활성화 | 진입점 없음 | **대상 경로 없음** | main SQL/Java 전수 grep에서 `INSERT INTO slips` 및 `UPDATE slips SET is_deleted=FALSE/slip_date=...` 0건. Slip을 만드는 scheduler도 0건. V117은 반대로 테스트 빈 전표를 soft-delete한다. |
| 배차/배송 배치 | 배차 controller/service 다수 | **전표 생성·날짜·활성 여부는 변경하지 않음** | `DeliveryBatchSeeder.java:89-131`도 기존 Slip을 찾아 batch FK만 연결한다. 배차 서비스의 `slipRepo.save`는 dispatch 상태/연결 갱신이며 `Slip.create*`, `slipDate`, `isDeleted`를 건드리지 않는다. |
| 회계 분개·세금계산서·재고 이동 연쇄 | 별도 accounting/inventory endpoint | **Slip 마감 가드 대상 아님; 새 Slip 생성 없음** | Slip lifecycle에서 다른 `Slip`을 함께 생성하는 호출은 0건. `complete`는 `SlipService.java:1117-1167`에서 inventory 입출고를 호출하고, 세금계산서는 `TaxInvoiceBatchController.java:82-83`의 별도 사용자 batch endpoint다. |

## 3. 저장·활성화·상태 변경 차집합

전수 grep의 핵심 결과는 다음과 같다.

1. `Slip.createOutbound/createInbound` main 호출부는 운영 7경로와 `SlipSeeder`뿐이다. 운영 7경로는 모두 `assertCreatable`과 짝을 이루며, 차집합은 dev 시작 시더 1개다.
2. 실제 `Slip`에 `markRestoredWithNameCleared()`를 호출하는 곳은 `SlipRestoreService.java:96` 한 곳이다. 배차 그룹 restore는 다른 엔티티다.
3. `slipDate`를 대입하는 곳은 생성자 `Slip.java:661`과 스냅샷 복원 `Slip.java:2234` 두 곳이다. 공개 edit DTO 네 개에는 전표일이 없다.
4. `Slip` 상태값 대입은 `Slip.java:1098-1297`의 도메인 전이로 모여 있고 이 블록에는 날짜 가드가 없다.
5. main migration/script에는 Slip 활성 복원 SQL이나 전표일 변경 SQL이 없다.

이 차집합 때문에 생성 축은 닫혔지만, 활성화 축의 soft-delete restore와 스냅샷 회귀 축은 생성 가드 바깥에 남는다.

## 4. 가드 없는 도달 경로 실재현

### S16-1 판매전표 soft-delete 복원 — 재현 1/1

#### 절차

1. 활성 기준선 0건에서 `OUTBOUND / 2026-08-08 / S16-1123-soft-delete-restore`를 생성한다.
2. `DELETE /api/v1/slips/{id}/sales`로 soft-delete한다.
3. 관리자 API로 `OUTBOUND / 2026-08-09` 기준선을 만든다. 2026-08-08은 strict-before라 닫힌 날짜다.
4. `POST /api/v1/slips/{id}/restore`를 호출한다.

#### 응답 원문

```text
{"step":"create-softrestore","http":201,"code":"OK","slipNo":"2026/08/08-24","date":"2026-08-08","status":"DRAFT"}
{"step":"delete-before-close","http":200,"code":"OK"}
{"step":"create-baseline","http":200,"code":"OK","type":"OUTBOUND","baselineDate":"2026-08-09"}
{"step":"restore-soft-deleted","http":200,"code":"OK","message":"성공","slipNo":"2026/08/08-24","date":"2026-08-08","status":"DRAFT"}
```

#### 왜 실 사용자가 밟는가

`SlipRestoreController.java:24-29`가 “판매전표 목록 삭제행 복원”으로 공개한 정식 endpoint이며 `sales.slip.list` RESTORE 권한을 요구한다. 삭제 실수를 복구하는 정상 사용자 작업이다. 복원 후 목록·조회·집계에 다시 참여하므로 단순 상태 변경이 아니라 닫힌 날짜에 행이 다시 **나타나는** 경로다.

### S16-2 revision 복원 — 닫힌 날짜 실행 1/1, 날짜 이동은 판정 불가

#### 절차

1. 기준선 생성 전 `OUTBOUND / 2026-08-08 / S16-1123-revision-restore`를 생성해 CREATE revision 1을 남긴다.
2. `OUTBOUND / 2026-08-09` 기준선을 활성화한다.
3. `GET /api/v1/slips/{id}/revisions`에서 revision 1을 확인한다.
4. `POST /api/v1/slips/{id}/revisions/1/restore`를 호출한다.

#### 응답 원문

```text
{"step":"list-revisions","http":200,"code":"OK","revisionCount":1}
{"step":"restore-revision","http":200,"code":"OK","message":"성공","revision":1,"date":"2026-08-08","status":"DRAFT"}
```

#### 왜 실 사용자가 밟는가

`SlipRevisionController.java:70-96`은 전표 수정이력 화면의 정식 RESTORE endpoint이고 `slip.audit-revert` RESTORE 권한을 받는다. 사용자가 과거 버전으로 되돌리는 정상 업무다. `Slip.restoreFromSnapshot`은 날짜를 포함한 헤더와 라인을 통째로 역적용한다.

이번 표본의 revision 날짜도 2026-08-08이므로 “열린 2026-08-10 전표가 revision 복원으로 닫힌 2026-08-08로 이동”은 만들 수 없었다. 현재 DTO로 서로 다른 `slipDate` revision을 생성할 수 없기 때문이다. 따라서 날짜 이동 가능성은 코드상 존재하지만 실 데이터 표본은 0, **판정 불가**다.

### S16-3 상태 전이 — save 대표 재현 1/1

#### 절차와 응답

기준선 전에 `S16-1123-state-save` DRAFT 전표를 만든 뒤 기준선을 활성화하고 저장했다.

```text
{"step":"create-statesave","http":201,"code":"OK","slipNo":"2026/08/08-26","date":"2026-08-08","status":"DRAFT"}
{"step":"save-while-closed","http":200,"code":"OK","message":"성공","date":"2026-08-08","status":"SAVED"}
```

#### 왜 실 사용자가 밟는가

작성 중인 전표를 저장·전송·수락·검수·확정하는 것은 핵심 사용자 workflow다. 대표 save는 닫힌 날짜에서도 계속 진행됐다. 나머지 10개 전이는 코드상 동일하게 날짜 가드가 없지만, SENT 이후 전표는 사용자 API로 안전하게 soft-delete 정리할 수 없고 accept/complete는 실 재고 부작용까지 발생한다. 기존 업무 데이터 수정 금지와 정리 의무 때문에 이번 라운드에서는 각 상태까지 올리지 않았다. 그러므로 나머지 10개 endpoint의 live 판정은 표본 0, **판정 불가**다.

## 5. 날짜 변경 축 실측

`S16-1123-date-change-probe`를 열린 날짜 2026-08-10에 생성한 뒤, 기준선 활성 상태에서 header PATCH 본문에 DTO에 없는 `slipDate=2026-08-08`을 추가했다.

```text
{"step":"create-datechange","http":201,"code":"OK","slipNo":"2026/08/10-2","date":"2026-08-10","status":"DRAFT"}
{"step":"attempt-date-change","http":200,"code":"OK","message":"성공","requestedDate":"2026-08-08","actualDate":"2026-08-10","status":"DRAFT"}
```

서버는 unknown 필드를 적용하지 않았다. PUT 두 경로와 V20 PATCH도 DTO에 `slipDate`가 없으며, 도메인 대입 지점 역시 생성/스냅샷 복원 둘뿐이다. 따라서 **현재 공개 수정 API를 이용한 직접 전표일 변경 경로는 없음**으로 판정한다. 단, revision/snapshot 복원은 별도 축이다.

## 6. 상태 전이·배치·전환·연쇄 축 판정

### 상태 전이

- `save`는 닫힌 날짜에서 200 실재현.
- `send` 이후 10개 전이는 정적 무가드 확인만 완료, live 표본 0이라 판정 불가.
- 취소 해제, 반려 재상신, 재발행처럼 상태를 뒤로 되돌리는 endpoint는 현재 `SlipController`에 없다.

### 일괄·배치

- Slip 신규 생성 batch endpoint나 scheduler는 없다.
- `SlipSeeder`만 dev 시작 시 과거 고정 날짜 전표를 guard 없이 만들 수 있다. 그러나 `@Profile("dev")`와 seed toggle이 모두 필요하고 재기동 금지 때문에 live 판정 불가다.
- Flyway와 운영 script에는 `slips` 활성 복원/전표일 변경 SQL이 없다.

### 전환

- 견적 전환, 견적 발행, 주문 발행, 주문 병합 발행은 모두 가드 연결.
- 주문→출고의 공개/내부 publish 서비스는 동일 `SlipPublishService`를 거치므로 internal endpoint도 우회가 아니다.
- 반품/회차는 신규 `Slip` 생성 factory가 별도로 없고 직접 생성 경로에서 `SlipType`/tag로 처리된다.

### 연쇄

- 한 Slip을 만들거나 상태 전이할 때 다른 Slip이 자동 생성되는 호출은 0건이다.
- complete 단계의 재고 이동은 별도 inventory 데이터이며 새 Slip이 아니다.
- 회계 분개·세금계산서는 accounting-service의 별도 사용자 endpoint와 별도 기간 가드 영역이다. Slip 마감 가드의 호출 누락으로 자동 생성되는 연쇄 문서는 찾지 못했다.

### 일곱째 축 — 버전/스냅샷 회귀

- 사용자 도달: revision restore, 닫힌 날짜 200 실재현.
- framework-only: `SlipDocumentCollaborationPort.restoreSnapshot`, HTTP 호출부 0건.
- 두 경로 모두 `Slip.restoreFromSnapshot`을 사용해 `slipDate`를 직접 역적용한다.

## 7. 만든/정리한 QA 데이터와 부작용

### 전표

| 전표번호 | 표식 | 실 조작 | 종료 상태 |
|---|---|---|---|
| `2026/08/08-24` | `S16-1123-soft-delete-restore` | 생성 → 삭제 → 마감 후 복원 → 재삭제 | 비활성 |
| `2026/08/08-25` | `S16-1123-revision-restore` | 생성 → 마감 후 revision 1 복원 → 삭제 | 비활성 |
| `2026/08/08-26` | `S16-1123-state-save` | 생성 → 마감 후 SAVED → 삭제 | 비활성 |
| `2026/08/10-2` | `S16-1123-date-change-probe-after` | 생성 → header PATCH(날짜 불변) → 삭제 | 비활성 |

최초 cleanup에서 revision/save 두 전표는 mutation 응답의 낙관적 잠금 토큰으로 DELETE했을 때 409를 반환했다. 최신 상세를 다시 GET한 뒤 동일 실 DELETE endpoint를 호출해 둘 다 200으로 정리했다.

```text
cleanup S16-1123-state-save       → HTTP 200
cleanup S16-1123-revision-restore → HTTP 200
remainingActiveS16=0
```

### 기준선

- `OUTBOUND / 2026-08-09` 기준선 1건을 관리자 POST로 생성하고 관리자 DELETE로 정리했다.
- 종료 확인: `activeBaselines=0`.
- S14의 전표 4건과 soft-delete OUTBOUND 기준선, S15가 건드린 비활성 INBOUND 기준선은 수정·삭제하지 않았다.

### 남는 QA 부작용

- 정리는 hard delete가 아니라 정상 soft-delete이므로 비활성 Slip 4행, 관련 라인·audit/revision 행과 soft-delete 기준선 행은 이력으로 남는다.
- 전표 채번 `2026/08/08-24~26`, `2026/08/10-2`가 소비됐다.
- revision 복원은 RESTORE revision을 추가했고, header PATCH는 수정 revision/audit을 추가했다.
- 실패한 사전조건 호출 1건은 출고 창고 누락으로 HTTP 400이었고 행을 만들지 않았다. PowerShell 사전 실행 오류 뒤 `S16-1123` 활성행 조회도 0건이었다.

## 8. 이 조사가 보지 않은 것

- `send/accept/process/complete/inspect/ship/deliver/confirm/reject/cancel` 10개 상태 전이를 각각 live로 올리지 않았다. 표본 0이므로 live 판정 불가다. 이유는 전표가 SENT 이후 정식 삭제로 회수되지 않거나 실 재고 입출고 부작용을 만들기 때문이다.
- 서로 다른 `slipDate`를 가진 실제 revision 표본이 0이라 revision 복원에 의한 날짜 이동을 live로 재현하지 못했다.
- `SlipDocumentCollaborationPort.restoreSnapshot`은 현재 HTTP 진입점이 없어 실 JWT로 호출하지 않았다.
- dev `SlipSeeder`는 컨테이너 재기동 금지 때문에 실행하지 않았다.
- 모바일 주문·견적 전환·3개 publish 경로는 S15의 가드 연결 결과와 이번 정적 전수를 대조했으며, 이번 S16에서 외부 원본을 새로 만들어 각각 재호출하지 않았다.
- 회계서비스 자체의 기간마감 정책, 세금계산서 일괄 발행의 날짜 정책은 별도 도메인이라 이번 Slip 마감 가드 조사에서 기능 실측하지 않았다.
- 동시 restore/기준선 생성 race와 KST 자정 경계는 실행하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-08-1123-s16-guard-coverage-sweep.md`
