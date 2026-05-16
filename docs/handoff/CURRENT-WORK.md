# 현재 작업 핸드오프 노트

> 갱신일: 2026-05-16 (SP-05 **Samhan Public CRUD 표면 재점검 진행**, Codex)
> 갱신자: Codex
> 사용법: 새 도구/세션 시작 시 본 파일 read → §0 (즉시 시작) + §1 (방금 끝난 일) + §3 (다음 trigger 후보) 순서

## 2026-05-16 Codex 최신 핸드오프 — SP-05 Samhan Public CRUD 표면 재점검

- 현재 branch: `codex/sp-05-samhan-public-crud-audit`
- 기준 main: PR #206 `[codex] SP-04 Samhan Public 전메뉴와 legacy GAS/노션 이식 감사` merge commit `0d77e0815ad6a43ca7cf0a2f59bcb909eb043991`.
- 현재 PR: 생성 예정 — `[codex] SP-05 Samhan Public CRUD 표면 재점검`
- 사용자 최신 요청:
  - SP-04 이후 할 일을 순서대로 진행한다.
  - 우선순위는 SP-05 → SP-06 → SP-07 → SP-08 순서다.
  - 판매/구매/거래처 등 실제 사용자가 생성/상세/수정/검수 흐름을 찾을 수 있어야 한다.
- SP-05 진행:
  - 판매관리 목록에서 `상세` 버튼을 추가하고 `/sales/:id` 상세/수정 화면으로 명시 진입하게 했다.
  - 구매관리 목록에서 `상세` 버튼을 추가하고 기존 `검수` CTA와 공존하게 했다.
  - 상세 버튼의 `data-testid`와 aria label은 내부 UUID가 아니라 공개 업무번호(`slipNo`, `YYYY/MM/DD-{순번}`) 기반이다.
  - `clients/desktop/playwright/sp-05-crud-surface/sp-05-crud-surface.spec.ts`를 RED 후 GREEN으로 통과시켰다.
  - `frontend-feature-inventory.md`, `missing-features-catalog.md`에 2026-05-16 SP-05 현재 상태 블록을 추가했다. 거래처 기본 UI와 구매관리 검수 CTA는 더 이상 “UI 부재”로 표기하지 않는다.
- 로컬 검증:
  - SP-05 QA 캡처 8장 생성 및 non-zero 확인 완료.
  - `clients/desktop` typecheck/lint/build PASS. lint는 기존 warning 2건, error 0.
  - static Playwright contract PASS: SP-05 + full-menu 14 tests / skipped 0.
  - Vite mock UI Playwright PASS: sales/purchase query 9 tests / skipped 0.
- 남은 즉시 작업:
  - 커밋/push/PR 생성.
  - PR 본문에 QA 캡처 8장을 commit-SHA raw URL로 인라인 첨부.
  - CI watch 후 PM 재점검/머지.
- 다음 후보:
  - SP-06 legacy GAS 기능 완전 대조
  - SP-07 Google Sheets 견적/주문 E2E
  - SP-08 권한/역할/UUID 비노출 전메뉴 회귀

## 2026-05-16 Codex 핸드오프 — SP-04 Samhan Public 전메뉴/legacy GAS/노션 이식 감사

- branch: `codex/sp-04-full-menu-audit`
- 기준 main: PR #205 `[codex] SP-03 Samhan Public 구매관리 검수 CTA와 표시번호 정합화` merge.
- PR #206 merge 완료 — `[codex] SP-04 Samhan Public 전메뉴와 legacy GAS/노션 이식 감사`.
- 사용자 최신 요청:
  - 전메뉴를 전체 점검한다.
  - `/tools/legacy-gas` 안 기존 이카운트 + Google Apps Script 연동 프로그램이 기능 누락 없이 Samhan Public 으로 이식됐는지 확인한다.
  - Notion 단톡방리스트 / 발송금지리스트 / 배차지역 분류표를 참조하며, 해당 데이터를 모두 이식한다.
  - 기존 PR을 확인한다.
  - 종합견적서와 주문서는 Google Spreadsheet 데이터를 그대로 가져오는지 재검증한다.
- SP-04 구현/감사 진행:
  - 기존 PR #115/#117/#118/#119/#120/#163을 legacy GAS/Notion migration 근거로 대조했다.
  - Notion database schema 확인:
    - 단톡방리스트: `이카운트 사업자명`, `카톡방`, `생성 일시`
    - 발송금지리스트: `이카운트 사업자명`, `생성 일시`
    - 배차지역 분류표: `분류 그룹`, `검색어`
  - 로컬 CSV export 현재 row count 를 재검증했다: 배차지역 20 / 거래처 DC 213 / 단톡방 112 / 발송금지 6.
  - `tools/operational-validation/import-notion-csv.ps1` 의 hardcoded 기대 row count 를 제거하고 현재 CSV non-empty row 기준으로 검증하도록 정렬했다.
  - 현재 Notion 단톡방/발송금지 표가 `거래처코드` 없이 `이카운트 사업자명`만 갖는 것을 확인했다. legacy GAS 동작을 보존하기 위해 code-first import 후 lookup miss row 는 `LEGACY-NAME-{hash}` alias 로 저장하고, 내일자 전표/배차안내는 partner name fallback 으로 단톡방/발송금지를 적용하도록 보정했다.
  - DC import 는 로컬 `dc_config_db.partners` seed 가 비어 있어도 CSV `거래처코드`/`업체명`으로 최소 Partner snapshot 을 생성한 뒤 213 rows 를 이식할 수 있게 보정했다.
  - Google Sheets connector로 legacy spreadsheet `종합 견적서` metadata와 핵심 range를 재검증했다. `종합견적서!A1:H20`은 출력 양식이고, 실제 카탈로그 원본은 `홈멀티_단가인상`, `싱글 세트_단가인상`, `상업멀티 구성_단가인상` 등 source tab임을 확인했다.
  - `ProductSheetSyncService`는 tab별 column mapping으로 보정했다. `싱글 세트`/`싱글 구성품`은 C열 모델명, H열 납품가를 사용한다.
  - `ProductCatalogLookupClient`는 `종합견적서!A2:C` flat range 가정을 제거하고, `*_단가인상` source tab 우선 + 주문서 base tab fallback으로 modelCode 단가를 lookup한다. `INTEGRATED_QUOTE_RANGE`는 별도 flat catalog가 있을 때만 override한다.
  - 전메뉴 IA/권한을 보정했다: `/sales/new`, `/purchases/new`, `/transfers/new`, `/sales/link-dispatch`, admin-origin 시트/발송금지/단톡방/지역 화면 route guard.
  - `DISPATCH` 공통 role 을 추가하고 배차/지역 조회 전용 계약에 연결했다.
  - 견적번호/주문번호/재고이동/전표/배차번호를 공개 업무번호 `YYYY/MM/DD-{순번}` 표준으로 정렬 중이다. 판매전표와 구매전표처럼 메뉴/업무 타입이 다르면 같은 날짜 같은 순번을 가질 수 있다.
  - PR 캡처용 SP-04 스크린샷 생성 스크립트와 static Playwright contract 를 추가했다.
- 완료:
  - SP-04 screenshot 12장 생성 및 PR body commit-SHA raw URL 링크 검증 완료.
  - `clients/desktop` typecheck/lint/build + static Playwright contract 완료.
  - targeted Gradle/Google Sheets/import validation + Docker smoke 완료.
  - PR #206 merge 및 미사용 브랜치 정리 완료.

