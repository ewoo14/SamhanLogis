# PR #1127 R9 — 이월 집계 필드 개명 및 과거 검색 증거 정정

## 범위 판정

`ProductLookupSheetSyncService.totalUnchanged`의 실제 소비자는 product-service Java 런타임 소스와 해당 IT뿐이었다. `tools/legacy-gas/알리고 자동 업로드/Index.html`의 `totalAdded` 계열 지역변수는 별도 Google Apps Script 코드베이스이며 이번 변경 대상이 아니다. 추가적인 셋째 가능성은 확인되지 않았다.

## ① 개명 결과

다음 4건을 `totalUnchangedRows`로 개명했다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:109` — 로그 표시
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:297` — 집계 누적
- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductLookupSheetSyncService.java:503` — `SyncSummary` 필드
- `services/product-service/src/test/java/com/samhanair/logis/product/it/ProductLookupSheetSyncServiceIT.java:184` — 불변식 단정값

계산식과 집계 동작은 변경하지 않았다.

## RED-A

사용한 검색식 원문:

```powershell
git grep -n -I -w -- totalUnchanged -- services/ clients/
```

개명 전에는 4건이 위 product-service 경계에 나타났고, `tools/legacy-gas/**`는 이 결과에 포함되지 않았다. 개명 후 종료 코드 1(매칭 없음)으로 0건을 확인했다.

## RED-B

`ProductLookupSheetSyncServiceIT`를 실행했고, `second.totalUnchangedRows`의 단정값은 그대로 `9`다. 개명 전 필드명을 새 이름으로 먼저 바꾼 TDD RED에서는 `SyncSummary`에 해당 필드가 없어 컴파일 실패(종료 코드 1)했으며, production 개명 후 같은 테스트가 통과했다.

검증 명령:

```powershell
.\gradlew :services:product-service:test --tests '*ProductLookupSheetSyncServiceIT' --rerun-tasks
```

## ② R7·R8 정정 문단

- `docs/dev-reports/2026-08-09-1127-r7-consumer-sweep.md:38`에 정정 문단 추가 — 당시 검색식에 `unchanged`/`totalUnchanged`가 없었고, 기존 "0건"이 전수 결과가 아니었음을 기록. 추가 10줄, 삭제 0줄.
- `docs/dev-reports/2026-08-09-1127-r8-type-alignment.md:98`에 정정 문단 추가 — 동일 사실과 R9 검색식 원문을 기록. 추가 10줄, 삭제 0줄.

줄 수는 `git diff --numstat`의 실제 결과(`10 0`씩)를 기준으로 기록했다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-09-978-r9-sweep-and-evidence-fix.md`

## 못 한 것

- 커밋·푸시는 하지 않았다.
- `tools/legacy-gas/**`와 과거 보고서 원문은 삭제·재작성하지 않았다.
- product-service 범위를 벗어난 전체 스위트는 실행하지 않았다.
