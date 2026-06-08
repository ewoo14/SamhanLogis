---
name: lookup-seed-source
description: RC9 lookup 3종(material-prices/odu/branch-pipes) 시드 소스 = legacy Google Sheet 3탭, SA key 게이트
metadata:
  type: project
---

RC9 라인입력 lookup 3종(material-prices / odu-recommendations / branch-pipes)은 BE/FE/mock 구현 완료됐으나 **3 테이블 0 row** — V3 Flyway 는 스키마만 만들고 시드 row 가 없음.

**시드 소스의 유일한 원천 = legacy Google Sheet `1RJqO3jT-yJTi3NDBhL60o_cZWlVETGTU7UlvIKXuVNQ` 의 3개 탭:**
- material-prices ← `싱글 자재가격` 탭 (~28행)
- odu-recommendations ← `추천실외기` 탭 (~24행)
- branch-pipes ← `분기계산` 탭 (A열=branchCode, 가변행)

`ProductSeedRunner` 는 `SheetWorkbookReader.fromEnvOrDefault()` 로 `workbook.json`(시트 덤프, SEED_SHEET_DIR/`seed.sheet.dir`, default `../../../../migration/source/sheet`)을 읽음. **이 workbook.json 은 raw 비추적(gitignore) — 양 PC(집/회사) 어디에도 없음** (2026-06-08 회사 PC SAMHAN9440 전역 검색 확인). `Downloads/samhan`=무관 별도 Node 앱, `견적서 양식.xlsx`=10KB 인쇄템플릿(데이터 아님).

**라이브 sync 경로**: `ProductSheetSyncService`(cron+admin trigger)는 SA 인증으로 시트 라이브 read. 단 **6 ProductMaster 카테고리만** sync, lookup 3종 미커버(dev-report migration-be-product-google-sheets-sync §8 후속과제). lookup 3종 시드 = sync 확장 슬라이스 필요.

**SA key 적재 메커니즘**: `GoogleSheetsClient` 가 `google.sheets.service-account-key-path`(env `GOOGLE_SERVICE_ACCOUNT_KEY`, default `/etc/samhan/sa-key.json`)에서 파일을 `GoogleCredentials.fromStream` 으로 로드. Windows 는 default 경로 부재 → 로컬 경로(예 `C:\samhan\sa-key.json`) + env 지정 필요. SA email 을 시트에 Viewer 공유 필수.

2026-06-08 개발책임자 결정: **Google Service Account key 제공 방식**으로 소스 확보. 키 입수 후 sync 확장 슬라이스(Codex 구현). 가짜 데이터 금지([[no-fake-data-ever]]) — 시트 실데이터만.
