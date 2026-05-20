# MIG-13 Minor 백로그 청소

> 2026-05-21 / branch `spec/2026-05-21-mig-13-minor-cleanup`

## 범위

MIG-1~12 사후 재점검에서 남은 Minor 5건을 admin UI(MIG-14) 진입 전 정리했다. 런타임 계약 변경은 footer 판별 허용 범위 확장 1건이며, 나머지는 stale 문서/주석/도달 불가 분기 정리다.

## 구현 메모

- `PartnerLookupClient` Javadoc에서 V32(MIG-12) 이후 401/403 fail-fast 격상 계약을 명시했다. 404/5xx/network fail-soft 동작은 유지한다.
- MIG-9 dev-report의 `journal_no` prefix를 실제 1e fix 결과인 CashDisbursement `JD-`, CashReceipt `JR-`로 정정했다.
- `EcountSalesPurchaseSummaryImporter` footer regex는 full-width 숫자(`０-９`)와 NBSP 공백을 허용하도록 월계/누계/timestamp 패턴을 같은 정책으로 확장했다.
- `EcountStockTransferImporter`의 `MIG5_LOOKUP_MISS` sample branch는 본 importer에서 throw되지 않는 dead branch라 제거하고, enum 공유 배경만 주석으로 남겼다.
- `AbstractPostgresIT`의 HikariCP `maximum-pool-size=5`는 변경하지 않고, Testcontainers reuse 및 향후 test parallelism 도입 시 재검토 필요성을 주석으로 명시했다.

## 회귀 가드

- `EcountSalesPurchaseSummaryImporterTest.full_width_숫자_footer_정확_skip` 추가.
- full-width 월계, NBSP 포함 누계, full-width timestamp footer 3종이 skip 처리되는지 확인한다.

## 이연

- `DynamicPermissionClient @MockBean` 일괄 청소는 MIG-14 admin UI 슬라이스로 이연한다.