## 2026-05-16 Codex 핸드오프 — SP-03 Samhan Public 구매관리 검수 CTA + 관리형 메뉴/이동번호 정합화

- 현재 branch: `codex/sp-03-purchase-inspection-cta`
- 기준 main: PR #204 `codex/sp-02-samhan-public-ui-gap-audit` merge commit `871e2a10`
- 현재 PR: 생성 예정 — `[codex] SP-03 Samhan Public 구매관리 검수 CTA와 표시번호 정합화`
- 직전 완료:
  - SP-01 거래처 관리 메뉴 권한 정합화 PR #203 merge.
  - SP-02 회계 마감 메뉴 권한 정합화 PR #204 merge.
- 사용자 최신 결정:
  - 전표번호는 전역 unique 가 아니라 메뉴/업무 속성별 날짜 시퀀스다.
  - 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 서로 다른 메뉴값/속성이므로 중복 가능하다.
  - 이동번호/배차번호도 사용자 노출 업무번호로 보고 `YYYY/MM/DD-{순번}` 형식을 따른다.
  - `T-2026/05/04-1`, `TR-20260504-001` 같은 prefix/padding 표기는 정합성 위배이므로 화면/신규 생성/Flyway 정규화 대상이다.
  - UUID는 내부 PK이며 Samhan Public/아로로지스 화면에 표시하지 않는다.
- SP-03 구현:
  - `구매조회` 를 `구매관리` 로 정리하고, `WAREHOUSE / MANAGER / MASTER` 에게 SAVED/CONFIRMED 구매전표 입고 검수 CTA 를 노출한다.
  - 입고 검수 모달은 `InboundInspectionDialog` 를 재사용하고 성공 후 구매관리 목록을 refetch 한다.
  - inventory-service 입고 검수 API 는 gateway strip 후 경로와 직접 `/api/v1/...` 경로를 모두 수용한다.
  - 사이드바/하위 메뉴 표기를 관리형으로 정리했다: `판매관리`, `구매관리`, `재고이동 관리`, `창고 관리`, `견적서 관리`, `주문서 관리`.
  - 예외 메뉴 `주문서 승인`, `거래처 DC 설정` 은 기존 명칭을 유지한다.
  - `StockTransferService` 신규 이동번호를 `YYYY/MM/DD-{순번}` 으로 생성한다. 채번은 같은 날짜의 마지막 numeric suffix + 1이며, Flyway `V10__normalize_stock_transfer_numbers.sql` 로 기존 `T-`/`TR-` 이동번호를 정규화한다.
  - 구매/판매/이동 mock 데이터와 문서 예시는 UUID 대신 공개 업무번호만 표시한다.
- SP-03 로컬 검증:
  - QA 캡처 6장 생성 완료: `docs/qa/sp-03-purchase-inspection-cta/screenshots/01-warehouse-purchase-inspect-cta.png` ~ `06-business-number-uuid-hidden-matrix.png`.
  - QA 캡처 UUID/내부키 문자열 스캔 PASS.
  - Docker Desktop TCP daemon 확인 PASS (`DOCKER_HOST=tcp://localhost:2375`).
  - `clients/web/design-system` `npm run build` PASS.
  - `clients/desktop` Playwright static contract PASS — `6 passed / skipped 0`.
  - Docker/JDK inventory targeted tests PASS — `StockTransferServiceTest 13 tests / skipped 0`, `InboundInspectionControllerIT 10 tests / skipped 0`, `StockTransferControllerIT 5 tests / skipped 0`.
  - Docker/JDK slip targeted tests PASS — `SlipQueryRedesignIT 5 tests / skipped 0`, `SlipQueryRedesignSpecIT 5 tests / skipped 0`.
  - `clients/desktop` `npm run typecheck`, `npm run lint`, `npm run build` PASS. lint 는 기존 SP-03 범위 밖 warning 2건, error 0.
  - `git diff --check` PASS. CRLF 안내 warning 만 출력.
- 남은 즉시 작업:
  - commit/push/PR 생성.
  - PR 본문에 QA 캡처 6장을 raw URL 로 인라인 첨부.
  - `gh pr checks --watch` 후 PM 재점검/머지.
  - 머지 완료 후 병합된 `codex/*` 브랜치 정리.
- 다음 후보:
  - A: Samhan Public 추가 UI 누락 점검
  - B: comments/audit/SSE proxy 확장
  - C: 실제 기기 QA
  - D: Testcontainers no-skip hardening

## 2026-05-16 Codex 핸드오프 — D-AX-22 UUID 비노출 계약 hardening 완료

- branch: `codex/d-ax-22-uuid-free-contract-hardening`
- 직전 완료:
  - D-AX20 Admin 사진 감사/재업로드 후보 PR #200 merge, 원격 브랜치 삭제 완료.
  - D-AX21 업무번호 범위형 표준화 PR #201 merge, 원격 브랜치 삭제 완료.
- 사용자 최신 결정:
  - 전표번호는 전역 unique 가 아니라 메뉴/업무 속성별 날짜 시퀀스다.
  - 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 서로 다른 메뉴값/속성이므로 중복 가능하다.
  - UUID는 내부 PK이며 Samhan Public/아로로지스 화면에 표시하지 않는다.
- D-AX21 완료 요약:
  - `SlipNumberSequence`를 `slipDate + slipType` 단위로 확장.
  - Flyway `V24__business_number_scope.sql`: `slip_number_sequences.slip_type`, `UNIQUE(slip_date, slip_type)`, `ux_slips_slip_type_no_active`.
  - `DispatchTaskService` 배차번호를 `YYYY/MM/DD-{순번}` 으로 변경.
  - Docker/JDK `slip-service` + `arologis-service` 전체 테스트, 모바일 Jest/typecheck, 데스크톱 typecheck, actionlint PASS 후 PR #201 merge.
- D-AX22 구현:
  - slip-service full detail 의 `sourceWarehouseName` UUID 문자열화 fallback 제거.
  - arologis GPS 보고 응답에서 내부 위치 row key 제거.
  - arologis 서명 저장 응답과 sign-and-send-copy 성공 header/body 에서 서명 내부키 제거.
  - sign-and-send-copy 실패 JSON 은 운영 사유 코드만 공개하고 저장 경로/원본 URL/내부키를 숨김.
  - `clients/arologis-mobile` API normalize + Jest/typecheck 로 서버가 내부 필드를 내려도 UI 반환값에서 제거.
  - `clients/desktop` signature 계약 typecheck 추가.
- 문서/QA:
  - `docs/dev-reports/d-ax-22-uuid-free-contract-hardening.md`
  - `docs/qa/d-ax-22-uuid-free-contract-hardening/scenarios.md`
  - `docs/qa/d-ax-22-uuid-free-contract-hardening/domain-integrity-check.md`
  - `docs/team-reviews/d-ax-22/team-1-tm-integration-review.md`
  - QA 캡처 8장 생성 완료: `01-driver-today-target-contract.png` ~ `08-mobile-ui-uuid-free-regression-matrix.png`
