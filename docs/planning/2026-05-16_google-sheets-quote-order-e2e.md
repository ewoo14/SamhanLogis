# google-sheets-quote-order-e2e 기획서

- 작성일: 2026-05-16
- 슬라이스: SP-07
- 범위: Samhan Public partner-order / product-service ↔ Google Sheets `종합견적서` live source

## 목적 및 배경

Samhan Public은 영업 현장에서 사용하는 legacy GAS UI와 기능을 그대로 유지하되, Notion 조회/쓰기만 Samhan DB/API 통신으로 치환한다. Google Spreadsheet `종합견적서` 는 legacy GAS와 동일한 단가/모델 원천으로 유지한다. 본 슬라이스(SP-07) 의 목적은 다음 4가지를 재검증하고 계약으로 고정하는 것이다.

1. **live source 재검증** — Spreadsheet의 27개 tab 중 어떤 range가 실제 카탈로그 원본이고, 어떤 tab이 output/control/credential-bearing form 인지 운영 시점 기준으로 재확인한다.
2. **source ↔ output/control 분리** — `홈멀티_단가인상`, `싱글 세트_단가인상`, `상업멀티 구성_단가인상` 같은 현재 단가 source tab과 붙지 않은 base tab, `종합견적서`/`전표업로드목록` 같은 output 양식, `전표생성폼` 같은 credential-bearing 제어 폼을 명확히 분리한다.
3. **partner-order bootstrap range-map 보안 보정** — bootstrap prefetch `range-map`에서 존재하지 않는 `설정!A1:Z` config read 및 credential-bearing tab 접근을 제거하여, 운영 서비스가 비공개 자격/제어 영역을 우발적으로 읽지 않도록 한다.
4. **product-service DB sync 계약 고정** — `종합견적서` source tab의 modelCode/납품가 컬럼 매핑을 product-service `ProductSheetSyncService` 와 정합화하고, IT/계약 테스트로 회귀를 막는다.

배경은 두 가지이다. 첫째, 기존 bootstrap range-map이 실제로 존재하지 않는 tab을 prefetch 대상으로 포함하고 있어 운영 시 spreadsheet API 호출이 실패하거나, 향후 동명 tab이 생길 경우 의도치 않게 민감 영역을 읽을 위험이 있었다. 둘째, `종합견적서` 출력 양식을 카탈로그 원본으로 오인할 경우 영업 견적/주문 흐름이 실데이터가 아닌 출력 양식의 잔여 셀을 참조할 수 있다.

## 유저 스토리

- **영업 담당자로서**, 현장에서 사용 중인 단가 source tab의 변경이 partner-order 견적/주문 흐름에 안전하게 반영되기를 원한다. `인상 전 단가` 옵션을 선택하면 붙지 않은 base tab의 출고가/납품가가 적용되어야 하며, 출력 양식이나 제어 폼의 잔여 데이터가 견적서에 섞이지 않아야 한다.
- **운영 담당자로서**, Samhan Public 백엔드가 `종합견적서` Spreadsheet 중 어떤 tab/range만 읽는지 한 눈에 확인할 수 있어야 한다. credential-bearing tab(예: 제어 폼) 은 어떤 경로로도 prefetch 되지 않아야 한다.
- **product-service 운영자로서**, 단가 source tab의 컬럼이 변경되거나 새 모델이 추가되었을 때 DB sync가 계약된 컬럼만 인식하고, 계약 불일치 시 명확히 실패하기를 원한다.
- **개발책임자로서**, partner-order bootstrap이 더 이상 존재하지 않는 `설정` tab을 호출하지 않으며, seed fallback 과 DC secret strip 이 정상 동작하는지를 단위/통합 테스트로 확인하고 싶다.
- **QA 담당자로서**, source / output / control 분리와 bootstrap range-map 보안 보정이 한 번의 Playwright static contract 실행으로 회귀 확인 가능해야 한다.

## 기술 스택

