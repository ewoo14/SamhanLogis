# SP-04 전메뉴 + legacy GAS/Notion 이식 재점검

> 작성일: 2026-05-16
> 브랜치: `codex/sp-04-full-menu-audit`
> 목적: 전메뉴 라우트/권한/표시명/업무번호 계약 점검과 함께, `tools/legacy-gas` 기반 이카운트/GAS 기능 및 운영 Notion 3표의 Samhan Public 이식 상태를 재검증한다.

## 1. 이번 재점검 결론

| 영역 | 판정 | 근거 |
| --- | --- | --- |
| 전메뉴 IA | 보정 진행 | 판매/구매/재고이동/창고/견적서/주문서의 관리형 메뉴명 정렬, hidden 운영 라우트 공식 메뉴화, backend 권한과 router/sidebar 가드 재정렬 |
| 업무번호 | 보정 진행 | 전표/배차/재고이동은 기존 표준 유지, 견적번호/주문번호/seed/mock/인쇄 샘플까지 `yyyy/MM/dd-{순번}`으로 정렬 |
| legacy GAS 27개 기능 | PR 기준 이식 완료 + P0 보강 이력 확인 | PR #115, #117, #118, #119, #120, #163 dev-report 기준. #163 이후 품목별 DPS pivot route도 현재 메뉴/감사 대상에 포함 |
| Notion 운영 CSV 4종 | 보정 진행 | 노션 원본 데이터를 Samhan Public DB로 이관하고, 이후 화면/API는 우리 DB CRUD만 사용한다. PR #115 고정 row count를 최신 CSV 기준으로 정렬하고, 현재 Notion 표처럼 거래처코드 없이 사업자명만 있는 CHAT/BLOCK 행도 legacy 방식 그대로 보존하도록 alias 이식 경로를 추가 |
| 종합견적서/주문서 Google Sheets | 보정 완료 | legacy GAS `SRC_SHEET_ID=<SHEET_ID>`와 실제 Google Sheet metadata/range를 재검증. `종합견적서` tab은 출력 양식이므로 원본 카탈로그 tab을 직접 읽도록 product/partner-order 매핑 보정 |

## 2. 기존 PR 확인

| PR | 상태 | 확인 범위 |
| --- | --- | --- |
| #115 `feature/integrated-phase-10-step-9-sheet-notion-import` | MERGED | REGION/DC/CHAT/BLOCK CSV import, admin UI, partner_code 우선 매핑 정정 |
| #117 `feature/integrated-phase-10-step-10-gas-b-ecount-auto` | MERGED | GAS B 7건: DPS, 가배차, 미배차, 지방가배차, 전표정리, 내일자 이미지, 배차안내 SMS |
| #118 `feature/integrated-phase-10-step-11-gas-b-accounting` | MERGED | GAS B 회계 4건: 원장, 거래명세서, 계산서, 일마감 |
| #119 `feature/integrated-phase-10-step-12-gas-cd-vendor` | MERGED | 알리고 주소록 sync mock, 운송사 실배차 비교 |
| #120 `feature/integrated-phase-10-step-13-vendor-ocr` | MERGED | 에어디자이너/제이시스템 OCR |
| #163 `feature/legacy-gas-cross-check-and-gap-fill` | MERGED | 27 GAS 매핑 보고서 + 품목별 DPS pivot 보강 |

## 3. Notion 표 스키마와 현재 CSV

사용자 제공 Notion 3표:

| Notion DB | 데이터 소스 | 스키마 | 현재 repo CSV non-empty rows | Samhan Public 위치 |
| --- | --- | --- | ---: | --- |
| 단톡방리스트 | `collection://34da1006-d658-8094-86b0-000bb4ac26e2` | `이카운트 사업자명`, `카톡방`, `생성 일시` | 112 | `notification-service` `partner_chat_room_mappings`, `/admin/chat-rooms` |
| 발송금지리스트 | `collection://34da1006-d658-8069-921a-000be16368a3` | `이카운트 사업자명`, `생성 일시` | 6 | `partner-service` `blocked_partners`, `/admin/blocked-partners` |
| 배차지역 분류표 | `collection://34ea1006-d658-8072-bf59-000ba8a8557f` | `분류 그룹`, `검색어` | 20 | `arologis-service` `region_dispatch_classifications`, `/admin/regions` |

추가로 PR #115 범위였던 `거래처 DC정보` CSV는 현재 non-empty 213 rows이며 `dc-config-service` `/api/v1/dc-config/admin/import`로 DB에 이관된다. 이관 후 `단톡방리스트` / `발송금지리스트` / `배차지역 분류표` / `거래처 DC정보`는 모두 Samhan Public 각 서비스 DB가 source-of-truth 이며, 노션은 런타임 조회처가 아니다.

