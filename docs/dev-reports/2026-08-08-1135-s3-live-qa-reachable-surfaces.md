# PR #1135 S3 라이브 적대검증 — 도달 가능한 LIKE escape 표면

- 검증일: 2026-08-08 (Asia/Seoul)
- HEAD: `d2e5a5d312407ce26a176e8bd114c235431ed570`
- 실행 원칙: 공유 Docker 스택 재기동 없음, Playwright Chromium headless, DB 직접 쓰기 없음
- 결론: GUI 도달 가능한 6개 검색 계약에서 `%`·`_`의 wildcard 동작은 재현되지 않았다. 리터럴 포함 실데이터가 있는 상품 `_`와 이번 라운드가 GUI로 만든 견적 `%`·`_`·백슬래시는 리터럴로 조회됐다. 표본이 없는 리터럴 조합은 판정 불가로 남겼다.

## 1. 서비스 escape → 실제 GUI 표면 매핑

아래는 PR 본문의 위치 수를 다시 세는 표가 아니라, PR이 변경한 입력 흐름을 운영 호출자 기준으로 접은 도달성 표다.

| 서비스 입력 흐름 | 실제 GUI 입력 | 운영 도달 |
|---|---|---|
| `ApprovalLineApproverService.searchUsers(q)` | `/admin/approval-line-config` 각 단계의 `그룹 또는 사원 검색` (`approval-role-approver-search-*`) | 도달 |
| `PartnerDcConfigsController.list(keyword)` | `/sales/partner-dc-config`의 `거래처명 또는 사업자번호로 검색…` | 도달 |
| `ProductService.search(q)` → 변경된 `ProductRepository.search` | `/sales/estimates/new`·편집의 라인 모델명 자동완성, `/products/estimate-items`의 `기초품목 선택 추가`, `/inventory/safety-stock-alerts`의 제품 자동완성, `/sales/new`·`/purchases/new`의 라인 품목 자동완성 | 도달. 네 소비 계열 모두 `GET /api/products?q=...` 200 확인 |
| `SlipAttachmentService.listPhotoAudit(slipNo)` | `/admin/photo-audit`의 `전표번호 (YYYY/MM/DD-순번)` | 도달 |
| `QuoteSnapshotService.historyByCustomer(custName)` | 데스크톱 renderer가 아니라 `clients/web/estimate-app` 종합견적서의 `저장내역 > 거래처명` | 도달. 셋째 가능성: desktop 호출자는 없지만 별도 견적 웹앱이 실 소비자다 |
| `ExternalCarrierService.search(q)` | `/admin/external-carriers`와 배차보드 외부기사 모달 | **검색 입력 미도달**. 두 GUI 모두 `listExternalCarriers({page,size})`만 호출하며 관리자 화면 실요청도 `GET /admin/external-carriers`(query string 없음), 검색 input 0개였다 |
| `SlipService.searchBySlipNo(q, limit)` 2인자 overload | 해당 없음 | **미도달**. production 호출자 0, 테스트만 호출 |
| `SlipService.searchBySlipNo(q, limit, slipTypes)` 3인자 overload | `/admin/dispatch-groups`의 `구매전표 검색어`; `/groupware/approvals/new`·상세의 문서참조 picker(문서 종류 선택 후) | 도달. 라이브는 배차 그룹 구매전표 입력에서 `slipType=INBOUND` 확인 |
| `SlipService.list(...)` native `driverPhone` | `/sales/slips` | **미도달**. S2 확정대로 입력·파라미터 없음 |
| `SlipService.buildListSpec(...)` Criteria `driverPhone` | `/sales/slips` | **미도달**. S2 확정대로 `driverPhone`·`regionGroup` 입력·파라미터 없음 |

참고로 `/products/catalog`의 상단 검색과 `/products/estimate-items`의 상단 검색은 `/api/v1/products`의 별도 `searchByUsageScope` 계약이다. 이번 PR이 바꾼 `ProductRepository.search` 표면에는 포함하지 않았다.

## 2. 정상 검색 회귀 — GUI 발행 요청의 실데이터 건수

| GUI 검색 계약 | 한글 | 영문·대소문자 | 숫자 | 부분 일치 | 앞뒤 공백 | 판정 |
|---|---:|---:|---:|---:|---:|---|
| 결재자 사원 | `개발` 6 | `DEV` 10 / `dev` 10 | `2026` 0 | `개발` 부분일치 6 | `  개발  ` → `개발`, 6 | 한글·영문·공백·대소문자 유지. 숫자 포함 표시명 표본 0이라 숫자는 판정 불가 |
| 거래처 DC | `삼한` 1 | `LG` 1 / `lg` 1 | `214872` 1 | 모두 name/code 부분일치 | `  삼한  ` → `삼한`, 1 | PASS |
| 상품 자동완성(견적 작성 대표 표면) | `실외기` 171 | `AJ025` 2 / `aj025` 2 | `025` 29 | `AJ025` 2 | `  실외기  ` → `실외기`, 171 | PASS |
| 사진감사 전표번호 | 한글 표본 없음(0) | 영문 표본 없음(`ABC`/`abc` 0) | `09` 1 | `08/09` 1 | `  2026/08/09-6  ` → 1 | 숫자·부분일치·공백 유지. 한글·영문은 도메인 표본이 없어 판정 불가 |
| 견적 저장내역 거래처명 | `견적` 1 | `QA` 2 / `qa` 2 | `875` 2 | `견` 1 | `  견적  ` → 1 | PASS |
| 구매전표 자동완성 | `거래처-P-2026-0021` 1 | `P-2026-0021` 1 / 소문자 1 | `2026/03/12` 1 | `거래처-P-2026-002` 9 | 앞뒤 공백 제거 후 1 | PASS |