| 영역 | 스택 |
|---|---|
| Backend | Spring Boot 3.3 / Java 17 / JPA / Flyway, partner-order-service, product-service |
| Sheets 연동 | Google Sheets API v4 (Service Account 자격 — 본 문서엔 자격값 미포함) |
| Bootstrap 설정 | partner-order `application.yml` 의 `bootstrap.range-map` (seed fallback 포함) |
| 테스트 | JUnit 5 + Testcontainers (`BootstrapServiceTest`, `ProductSheetSyncServiceIT`, `ProductCatalogLookupClientTest`), Playwright static contract (`clients/desktop/playwright/sp-07-google-sheets-source`) |
| 정합성 도구 | Playwright `full-menu-contract` 회귀, gradle targeted test, desktop typecheck/lint/build |
| 문서/캡처 | `docs/operational-validation/google-sheets-source-validation.md`, `docs/operational-validation/google-sheets-live-source-snapshot.md`, `docs/qa/sp-07-google-sheets-quote-order-e2e/`, `scripts/generate-sp-07-google-sheets-source-screenshots.mjs` |

> 본 문서엔 Service Account 키, 운영 계정값, 거래처 연락처를 포함하지 않는다. 운영 자격은 별도 비밀 채널/PC 에서만 다룬다.

## API 설계

### 1) partner-order-service — bootstrap range-map 계약

- 위치: `services/partner-order-service/src/main/resources/application.yml` 의 `bootstrap.range-map`.
- 정책:
  - **포함** — 거래처 발송 주문서 GAS와 동일하게 base payload range와 `*_단가인상` helper range를 모두 등록한다. 예: `홈멀티!A1:Z`, `싱글 세트!A1:Z`, `싱글 구성품!A1:Z`, `상업멀티!A1:Z`, `상업멀티 구성!A1:Z`, `구형!A1:Z`, `홈멀티_단가인상!A1:Z`, `상업멀티_단가인상!A1:Z`, `싱글 세트_단가인상!A1:Z`, `싱글 구성품_단가인상!A1:Z`.
  - **제외** — `설정!A1:Z` 등 존재하지 않거나 운영에서 사용하지 않는 config tab, `전표생성폼` 등 credential-bearing 제어 폼, `종합견적서`/`전표업로드목록` 등 output 양식.
  - **seed fallback** — Sheets 자격이 없거나 응답이 비어있을 때 사용하는 in-memory seed는 `BootstrapService` 가 보유하며, `BootstrapServiceTest` 가 seed 진입 조건을 고정한다.
  - **DC secret strip** — 응답에 포함될 수 있는 DC/비밀 컬럼은 bootstrap 단계에서 strip 한다.

### 2) product-service — Sheets DB sync 계약

- 핵심 컴포넌트: `ProductSheetSyncService` + 단가 source tab별 column mapping.
- 컬럼 계약:
  - ProductMaster 기본 단가는 `*_단가인상` tab에서 가져온다.
  - 붙지 않은 base tab은 `인상 전 단가` 선택용 `PriceHistory`로 보존한다.
  - 모델코드 / 모델명 / 납품가 컬럼 위치는 source tab 별로 명시되며, 계약 변경 시 `ProductSheetSyncServiceIT` 가 RED 가 되어야 한다.
  - 출력 양식 (`종합견적서`, `전표업로드목록`) 은 DB sync 대상이 아니다.
- 트리거: 운영 환경에서는 Service Account 자격이 배치된 후 수동/스케줄 동기화로 수행한다. 본 슬라이스는 계약 고정과 IT 만 다룬다.

### 2-1) partner-order-service — catalog lookup 계약

- 핵심 컴포넌트: `ProductCatalogLookupClient`.
- 정책:
  - 기존 vendor OCR 업로드 UI/API 계약을 새 옵션으로 바꾸지 않는다.
  - 주문서/vendor OCR 경로의 catalog lookup은 `_단가인상` tab의 출고가/납품가를 사용한다.
  - `인상 전 단가`는 종합견적서 legacy UI가 product DB/PriceHistory를 통해 재현한다.
  - `종합견적서`, `전표업로드목록`, `전표생성폼`은 catalog lookup source가 아니다.

### 3) Playwright static contract (`sp-07-google-sheets-source`)

- 목적: BE/FE 양쪽이 동일한 source/output/control 분류와 column 계약을 참조하는지 정적 검증.
- 검증 항목:
  - bootstrap range-map 구성 — 허용 source tab 만 포함, 금지 tab 미포함.
  - partner-order catalog lookup 의 modelCode/납품가 컬럼 매핑.
  - product-service DB sync column mapping 일관성.
  - 문서(`google-sheets-source-validation.md`, `google-sheets-live-source-snapshot.md`) 의 정책 문구 존재.

