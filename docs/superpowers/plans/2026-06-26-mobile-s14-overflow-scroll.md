# 모바일 슬14 — overflow/scroll 보강 (plan)

> 에픽 [모바일 레이아웃 갭 클로저](../specs/2026-06-26-mobile-layout-gap-closure-design.md) 슬14. 슬12a/12입력폼/12b/13 머지 완결 후속. 소형 CSS.

## 대상 + 정찰 결과
| 분류 | 파일 | 정찰 | 접근 |
|---|---|---|---|
| 권한 매트릭스 | PermissionMatrixBulkPage(minWidth180, **overflowX 0**) | 래퍼 부재 | **overflow-x:auto 래퍼** |
| 권한 매트릭스 | PermissionMatrixPage·PermissionGroupMatrixPage(minWidth 980, overflowX 1) | 기존 래퍼 有 | 검증, 미흡 시 보강(sticky 첫 컬럼 검토) |
| 거래명세서 | StatementBatchPage(8컬럼 table, **overflowX 0**) | 래퍼 부재 | **overflow-x:auto 래퍼** |
| sub-nav | ProductClassificationsPage·EstimateItemsCatalogPage(카테고리 탭 inline-flex+nowrap) | 가로 오버플로 | **컨테이너 overflow-x:auto + 탭 flex-shrink:0**(공용 Tabs 동형) |
| 필터바 | PhotoAuditPage(5열 grid minmax 합~640px) | ≤768 미접힘 | 전역 **`.mobile-filter-grid`**(@media 1열, 슬10 기존) |
| 필터바 | DocumentReferencePicker | 구조 확인 후 | `.mobile-filter-grid` 또는 동형 |

## 접근
- **wide table/매트릭스**: 스크롤 래퍼 `<div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' }}>` 부재처에 추가. minWidth 보존(데스크탑 무변동, 모바일 가로스크롤로 액션열 도달). sticky 첫 컬럼은 선택(매트릭스 행 라벨 고정).
- **sub-nav 탭**: 탭 컨테이너 `overflow-x:auto` + 각 탭 `flex-shrink:0`(no-wrap 가로스크롤). 공용 Tabs 패턴과 동형.
- **필터바**: 전역 `.mobile-filter-grid`(global.css:5063, @media≤768 1열) className 부여. 데스크탑 grid 무변동.

## 불변
- 데스크탑 무회귀(래퍼는 항상 적용 가능하나 minWidth로 데스크탑 폭 보존, 필터바는 @media 스코프). testid/핸들러 보존. Flyway 0, BE 무변경, FE only.

## 워크플로우
canonical 8단계. 라이브 QA 390/1280(매트릭스 가로스크롤 도달·필터바 1열·데스크탑 무회귀). 매 Bundle ScheduleWakeup. 무시드(권한 dev_master 403 등) 정직 보고.