- 현재 검증:
  - D-AX22 RED targeted test 실패 확인 후 production patch.
  - targeted backend Gradle PASS.
  - Docker/JDK `:services:slip-service:test :services:arologis-service:test` PASS.
  - XML 집계: `slip-service` 464 tests / failure 0 / error 0 / skipped 0.
  - XML 집계: `arologis-service` 236 tests / failure 0 / error 0 / skipped 0.
  - `clients/arologis-mobile` Jest PASS — 7 suites / 23 tests / skipped 0.
  - `clients/arologis-mobile` typecheck PASS, `npx expo install --check` PASS.
  - `clients/desktop` typecheck/lint/build PASS. lint 는 기존 warning 3건, error 0.
  - `git diff --check` PASS.
  - `actionlint` 는 로컬 PATH 에 없어 실행하지 못함. 이번 PR 은 workflow 파일 변경 없음.
- PR #202 merge 완료, 원격 브랜치 삭제 완료.
- 다음 후보:
  - A: comments/audit/SSE proxy 확장
  - B: 삼한 퍼블릭 거래처 생성/관리 UI gap 점검
  - C: 실제 기기 QA
  - D: Testcontainers no-skip hardening

## 2026-05-16 Codex 최신 핸드오프 — D-AX-20 Admin 사진 감사/재업로드 후보 완료

- branch: `codex/d-ax-20-arologis-admin-photo-audit`
- 직전 완료: D-AX-19 `clients/mobile-staff` 기사 모드 은퇴 PR #199 merge, 원격 브랜치 삭제 완료.
- 사용자 선택/운영 방식:
  - 추천안 1번 — Admin 사진 감사/재업로드 후보 화면.
  - 동시 agent 슬롯 제약상 1개 팀만 운영하고, Codex 가 부모 PM 으로 문서/PR/CI/머지/브랜치 정리까지 통합 관리.
  - 테스트는 skip 하지 않고, 필요한 테스트 환경을 구축해 통과 여부를 확인한다. Docker/Testcontainers 는 가능하면 로컬에서 실행하고, 로컬 접근 불가 시 CI 결과로 재점검한다.
- 새 도메인 정책:
  - UUID 는 내부 PK 이며 Samhan Public / 아로로지스 화면에 표시하지 않는다.
  - 전표/배차 등 사용자 노출 업무번호는 `YYYY/MM/DD-{순번}` 형식을 표준으로 삼는다.
  - 전표번호는 메뉴/업무 속성별로 독립 증가한다. 예: 판매전표 `YYYY/MM/DD-1` 과 구매전표 `YYYY/MM/DD-1` 은 중복 가능하며 UUID PK + 업무 유형으로 구분한다.
  - 날짜가 바뀌면 해당 날짜의 마지막 순번 이후로 증가하고, soft-delete/복구 이력은 UUID PK 와 audit 으로 보존한다.
  - D-AX20 신규 샘플/캡처는 위 형식으로 맞췄고, 기존 `001` padding / `S-2026-*` / `SL-*` 계열은 후속 업무번호 범위형 표준화 PR 후보로 남긴다.
- 구현:
  - BE `GET /slips/admin/photo-audit` 추가. gateway 외부 경로는 `/api/v1/slips/admin/photo-audit`.
  - `type/from/to/slipNo/page/size` 필터, `WAREHOUSE/MANAGER/MASTER` 권한, `uploadedAt desc`, size 최대 100.
  - `slip_attachments` + `slips` read-only JPQL join. 신규 DB/Flyway 없음.
  - 응답은 내부 `attachmentId`, `slipId`, `downloadUrl` 을 포함하지 않는다.
  - desktop `/admin/photo-audit` route + 창고 운영 sidebar `사진 감사` entry 추가.
  - FE 는 raw URL 없는 안전 placeholder 를 표시하고, `uploadedBy` 가 UUID 패턴이면 `업로더 확인 필요`로 치환한다.
  - 현재 페이지 내 `slipNo + attachmentType` 중복을 `재업로드 {count}회` badge 로 표시한다.
- 문서/QA:
  - `docs/dev-reports/d-ax-20-arologis-admin-photo-audit.md`
  - `docs/uiux/d-ax-20-arologis-admin-photo-audit/photo-audit-ux.md`
  - `docs/qa/d-ax-20-arologis-admin-photo-audit/scenarios.md`
  - `docs/qa/d-ax-20-arologis-admin-photo-audit/domain-integrity-check.md`
  - `docs/team-reviews/d-ax-20/team-1-tm-integration-review.md`
  - QA 캡처 7장: `01-scope-contract.png` ~ `07-pr-inline-capture-checklist.png`
- 검증:
  - D-AX20 screenshot generator PASS — PNG 7장 재생성, privacy guard PASS.
  - `clients/desktop` typecheck/lint/build PASS. lint 는 기존 warning 3건, error 0.
  - D-AX20 Playwright contract PASS — 3 tests, skip 없음.
  - Docker Desktop TCP daemon 확인 PASS (`DOCKER_HOST=tcp://localhost:2375`).
  - Docker/JDK Gradle `:services:slip-service:test --tests "*PhotoAudit*"` PASS.
  - Docker/JDK Gradle `:services:slip-service:test` PASS — 461 tests, failure 0, error 0, 기존 Testcontainers IT skip 171.
  - 5-agent 재검토 반영: 내부 audit rule id 캡처 제거, URL성 전표번호 입력 차단, MockMvc security role 테스트, repository JPQL/soft-delete projection 테스트 보강.
  - 기존 IT skip 171건은 D-AX20 신규 skip 이 아니라 Testcontainers provider 가 Docker Desktop TCP remote env 를 valid 로 판정하지 못하는 no-skip hardening 과제.
- 남은 즉시 작업:
  - commit/push/PR 생성.
  - PR 본문 raw screenshot URL 7장 HEAD 200 확인.
  - `gh pr checks --watch` 후 PM 재점검/머지.
- 다음 후보:
  - A: 전표/배차 표시번호 `YYYY/MM/DD-{순번}` 업무번호 범위형 표준화
  - B: 삼한 퍼블릭 거래처 생성/관리 UI gap 점검
  - C: 전표 상세 comments/audit/SSE proxy 확장
  - D: 실제 기기 QA

## 2026-05-16 Codex 최신 핸드오프 — D-AX-19 mobile-staff 기사 모드 은퇴 완료

- branch: `codex/d-ax-19-mobile-staff-driver-retirement`
- 직전 완료: D-AX-18 전표 상세 브리지 PR #198 merge, 원격 브랜치 삭제 완료.
- PR #199 merge 완료, 원격 브랜치 삭제 완료.
- 사용자 선택: 1번 추천안 — `clients/mobile-staff` 기사 모드 제거, 기사 기능은 `clients/arologis-mobile` 전담.
- 구현:
  - `AppRootNavigator` 를 `EstimateWebViewScreen` 단일 렌더로 축소.
  - `clients/mobile-staff/src/screens/driver/**`, `src/api/arologis.ts`, `src/hooks/useGpsPermission.ts`, 기사 전용 Jest 제거.
  - `attachmentApi`, `slipAudit`, `slipComment`, `slipEditRequest`, `SlipRealtimeClient` 는 `salesUtils.API_BASE_URL` 로 이동.
  - `base-64`, `@types/base-64`, `expo-file-system`, `expo-location`, `expo-sharing` 제거.
  - `app.config.js` 에서 위치 권한과 `expo-location` plugin 제거, 정적 `app.json` 삭제.
  - `expo-font` 는 SDK 53 기대 버전으로 정렬.