### 4) 운영 검증 문서 계약

- `docs/operational-validation/google-sheets-source-validation.md` — source/output/control 분류, prefetch 정책, 운영 자격 배치 절차 헤더(자격값 미포함).
- `docs/operational-validation/google-sheets-live-source-snapshot.md` — 27개 tab inventory, 안전 range 샘플(개인정보 row 미포함, header 만).

## 예외 처리 시나리오

| # | 상황 | 동작 |
|---|---|---|
| 1 | Sheets 자격 미배치 / API 응답 비어있음 | `BootstrapService` seed fallback 활성. partner-order 는 운영 의존 없이 부팅 가능. `BootstrapServiceTest` 가 회귀 방지. |
| 2 | bootstrap range-map 에 금지 tab(`설정`, `전표생성폼` 등) 이 추가됨 | Playwright `sp-07-google-sheets-source` static contract RED. 머지 전 차단. |
| 3 | source tab 의 컬럼이 운영에서 변경 | `ProductSheetSyncServiceIT` 및 `ProductCatalogLookupClientTest` 가 RED. 계약 갱신 PR 발행 전까지 sync 보류. |
| 4 | 출력 양식(`종합견적서`/`전표업로드목록`) 을 catalog 원본으로 오인하는 변경 | static contract 의 source/output 분리 assertion RED. |
| 5 | credential-bearing tab 의 비밀 컬럼이 응답에 섞임 | bootstrap 단계의 DC secret strip 으로 제거. 테스트가 strip 동작을 강제. |
| 6 | spreadsheet tab 추가/삭제 | live snapshot 문서를 갱신하고 static contract 의 tab inventory 를 함께 갱신해야 머지 가능. |
| 7 | Service Account 키 노출 위험 | 본 슬라이스 산출물(plan/spec/dev-report/QA 캡처) 에 자격/계정/거래처 연락처를 기록하지 않는다. 운영 자격은 운영 PC 비밀 저장소에서만 다룬다. |
| 8 | `인상 전 단가` 선택 누락 | `ProductSheetSyncServiceIT`의 `PriceHistory` 회귀 가드가 RED. desktop vendor OCR에 새 `priceBasis` UI를 추가하지 않는다. |
| 9 | Windows 한글 경로 + JDK 17 환경에서 `gradle test` 실패 | targeted test (`--tests` 지정) 로 우회하거나 영문 경로 작업 트리에서 재시도. |

## 완료 기준

본 슬라이스는 다음 항목이 모두 충족될 때 완료로 간주한다.

1. `application.yml` bootstrap `range-map` 에서 `설정!A1:Z` 및 credential-bearing tab 이 제거되어 있다.
2. `BootstrapServiceTest` 가 (a) config seed fallback, (b) DC secret strip, (c) form tab 미조회 계약 3가지를 모두 검증한다.
3. `ProductCatalogLookupClientTest` 가 기존 vendor OCR UI/API를 유지하면서 `_단가인상` tab lookup 계약을 PASS 한다.
4. `ProductSheetSyncServiceIT` 가 product-service DB sync 의 column mapping과 `PriceHistory` 인상 전 단가 보존 계약을 PASS 한다.
5. Playwright `sp-07-google-sheets-source` static contract 7 케이스 + `full-menu-contract` 회귀가 PASS 한다.
6. 운영 검증 문서 2종(`google-sheets-source-validation.md`, `google-sheets-live-source-snapshot.md`) 이 source/output/control 분류와 운영 자격 배치 절차 헤더를 명시한다. 자격값/거래처 개인정보는 포함하지 않는다.
7. QA 캡처 6장 (`docs/qa/sp-07-google-sheets-quote-order-e2e/01~06`) 이 생성되어 PR 본문에 인라인 첨부 가능 상태이다.
8. README / ROADMAP / DECISIONS / `docs/handoff/CURRENT-WORK.md` / `docs/dev-reports/sp-07-google-sheets-quote-order-e2e.md` 가 같은 commit 에서 동기화되었다.
9. CI green 후 PM 재점검에서 5-team 0결함 확인 시 자동 머지, 결함/UNSTABLE 시 개발책임자 결정 대기.
