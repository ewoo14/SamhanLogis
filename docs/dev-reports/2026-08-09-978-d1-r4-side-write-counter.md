# PR #1127 R4 — Product 밖 쓰기 별도 카운터

## 변경

`ProductSheetSyncService`에 `priceHistoryExposureSpecWrites`를 추가했다. 이 이름은 Product master가 아니라 이번 행 처리 중 상태가 실제로 달라진 `PriceHistory`, `ProductEstimateExposure`, `ProductSpec`을 세는 의미를 직접 드러낸다. 세 엔티티를 하나의 모호한 `sideWrites`로 합치지 않은 이유는 이번 라운드가 “Product 밖 쓰기”라는 관측 의미를 보존하면서도 어떤 보조 엔티티가 대상인지 코드와 로그에서 즉시 확인 가능해야 하기 때문이다.

카운터는 Product가 기존 행이고 Hibernate dirty 판정 결과가 unchanged인 경우에만 증가한다. Product가 신규이거나 Product 자체가 dirty이면 `updated`/`inserted` 계약에 맡긴다. 동일 값의 반복 `save()` 호출은 외부 엔티티 상태 변화로 세지 않는다.

`SyncSummary.totalPriceHistoryExposureSpecWrites`와 tab 로그에도 같은 카운터를 별도로 노출했다. `updated`/`unchanged` 계산식과 Hibernate 영속 메타데이터 판정은 변경하지 않았다.

## RED-A / RED-B 동시 GREEN 원문

회귀 테스트:

```text
sync_Product가_변경되지_않아도_priceHistory와_exposure_변경을_별도카운터로_관측한다()
```

첫 번째 시트 재정렬 실행(Price/Product는 동일, exposure 표시순서만 변경):

```text
[ProductSheetSync] tab '홈멀티': inserted=0, updated=0, unchanged=2, nameDrift=0, priceHistoryExposureSpecWrites=2, softDeleted=0, skipped=0, preservedManual=0
```

동일 시트 연속 두 번째 실행:

```text
[ProductSheetSync] tab '홈멀티': inserted=0, updated=0, unchanged=2, nameDrift=0, priceHistoryExposureSpecWrites=0, softDeleted=0, skipped=0, preservedManual=0
```

따라서 RED-A는 `2`로 잡혔고, RED-B는 두 실행 모두 `updated=0`으로 유지됐다.

## 로그·summary 출력 예시 원문

```text
[ProductSheetSync] tab '홈멀티': inserted=0, updated=0, unchanged=2, nameDrift=0, priceHistoryExposureSpecWrites=2, softDeleted=0, skipped=0, preservedManual=0
[ProductSheetSync] sync 완료: 총 inserted=0, updated=0, softDeleted=0, skipped=0, preservedManual=0, 구성품 linked=0, bundle marked=0, 사양 linked=0, priceHistoryExposureSpecWrites=2, duration=34ms
```

## R1·R2·R3 유지 확인

- 롤백된 변경은 `ProductMutationSnapshot`이 현재 DB 영속 상태를 다시 캡처하므로 다음 실행에서 재시도된다. 인메모리 hash/baseline을 추가하지 않았다.
- `name`은 Product dirty 판정에 사용하지 않고 기존 `nameDrift` 로그·카운터로만 관측된다.
- Product 판정은 기존 Hibernate `EntityEntry` loaded state와 `findDirty`를 그대로 사용한다. 양방향 차집합을 만들 별도 영속 필드 목록을 추가하지 않았다.
- `updated`/`unchanged`의 기존 의미와 연속 실행 계약을 회귀 테스트로 고정했다.

## 검증

```text
./gradlew --no-daemon :services:product-service:test --tests '*ProductSheetSync*' --rerun-tasks
BUILD SUCCESSFUL
ProductSheetSyncExposureReorderIT: 1 tests completed, 0 failed
ProductSheetSyncServiceIT: 39 tests completed, 0 failed
ProductSheetSyncSchedulerTest: 9 tests completed, 0 failed
```

```text
./gradlew --no-daemon :services:product-service:test --rerun-tasks
BUILD SUCCESSFUL
694 tests completed, 0 failed, 0 errors, 0 skipped
```

전체 스위트에서 `HeaderAuthenticationFilterTest` flaky 실패는 이번 실행에서 재현되지 않았으며(1 test, 0 failed), 해당 파일과 동작은 건드리지 않았다.

## 새로 보인 표면 — 목록만

- 구성품 탭의 `BundleComponent` 저장은 Product tab의 `updated`/`unchanged` 행 계약 밖에 있다. 이번 R4 카운터에 섞지 않았다.
- `ProductSheetSyncScheduler`의 기존 로그는 새 summary 필드를 직접 출력하지 않는다. 서비스 summary와 tab 로그 범위에서만 추가했다.

## 신규 파일

- `docs/dev-reports/2026-08-09-978-d1-r4-side-write-counter.md`

커밋·푸시는 하지 않았다.