- 검증:
  - `cd clients/mobile-staff && npm run typecheck` PASS.
  - `cd clients/mobile-staff && npm test -- --runInBand` PASS (1 suite / 1 test).
  - `cd clients/mobile-staff && npx expo install --check` PASS.
  - `cd clients/mobile-staff && npx expo-doctor` PASS (17/17).
  - no driver runtime import guard PASS.
  - `.\scripts\generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1` PASS.
- QA 캡처:
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/01-retirement-decision.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/02-app-root-estimate-only.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/03-no-driver-toggle.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/04-code-boundary-import-guard.png`
  - `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/05-verification-matrix.png`
- 완료 메모:
  - 5-team 최종 리뷰: Designer/FE/BE/QA/DevOps blocker 없음.
  - PR 본문 raw screenshot URL HEAD 200 확인 후 PR #199 merge.
  - `gh pr checks --watch` 완료 후 PM 재점검/머지, 원격 브랜치 삭제 완료.
- 다음 후보:
  - A: Admin 사진 관리/재업로드 감사 화면
  - B: 전표 상세 comments/audit/SSE proxy 확장
  - C: 실제 기기 QA

## 2026-05-16 Codex 최신 핸드오프 — D-AX-18 arologis-mobile 전표 상세 브리지 진행

- 현재 branch: `codex/d-ax-18-arologis-mobile-slip-detail-bridge`
- 직전 완료: D-AX-17 배송사진/검수사진 PR #197 merge, 원격 브랜치 삭제 완료.
- 사용자 선택: 1번 — today 정차 target 기반 읽기 전용 전표 상세 bridge.
- 세부 선택:
  - 추천 1안 채택: `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 서버가 내부 dispatch/stop/slip UUID 를 해석.
  - `mobile-staff` 전표 상세 직접 import/복제는 하지 않음.
  - driver-facing API/UI 에 `id`, `dispatchId`, `vehicleId`, `stopId`, `slipId`, `downloadUrl` 을 노출하지 않음.
  - comments/audit/SSE proxy, 전표 편집 기능은 후속 선택지로 분리.
- 구현:
  - BE `GET /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/slip-detail` 추가.
  - BE `DriverSlipDetailResponse` 로 전표번호/거래처/주소/창고/품목/합계만 반환.
  - 400 target mismatch, 422 slip mapping 없음, 502 slip-service 상세 실패를 분리.
  - `clients/arologis-mobile` API `fetchStopSlipDetail(...)`, public type guard, dashboard `전표` 버튼, `DriverSlipDetailScreen` 추가.
  - QA 캡처 generator 8장 추가.
- 현재 검증:
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --no-daemon --rerun-tasks` PASS.
  - `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` PASS.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverSlipDetailScreen.test.tsx arologisSlipDetail.test.ts --runInBand` PASS.
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-18-arologis-mobile-slip-detail-screenshots.ps1` PASS.
- 남은 즉시 작업:
  - PR 본문 raw screenshot URL HEAD 200 확인.
  - `gh pr checks --watch` 후 PM 재점검/머지.
- QA 캡처:
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/01-slip-detail-target-contract.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/02-dashboard-slip-detail-button.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/03-slip-detail-empty-target-guard.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/04-slip-detail-header.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/05-slip-detail-lines-and-total.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/06-slip-detail-mapping-failure-422.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/07-slip-detail-fetch-failure-retry.png`
  - `docs/qa/d-ax-18-arologis-mobile-slip-detail-bridge/screenshots/08-verification-matrix.png`
- 다음 후보:
  - A: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - B: Admin 사진 관리/재업로드 감사 화면
  - C: 전표 상세 comments/audit/SSE proxy 확장

## 2026-05-15 Codex 최신 핸드오프 — D-AX-17 arologis-mobile 배송사진/검수사진 진행

- 현재 branch: `codex/d-ax-17-arologis-mobile-photos`
- 사용자 선택: 1번 — 인증된 today stop target 기반 DELIVERY / INSPECTION 사진 이식.
- 세부 선택:
  - 추천 1안 채택: `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 정차를 식별하고 서버 내부에서 slip attachment 로 연결.
  - `mobile-staff` public token/batchToken 흐름은 복제하지 않음.
  - driver-facing API/UI 에 UUID, internal attachment id, presigned/download URL 을 노출하지 않음.
- 구현:
  - BE `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/photos/{photoType}` 추가.
  - BE `SlipClient.uploadAttachment(...)` internal multipart bridge 추가.
  - slip-service `/internal/slips/{slipId}/attachments` internal endpoint 추가, DELIVERY / INSPECTION 만 허용.
  - `clients/arologis-mobile` 사진 탭, dashboard `사진` 버튼, empty-target guard, DELIVERY 3장 / INSPECTION 5장 limit, 업로드 진행/성공/실패/재시도 UI 추가.
  - `expo-image-picker`, `expo-image-manipulator` 의존성 추가.
  - typecheck 계약 파일은 `StopPhotoUploadResponse` 에 `attachmentType/fileName/fileSize/contentType/capturedAt/uploadedAt` 만 공개하고 `id/downloadUrl` 은 `@ts-expect-error` 로 차단.
- 검증:
  - `.\gradlew.bat :services:arologis-service:compileJava :services:slip-service:compileJava --no-daemon` PASS.
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest --tests com.samhanair.logis.arologis.client.SlipClientTest --no-daemon --rerun-tasks` PASS.
  - `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test :services:slip-service:test --no-daemon --rerun-tasks` PASS.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverPhotoScreen.test.tsx arologisPhotoUpload.test.ts --runInBand` PASS.
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-17-arologis-mobile-photos-screenshots.ps1` PASS.
  - Docker actual run 중 드러난 기존 회귀도 함께 안정화: `KakaoDispatchParserTest` 시간 의존, `DispatchTaskRepositoryIT` seed 충돌, `SlipRealtimeControllerIT` shared realtime payload 계약.