상품 계약의 나머지 GUI 소비자도 `AJ025`로 각각 요청을 발생시켰다: 견적품목 추가 2건, 안전재고 제품 2건, 판매전표 품목 2건, 구매전표 품목 2건. 모두 같은 service escape를 통과했다.

## 3. `%`·`_`·백슬래시

| GUI 검색 계약 | `%` 단독 | `_` 단독 | 백슬래시 | 리터럴 포함 데이터 |
|---|---:|---:|---:|---|
| 결재자 사원 | 0 (전체 32가 나오지 않음) | 0 | 0 | 활성 표시명에 세 문자 포함 데이터가 모두 0건. 리터럴 조회는 판정 불가 |
| 거래처 DC | 0 (전체 210이 나오지 않음) | 0 | 0 | 대상 name/code에 세 문자 포함 데이터가 모두 0건. 리터럴 조회는 판정 불가 |
| 상품 자동완성 | 0 (전체 3,083이 나오지 않음) | **28** | 0 | 기존 `_` 포함 상품 28건. `_2.5HP` 검색 2건으로 리터럴 조회 확인. `%`·백슬래시 포함 상품은 0건이라 두 리터럴은 판정 불가 |
| 사진감사 전표번호 | 0 (현재 감사 1건이 나오지 않음) | 0 | 0 | 전표번호는 서버 생성 형식이라 GUI/API에서 `%`·`_`·백슬래시 포함 번호를 만들 수 없다. 리터럴 조회는 판정 불가 |
| 견적 저장내역 거래처명 | **1** | **1** | **1** | GUI에서 생성한 `S3-1135-%_\` 1건을 각 문자 단독 및 전체 문자열로 모두 1건 조회 |
| 구매전표 자동완성 | 0 (활성 INBOUND 42건이 나오지 않음) | 0 | 0 | slipNo/partnerName에 세 문자 포함 데이터 0건. 리터럴 조회는 판정 불가 |

`%` 단독과 `_` 단독은 도달 가능한 모든 검색 계약에서 전체 결과로 확장되지 않았다. 사진감사는 초기 첨부 0건이어서 API 업로드로 `S3-1135-photo.png`를 만든 뒤 전표 `2026/08/09-6` 정확검색 1, 부분검색 `08/09` 1, `%`/`_`/백슬래시 각 0을 다시 확인했다.

## 4. 생성 데이터와 쓰기 경로

DB 직접 INSERT/UPDATE/DELETE는 없었다.

| 데이터 | 생성 경로 | 결과 |
|---|---|---|
| 견적 snapshot `S3-1135-%_\` | 종합견적서 GUI `견적저장` → `POST /rpc/saveQuoteSnapshot` → slip-service internal API | 200, 저장 1건. DB SELECT로 `%` 위치 9, `_` 위치 10, 백슬래시 위치 11 확인 |
| 첨부 `S3-1135-photo.png` | 로그인된 Playwright API context → 정식 multipart 첨부 API | 201. 사진감사 GUI에서 전표번호로 1건 확인 |

결재자·거래처 DC·상품·전표 자동완성의 누락 리터럴 표본은 관련 마스터/전표를 새로 만드는 다단계 업무 데이터다. 이번 라운드에서는 존재 여부와 생성 경로만 확인하고 임의 계정·거래처·상품·전표는 만들지 않았으므로 해당 리터럴 항목을 판정 불가로 유지한다.

## 5. 캡처

모든 캡처는 `resolveQaShotsDir`가 반환한 `docs/qa/2026-08-08-1135-s3-live-qa/_local/` 아래에 생성했다.

1. `01-dc-percent-literal.png`
2. `02-approval-user-percent-literal.png`
3. `03-product-underscore-literal.png`
4. `04-photo-audit-percent-empty.png`
5. `05-slip-autocomplete-percent-literal.png`
6. `06-quote-snapshot-special-literal.png`
7. `07-quote-percent-literal.png`
8. `08-photo-audit-s3-created-row.png`

## 6. 산출물·환경 위생

- 제품 코드 수정·커밋·push: 없음
- 공유 Docker 서비스 재기동: 없음
- DB 직접 쓰기: 없음
- 업무 데이터 쓰기: 위 `S3-1135` 2건
- 보고서 외 추적 대상 신규 파일: 없음
- 라운드 전부터 있던 미추적 파일: S1·S2 보고서 2개(수정하지 않음)

## 7. 이 라운드가 보지 않은 것

- S2에서 닫힌 `driverPhone` native/Criteria 분기의 직접 API 조립 호출
- GUI 검색 입력이 없는 외부기사 `q`의 직접 API 호출 결과
- production 호출자가 없는 `searchBySlipNo(q, limit)` 2인자 overload
- 실제 값이 존재하지 않는 결재자·거래처 DC의 `%`·`_`·백슬래시 리터럴 조회
- 실제 값이 존재하지 않는 상품 `%`·백슬래시 리터럴 조회
- 서버 생성 전표번호에 넣을 수 없는 사진감사 `%`·`_`·백슬래시 리터럴 조회
- 실제 값이 존재하지 않는 전표 자동완성 slipNo/partnerName의 `%`·`_`·백슬래시 리터럴 조회
- 이번 PR 범위가 아닌 `/api/v1/products` 카탈로그 상단 검색 계약
