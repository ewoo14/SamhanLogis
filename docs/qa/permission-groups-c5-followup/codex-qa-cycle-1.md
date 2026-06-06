### 결함표

| ID | 심각도 | 위치 | 결함 | 요청 |
|---|---:|---|---|---|
| CQA-1 | P1 | `services/auth-service/src/test/java/com/samhanair/logis/auth/it/AuthFlywayV47SeedIT.java:73-100` | V47 materialize 가드가 false-green 가능. `materialized > 0 && materialized <= managerAccounts`라서 MANAGER 배속 계정 일부만 `account_page_permissions`에 들어가도 통과한다. 시스템마스터 제외도 "제외 대상 0건"을 직접 단언하지 않는다. | expected set = 활성 MANAGER 배속 계정 - 시스템마스터 동시 배속 계정으로 계산해 exact count/set 단언. `dev_manager` row의 7 action도 `view/create=true`, 나머지 false로 직접 단언. 시스템마스터 계정 `products.sync` row 0건 단언 추가. |
| CQA-2 | P2 | `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/EcountMigPartialIdentitySupport.java:6-13`, Mig6~11 IT | EcountMig IT 계약 갱신이 `X-User-Groups` partial identity만 검증한다. 실제 filter 계약은 `X-User-Groups` 또는 `X-Is-System-Master` 존재 + `X-User-Id` 부재 = 401인데, `X-Is-System-Master` 분기와 `X-User-Role` 단독 무시 분기가 비어 있다. | Mig6~11 공통 케이스에 `missingUserId + X-Is-System-Master:true -> 401`, `missingUserId + X-User-Role only -> 403/anonymous`를 추가해 role 무시와 partial identity re-key를 같이 고정. |
| CQA-3 | P2 | `clients/desktop/playwright/permission-groups-c5-followup/permission-groups-c5-followup.spec.ts:4`, `:27-94` | 신규 Playwright spec이 "source contract" 문자열 검사만 한다. `dynamicCanAccess('products.sync')`가 죽은 코드에 남아도 통과하고, mock 권한 스냅샷 기준 메뉴 표시/라우트 redirect 계약은 검증하지 않는다. | mock 런타임 spec 추가: MANAGER/custom grant에서 `/admin/sheet-sync` 메뉴/라우트 허용, 미grant 계정 redirect, `/sales/closing`은 `accounting.period-close` view만으로 표시되는지 확인. 최소한 source regex도 `to=... show={...}` 연결까지 단언. |
| CQA-4 | P3 | `docs/qa/permission-groups-c5-followup/claude-qa-cycle-1.md`, `real-qa-evidence.md` | `git diff --check origin/main...HEAD` 실패. QA 문서 trailing whitespace 10건. | trailing whitespace 제거. Markdown hard-break 의도면 `<br>` 등 명시 표현으로 교체. |

### Claude 발견 평가표

| Claude # | 평가 | 현재 head 기준 판단 |
|---:|---|---|
| 1 DEF-1 | Valid, fix 확인 | V47 직접 seed가 materializer를 안 타는 문제는 실제 403로 타당. 현재 V47 SQL + real QA dev_manager 200 증빙은 수용. 단 IT 가드는 CQA-1 보완 필요. |
| 2 사이드바/라우트 이원화 | Valid, fix 확인 | `showAccountingPeriodClose`, arologis/dispatch SMS dynamic page-code 전환 확인. 런타임 계약은 CQA-3 보완 필요. |
| 3 full-menu-contract stale | Valid | 격리 spec이라 P2 격하 타당. PermissionGuard 단언 갱신 확인. |
| 4 Prometheus authenticated 주석 | Valid | `InternalTokenFilter` 실 게이트 설명과 테스트 단언 확인. |
| 5 `canQuerySales` isSystemMaster 설명 | Valid low | FE snapshot 한계와 MASTER 그룹 대리 판정 주석 확인. |
| 6 `showAdmin` dead block | Valid | dead 빈 블록 제거, 단톡방 MASTER 제외 분기만 잔류 확인. |
| 7 `SalesClosingPage` role 직접 판정 | Valid | `usePermissions().canAccess()` 기반으로 전환 확인. |
| 8 V47 soft-delete 주석 | Valid | partial unique/soft-delete 행 시나리오 주석 확인. |
| 9 AuthFlyway false action 단언 | Valid but incomplete | 잔여 4 action false는 추가됐으나 materialize exactness가 약함. CQA-1. |
| 10 Inventory IT role header 주석 | Valid | role header가 라벨/metric 용도라는 주석 확인. |
| 11 EcountMig 중복 helper | Valid but incomplete | helper 추출은 확인. `X-Is-System-Master`/role-only 계약 공백은 CQA-2. |
| 12 sp-d2 제목 | Valid | "PermissionGuard 단일 게이트" 갱신 확인. |
| 13 HeaderAuthenticationFilterTest 복제 | Invalid as defect | 서비스별 독립 테스트 허용. 15개 파일 모두 `GROUP_...` 보존과 `ROLE_MASTER` 부재를 같이 단언해 품질 충분. |
| 14 Prometheus scrape | Valid non-blocking | 선재 운영 인프라 이슈, 본 PR 회귀 아님. |
| 15 PageCode raw 표시 | Invalid as defect | UUID 아님, MASTER 전용 디버그 문자열로 수용. |

### 판정

**CHANGES REQUESTED**

V47 SQL 자체는 `BOOL_OR` 다중 그룹 합성과 시스템마스터 제외가 `EffectivePermissionMaterializer`의 products.sync 경로와 같은 방향이다. 다만 현재 회귀 가드와 신규 Playwright 계약이 부분 누락을 통과시킬 수 있어, 위 4건은 본 PR에서 즉시 처리 필요. 검증은 read-only 정적 검토와 `git diff --check` 기준이며, sandbox 제약상 테스트 실행은 하지 않았다.