- QA 캡처:
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/01-today-photo-target-contract.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/02-dashboard-photo-and-signature-buttons.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/03-photo-empty-target-guard.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/04-delivery-photo-capture-preview.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/05-inspection-type-switch-max-count.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/06-upload-progress.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/07-upload-success-uuid-free-response.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/08-partial-failure-retry.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/09-slip-mapping-failure-422.png`
  - `docs/qa/d-ax-17-arologis-mobile-photos/screenshots/10-verification-matrix.png`
- 다음 후보:
  - A: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - B: 아로로지스 모바일 상세/전표 bridge 확장
  - C: Admin 사진 관리/재업로드 감사 화면

## 2026-05-15 Codex 최신 핸드오프 — D-AX-16 arologis-mobile signature/sign-and-send-copy 진행

- 현재 branch: `codex/d-ax-16-arologis-mobile-signature-copy`
- 사용자 선택: 1번 — signature / sign-and-send-copy 아로로지스 모바일 이식.
- 세부 선택:
  - 추천 1안 채택: backend `today` 응답을 실제 서명 가능한 정차 target 까지 확장하고, 앱에서 정차 선택 후 `sign-and-send-copy` 호출.
  - `mobile-staff` 의 mock stop/all-zero UUID 방식은 복제하지 않음.
- 구현:
  - BE `GET /driver-app/arologis/dispatches/today` 응답에 `dispatchDate`, `dispatchType`, `label`, `stops[]` 추가. `dispatchId` UUID 는 제외.
  - `POST /driver-app/arologis/dispatches/today/{dispatchType}/vehicles/{vehicleSeq}/stops/{stopSeq}/sign-and-send-copy` 에서 today target 을 서버 내부 UUID 로 해석.
  - `clients/arologis-mobile` API에 `apiFetchRaw`, UUID-free `signAndSendCopy`, image/png → base64 변환 추가.
  - dashboard 카드에 정차 목록 + `서명` 버튼 추가.
  - `DriverSignatureScreen` 신규: 정차 target guard, 실제 signature canvas, 기사 서명 GPS, 인수자 서명, 1-tap 완료 + 사본 발송, duplicate/bridge/fail toast, retry.
  - 하단 tab: `배차` / `GPS` / `서명` + 로그아웃.
- 검증:
  - RED: `ArologisDriverAppControllerTest` 가 `stops` 누락 및 today UUID-free 계약 위반으로 실패 확인.
  - `.\gradlew.bat :services:arologis-service:test --tests com.samhanair.logis.arologis.controller.ArologisDriverAppControllerTest` PASS.
  - `ArologisDriverAppControllerIT.today_with_internal_driver_returns_200` 는 어제/내일 배정 제외 + `dispatchId` 비노출 계약으로 보강.
  - Docker/Testcontainers actual run: `$env:DOCKER_HOST='tcp://localhost:2375'; .\gradlew.bat :services:arologis-service:test --no-daemon --rerun-tasks` PASS (225 tests).
  - Docker actual run에서 드러난 latent failure 수정: auth/driver/refresh seed 충돌, Tx1 rollback 프록시 경계, renderer timeout 재시도 stub, explicit-cleanup IT 트랜잭션 격리.
  - RED: `clients/arologis-mobile/src/__tests__/types/signatureContract.test-d.ts` 추가 후 `signAndSendCopy` / `stops` 타입 누락으로 실패 확인.
  - `cd clients/arologis-mobile && npm run typecheck` PASS.
  - `cd clients/arologis-mobile && npm test -- DriverSignatureScreen.test.tsx --runInBand` PASS (6 tests).
  - `cd clients/arologis-mobile && npx expo install --check` PASS.
  - `.\scripts\generate-d-ax-16-arologis-mobile-signature-copy-screenshots.ps1` PASS.
- QA 캡처:
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/01-today-contract-with-stops.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/02-dashboard-stop-list.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/03-signature-empty-target.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/04-signature-selected-stop.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/05-driver-signature-gps-captured.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/06-recipient-signature-ready.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/07-success-share-sheet.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/08-recipient-phone-missing.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/09-renderer-timeout-retry.png`
  - `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/10-verification-matrix.png`
- 다음 후보:
  - A: 배송사진 / 검수사진 이식
  - B: 실제 기기 QA 후 `mobile-staff` driver mode 제거
  - C: signature canvas 실 의존성 도입 여부 결정

## 2026-05-15 Codex 최신 핸드오프 — D-AX-13 auth contract 정합 진행

- 현재 branch: `codex/d-ax-13-auth-contract`
- 선택된 방향: 사용자 승인 1번 — `/auth/me`와 login/refresh 응답의 공개 식별자 계약을 BE/FE에서 한 번에 정합.
- 구현:
  - BE `AuthTokenResponse`에 role별 공개 식별자(`loginId/fullName`, `driverCode/phoneNumber`) 추가.
  - BE `MeResponse`도 같은 공개 식별자 schema 로 확장.
  - `AuthIdentityService` 추가: JWT `X-User-Id`/`X-User-Role` 기준으로 DB row 재조회, role mismatch/user gone 은 401.
  - desktop `LoginPage`와 refresh interceptor 에서 `loginId/fullName` undefined 저장 방지.
  - mobile auth API와 refresh helper 에서 `driverCode/phoneNumber` 보존.
- 검증:
  - RED: 새 필드 테스트 추가 후 `compileTestJava`가 `loginId/fullName/driverCode/phoneNumber` method 없음으로 실패 확인.
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.service.auth.AdminLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.DriverLoginServiceTest" --tests "com.samhanair.logis.arologis.service.auth.RefreshTokenServiceTest"` PASS
  - `.\gradlew.bat :services:arologis-service:test --tests "com.samhanair.logis.arologis.it.ArologisAdminAuthIT" --tests "com.samhanair.logis.arologis.it.ArologisDriverAuthIT"` PASS
  - `cd clients/arologis-desktop && npm run typecheck` PASS
  - `cd clients/arologis-mobile && npm run typecheck` PASS
- QA 캡처:
  - `docs/qa/d-ax-13-auth-contract/screenshots/01-contract-overview.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/02-admin-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/03-auth-me-admin.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/04-driver-login-response.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/05-auth-me-driver.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/06-refresh-rotation-identity.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/07-frontend-store-flow.png`
  - `docs/qa/d-ax-13-auth-contract/screenshots/08-verification-matrix.png`
- 다음 후보:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: 실제 기기 QA 및 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-15 arologis-mobile dashboard/GPS 진행

- 현재 branch: `codex/d-ax-15-arologis-mobile-driver-runtime`
- 사용자 피드백: Claude처럼 진행 방향은 다자선택으로 제시하고, Codex가 멋대로 결정하지 않는다.
- 채택 방향: 추천안 B — `clients/arologis-mobile` 에 dashboard + GPS 두 탭만 먼저 이식.
- 구현:
  - 로그인 성공 후 `RootNavigator` 가 `DriverTabNavigator` 로 진입.
  - `DriverDashboardScreen` / `DriverLocationTrackingScreen` 을 독립 앱 내부로 이식.
  - `api/arologis.ts` 는 `GET /driver-app/arologis/dispatches/today`, `POST /driver-app/arologis/locations` 만 담당.
  - 서명 / 배송사진 / 검수사진 / mobile-staff driver 제거는 후속 PR 선택지로 남김.
- 검증:
  - `cd clients/arologis-mobile && npm install`
  - `cd clients/arologis-mobile && npm run typecheck`
  - `rg -n 'clients/mobile-staff|mobile-staff|../../../mobile-staff' clients/arologis-mobile/src` 결과 없음
  - `.\scripts\generate-d-ax-15-arologis-mobile-driver-runtime-screenshots.ps1`
