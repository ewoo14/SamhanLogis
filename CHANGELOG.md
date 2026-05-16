# Changelog

> 본 파일은 Samhan Public + 아로로지스 통합 플랫폼의 사용자 가시 변경 요약을 누적한다.
> 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 기반이며, 한국어로 작성한다.
> 모든 entry는 머지된 PR 번호와 함께 표기하고, 운영자 화면/시나리오/성공·실패 처리·계약 변경 사항을 포함한다.
> 본격적인 머지 PR 본문/메모리 가드는 README §최신 진행 메모, ROADMAP, `migration/decisions/DECISIONS.md`를 함께 참조한다.

---

## [Unreleased]

### SP-08 legacy GAS DB/API parity 기반 잠금

- legacy GAS UI/기능은 유지하고 Notion live save/import 문구만 Samhan DB/API 의미로 정리.
- `estimate-app` 견적 저장 confirm: `노션에 저장` → `Samhan DB에 저장`.
- `order-app` `getOrderSnapshotHistory(safeBizNo, sDate, eDate)` legacy 시그니처를 유지하되 `safeBizNo`는 client-side 호환 인자로만 소비하고 `/partner-orders/drafts?from=&to=` query params로 날짜만 전달.
- `partner-order-service` draft list endpoint에 optional `from/to` 날짜 필터 추가. 한쪽 범위만 온 경우 sentinel date 없이 전용 repository method로 분기하며, 기존 caller는 파라미터 없이 그대로 동작.
- 단톡방/발송금지/배차지역/DC 관리 화면의 사용자 노출 import/source label을 `기존 운영 CSV`, `DB 이관 시드`, `원본 생성`으로 정렬.
- SP-08 static contract와 QA PNG 11장 생성 스크립트 추가.

---

## 2026-05-16 — SP-07 Google Sheets 견적/주문 원본 계약 정렬

