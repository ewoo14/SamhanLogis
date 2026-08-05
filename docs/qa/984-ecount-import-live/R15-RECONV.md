# PR #984 R15 기능 회귀 검토

- 검토 역할: 기능 회귀 검토자(코드 수정 없음)
- 검증 대상 HEAD: `21d1d5d1d3d7d9fd103f698d19cf2ba107b5de71`
- 질문: R14의 reservation 해제 시점 이동이 새 문제를 만들었는가?
- 진행 상태: 완료

## 중간 조사 기록

- 요청에 따라 산출물을 먼저 생성했다.
- `git rev-parse HEAD` 결과가 검증 대상 `21d1d5d1d3d7d9fd103f698d19cf2ba107b5de71`과 일치한다.
- 워크트리의 유일한 미추적 파일은 이 중간 저장 산출물이다. git 쓰기, Docker 재기동·재빌드, 공유 DB 쓰기는 수행하지 않는다.
- R14 diff는 production 2개 파일만 바꾼다. `Mig8OrderTransformService`의 정상 반환 직전 release를 transaction callback 등록으로 바꾸고, `ProductAliasClient`가 `afterCommit` 또는 비커밋 `afterCompletion`에서 token별 release를 수행한다.
- reservation 자체는 품목을 점유해 다른 resolver를 기다리게 하지 않는다. token별 행을 upsert하며, 동일 품목에 복수 token이 공존하고 release는 자기 token 행만 삭제한다.
- reservation 검사 호출부는 `ProductSheetSyncService`의 시트 부재 soft-delete 한 곳뿐이다. 활성 reservation이면 해당 sync 회차의 삭제를 보류하고 다음 품목으로 진행한다. 정상 조회·native import·직접 삭제 경로를 막는 호출은 없다.
- MIG-8 동시 실행은 기존 `pg_advisory_xact_lock`으로 직렬화된다. R14의 release callback은 DB commit 뒤 실행되므로 첫 실행의 transaction advisory lock은 release HTTP보다 먼저 풀린다. reservation 때문에 두 번째 실행이 새로 기다리는 구조는 아니다.
- 프로세스 강제 종료는 callback을 실행하지 못하므로 reservation이 TTL 2분까지 남을 수 있다. 이는 성공 commit 직후라는 새 잔존 창을 만들지만, 영향은 시트 soft-delete 1회 보류로 제한되고 기본 cron은 5분 간격이다. commit 실패/rollback은 비커밋 `afterCompletion`에서 즉시 release하도록 등록돼 있다.
- 읽기 전용 실 DB 조회: `accounting_db.staging.ecount_order_raw=0행`, 주문/라인도 0행, `product_db.staging.ecount_item_alias=0행`. 실행 중 product DB는 아직 Flyway V26이며 reservation 테이블(V29)도 없다. 따라서 원본 부재 조건과 함께 실 데이터 영향 건수는 **데이터 부재로 미판정**이며, 관측값 0을 영향 0의 증거로 쓰지 않는다.

## 판정

**PASS — R14의 해제 시점 이동이 새 사용자 오작동을 만들었다는 근거는 없다.**

BLOCK finding은 없다. 정상 commit 뒤 release까지의 짧은 구간에는 reservation이 계속 살아 있어 sheet sync 삭제는 보류된다. 직접 삭제는 reservation을 보지 않지만 그 시점에는 accounting line commit이 이미 끝났으므로 R13의 “UUID를 받은 뒤 line 확정 전에 품목이 사라지는 창”을 다시 열지 않는다. 실패·강제 종료·동시 실행도 아래와 같이 새 영구 차단이나 무한 reservation 대기를 만들지 않는다.

실 데이터 영향 건수만은 **데이터 부재로 미판정**이다. 이 미판정은 전체 R15 판정을 뒤집는 결함 증거가 아니라, 요청에서 지정한 원본 26,055행 및 현재 shared DB의 검증 데이터 부재를 정직하게 분리한 것이다.

## 1. commit 이후 해제로 창이 닫혔는가

PASS.