- QA 캡처:
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/01-authenticated-driver-tabs.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/02-driver-dashboard.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/03-gps-tracking.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/04-dashboard-empty.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/05-dashboard-error.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/06-gps-permission-block.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/07-typecheck-pass.png`
  - `docs/qa/d-ax-15-arologis-mobile-driver-runtime/screenshots/08-import-boundary-pass.png`
- 다음 선택지:
  - A: signature / sign-and-send-copy 이식
  - B: 배송사진 / 검수사진 이식
  - C: `/auth/me` schema 정합 검증
  - D: 실기기 QA 후 `mobile-staff` driver mode 제거

## 2026-05-15 Codex 최신 핸드오프 — D-AX-12 mobile cross-import 분리 진행

- 현재 branch: `codex/d-ax-12-mobile-cross-import`
- 방향: D-AX-11 완료 후 같은 아로로지스 추출 흐름으로 `clients/mobile-staff` driver tab 의 Samhan Public slip 직접 import 를 먼저 제거.
- 구현:
  - `DriverTabNavigator` 의 `../SlipDetailScreen` import 제거.
  - `DriverSlipDetailEntry` 신규 경계 화면 추가.
  - dashboard → entry → back Jest 추가.
  - 기존 `SignaturePhotoScreenChain` mock 을 driver entry 로 교체.
- 검증:
  - `cd clients/mobile-staff && npm test -- DriverSlipDetailRoute.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm test -- SignaturePhotoScreenChain.test.tsx --runInBand` PASS
  - `cd clients/mobile-staff && npm run typecheck` PASS
  - `rg -n "from '../SlipDetailScreen'|SlipDetailScreen from|\\.\\./SlipDetailScreen" clients/mobile-staff/src/screens/driver` 결과 없음
  - `.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1` PASS
- QA 캡처:
  - PR 본문에 아래 8장을 모두 인라인 첨부한다. 캡처는 여러 테스트를 진행한 뒤 생성한 1000px 폭 PNG mock render 라서 GitHub 에서 문구와 버튼이 잘 보인다.
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/01-driver-slip-guard.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/02-signature-chain-regression.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/03-driver-route-test-flow.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/04-driver-back-navigation.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/05-typecheck-contract.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/06-jest-driver-route-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/07-jest-signature-chain-pass.png`
  - `docs/qa/d-ax-12-mobile-cross-import/screenshots/08-direct-import-search-guard.png`
- 문서:
  - spec: `docs/superpowers/specs/2026-05-15-d-ax-12-mobile-cross-import-design.md`
  - dev report: `docs/dev-reports/d-ax-12-mobile-cross-import.md`
  - QA: `docs/qa/d-ax-12-mobile-cross-import/scenarios.md`
- 다음 후보:
  - `clients/arologis-mobile` 로 driver dashboard / GPS / signature / photo 화면 이식.
  - 실제 slip 연결값이 배차 응답에 포함되면 `DriverSlipDetailEntry` 를 아로로지스 전용 상세 bridge 로 확장.

## 2026-05-15 Codex 최신 핸드오프 — D-AX-11 PR #192 머지 완료

이 섹션이 아래의 과거 `D-AX-11 in progress` 기록보다 우선한다.