- PR: [#209](https://github.com/ewoo14/SamhanLogis/pull/209) — `[codex] SP-07 Google Sheets 견적 주문 원본 계약 정렬`
- 결정 기록: [`migration/decisions/DECISIONS.md` § SP-07](migration/decisions/DECISIONS.md) (SP-07-01 ~ SP-07-08)
- dev-report: [`docs/dev-reports/2026-05-16-sp-07-google-sheets-quote-order-e2e.md`](docs/dev-reports/2026-05-16-sp-07-google-sheets-quote-order-e2e.md)
- 계획 문서: [`docs/planning/2026-05-16_google-sheets-quote-order-e2e.md`](docs/planning/2026-05-16_google-sheets-quote-order-e2e.md)
- live 원본 snapshot: [`docs/operational-validation/google-sheets-live-source-snapshot.md`](docs/operational-validation/google-sheets-live-source-snapshot.md)

### 시나리오 / 화면 흐름

1. **운영자 (MANAGER / MASTER) 가 종합견적서 spreadsheet 단가표를 갱신**
   - GAS 작성 화면은 그대로 유지. `홈멀티_단가인상`, `싱글 세트_단가인상`, `싱글 구성품_단가인상`, `상업멀티_단가인상`, `상업멀티 구성_단가인상`, `구형` source tab에 직접 입력한다.
2. **`product-service`가 cron 으로 `ProductSheetSyncService.syncTab` 실행**
   - `*_단가인상` tab을 ProductMaster 기본 단가(`releasePrice` / `deliveryPrice`)로 sync (effective date `2026-04-01` PriceHistory 동시 upsert).
   - base tab (`홈멀티`, `싱글 세트`, `상업멀티`, …) 의 row 중 current tab에도 존재하는 modelCode 에 한해 `인상 전 단가` PriceHistory(effective date `2000-01-01`)로 보존. base-only 모델을 active ProductMaster 로 되살리는 silent fallback 은 차단한다.
   - 시트에서 사라진 modelCode는 `productCategory` scope의 `findByProductCategoryAndIsDeletedFalse` 기반으로 정확히 soft-delete (이전 `UsageScope` 누수 가능성 정리).
3. **`partner-order-service` bootstrap 호출 (`/api/v1/bootstrap`)**
   - 거래처 발송 주문서 GAS와 동일하게 base payload + `*_단가인상` helper map prefetch. 존재하지 않는 `설정!A1:Z` config read 는 제거되고, config 는 V2 seed fallback + DC secret strip 으로 응답한다.
   - output/control form(`종합견적서`, `전표업로드목록`, credential-bearing `전표생성폼`)은 prefetch 범위에서 제외 — 운영자 spreadsheet 권한 유출 / API 인증키 leak 차단.
4. **거래처 주문서 OCR 업로드 (vendor OCR 경로)**
   - `ProductCatalogLookupClient.CatalogEntry` 는 `releasePrice` (출고가) + `unitPrice` (납품가) 두 가격을 함께 반환. 기존 3-arg `(modelCode, productName, unitPrice)` 호환 생성자는 유지되어 OCR 업로드 UI/API의 외부 계약은 변경되지 않는다.

### 성공 / 실패 처리

- **성공** — `*_단가인상` row hash 변동 시 ProductMaster + PriceHistory 동시 upsert, hash 동일 시 unchanged 카운트만 증가. base tab `인상 전 단가` 도 같은 modelCode 에 대해 멱등하게 upsert.
- **부분 실패 (개별 row)** — header row 탐색 실패, modelCode blank, base-only modelCode 등은 warn 로그 + skip. cron 자체는 계속 진행한다.
- **base tab 헤더 탐색 실패** — `[ProductSheetSync] 인상 전 tab '{tab}' 헤더 row 탐색 실패 — priceHistory skip` 로그 남기고 PriceHistory upsert 만 skip, 현재 단가 sync 는 정상 종료.
- **`GoogleSheetsClient` 호출 실패** — `ProductCatalogLookupClient` 는 fail-soft (warn 로그, 빈 catalog 반환) 로 OCR 진행 자체는 차단하지 않는다.
- **credential leak guard** — `전표생성폼` 등 credential-bearing tab은 bootstrap range-map / catalog lookup / docs / fixture / PR 캡처 어디에도 게시 금지 (SP-07-03).

### API 계약 변경

| 영향 | 항목 | 변경 | 호환성 |
| ---- | ---- | ---- | ------ |
| 외부 (vendor OCR 업로드 UI/API) | `/api/v1/vendor-orders/*` 업로드 endpoint | 변경 없음 | 기존 client 100% 호환 |
| 내부 (`partner-order-service`) | `ProductCatalogLookupClient.CatalogEntry` record | `(modelCode, productName, unitPrice)` → `(modelCode, productName, releasePrice, unitPrice)` 4-필드로 확장. `releasePrice` 는 `*_단가인상` source tab의 출고가 열에서 채운다. | 기존 3-arg `new CatalogEntry(modelCode, name, unitPrice)` 생성자 보존 — 호출자 수정 없이 컴파일 가능. 3-arg 경로는 `releasePrice = 0` 으로 채워진다. |
| 내부 (`partner-order-service`) | bootstrap range-map | `설정!A1:Z` (존재하지 않는 tab) 제거, base payload + `*_단가인상` helper map prefetch 구성으로 정렬 | 거래처 발송 주문서 GAS와 1:1. 기존 응답 시 `설정` 빈 배열 의존 코드 없음 — 회귀 없음. |
| 내부 (`product-service`) | `ProductSheetSyncService` 생성자 | `PriceHistoryRepository` DI 추가, `SheetTabMapping` 에 `currentTabName` + `beforeIncreaseTabName` 분리 | Spring 자동주입. ProductMaster sync 동작은 동일 + PriceHistory 보존 효과 추가. |
| 내부 (`product-service`) | `ProductRepository` | `findByProductCategoryAndIsDeletedFalse(ProductCategory)` 추가 | 기존 `findByUsageScopeAndIsDeletedFalse` 도 유지. soft-delete scope 가 정확히 `productCategory` 범위로 좁혀짐 (회귀 fix). |
| 내부 (`product-service`) | `PriceHistoryRepository` | `findByProductIdAndEffectiveDate(UUID, LocalDate)` 추가 | upsert 경로 한정 — 외부 호출자 없음. |

> **신규 `priceBasis` 옵션은 도입하지 않는다** — 사용자 정정 (SP-07-05) 에 따라 vendor OCR 업로드 UI/API 와 `종합견적서` GAS UI 는 legacy 1:1 보존. 가격 기준 분리는 server-side 동기화 / PriceHistory 보존 계층에서만 처리한다.

### 검증

- backend
  - `gradlew.bat :services:partner-order-service:test --tests *BootstrapServiceTest --tests *ProductCatalogLookupClientTest --tests *VendorOrderServiceTest --tests *VendorOrderControllerIT --no-daemon --rerun-tasks` — PASS, skipped 0
  - `gradlew.bat :services:product-service:test --tests *ProductSheetSyncServiceIT --no-daemon --rerun-tasks` — PASS, 9 tests, skipped 0
- frontend / static contract
  - `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts --reporter=line` — PASS, 7 tests, skipped 0
  - `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` — PASS, 18 tests, skipped 0
  - `npm run typecheck` / `npm run lint` (warning 2, error 0) / `npm run build` — PASS
- 정합성
  - `git diff --check` — PASS (CRLF 안내 warning 만)

### 보안 / secret 가드

- 본 PR 은 Google Spreadsheet ID / Service Account JSON / SMTP / Aligo / OCR API key 를 어떤 문서·CHANGELOG·README·fixture·PR 캡처에도 포함하지 않는다.
- `전표생성폼` 등 credential-bearing tab 의 cell 값 / range 는 본 문서 / `docs/operational-validation/google-sheets-live-source-snapshot.md` / 테스트 fixture 어디에도 게시되지 않는다 (SP-07-03).
- 실제 credential 은 운영 환경의 secret store (AWS Secrets Manager / GitHub Actions secrets / 로컬 `.env`) 에만 존재하며, 본 문서는 secret 등록 위치만 가리킨다.
