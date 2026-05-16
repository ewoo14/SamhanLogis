# SP-08 legacy GAS DB/API parity report

> 브랜치: `codex/sp-08-legacy-gas-db-api-parity`
> 기준: PR #209 merge 이후 main

## 목적

나머지 legacy GAS 프로그램은 UI와 기능을 기존 그대로 유지하되, 운영 중 조회/저장/수정/삭제는 Samhan Public DB/API만 사용하도록 잠근다. Notion 표와 legacy GAS/CSV는 이관 snapshot 및 회귀 검증 reference로만 남긴다.

## 5-team 감사 요약

| 역할 | 결론 | SP-08-1 반영 |
|---|---|---|
| Backend | `getOrderSnapshotHistory` 인자가 DB API로 전달되지 않고, 공통 GAS history/state 계층이 후속 과제다. | partner-order draft list에 optional `from/to` date filter 추가 |
| Frontend | estimate/order/admin 화면에 사용자-facing Notion 문구와 저장내역 필터 불일치가 남아 있다. | 견적 저장 문구를 Samhan DB로 변경, admin CSV/import label 정리, order-app query params 전달 |
| Designer | legacy 레이블/탭/출력 양식을 유지하고 PR 캡처에서 표 헤더까지 보여야 한다. | SP-08 QA PNG 11장 생성 |
| DevOps | SP-08 전용 static contract, screenshot generator, no-skip verification gate가 없다. | `sp-08-legacy-gas-db-api-parity.spec.ts`와 screenshot generator 추가 |
| QA | Notion-derived CRUD, 배차/DPS/회계/vendor OCR/견적주문을 묶은 회귀 matrix 필요. | dev-report와 QA checklist에 matrix 고정 |

## 구현

### Notion live target 문구 제거

- `clients/web/estimate-app/views/index.ejs`
  - `현재 견적 상태를 노션에 저장` confirm을 `현재 견적 상태를 Samhan DB에 저장`으로 변경.
- `clients/desktop/src/renderer/routes/SalesPartnerDcConfigPage.tsx`
  - `Notion CSV`, `노션에서 다운로드` 사용자 문구를 `기존 운영 CSV`로 변경.
- `clients/desktop/src/renderer/routes/admin/RegionsPage.tsx`
  - 지역 분류 입력/CSV 설명을 `기존 지역 분류표`, `기존 운영 CSV`로 변경.
- `clients/desktop/src/renderer/routes/admin/ChatRoomsPage.tsx`
  - 표 헤더 `Notion 생성`을 `원본 생성`으로 변경.
- `clients/desktop/src/renderer/api/chatRoomApi.ts`, `blockedPartnerApi.ts`
  - source label을 `DB 이관 시드`, `DB 이관 CSV`로 변경.

### 주문서 저장내역 기간 필터 복원

- `clients/web/order-app/src/samhanApi.ts`
  - legacy `getOrderSnapshotHistory(safeBizNo, sDate, eDate)` 시그니처를 유지하되 `safeBizNo`는 client-side 호환 인자로만 소비하고 `/partner-orders/drafts?from=&to=` query params로 날짜만 전달.
  - `getDraftList` alias도 같은 인자를 허용하고, JS `Date` 객체와 문자열 날짜를 모두 `YYYY-MM-DD`로 정규화.
- `services/partner-order-service`
  - `PartnerOrderDraftController.list`에 optional `from/to` ISO date query param 추가.
  - `PartnerOrderDraftService.list(partnerCode, from, to, pageable)` 추가.
  - `PartnerOrderDraftRepository.findAllByPartnerCodeAndCreatedAtBetweenOrderByCreatedAtDesc` 추가.
  - 한쪽 범위만 온 경우 sentinel date 없이 전용 repository method로 분기.
  - 기존 no-arg list 경로는 그대로 유지해 old caller 호환을 보존.

### 정적 계약과 캡처

- `clients/desktop/playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts`
  - legacy GAS inventory, `Inde.html` 오타 UI surface 포함.
  - 사용자 노출 Notion live target 문구 제거.
  - order-app 저장내역 query params 전달.
  - draft backend optional date range filter.
  - order/estimate active runtime Notion HTTP endpoint 제거.
- `scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs`
  - PR inline용 11장 PNG 생성.

## 후속 구현 대상

이번 SP-08-1은 기반 잠금이다. 아래는 후속 SP-08 sub-task로 구현을 이어간다.

| 영역 | 남은 일 |
|---|---|
| DPS | 완료 (SP-08-2) — `DpsSaveHistory` DB/API + DPS 비교/품목별 DPS 실행/저장내역 2탭 + latest 자동 복원/명시 저장 |
| 배차 | 진행 중 (SP-08-3-1) — 가배차/지방가배차/미배차/전표정리/배차문자/운송사 비교의 저장/복원/preview/send history 매트릭스 기반 잠금 |
| 회계 | 원장/거래명세서/내일자 전표 print `MOCK_DATA` 제거, accounting/slip DB 데이터 연결 |
| Vendor/OCR | 에어디자이너 PDF 다중 파일, 제이시스템 이미지 다중 파일/슬라이드 preview, 담당자명 입력 parity |
| Aligo | 주소록 sync dry-run/mock 경로와 secret guard 강화 |
| 공통 | `legacy_gas_history/state` 계층 또는 도메인별 history endpoint 설계 |

## 검증

| 명령 | 결과 |
|---|---|
| `npx playwright test playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts --reporter=line` | PASS - 6 tests, skipped 0 |
| `npx playwright test playwright/sp-08-legacy-gas-db-api-parity/sp-08-legacy-gas-db-api-parity.spec.ts playwright/sp-06-notion-db-crud/sp-06-notion-db-crud.spec.ts playwright/sp-07-google-sheets-source/sp-07-google-sheets-source.spec.ts playwright/full-menu-contract/full-menu-contract.spec.ts --reporter=line` | PASS - 34 tests, skipped 0 |
| `.\gradlew.bat :services:partner-order-service:test --tests "*PartnerOrderDraftServiceIT" --no-daemon --rerun-tasks` | PASS — 3 tests, skipped 0 |
| `npm run typecheck` (`clients/desktop`) | PASS |
| `npm run lint` (`clients/desktop`) | PASS - 0 errors, 2 existing warnings |
| `npm run build` (`clients/desktop`) | PASS |
| `npm ci && npm run typecheck` (`clients/web/order-app`) | PASS |
| `npm run build` (`clients/web/order-app`) | PASS |
| `npm ci && npm test -- --runInBand` (`clients/web/estimate-app`) | PASS - 17 tests, skipped 0 |
| `node scripts/generate-sp-08-legacy-gas-db-api-parity-screenshots.mjs` | PASS — 11 PNG, non-zero |
| `git diff --check` | PASS - whitespace errors 0 |
| SP-08 secret-like artifact scan | PASS - no Notion token / private key / Sheets URL id / Aligo key assignment |