- 현재 브랜치: `main`
- 최신 main commit: `5599580 feat(arologis): D-AX-11 배차 페이지 데스크톱 이전`
- PR: https://github.com/ewoo14/SamhanLogis/pull/192
- 머지 커밋: `55995805d2922084c516f942d02f3cf1382a6407`
- 상태: D-AX-11 완료, PR #192 squash merge 완료, remote main 최신.
- 최종 CI: PR head `bfc5f7d` 기준 GitHub checks 전체 통과.
- QA: `qa/playwright`의 Chromium mock render로 한국어 화면 4장 캡처 완료.
- QA 산출물:
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/01-manual-dispatch.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/02-pre-classify.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/03-unassigned.png`
  - `docs/qa/arologis-dispatch-pages-extract/screenshots/04-reconcile.png`
- PR 포함 항목: 5-team review 표, TM 통합, PM/CI 승인, QA 스크린샷, 리뷰 반영 내역.
- 별도 세션 기록: `docs/handoff/2026-05-15-codex-d-ax-11-session.md`
- dev report: `docs/dev-reports/arologis-dispatch-pages-extract.md`

다음 세션 첫 명령:

```powershell
git checkout main
git pull
git log --oneline -5
Get-Content AGENTS.md, docs/handoff/CURRENT-WORK.md, .codex/AGENTS.md -Encoding UTF8
```

다음 후보 작업은 새 결정을 만들기 전에 `migration/decisions/DECISIONS.md`와 해당 slice spec/plan을 먼저 확인한다. 사용자가 “그대로 진행”을 요청하면 Claude handoff 패턴대로 5-team review, PR 본문 QA 스크린샷, PM/CI 승인 코멘트를 포함한다.

## 2026-05-15 Codex Update — D-AX-11 in progress

- Current branch: `feat/arologis-dispatch-pages-extract`
- Current scope: Arologis desktop dispatch pages under `clients/arologis-desktop/src/renderer/routes/dispatches`
- Handoff pattern: 5-team review dispatched and received (BE / FE / Designer / QA / DevOps). Review fixes are being applied in this same branch.
- Implemented routes: `/dispatches/manual`, `/dispatches/pre-classify`, `/dispatches/unassigned`, `/dispatches/reconcile`
- Key fixes from review: `kakaoSeq` DTO alignment, Arologis role constants, design-system CSS import, raw hex cleanup, desktop CI typecheck hard-fail, D-AX-11 route IA note.
- Phone check: remote/PR viewing requires push/PR network access. Per owner instruction, no approval prompt will be requested for non-merge work; keep local handoff current until a permitted push path is available.

---

## 0. 즉시 시작 — 코덱스에서 첫 명령

```powershell
git checkout main
git pull
git log --oneline -5
# → 1ad4296 feat(samhan-signature-copy): Phase F (#191) 가 가장 최근 머지
```

**코덱스가 모르는 본 repo 의 핵심 컨벤션** (Claude Code `.claude/memory/` 가 있지만 코덱스는 못 읽음 — 아래만 알면 충분):

| 규칙 | 요점 |
|---|---|
| 한국어 commit/PR/Issue | prefix (`feat:`/`fix:`/...) + trailer 만 영어, 본문은 한국어 |
| 5-team 패턴 | BE/FE/Designer/DevOps **4 parallel** + QA **sequential** (실 산출 검증 + 실 캡처) |
| 통합 PR | 단편 PR 금지. 디자인/UI 차이까지 묶어 통합 PR + QA + TM 승인 |
| QA 스크린샷 | 모든 PR 본문에 QA 결과 스크린샷 1장 이상 인라인 (`docs/qa/<slug>/screenshots/*.png`) |
| QA mock fallback | 실 emulator 어려운 경우 PowerShell System.Drawing mock PNG OK (`scripts/generate-*-screenshots.ps1` 패턴) |
| UUID 비공개 | 모든 클라이언트 화면 UUID 노출 금지. 비즈니스 식별자 (슬립번호/창고 코드/거래처명) 만 |
| BaseEntity 7 audit | 모든 entity 가 `BaseEntity` 상속 + Soft Delete 만 |
| Korean Path JDK 트랩 | 한글 path 에서 `gradle test` fail. `assemble` 사용 또는 영문 path |
| gradlew chmod | Windows 커밋 시 `git update-index --chmod=+x gradlew` 필수 (Linux CI Permission denied 방지) |
| PowerShell UTF-8 | `Set-Content` 기본 UTF-16 LE BOM 트랩. Write/Edit/heredoc 사용 |
| 머지 권한 | 사용자 (개발책임자) 결정. 5-team 0 결함 + CI green 시도 사용자 trigger 만 머지 |

---

## 1. 방금 끝난 일 — Phase F (PR #191) 머지 완료 (2026-05-15)

**PR**: https://github.com/ewoo14/SamhanLogis/pull/191 — **MERGED** (squash commit `1ad4296`)
**제목**: `feat(samhan-signature-copy): Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송 (D-DF-01~13)`

### 핵심 산출 (한 줄 요약)

기사 어플 정차 도착 → DELIVERY 사진 첨부 (기존 SignaturePhotoScreen) → DriverSignatureScreen 자체+인수자 서명 → arologis 가 양쪽 저장 (자체 signatures + slip-service signature_source=APP) + 서버 Playwright Chromium 으로 OutboundView 양식 사본 PNG 합성 + mobile expo-sharing Share Sheet 으로 인수자에게 발송 (**기사 본인 카톡, Aligo 0**).

### 13 결정 (D-DF-01~13)

`migration/decisions/DECISIONS.md` 의 D-DF-00 entry 참조. 핵심:
- **Aligo 폐기** → mobile RN expo-sharing Share Sheet (기사 본인 발신)
- **PNG 합성 방식** = 서버 측 Playwright Java SDK 1.47 + Chromium headless → `OutboundView.tsx` URL (file://) 렌더링 → fullPage screenshot
- **양쪽 저장** = arologis 자체 `signatures` + slip-service `signature_source=APP` + `slip_signature_audit`. 출고전표 본체 (Slip) 는 slip-service 단일 SOT
- **사진 첨부 통합 (D-DF-13)** = 기존 SignaturePhotoScreen (P1-8 Stage 4) W10-4 deep link 활성. 사진은 slip-service attachment 별도, 사본 PNG 와 분리

### 4 신규 컬럼 (Flyway V11) — `arologis.signatures`

| 컬럼 | 의미 |
|---|---|
| `copy_sent_at` | PNG download 시각 (성공 1회 가드, NULL → OK, NOT NULL → 409) |
| `copy_send_failure_count` | Tx2 c/d fail 카운트 (모니터링 alert 임계치) |
| `copy_image_path` | disk path (`/var/lib/arologis/signature-copies/{signatureId}.png`) — Phase 11 cutover 시 S3 키로 갈아탐 |
| `copy_recipient_phone` | 발송 시점 slip recipientPhone 스냅샷 (풀 번호) |

### 핵심 파일 (Phase F 신규/수정)

```
services/arologis-service/
├── src/main/java/com/samhanair/logis/arologis/
│   ├── domain/Signature.java                                    (4 column + markCopySent + markCopyFailure)
│   ├── service/copy/
│   │   ├── SignAndSendCopyService.java                          (Tx1 atomic + Tx2 best effort orchestration)
│   │   ├── PlaywrightCopyRenderer.java                          (Playwright wrapper, RendererTimeoutException/RendererErrorException)
│   │   ├── CopyImageDiskStorage.java                            (disk save)
│   │   └── CopyFailureReason.java                               (enum)
│   ├── controller/ArologisDriverAppController.java              (POST /sign-and-send-copy 추가, /sign @Deprecated)
│   ├── client/SlipClient.java                                   (findRecipientPhone + findFullDetail 추가)
│   ├── service/SlipResolver.java                                (findRecipientPhone + buildSlipDataMap)
│   ├── config/PlaywrightConfig.java                             (Browser bean, @ConditionalOnProperty)
│   └── web/dto/copy/SignAndSendCopy{Request,Response}.java
├── src/main/resources/db/migration/V11__add_signature_copy_columns.sql
└── Dockerfile                                                    (Playwright + Chromium + fonts-noto-cjk)

clients/desktop/
├── print-renderer/                                               (NEW — multi-entry)
│   ├── index.html / main.tsx / PrintRendererApp.tsx
└── vite.print-renderer.config.ts

clients/mobile-staff/
├── src/api/arologis.ts                                           (signAndSendCopy + 응답 분기 타입)
├── src/screens/driver/
│   ├── DriverSignatureScreen.tsx                                 (1-tap 완료+발송 + Share Sheet + 5 토스트)
│   ├── SignaturePhotoScreen.tsx                                  (onUploaded → DriverSignature chain)
│   └── DriverTabNavigator.tsx                                    (signature-photo 탭 추가)
└── package.json                                                  (expo-sharing + expo-file-system + base-64 추가)

services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java   (/recipient-phone + /full 추가)

docs/superpowers/specs/2026-05-14-samhan-signature-copy-design.md   (v3.1, 13 결정)
docs/superpowers/plans/2026-05-15-samhan-signature-copy.md          (5-team plan)
docs/dev-reports/samhan-signature-copy.md                            (3-layer 누적)
docs/qa/samhan-signature-copy/scenarios.md                            (7 시나리오 + 회귀 + 4단계 롤백)
docs/qa/samhan-signature-copy/screenshots/01~07.png                  (PowerShell mock fallback)
scripts/generate-samhan-signature-copy-screenshots.ps1                (재실행 스크립트)
docs/uiux/samhan-signature-copy/01~03.md                              (Designer mock 3장)
docs/migration/phase11/M-PHASE-11-signature-copy-memory.md           (Chromium 메모리 검증)
infrastructure/env-templates/arologis-service.env                     (4 env 추가)
```

### spec/plan vs 실 코드 정정 9건 (BE worker 자체 정정 — plan 문서와 실 코드 차이)

1. `VehicleStop` 직접 dispatchId 미보유 → 권한 = `vehicle.assignedDriverId == driverId`
2. Slip 의 `sourceWarehouseName` 미존재 → `sourceWarehouseId.toString()` placeholder
3. Slip 의 `recipientAddress` X → `deliveryAddress` 사용
4. Slip 의 `recipientPhoneNumber` X → `recipientPhone` (V20 column)
5. Slip 의 `totalSupply`/`vat`/`total` getter 미존재 → lines 합산 계산
6. `VehicleStop.recipientName` 미존재 → "어플인수자" placeholder
7. `DriverPrincipal` 미도입 → `X-User-Id` → `DriverRepository.findByAppUserId` 패턴
8. `PlaywrightConfig` — `@ConditionalOnProperty(arologis.playwright.enabled=true)` 추가
9. `SignatureRepository.findFirstByStopIdAndSourceOrderByCreatedAtDesc` 미존재 → `findAllByStopIdOrderByCapturedAtDesc` stream filter

### 통계

- BE 8 commit + FE 5 + Designer 1 + DevOps 3 + QA 2 + TM 통합/PR/QA fix 다수 = 23 commit
- arologis-service: **221 tests / 0 fail / 75 skipped (Docker npipe — IT 5건 코드만, CI Linux 실행)**
- slip-service: **454 tests / 0 fail / 171 skipped** (PR #99 SignatureIntegrationIT 보존)
- mobile-staff: **TS 0 errors + Jest 7 PASS** (DriverSignatureScreen 6 + SignaturePhotoScreenChain 1)
- desktop print-renderer build: **SUCCESS (148.67 kB)**
- CI 21 check all PASS + GitGuardian PASS
- 회귀 0 결함

---

## 2. PR #191 후속 — 즉시 진행 가능한 fix (선택)

| # | 후속 작업 | 우선순위 | 추정 |
|---|---|---|---|
| F1 | QA 캡처 텍스트 잘림 fix (01/05/07 우측/좌측 1~2 글자) | LOW | 30분 (PowerShell width margin 또는 텍스트 단축) |
| F2 | `.claude/memory/project_samhan_signature_copy.md` 신규 메모리 작성 | LOW | 10분 (TM agent 권한 차단으로 미작성, 결정은 DECISIONS + dev-report 보존) |
| F3 | Admin 재발송 endpoint PR (`/admin/.../signatures/{id}/resend-copy`) | MEDIUM | 1~2일 spec + plan + 5-team |
| F4 | KakaoLink SDK deep link PR (인수자 번호 prefill) | MEDIUM (사용자 피드백 후) | 2~3일 |
| F5 | `/sign` endpoint 완전 제거 PR (1~2 분기 후) | LOW | 30분 |
| F6 | OutboundView refactor (옵션 a — useQuery 분리, drift 0 우선시) | LOW | 1일 |
| F7 | Phase 11 disk → S3 cutover PR | Phase 11 시점 | 별도 |
| F8 | `copy_send_failure_count` Slack alert (>5 / 10분) | LOW | 반나절 |

---

## 3. 다음 trigger 후보 (개발책임자 결정)

### 즉시 가능 (인성 자료 무관)

- **Phase E** — 인수자 카톡/문자 발송 (배차 기사 정보) — notification-service Aligo 활용. spec 신규 필요 (브레인스토밍 권장).
- **D-AX-11** — FE 산재 페이지 이전 (`ArologisManualDispatchPage` 등 4 page + Api 3 + RealtimeClient) — HIGH 우선순위. spec 신규.
- **D-AX-12** — mobile cross-import 분리 (`DriverTabNavigator` → `SlipDetailScreen`) — Phase F 머지 후 환경 안정화 후 진행 권장. spec 신규.
- **D-AX-13** — BE/FE auth schema 정합 검증 (`/auth/me` 응답) — 작은 PR.
- **ACM SAN 갱신** — Terraform `*.arologis.samhan-air.com` 추가 (Phase 11 cutover 전).
- **EC2 Health Lambda** — CloudWatch alarm + SNS 별도 PR.
- **Phase F 후속 fix** — F1~F8 위 표 (단순 fix 부터 큰 PR 까지).

### 인성데이타 API 링크 도착 대기 (사용자 요청 "추후")

- **Phase B** — arologis `InsungQuickDriverMatcher` 실 활성 (W10-2 trigger).
- **Phase D** — GPS 실시간 공유 (SSE) — 인성 LBS callback endpoint.

---

## 4. 본 conversation 누적 머지 (8 PR, PR #184~#191)

| PR | merge commit | 내용 |
|---|---|---|
| #184 | `f3cb306` | 아로로지스 독립 분리 (D-AX-01~10) — monorepo 유지 + 자체 auth + 휴대번호 passwordless |
| #185 | `26f2bc3` | post-merge follow-up — mock PNG 6장 + handoff + autopilot 메모리 v2 |
| #186 | `2bd653f` | D-AX-14 자동 폰번호 인식 + 1-tap 로그인 (PR #184 보완) |
| #187 | `cc106d1` | D-AX-14 mock 스크린샷 3장 follow-up |
| #188 | `01d41f6` | **Phase A — 배차 메뉴 + 아로로지스 발송** (D-DB-01~09) |
| #189 | `9bebe12` | **Phase C — 배차 수정/취소 요청 흐름** (D-DC-01~09) + 5-team 패턴 정정 메모리 |
| #190 | `3b3d04d` | handoff 갱신 — PR #184~#189 머지 + Phase F spec 리뷰 대기 + 후속 Phase 안내 |
| #191 | `1ad4296` | **Phase F — 전자서명 양쪽 저장 + 출고전표 사본 PNG 1회 발송** (D-DF-01~13). 새 5-team (QA sequential) 첫 적용 + Aligo 폐기 + Playwright Chromium 도입 |

---

## 5. 코덱스 진입 시 권장 흐름

1. **`git pull`** + `git log --oneline -5` 로 main 의 최신 (`1ad4296`) 확인.
2. **본 파일 (`docs/handoff/CURRENT-WORK.md`) 다시 read** — 진행 상태 즉시 파악.
3. **사용자 (개발책임자) 의 다음 trigger 메시지 대기** — §3 의 후보 중 하나, 또는 새 작업.
4. 작업 시작 시 **§0 의 컨벤션 표** 준수 (한국어 commit + 통합 PR + QA 캡처 + UUID 비공개 등).
5. 큰 작업 (신규 Phase, 새 endpoint 다수) = brainstorm → spec → plan → 5-team 디스패치 → TM 통합 → PR 발행 → 사용자 머지 패턴 따름.
6. 작은 작업 (단순 fix, env 변경, 문서) = 즉시 commit + PR (단 통합 PR 패턴 유의).

### 5-team 디스패치 시 (Claude Code 환경에서 검증된 패턴, 코덱스 환경에서는 적응 필요)

본 repo 의 `.claude/worktrees/` 가 Claude Code 의 git worktree isolation 디렉토리. 코덱스도 git worktree 사용 가능 (`git worktree add ...`). 4 team 동시 worktree 분리 → 머지 패턴.

또는 코덱스 환경에서 단순화: TM 한 사람이 모든 team scope 를 순차 진행 (slow 하지만 단순).

### 메모리 시스템 (Claude Code 전용 — 코덱스 무관)

`.claude/memory/MEMORY.md` 는 Claude Code 의 자동 로드 메모리. 코덱스는 이 시스템 모름. 그러나 git tracked 라 코덱스도 read 가능. 본 파일 (CURRENT-WORK.md) + `migration/decisions/DECISIONS.md` + `docs/superpowers/specs/` + `docs/superpowers/plans/` + `docs/dev-reports/` 만 알면 충분.

**Claude Code 로 다시 돌아올 때**: `.\scripts\sync-claude-memory.ps1` 실행 (repo .claude/memory → 사용자 홈 ~/.claude/projects/c--dev-SamhanLogis/memory/ 단방향 복사).

---

## 6. 통계 (본 conversation, 2026-05-14 ~ 05-15)

- 누적 PR 머지: **8** (#184~#191)
- 누적 commit: ~170+ (5-team x 7 cycle + TM + PM + fix)
- 누적 메모리 (Claude Code): 8 신규 (Phase F 의 `project_samhan_signature_copy` 만 미작성, DECISIONS + dev-report 보존)
- 누적 DECISIONS entry: D-AX-01~14 + D-DB-01~09 + D-DC-01~09 + D-DF-01~13 (50+ entry)
- 회귀 가드: 모든 PR 0 결함 (slip-service 단위 ~98 + IT 50+ 보존)
- AWS 비용 변경: ₩0 (Phase 11 계획 ₩405K/월 유지, Chromium ~500MB pool 은 m5.xlarge 16GB 여유 안 — `docs/migration/phase11/M-PHASE-11-signature-copy-memory.md`)

---

## 7. 양 PC 작업 인계 절차 (Claude Code)

### 떠나는 PC (현재 PC)

```powershell
# CURRENT-WORK.md 갱신은 본 commit 으로 진행
git checkout main
git pull
```

### 도착하는 PC (회사/집)

```powershell
git pull
.\scripts\sync-claude-memory.ps1   # 8 신규 메모리 동기화 (Claude Code 사용 시)
# Claude Code 새 세션 → CLAUDE.md 자동 로드 + 본 파일 read 으로 컨텍스트 회복
# 코덱스 사용 시 → 본 파일 read + git pull 만으로 충분
# trigger: §3 의 후보 중 하나, 또는 새 작업
```