## 4. 종합견적서 / 거래처 발송 주문서 Google Sheets 원본 대조

legacy GAS 두 앱은 같은 spreadsheet를 source-of-truth로 사용한다.

| 앱 | legacy 파일 | sheet id | 원본 tab |
| --- | --- | --- | --- |
| 종합견적서 | `tools/legacy-gas/종합견적서/Code.js` | `<SHEET_ID>` | `홈멀티_단가인상`, `싱글 세트_단가인상`, `싱글 구성품_단가인상`, `상업멀티_단가인상`, `상업멀티 구성_단가인상`, `구형`, `거래처`, `담당자`, `추천실외기` |
| 거래처 발송 주문서 | `tools/legacy-gas/거래처 발송 주문서/Code.js` | 동일 | `홈멀티`, `싱글 세트`, `싱글 구성품`, `상업멀티`, `상업멀티 구성`, `구형`, `거래처`, `담당자` + 단가인상 helper tab |

Google Sheets connector 재검증 결과:

| range | 확인 결과 |
| --- | --- |
| `종합견적서!A1:H20` | `견 적 서` 출력 양식. `품명/모델/단위/수량/출고가/납품가/소계` header만 있고 카탈로그 row가 아님 |
| `홈멀티_단가인상!A1:H12` | B열 모델명, D열 출고가, F열 납품가. 예: `AJ060MXHNBC1`, 납품가 `1,611,115` |
| `싱글 세트_단가인상!A1:I12` | C열 모델명, E열 출고가, H열 납품가. 예: `AC060CS6PBH1SY`, 납품가 `1,490,000` |
| `상업멀티 구성_단가인상!A1:J12` | B열 모델명, D열 출고가, F열 납품가. 예: `AM080AXVHHH1`, 납품가 `4,715,370` |
| `거래처!A1:J8` | 거래처코드/담당자명/거래처명/대표자명/주소/전화번호/특이사항/그룹/여신한도/싱글 할인 |

보정:
- `ProductSheetSyncService`는 tab별 모델/가격 컬럼 index를 별도 계약으로 갖는다. 싱글 세트/싱글 구성품은 B열 평형이 아니라 C열 모델명을 사용한다.
- `ProductCatalogLookupClient`는 기본값에서 `종합견적서!A2:C` flat range 가정을 제거하고, legacy GAS 원본 tab을 직접 읽는다. `INTEGRATED_QUOTE_RANGE`는 운영자가 별도 3열 flat catalog를 만든 경우에만 override로 사용한다.
- SP-07 정정: 단가 lookup/UI는 GAS를 그대로 유지한다. 종합견적서 기본값은 `*_단가인상`, `인상 전 단가`는 base tab PriceHistory를 사용하며, vendor OCR 업로드에는 새 price basis UI를 추가하지 않는다.

## 5. 발견한 정합성 이슈와 처리

| 이슈 | 영향 | 처리 |
| --- | --- | --- |
| PR #115 문서/스크립트의 기대 row count가 현재 CSV와 다름: REGION 19→20, CHAT 111→112, BLOCK 5→6, DC 221→213 | 최신 export를 모두 넣어도 검증 스크립트가 실패/오판 가능 | `import-notion-csv.ps1`가 선택된 CSV의 실제 non-empty row count를 계산하도록 수정 |
| 현재 단톡방/발송금지 Notion 표가 `이카운트 사업자명`만 보유하고 `거래처코드`를 보유하지 않음 | PR #115의 code-first 계약만 엄격 적용하면 실제 운영 표 112/6 rows 중 일부가 reject되어 legacy GAS 대비 기능 누락 발생 | `LEGACY-NAME-{hash}` alias를 생성해 name-only 행을 유실 없이 저장하고, 내일자 전표/배차안내 조회 시 `partnerName` fallback 으로 단톡방/발송금지를 적용 |
| DC CSV에는 거래처코드가 있지만 로컬 `dc_config_db.partners` seed가 비어 있음 | DC 213 rows 전체 import가 `partner not found`로 reject될 수 있음 | DC import 시 CSV의 `거래처코드`/`업체명`으로 최소 Partner snapshot을 자동 생성한 뒤 DC config를 upsert |
| import service Javadoc에 과거 row count가 남아 있음 | 운영자가 현재 export와 문서 불일치로 혼동 가능 | 하드코딩된 row count 문구 제거 |
| `/admin/regions` 중복 entry와 `지역 분류` legacy 라벨 | 배차담당자 화면에서 같은 기능이 두 메뉴로 보임 | 단일 `배차지역 관리` entry로 정리, DISPATCH 조회 전용/관리자는 수정 가능 |
| `DISPATCH` role이 FE/BE 사용처에는 있으나 shared Role enum에 없음 | user-service role 목록/토큰/권한 부여 경로에서 배차담당자 부재 | `Role.DISPATCH("배차담당자")` 추가 및 user/desktop label 보강 |
| 견적/주문 신규 채번과 seed/mock 샘플이 `EQ-`, `PO-`, `OUT-` prefix 또는 `YYYY/MM/DD - 0001` 형태를 일부 유지 | 전표번호 표준과 화면 샘플이 어긋나 사용자가 업무번호 규칙을 다르게 이해할 수 있음 | 신규 견적/주문 채번, dev seed, desktop mock/print 샘플을 `YYYY/MM/DD-{순번}`으로 정렬 |
| partner-order vendor OCR catalog lookup 이 `종합견적서!A2:C`를 flat catalog로 가정 | 실제 `종합견적서` tab은 출력 양식이라 모델 lookup이 비거나 잘못될 수 있음 | legacy GAS와 동일하게 원본 category tab을 직접 읽고, SP-07에서 vendor OCR은 `_단가인상` tab lookup 유지 / 종합견적서 `인상 전 단가`는 product DB `PriceHistory`로 보정 |
| product-service Google Sheet sync 가 모든 tab을 홈멀티 컬럼 구조로 해석 | `싱글 세트`의 평형이 modelCode로 저장되고 단가 컬럼이 어긋날 수 있음 | tab별 column mapping 추가 + `ProductSheetSyncServiceIT`에 싱글 세트/상업멀티 구성 실제 시트 shape 회귀 테스트 추가 |