- 변환은 `REQUIRES_NEW` transaction을 시작하고 기존 전역 transaction advisory lock을 잡은 뒤 처리한다(`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/Mig8OrderTransformService.java:50-53`, `:531-535`).
- 성공 경로는 line upsert와 결과 집계를 마친 뒤 release callback을 등록하고 반환한다(`Mig8OrderTransformService.java:70-87`). 실제 release는 `afterCommit()`에서 수행된다(`services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/ProductAliasClient.java:131-155`). 따라서 line DB commit 전에는 정상 경로가 reservation을 해제하지 않는다.
- commit과 release 사이에 sheet sync가 들어오면 product 행을 잠근 뒤 아직 활성인 reservation을 확인한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/EcountAliasReservationService.java:61-81`). 활성이라면 그 품목의 soft-delete를 그 sync 회차에서 보류한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:1365-1391`). 기다리거나 부분 삭제하지 않는다.
- 직접 사용자 삭제는 reservation을 조회하지 않고 soft-delete한다(`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:698-705`). 다만 R14가 새로 만든 post-commit 구간에서는 accounting line이 이미 `product_id`와 품목 snapshot을 함께 확정한 뒤다(`Mig8OrderTransformService.java:315-358`). 따라서 direct delete가 그 구간에 와도 “line 확정 전 UUID 소실” 회귀는 아니다.

정상 경로에서 sheet sync가 바로 이 매우 짧은 post-commit callback 구간과 겹치면 해당 삭제가 다음 sync로 미뤄질 수 있다. 기본 cron은 5분 간격이다(`services/product-service/src/main/java/com/samhanair/logis/product/scheduler/ProductSheetSyncScheduler.java:74-92`). 그러나 reservation은 원래 transform 전체 동안 같은 보류를 만들었고, R14가 추가한 구간은 commit 직후 release HTTP 완료까지뿐이다. 품목을 영구히 남기거나 정상 import를 실패시키는 새 동작은 아니다.

## 2. reservation 잔존 경로

PASS.

- rollback 및 commit 실패처럼 completion status가 `COMMITTED`가 아니면 `afterCompletion`이 release를 호출한다(`ProductAliasClient.java:144-155`). transform 본문 예외는 callback 등록 전 `finally`에서 즉시 release한다(`Mig8OrderTransformService.java:88-91`).
- release HTTP 자체가 실패해도 token은 ThreadLocal에서 먼저 제거되고, product-service TTL이 최종 정리를 담당한다(`ProductAliasClient.java:104-121`). TTL은 reservation 생성/갱신 시점부터 2분이다(`EcountAliasReservationService.java:19`, `:46-57`).
- 프로세스가 강제 종료되면 Java callback은 실행될 수 없으므로 TTL까지 reservation이 남는다. R14로 인해 “성공 commit 직후부터 callback 실행 전”이라는 강제 종료 창이 새로 생긴 것은 맞다. 하지만 잔존 reservation의 유일한 소비자는 sheet sync soft-delete이고(`EcountAliasReservationService.java:61-81`, `ProductSheetSyncService.java:1386-1390`), TTL 뒤 자동으로 비활성 판정된다. 정상 품목 조회·직접 삭제·native import를 2분간 차단하는 lock이 아니다.
- 만료 행을 물리 삭제하는 scheduler는 없지만 모든 차단 판정이 `expires_at > NOW()` 조건이라, 만료 행이 남아도 사용자 동작을 계속 막지 않는다(`EcountAliasReservationService.java:75-81`).

## 3. 정상 import 지연·차단과 실 데이터 영향 건수

PASS(코드 경로), **실 데이터 건수는 데이터 부재로 미판정**.

