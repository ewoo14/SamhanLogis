# SP-07 Google Sheets 견적/주문 E2E

> 목적: `종합 견적서` Google Spreadsheet의 live source tab을 재검증하고, Samhan Public이 output/control form 또는 credential-bearing tab을 runtime prefetch 대상으로 오인하지 않도록 계약화한다.

## 구현 요약

| 영역 | 내용 |
|---|---|
| live snapshot | connector로 spreadsheet `<SHEET_ID>` metadata와 안전 range를 확인했다. |
| partner-order | bootstrap `range-map`에서 존재하지 않는 `설정!A1:Z` config read를 제거하고, 거래처 발송 주문서 GAS처럼 base payload + `*_단가인상` helper map을 모두 prefetch한다. |
| product-service | 종합견적서 기본값은 `*_단가인상`으로 DB sync하고, 붙지 않은 base tab은 `인상 전 단가`용 `PriceHistory`로 보존한다. |
| 보안 가드 | `전표생성폼`은 credential-bearing 제어 폼, `전표업로드목록`/`종합견적서`는 output/form으로 문서화했다. |
| 테스트 | `BootstrapServiceTest`가 config seed fallback + DC secret strip + form tab 미조회 계약을 검증하고, `ProductSheetSyncServiceIT`가 `PriceHistory` current/base 계약을 검증한다. |
| static contract | Playwright SP-07 계약으로 range-map, catalog lookup, product sync column mapping, 문서 산출물을 함께 검증한다. |
| Claude Code workflow | `claude` CLI로 `docs/planning/2026-05-16_google-sheets-quote-order-e2e.md` 기획 문서를 생성하고, Codex가 구현 스펙과 대조 후 bootstrap/catalog 역할 구분 문구를 정합화했다. |

## Live connector 증거

| range | 검증 |
|---|---|
| spreadsheet metadata | 27개 tab, locale `ko_KR`, timezone `Asia/Seoul` |
| `홈멀티_단가인상!A3:H4` | `AJ060MXHNBC1`, 납품가 `1,611,115` |
| `싱글 세트_단가인상!A3:I4` | `AC060CS6PBH1SY`, C열 모델명/H열 납품가 |
| `상업멀티 구성_단가인상!A1:J2` | `AM080AXVHHH1`, B열 모델명/F열 납품가 |
| `종합견적서!A1:H12` | 출력 양식. 카탈로그 원본 아님 |
| `전표업로드목록!A1:J3` | 업로드 조립 출력 양식 |
| `거래처!A1:J1` | header만 문서화. 개인정보 row는 게시하지 않음 |

## 검증 로그

| 명령 | 결과 |
|---|---|
| `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts --reporter=line` | PASS — 7 tests, skipped 0. 문구 assertion RED 2건 확인 후 실제 산출물 기준으로 GREEN |
| `npx playwright test playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` | PASS — 18 tests, skipped 0 |
| `.\gradlew.bat :services:partner-order-service:test --tests "*BootstrapServiceTest" --tests "*ProductCatalogLookupClientTest" --tests "*VendorOrderServiceTest" --tests "*VendorOrderControllerIT" --no-daemon --rerun-tasks` | PASS — targeted partner-order tests, skipped 0 |
| `.\gradlew.bat :services:product-service:test --tests "*ProductSheetSyncServiceIT" --no-daemon --rerun-tasks` | PASS — 9 tests, skipped 0 |
| `npm run typecheck` (`clients/desktop`) | PASS |
| `npm run lint` (`clients/desktop`) | PASS — 기존 warning 2건, error 0 |
| `npm run build` (`clients/desktop`) | PASS |
| `git diff --check` | PASS — CRLF 안내 warning만 출력 |
| `node scripts/generate-sp-07-google-sheets-source-screenshots.mjs` | PASS — 1280x900 PNG 6장 생성, 03/05 원본 보기 확인 |

## QA 캡처

| # | 파일 | 내용 |
|---|---|---|
| 01 | `01-live-spreadsheet-tab-inventory.png` | 27개 live tab inventory |
| 02 | `02-source-tabs-vs-output-forms.png` | source tab과 output/control form 분리 |
| 03 | `03-bootstrap-secure-range-map.png` | bootstrap prefetch 보안 range-map |
| 04 | `04-catalog-lookup-column-contract.png` | partner-order modelCode/납품가 column 계약 |
| 05 | `05-product-db-sync-contract.png` | product-service DB sync 계약 |
| 06 | `06-verification-matrix.png` | 테스트/문서/secret guard matrix |

## 후속

- 운영 PC에 Service Account 키를 배치한 뒤 `docs/operational-validation/google-sheets-source-validation.md` §5 runtime 검증을 실행한다.
- 별도 3열 flat catalog를 만들지 않는 한 `INTEGRATED_QUOTE_RANGE`는 미설정으로 둔다.