## 6. 남은 운영 리스크

| 항목 | 권장 처리 |
| --- | --- |
| 알리고 실 API | 현재 dryRun/mock 기반. API key/spec 입수 후 실 RestClient 활성화 별도 PR |
| Notion CSV 실제 import | Docker 기반 로컬 서비스 부팅 후 `tools/operational-validation/import-notion-csv.ps1` 실행, rejected 0 및 DB row count 확인 |
| Google Service Account 로컬 실 read | connector로 metadata/range는 확인 완료. 운영 runtime 검증은 `%USERPROFILE%\.samhan\sa-key.json` 배치 후 `docs/operational-validation/google-sheets-source-validation.md` 절차 실행 |
| 거래처명만 있는 CHAT/BLOCK row | 운영 표 변경 없이 import 가능. Samhan Public 내부에는 deterministic legacy alias로 저장하고, 실제 업무 조회는 partner code 우선 + partner name fallback 으로 적용 |
| DC CSV row 감소 | 현재 CSV 기준으로는 정상. 과거 221 row와 차이가 의도된 삭제인지 운영자가 한 번 spot-check 권장 |

## 7. 검증

| 검증 | 결과 |
| --- | --- |
| `ProductCatalogLookupClientTest` | PASS — 종합견적서 출력 tab 대신 Google Sheet 원본 tab lookup 계약 |
| `ProductSheetSyncServiceIT` | PASS — 싱글 세트/상업멀티 구성 실제 Google Sheet 컬럼 계약 |
| `DcConfigImportServiceTest` | PASS — trailing blank row skip + Partner snapshot 자동 생성 |
| `RoleTest`, `AdminUserControllerTest` | PASS — `DISPATCH` role 공통 enum/사용자 관리 계약 |
| `ChatRoomImportServiceTest`, `DispatchBatchPreviewServiceTest`, `PartnerBlockImportServiceTest` | PASS — name-only Notion row alias + partner name fallback |
| `EstimateNumberServiceTest`, `PartnerOrderConfirmServiceTest`, `VendorOrderServiceTest`, `NextDaySlipImageServiceTest`, `DispatchBoardAdminControllerIT`, `StockTransferServiceTest` | PASS — 업무번호/전표 이미지/배차 권한/재고이동 회귀 |
| `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts` | PASS — 11 tests, 전메뉴/권한/업무번호/legacy report/CSV/Google Sheets 정적 계약 |
| `tools/operational-validation/import-notion-csv.ps1 -ContinueOnError` | PASS — REGION 20 / DC 213 / CHAT 112 / BLOCK 6 모두 HTTP 200, rejected 0 |
| `tools/operational-validation/run-smoke-tests.ps1` | PASS — service health UP 15/15, endpoint smoke OK 7/7 |
| `clients/desktop` typecheck/lint/build | PASS — lint 기존 warning 2건, error 0 |
| QA mock screenshot | PASS — `docs/qa/sp-04-full-menu-audit/screenshots/*.png` 12장 생성, 모두 non-zero |