- R14는 release HTTP 호출 횟수를 늘리지 않고 호출 순서만 `release → commit`에서 `commit → release`로 바꿨다. 정상 요청이 응답하기까지 release 호출을 동기적으로 수행하는 점도 동일하다(`ProductAliasClient.java:104-121`, `:139-155`).
- reservation을 검사하는 production 호출부는 sheet 부재 soft-delete 1곳뿐이다. `hasActiveReservation()` 호출 검색 결과도 그 1곳이며, native import·조회·직접 삭제에는 reservation 대기가 추가되지 않았다(`EcountAliasReservationService.java:61-81`, `ProductSheetSyncService.java:1386`).
- shared DB 읽기 전용 실측: `accounting_db.staging.ecount_order_raw` 0행, active/pending 0행, `orders` 0행, `order_lines` 0행, `product_db.staging.ecount_item_alias` 0행이다. 또한 현재 실행 DB는 product Flyway V26이라 V29 reservation 테이블 자체가 없다. 원본 26,055행도 이 PC에 없으므로 “실 데이터에서 몇 품목이 추가 지연되는가”는 **데이터 부재로 미판정**이다.
- 정적 영향 범위 건수는 sheet sync soft-delete 호출부 1곳, 직접 삭제 변경 0곳, native import 변경 0곳이다. 이는 live 영향 품목 수를 대신하지 않는다.

## 4. 동시 실행 두 개

PASS.

- reservation PK는 `(reservation_token, product_id)`라 같은 product에 서로 다른 token 두 개가 공존할 수 있다(`services/product-service/src/main/resources/db/migration/V29__add_ecount_alias_reservations.sql:2-7`). release도 자기 token 행만 삭제하므로 먼저 끝난 실행이 다른 실행의 보호를 풀지 않는다(`EcountAliasReservationService.java:84-92`).
- product-service reserve는 product 행 `FOR UPDATE` 구간만 직렬화하고 활성 product에 token 행을 upsert한다(`EcountAliasReservationService.java:23-58`). reservation이 상대 token 해제를 기다리는 구조는 없다.
- accounting MIG-8 두 실행은 기존 blocking `pg_advisory_xact_lock`으로 직렬화된다(`Mig8OrderTransformService.java:50-53`, `:531-535`). 코드상 lock timeout은 없으므로 첫 transaction이 살아서 끝나지 않으면 둘째가 오래 기다릴 수 있으나, 이는 R14 이전부터 존재한 전역 import 직렬화다. R14에서는 DB commit이 release HTTP보다 먼저라 advisory transaction lock도 release callback 전에 풀리므로, 해제 시점 이동이 그 대기를 늘리지 않는다.

## 검증

- HEAD: `21d1d5d1d3d7d9fd103f698d19cf2ba107b5de71` 확인.
- fresh focused 실행: `./gradlew.bat :services:accounting-service:test --tests com.samhanair.logis.accounting.client.ProductAliasClientTest --tests com.samhanair.logis.accounting.service.Mig8OrderTransformServiceTest --no-daemon --rerun-tasks`
- 결과: 종료코드 0, `BUILD SUCCESSFUL`, 21 actionable tasks 전부 executed.
- XML 결과: `ProductAliasClientTest` 8/8, `Mig8OrderTransformServiceTest` 23/23, failures/errors/skipped 각 0.
- 테스트가 직접 고정하는 계약: commit 전 release 0회 후 `afterCommit` release 1회, rollback completion 직후 release 1회(`services/accounting-service/src/test/java/com/samhanair/logis/accounting/client/ProductAliasClientTest.java:156-199`).

## 내가 보지 않은 것

- R12 회복 경로를 다시 보지 않았다.
- R10의 미해소 라인 보존·전표 차단·미해소 표시·거부 상세를 다시 보지 않았다.
- 선두 token 매칭 규칙, Issue #1000 범위, V15 번호를 보지 않았다.
- 원본 26,055행이 없어 live replay를 시도하지 않았다. 이 데이터 기반 영향 건수는 **데이터 부재로 미판정**이다.
- Docker를 재빌드·재기동하지 않았고 shared DB에 쓰지 않았다. SQL은 읽기 전용 조회만 수행했다.
- 전체 테스트 suite는 실행하지 않았으며, 직전 라운드의 종료코드 124를 지적하거나 재판정하지 않았다.
- 프로세스 강제 종료 및 commit 네트워크 단절을 실제로 주입하지 않았다. 해당 경로는 callback/TTL 코드의 상태 전이를 검토했다.
