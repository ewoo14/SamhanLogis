# product-service: 구글 스프레드 시트 → DB cron 동기화 (옵션 C-2)

> Phase 6 backend 정정 슬라이스. PR #38 (M1a 시드) 머지 후 정책 변경.
> Branch: `feature/migration-be-product-google-sheets-sync`. Base: `origin/main`.

## 1. 배경

개발책임자 결정 (2026-05-05):
> "견적서와 주문서의 경우에만 기존 구글 스크립트처럼 구글 스프레드 시트에서 그대로 가져오는 것으로 하자"

기존 product-service M1a (PR #38 머지) 는 27 sheet → 8 entity DB 시드 구조. 본 작업은 시트가 source-of-truth 인 운영 모델로 정정하기 위해 **구글 시트 → DB cron 1시간 동기화** 추가.

legacy 시트 ID `<SHEET_ID>` 그대로 사용. 27 tab → 8 entity 매핑 그대로 (PR #38 보존).

## 2. 옵션 비교 + 채택

| 옵션 | 설명 | 장점 | 단점 | 결정 |
|---|---|---|---|---|
| C-1 | 실시간 시트 read (호출마다) | DB 동기화 불필요 | 시트 API per-minute quota (60 read) 한계 + 응답 지연 | 기각 |
| **C-2** | **cron 1시간 주기 시트 → DB sync** | **DB read 빠름 + 시트 변경 1시간 내 반영 + quota 부담 분산** | **시트 변경 즉시 반영 안 됨 → C-3 결합** | **채택** |
| C-3 | admin endpoint 수동 trigger | 즉시 반영 가능 | 자동 sync 부재 | C-2 와 결합 (보조) |

본 PR 은 **C-2 + C-3 결합** — cron 자동 + admin 수동 trigger 동시 제공.

## 3. 변경 매트릭스

### 신규 파일 (4)

| 파일 | 책임 |
|---|---|
| `services/product-service/src/main/java/.../client/GoogleSheetsClient.java` | Google Sheets v4 SDK 래퍼. Service Account JWT 인증. Caffeine 5분 TTL 캐시. |
| `services/product-service/src/main/java/.../service/ProductSheetSyncService.java` | tab 별 별도 트랜잭션 sync. row hash (SHA-256) 기반 변경 감지. soft-delete 자동. |
| `services/product-service/src/main/java/.../scheduler/ProductSheetSyncScheduler.java` | `@Scheduled` cron + `ApplicationReadyEvent` 부팅 1회. |
| `services/product-service/src/main/java/.../web/ProductAdminController.java` | `POST /api/v1/products/admin/sync` 수동 trigger (옵션 C-3). |

### 정정 파일 (3)

| 파일 | 변경 |
|---|---|
| `services/product-service/build.gradle` | `google-api-client` 2.4.0 + `google-api-services-sheets` v4-rev20240514 + `google-auth-library-oauth2-http` 1.23.0 + `caffeine` 3.1.8 + `wiremock-standalone` 3.9.1 (test) 추가 |
| `services/product-service/src/main/resources/application.yml` | `google.sheets.*` 4 키 + `app.scheduling.*` 2 키 추가. local profile 에서 `app.scheduling.enabled=false` override. |
| `services/product-service/src/main/java/.../ProductServiceApplication.java` | `@EnableScheduling` 활성 |

### IT (1)

| 파일 | 시나리오 |
|---|---|
| `services/product-service/src/test/java/.../it/ProductSheetSyncServiceIT.java` | (1) 첫 sync insert only (2) 동일 시트 재 sync — rowHash 일치, update 없음 (3) 가격 변경 시 update 발생 (4) 시트에서 사라진 row soft-delete |

### dev-report (1)

`docs/dev-reports/migration-be-product-google-sheets-sync.md` (본 문서)

### legacy 보존

- `ProductSeedRunner` (Phase 6 M1a dry-run runner) — **변경 없음**. cron 가용 전 fallback 으로 유지.
- V1~V4 Flyway migration — 변경 없음. 시트 sync 는 기존 schema 위에서 동작.
- 27 tab → 8 entity 매핑 — `ProductSheetSyncService.TAB_MAPPINGS` 가 PR #38 의 6 카테고리 매핑 (홈멀티/싱글 세트/싱글 구성품/상업멀티/상업멀티 구성/구형) 그대로 보존.

## 4. 동기화 룰 상세

### TAB → 도메인 매핑 (PR #38 보존)

| 시트 tab | productCategory | usageScope | estimateCategory |
|---|---|---|---|
| 홈멀티 | HOME_MULTI | BOTH | HOME_MULTI |
| 싱글 세트 | SINGLE_SET | BOTH | SINGLE_SET |
| 싱글 구성품 | SINGLE_PART | NONE | (null) |
| 상업멀티 | COMMERCIAL_MULTI | BOTH | COMMERCIAL_MULTI |
| 상업멀티 구성 | COMMERCIAL_PART | NONE | (null) |
| 구형 | OLD | BOTH | LEGACY |

### upsert 매트릭스

| 상태 | 행동 |
|---|---|
| DB 에 없음 + 시트에 있음 | INSERT (`Product.seedFromSheet`) |
| DB 에 있음 + 시트에 있음 + rowHash 일치 | unchanged (skip) |
| DB 에 있음 + 시트에 있음 + rowHash 불일치 | UPDATE (가격 + usage 갱신) |
| DB 에 있음 + 시트에 없음 | soft-delete (`BaseEntity.markDeleted("system-sheet-sync")`) |
| 다음 sync 시 시트에 재현 | (현재 PR scope X) — 후속 PR 에서 deleted 복구 룰 추가 가능 |

### 캐시 + 트랜잭션

- Caffeine 5분 TTL — cron sync (1시간 주기) + admin trigger 동시 호출 시 시트 API quota 가드.
- tab 1개씩 별도 트랜잭션 (`@Transactional` on `syncTab`) — 1 tab 실패가 전체 sync 무효화 방지.
- row 단위 실패는 catch + log + skip (sync continuity 우선).

### 부팅 + cron

- `@EventListener(ApplicationReadyEvent.class)` — 부팅 시 1회 sync. 실패 시 catch + log (부팅 차단 X).
- `@Scheduled(cron = "${app.scheduling.product-sync-cron:0 0 * * * *}")` — 매시 정각.
- 환경변수 override: `PRODUCT_SYNC_SCHEDULING_ENABLED`, `PRODUCT_SYNC_CRON`.

## 5. IT 시나리오

`ProductSheetSyncServiceIT` 4 테스트 — `@MockBean GoogleSheetsClient` 격리 (memory `feedback_it_mockbean_external_clients.md` 가드).

| 테스트 | 검증 |
|---|---|
| `sync_첫실행_insert_only` | 시트 1 row → DB 에 insert 1건, productCategory=HOME_MULTI, releasePrice 일치 |
| `sync_재실행_rowHash_동일이면_update_없음` | 동일 시트 응답 2회 sync → 2회차 unchanged=1, updated=0 |
| `sync_가격변경시_update_발생` | 시트 응답 가격 변경 → 2회차 updated=1, releasePrice 신규 값 |
| `sync_시트에서_사라진_row_softDelete` | 시트에서 row 제거 → softDeleted=1, active 조회 시 없음 |

### IT 환경 트랩

- Windows + Docker Desktop npipe 한계로 Testcontainers PostgreSQL skip 가능 (memory `feedback_testcontainers_windows_docker.md`).
- `AbstractPostgresIT.DockerAvailableCondition` 가 자동 disabled 처리 → build SUCCESSFUL.
- CI (Linux runner) 에서는 정상 실행.

## 6. 빌드 결과 (로컬)

| 명령 | 결과 |
|---|---|
| `./gradlew :services:product-service:compileJava` | BUILD SUCCESSFUL |
| `./gradlew :services:product-service:compileTestJava` | BUILD SUCCESSFUL |
| `./gradlew :services:product-service:assemble` | BUILD SUCCESSFUL (`product-service.jar`) |
| `./gradlew :services:product-service:test` | BUILD SUCCESSFUL (IT 4건 Windows Docker npipe → SKIPPED, 단위 test 통과) |

## 7. 가드 적용

| 가드 | 적용 |
|---|---|
| BaseEntity 7 audit fields | ✓ Product entity 변경 없음 (기존 7 필드 그대로) |
| Soft Delete | ✓ `BaseEntity.markDeleted("system-sheet-sync")` 호출, hard delete 없음 |
| Korean accounting 표준 코드 | (해당 없음 — accounting-service 영역) |
| 한국어 Javadoc + commit + PR | ✓ 모든 신규 파일 한국어 주석 |
| `feedback_it_mockbean_external_clients.md` | ✓ `@MockBean GoogleSheetsClient` 격리 |
| `feedback_testcontainers_windows_docker.md` | ✓ DockerAvailableCondition 사용, Windows skip 허용 |
| `feedback_korean_path_jdk.md` | ✓ worktree 영문 path 에서 assemble + 단위 test 통과 |
| `feedback_uuid_no_user_visibility.md` | ✓ admin endpoint response 는 SyncSummary (UUID 미포함) |
| `feedback_function_documentation.md` | (1) 한국어 Javadoc 모든 service/scheduler/client (2) springdoc-openapi (admin endpoint @Operation) (3) 본 dev-report |
| 시크릿 (Service Account JSON) | ✓ placeholder path 만 (`/etc/samhan/sa-key.json`) — 실 값 SSH 직접 |
| legacy 시트 ID 보존 | ✓ `<SHEET_ID>` |
| legacy 27 tab → 8 entity 매핑 | ✓ PR #38 의 6 카테고리 매핑 (홈멀티/싱글세트/싱글구성품/상업멀티/상업멀티구성/구형) 그대로 |

## 8. 후속 작업

| 작업 | 책임 | 비고 |
|---|---|---|
| FE PR — desktop/estimate-app 의 mock fallback 제거 | 별도 spawn | 본 PR 머지 후 시트 데이터 DB 도착 확인 필요 |
| BranchPipeLookup / OduRecommendation / MaterialPrice / BundleComponent 시트 → DB sync 확장 | 후속 PR | 본 PR 은 6 카테고리 ProductMaster 만 sync. 나머지 4 entity 는 V3 Flyway 시드 그대로 |
| admin endpoint role 게이트 (ROLE_ADMIN) 강화 | 후속 PR | 현재 anyRequest().authenticated() 만 통과 |
| 시트 schema 변경 시 alert | 후속 PR | sync 실패 N회 연속 시 Slack/email |
| 시트 row 삭제 → DB soft-delete 후 시트 재현 시 복구 룰 | 후속 PR | 현재 unique partial index 위배 가능성 검토 필요 |
| Service Account JSON 운영 배포 | DevOps | `/etc/samhan/sa-key.json` 위치 + 권한 설정 (chmod 600 root) |

## 9. TM 검토 포인트

- [x] 옵션 C-2 채택 근거 명시 (§2)
- [x] legacy 보존 (시트 ID + 27 tab → 8 entity 매핑) 검증
- [x] BaseEntity + Soft Delete + 한국어 Javadoc 가드 적용
- [x] IT 4 시나리오 + @MockBean 격리
- [x] 환경변수 + 시크릿 placeholder
- [x] 후속 작업 분리 (FE mock 제거 / 다른 entity sync / admin role / alert)

## 10. 정정 (2026-05-05) — legacy `getDisplayValues` / `getFormulas` 동등 추가

### 배경

개발책임자 결정 (2026-05-05):
> "68번은 추가 정정 필요. 단, 구글 서비스 계정을 통해 데이터를 불러올것"

= legacy 1:1 보존 강화 + Service Account 인증 유지 (변경 X — 이미 적용된 SA 그대로).

### legacy 사용처 grep 결과

`migration/source/scripts/{estimate,partner-order}/Code.js` 의 `getDisplayValues()` + `getFormulas()` 사용 위치:

| Code.js | line | API | 컨텍스트 |
|---|---|---|---|
| estimate | 384 | `rng.getDisplayValues()` | 홈멀티 read (가격/모델 등 표시값) |
| estimate | 385 | `rng.getFormulas()` | 홈멀티 — `priceFormula` 추출 → `useK2` (`$L$2` 검출) |
| estimate | 507 | `sh.getDataRange().getDisplayValues()` | 싱글 세트 read |
| estimate | 508 | `sh.getDataRange().getFormulas()` | 싱글 세트 — `matKey` 분기 (`$D$4 / $D$7 / $D$8`) |
| estimate | 619 | `rng.getDisplayValues()` | 싱글 구성품 read |
| estimate | 687 | `sh.getRange(...).getDisplayValues()` | 모델/품목 lookup |
| estimate | 788/789 | `getDisplayValues + getFormulas` | 상업멀티 read (formula 보조) |
| estimate | 882 | `rng.getDisplayValues()` | 상업멀티 구성 read |
| estimate | 968 / 1040 / 1122 / 1199 | `sh.getDataRange().getDisplayValues()` | 규격 / 상세 / 분류 / 카테고리 lookup |
| estimate | 1369 / 1394 | `sh.getRange(1,1,2,24).getDisplayValues()` | 헤더 read |
| estimate | 1436 / 1506 | `sh.getDataRange().getDisplayValues()` | 보조 시트 read |
| estimate | 1730 | `range.getFormulas()` | 수식 보조 |
| partner-order | 261/274/312/325 | `sh.getDataRange().getDisplayValues()` | 거래처 / 주문 / 카테고리 read |
| partner-order | 615/616 | `getDisplayValues + getFormulas` | 홈멀티 read (estimate 385 와 동일 useK2 분기) |
| partner-order | 736/737 | `getDisplayValues + getFormulas` | 싱글 세트 read (estimate 508 와 동일 matKey 분기) |
| partner-order | 842 ~ 1710 | (동등 패턴 다수) | 다른 tab read 및 lookup |
| partner-order | 1896 | `range.getFormulas()` | 수식 보조 |

**핵심 발견**:
- 모든 6 sync 대상 tab (홈멀티/싱글세트/싱글구성품/상업멀티/상업멀티구성/구형) 의 read 가
  legacy 에서 `getDisplayValues()` 사용 — 가격이 천단위 콤마 포맷 (`"1,500,000"`) 으로 표시되며
  `parseKRNumber_()` 가 콤마 제거 후 파싱.
- 홈멀티 + 싱글세트 두 tab 만 추가로 `getFormulas()` 사용 — `useK2 / matKey` 비즈니스 분기.

### Sheets v4 API 매핑

| legacy Apps Script | PR #68 정정 후 method | Sheets v4 query parameter |
|---|---|---|
| `Range.getValues()` | `readSheet(sheetId, range)` (default UNFORMATTED) | `valueRenderOption=UNFORMATTED_VALUE` |
| `Range.getDisplayValues()` | `readSheetDisplay(sheetId, range)` | `valueRenderOption=FORMATTED_VALUE` |
| `Range.getFormulas()` | `readSheetFormulas(sheetId, range)` | `valueRenderOption=FORMULA` |

또한 enum 기반 통합 진입점 추가:
```java
public enum ValueRenderMode { UNFORMATTED, FORMATTED, FORMULA }
public List<List<Object>> readSheet(String sheetId, String range, ValueRenderMode mode);
```

캐시 key 가 `sheetId|range` → `sheetId|range|renderOption` 으로 확장 (3 mode 별 별도 캐시).

### ProductSheetSyncService 의 mode 적용 결정

| tab | 현재 PR #68 (정정 전) | 정정 후 | 비고 |
|---|---|---|---|
| 홈멀티 | `readSheet()` (UNFORMATTED) | `readSheetDisplay()` (FORMATTED) | legacy estimate:384 + partner-order:615 1:1 |
| 싱글 세트 | `readSheet()` | `readSheetDisplay()` | legacy estimate:507 + partner-order:736 1:1 |
| 싱글 구성품 | `readSheet()` | `readSheetDisplay()` | legacy estimate:619 1:1 |
| 상업멀티 | `readSheet()` | `readSheetDisplay()` | legacy estimate:788 1:1 |
| 상업멀티 구성 | `readSheet()` | `readSheetDisplay()` | legacy estimate:882 1:1 |
| 구형 | `readSheet()` | `readSheetDisplay()` | legacy `getDisplayValues()` 패턴 보존 |

`parseDecimal()` 가 이미 콤마/₩ 제거 로직을 보유 (line 248) — FORMATTED mode 의 천단위 콤마 표기 (`"1,500,000"`) 와 호환.

### formula mode 후속 처리 (본 PR scope X, 후속 PR)

홈멀티의 `useK2` (`$L$2` 검출) + 싱글 세트의 `matKey` (`$D$4 / $D$7 / $D$8` 분기) 는
현재 Product entity 에 컬럼 부재. 후속 PR 에서 `Product.priceFormulaHint` 또는
별도 `PricingRule` entity 추가 후 `readSheetFormulas()` 호출하여 비즈니스 분기 보존 예정.
본 정정에서는 GoogleSheetsClient 에 method 만 추가 — 향후 호출 인터페이스 보존.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `services/product-service/src/main/java/.../client/GoogleSheetsClient.java` | `ValueRenderMode` enum + 3 method (`readSheet`/`readSheetDisplay`/`readSheetFormulas`) + 캐시 key 확장 |
| `services/product-service/src/main/java/.../service/ProductSheetSyncService.java` | `syncTab` 내부 read 호출을 `readSheetDisplay` 로 변경 (legacy 1:1) |
| `services/product-service/src/test/java/.../it/ProductSheetSyncServiceIT.java` | 4 기존 시나리오 mock stub 을 `readSheetDisplay` 로 변경 + 가격 데이터에 천단위 콤마 추가 + 2 신규 테스트 (legacy 가드 + 3 mode mockable) |
| `docs/dev-reports/migration-be-product-google-sheets-sync.md` | 본 §10 추가 |

### 인증 (변경 X)

- Service Account JWT 인증 그대로 유지 (개발책임자 명시).
- `serviceAccountKeyPath` / `endpointOverride` / `cacheTtlMinutes` properties 변경 X.
- SDK build pipeline 변경 X (`sheetsService()` 메서드 그대로).

### 정정 가드

- [x] 한국어 commit + dev-reports
- [x] BaseEntity / Soft Delete (변경 없음 — legacy 보존)
- [x] role 풀네임 (변경 없음 — admin endpoint 동일)
- [x] IT @MockBean 격리 (`GoogleSheetsClient` mock 그대로)
- [x] 한글 path JDK 회피 (worktree 영문 path 에서 작업)
- [x] gradlew chmod (Windows commit 전 `git update-index --chmod=+x`)
- [x] legacy 비즈니스 로직 변형 금지 — `readSheet()` (UNFORMATTED) default 시그니처 보존, display/formula 는 신규 method
- [x] Service Account 인증 그대로 (JWT 변경 X)
- [x] gradle test FAIL 시 즉시 fix → 새 commit (amend 금지)
- [x] GitGuardian PASS — 시크릿 미포함
