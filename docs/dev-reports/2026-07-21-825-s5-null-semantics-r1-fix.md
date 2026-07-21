# #825 슬5 null-semantics — FABLE5 R1 적대검증 fix 보고서

기준일: 2026-07-21
범위: accounting-service(CODEF scope_mode·일마감) · inventory-service(안전재고) · desktop FE 3화면 · design-system `TagChip`
대상 PR: #864 (연관 Issue #825)
담당: SONNET5 — FABLE5 R1 라운드 fix

## 0. 배경

OPUS 4.8 기획(spec) → CODEX LUNA 5.6 구현(commit `e63aac28c`) 이후 FABLE5 1차 적대검증(6차원)이
발견한 결함을 본 라운드에서 fix 했다. 핵심 발견은 spec §0 표 ③("CODEF 선택 리스트 `[]` = 전체")이
**실측 오류**였다는 점이다 — 실제로는 `CodefImportScopedService.resolveRefs` 에서 refs 가 모두
`null`(필드 부재)일 때만 진짜 전체 열거가 일어나고, 저장된 selections 의 `[]` 는 그 자체로 전체를
뜻하지 않는다. 이 오독 위에 세운 D-S5-01("CODEF 도 저장 스키마 무변경")이 ALL 저장 직후 가져오기가
자기모순으로 400 나는 BLOCKING 결함의 근본 원인이었다.

## 1. 결정 1 — CODEF `scope_mode` 컬럼 추가 (D-S5-01 CODEF 한정 번복)

- **마이그레이션**: `V64__add_user_codef_import_scope_mode.sql`(accounting-service). V63
  `widen_accounting_partner_code_100` 이 직전 최신임을 디렉토리 실측 후 V64 채택.
  `ALTER TABLE user_codef_import_scope ADD COLUMN scope_mode VARCHAR(20)` → 기존 행
  `UPDATE ... SET scope_mode='SELECTED' WHERE scope_mode IS NULL`(소급 각인 금지 — ALL 로 단정하지
  않고 보수적으로 SELECTED 채택, refs 비어있는 기존 행은 오늘과 동일하게 "저장 선택 비어있음" 거부가
  유지되어 회귀 없음) → `NOT NULL` + `CHECK (scope_mode IN ('ALL','SELECTED'))`.
- **fresh Postgres probe**(Windows skip 가림 방지): `accounting_probe` DB 를 DROP/CREATE 후 V1~V64
  전 파일을 `psql -v ON_ERROR_STOP=1` 로 순서대로(`sort -V`) 적용 — 64개 전부 에러 없이 적용,
  `\d user_codef_import_scope` 로 컬럼/NOT NULL/CHECK 제약 확정.
- **엔티티**: `UserCodefImportScope.scopeMode`(String, 기본값 `"SELECTED"`) 추가.
  `updateSelections(...)` 5번째 인자로 scopeMode 를 받는다.
- **응답 계약(H-4)**: `CodefImportScopeResponse.scopeMode` 추가 — 저장된 행이 없으면(한 번도
  저장한 적 없음) `null`(3-상태: `null`=미저장/`ALL`/`SELECTED`)로 응답해 FE 재방문 복원이 '전체
  저장'과 '미저장'을 정확히 구별하게 한다.

## 2. BLOCKING#1 근본 fix — `CodefImportScopedService.resolveRefs`

`type=ALL` + 세 ref 배열이 모두 explicit `[]`(FE 의 "저장 선택 사용" 신호)인 경우, 저장된 scope 의
`scopeMode` 를 확인한다:
- `scopeMode=ALL` → refs 는 설계상 비어 있으므로 **CODEF 서버 목록 전체 열거**(진짜 전체)로
  materialize. 종전에는 이 케이스도 "저장 선택이 비어 있음" 으로 오판해 400 을 던졌다.
- `scopeMode=SELECTED` → 저장된 ref 목록 사용(기존 동작 유지). refs 가 모두 비어 있으면(정상
  경로로는 D-S5-02 저장 검증상 불가) 방어적으로 기존 400 유지.

`listAllFromCodef` 헬퍼로 "진짜 ALL"(refs 모두 `null`) 분기와 "ALL 저장 scope" 분기가 동일 열거
로직을 공유하도록 리팩터링했다.

## 3. HIGH — design-system `TagChip` 버블링·ARIA 하드닝

`TagChip.tsx`:
- **버블링 근본 fix**: 제거 `<button>` 의 `onClick` 에 `event.stopPropagation()` 추가 — 종전에는
  `onRemove` 실행 후 클릭이 chip 자신의 `onClick`(예: '전체' 재선택)으로 버블링되어 제거 직후
  즉시 재선택되는 결함이 있었다(라이브 QA d1-f1/d2-f1 로 실증).
- **ARIA 중첩 해소**: `onClick`+`role="button"` 을 함께 받는 "누름 가능(pressable)" chip 은
  `role="button"` 을 outer span 이 아닌 라벨/값 텍스트만 감싸는 내부 wrapper 에 부여한다 —
  `role="button"` 요소 내부에 실제 `<button>`(제거 버튼)이 중첩되는 것은 ARIA/HTML 위반이었다.
  내부 wrapper 는 outer 와 동일한 `inline-flex`+`gap` 을 복제해 시각적 레이아웃 변화가 없다.
- **키보드 접근성**: 내부 wrapper 에 `onKeyDown`(Enter/Space → onClick) 추가.
- **`aria-pressed`/`aria-describedby`**: 누름 가능 chip 이 두 속성을 내부 wrapper 로 전달.
- **회귀 무해성**: `onClick`+`role="button"` 조합을 만족하지 못하는 기존 소비처(`onRemove` 전용
  read-only chip — `ApprovalLineConfigPage`/`GroupwareApprovalCreatePage`/`MultiSelectAutocomplete`
  등)는 신규 wrapper 가 활성화되지 않아 종전과 완전히 동일하게 렌더된다.

세 소비처(`CodefImportScopeForm`/`DailyClosingPage`/`SafetyStockAlertsPage`)의 '전체' chip 에
`aria-pressed`/`aria-describedby`(잠긴 사유 힌트 id 연결)를 배선했다.

## 4. item5 — CODEF type seam (화면=SELECTED·0개 ⟺ 실행=전체 어긋남)

`CodefImportScopeForm.buildImportPayload`: 종전에는 `scopeMode=SELECTED` 여도 type 드롭다운
전환으로 현재 보이는 카테고리의 유효 선택이 0건이면 `selectedCount(refs)===0` 분기가 refs 키
자체를 생략(undefined)해, BE 가 "전체 미지정(null)"으로 해석해 서버 전수 열거로 샜다. fix 후에는
`scopeMode` 로 직접 분기해 SELECTED 는 refs 를 **항상 explicit 배열**(0건이면 `[]`)로 보낸다 —
이 슬라이스가 없애려던 바로 그 null-semantics 모호성이 type 전환 경로에서 재발하던 것을 막았다.

## 5. 결정 2 — 안전재고 쓰기 폼 완성 (`SafetyStockAlertsPage.tsx`)

- **ⓐ 권한 게이팅**: `usePermissions().canAccess('inventory.safety-stock','update')` 로 BE
  `@RequirePermission(inventory.safety-stock, UPDATE)` 와 정확히 일치하는 page-code/action 게이팅을
  추가. 미보유 시 폼 전체(제품 선택·범위 chip·창고 select·임계값·저장 버튼) 비활성 + 사유 안내.
- **ⓑ 저장 성공/실패 피드백**: `configMutation` 에 `onError` 가 없어 실패(예: 존재하지 않는
  productId 의 404)가 무피드백(silent)이었다(라이브 QA d2-f3 로 실증). 성공(`.success-banner`,
  대비 5.2:1)·실패(`.error-banner`) 배너를 추가.
- **ⓒ 제품 목록 순환 구조 해소**: 제품 `<select>` 가 `alertsQuery.data`(임계 미만 알림) 에서
  옵션을 파생해, 알림이 뜬 적 없는(=아직 미설정이거나 재고 충분한) 제품은 **최초 임계값을 설정할
  방법이 없는 순환 구조**였다. `ProductAutocomplete`(product-service 실검색, 기존 `SlipFormPage`
  등에서 이미 쓰던 컴포넌트 재사용)로 교체해 임의 제품을 모델명/품목명으로 검색·선택 가능하게
  했다.
- **ⓓ vitest 신설**: `SafetyStockAlertsPage.test.tsx`(7 케이스) — 칩0 잠금, ⓒ 순환 구조 해소(알림
  이력 없는 제품 저장), ⓑ 성공/실패 피드백, TagChip 버블링 fix 통합 회귀, 키보드 접근성, ⓐ 권한
  게이팅.

## 6. item10 — `?? 'ALL'` 무음 폴백 3곳 제거

`DailyClosingPage.tsx`(closeMutation)·`SafetyStockAlertsPage.tsx`(configMutation)·
`CodefImportScopeForm.tsx`(buildScopePayload) 세 곳 모두 `scopeMode ?? 'ALL'` 무음 폴백을
제거하고, `mutationFn` 내부에서 `scopeMode===null` 이면 명시적으로 `throw`(방어 방향=reject) 하도록
바꿨다. 저장/실행 버튼이 이미 `scopeMode!==null` 을 강제하므로 정상 경로로는 도달하지 않는
방어적 가드다.

## 7. item11 — `Input` fullWidth 레이아웃 붕괴 재발

`SafetyStockAlertsPage.tsx` 신규 `<Input type="number">`(임계값)가 기본 `fullWidth=true` 로 인라인
flex 행에서 폭 100%로 늘어나 레이아웃이 붕괴했다 — 같은 PR 이 `DailyClosingPage.tsx:601` 에 이미
박제해 둔 CM4 함정의 재발. `PartnerAutocomplete` 와 달리 `Input` 은 `fullWidth` prop 을 직접
지원하므로, 래퍼 div 대신 `fullWidth={false}` 로 근본 해소했다(동일 원인의 더 직접적인 해법).
`ProductAutocomplete` 는 `fullWidth` prop 이 없어 CM4 그대로(폭 제약 래퍼 div) 적용했다.

## 8. item12 — 대비 미달 + role 남용 통일

- `DailyClosingPage.tsx` 힌트가 `var(--state-warning)`(#F59E0B) 12px 로 흰 배경 대비
  **2.15:1**(AA 4.5:1 미달, 계산 검증)이었다. 세 화면(일마감/안전재고/CODEF) 힌트를
  `var(--ink-secondary, #5C6773)`(대비 5.77:1)로 통일했다(`.codef-import-hint` CSS 클래스 포함).
- 세 힌트 모두 `role="alert"`(긴급/동적 공지 전용) 대신 `role="status"`(polite, 상시 표시 안내에
  맞는 시맨틱)로 통일했다.
- `SafetyStockAlertsPage.tsx` 신규 텍스트(권한 없음 안내)는 `--state-danger`(#EF4444, 대비
  3.76:1, AA 미달)를 쓰지 않고 이 화면이 이미 쓰던 `--color-danger-700`(대비 8.3:1)을 재사용했다.
  성공 배너는 `--state-success`(#10B981, 대비 2.54:1, AA 미달)대신 기존 `.success-banner`
  (`--color-success-700`, 대비 5.2:1)를 재사용했다.

## 9. item13 — 일마감 draft 안내 문구 편향 정정

`execScopeMode===null` 힌트가 "'전체' 칩을 선택하세요" 만 안내해 거래처 지정 의도 사용자를 전체
마감으로 유도했다(회계 무결성 도메인). "전체로 처리하려면 '전체' 칩을 선택하세요. 특정 거래처만
처리하려면 거래처를 선택하세요."로 양쪽 경로를 모두 안내하도록 정정했다(기존 테스트가 의존하는
"'전체' 칩을 선택하세요" 부분 문자열은 그대로 보존).

## 10. mock 파리티 (item7)

`mock.ts`: PUT/GET `/accounting/codef/scopes` 와 POST `/accounting/codef/import-scoped` 를 BE
`resolveRefs` 정정과 1:1로 맞췄다 — 미저장 GET 은 `scopeMode:null`, ALL 저장 scope 는
`explicitEmptySavedScope && saved.scopeMode==='ALL'` 조건에서 `resolveMockCodefRefs` 에 `null`
을 넘겨 "서버 전체 열거" 분기를 강제(기존 헬퍼 재사용, 신규 분기 로직 최소화). `mock.test.ts` 의
"저장된 scope 가 있지만 refs 가 모두 비어 있으면 INVALID_INPUT" 테스트(ALL 저장 시나리오였던
것)를 **BLOCKING#1 fix 확인**(200 성공 + scopeMode round-trip)으로 뒤집고, 방어 가드용 테스트는
mock 내부 상태를 export 없이 직접 조작할 수 없어 재현 불가능함을 확인 후, 대신 "한 번도 저장한
적 없음 → 404" 케이스(기존에 커버리지 0건이던 실제 도달 가능 분기)로 대체했다.

## 11. spec 정정 (item2)

`docs/specs/825-s5-null-semantics-spec.md`:
- §0 표 ③ 을 취소선 + 정정 각주로 수정하고, 상단에 "🚨 R1 정정" 콜아웃을 추가해 실측 오류와
  그 위에 세운 D-S5-01 이 번복된 경위를 기록했다.
- D-S5-01 제목/본문을 "일마감·안전재고 한정"으로 좁히고 CODEF 예외(D-S5-06 참조)를 명시.
- **D-S5-06**(신규) — scope_mode 컬럼 결정·근거·backfill 정책·응답 계약을 기록.
- §3 검증에 "R1 발견·정정" — DTO/서비스 이중 가드가 사실상 동일 문구를 렌더해(GlobalExceptionHandler
  가 `@AssertTrue` 위반과 `BusinessException` 을 유사하게 렌더) MockMvc IT 만으로는 두 뮤테이션을
  구별하지 못했던 점과, 그 대응(순수 `Validator` 직접 호출 유닛 테스트 + `@Valid` 우회 서비스 직접
  호출 유닛 테스트)을 기록.
- §4 교차검증에 D-S5-01 번복이 "결정 충돌"이 아니라 "그 결정을 성립시킨 실측 전제가 오독이었음을
  재확인 후 개발책임자가 정식으로 번복"한 사례임을 명시.

## 12. 뮤테이션 킬 매트릭스 보강 (item6)

`services/accounting-service/src/test/java/.../web/dto/{CreateDailyClosingRequestTest,
CodefImportScopeRequestTest}.java`, `services/inventory-service/.../web/dto/SafetyStockSetRequestTest.java`
(신규) — `jakarta.validation.Validation.buildDefaultValidatorFactory()` 로 서비스/컨트롤러를
전혀 거치지 않고 DTO 를 직접 `Validator` 에 태워 `@NotNull`/`@Pattern`/`@AssertTrue` 각각을
독립적으로 증명한다. 서비스층은 기존 직접-`service.xxx()`-호출 유닛 테스트(`@Valid` 를 우회)가
이미 존재해 유지했다. 검증 결과는 §13 참조.

`CodefImportScopedServiceTest.java`(신규) — BLOCKING#1 fix 를 서비스 유닛 레벨에서 3가지로 증명:
① `scopeMode=ALL` 저장 + explicit-empty refs → CODEF 서버 전체 열거(mock 검증) ② `scopeMode=SELECTED`
저장 → 저장 refs 사용(서버 열거 미호출 검증) ③ `scopeMode=SELECTED` + refs 손상(직접 구성, API로는
도달 불가) → 방어 가드 유지.

`CodefAccountSelectionIT.java`(기존, 광범위 CODEF IT) — V64 컬럼 추가로 raw SQL INSERT(unique
충돌 재현 테스트)가 `scope_mode` NOT NULL 위반으로 깨진 것을 fix(누락 컬럼 추가) — 이 하나의 raw
INSERT 실패가 커넥션/트랜잭션을 오염시켜 클래스 내 18개 테스트가 cascading 실패했었다(단일 근본
원인). `importScopedAllWithEmptyRefsAndEmptySavedScope_returnsClearMessage` 를
BLOCKING#1 fix 확인(200+scopeMode round-trip)으로 재작성하고, 방어 가드 회귀용 신규 테스트를
추가(raw SQL 로 SELECTED+빈 refs 상태 구성).

`CodefImportControllerIT.java` — ALL 저장 직후 가져오기 200(BLOCKING#1)·GET scopeMode round-trip
(H-4)·미저장 scopeMode=null(H-4) 3개 신규 IT.

## 13. 검증 (실행 원문)

### BE gradle (genuine, `--rerun-tasks --no-build-cache`)

```
./gradlew :services:accounting-service:test :services:inventory-service:test --rerun-tasks --no-build-cache
```

1차 실행(캐시 허용)에서 `CodefAccountSelectionIT` 18건 + 무관 `PurchaseAccountingSlipConcurrencyIT`/
`SalesAccountingSlipConcurrencyIT` 2건 실패 발견 → raw SQL INSERT 컬럼 누락 fix 후 재실행
`BUILD SUCCESSFUL in 5m 54s`(0 실패) — concurrency 2건도 재실행에서 자연 소거되어 타 트랙 gradle
자원 경합에 의한 일시적 flakiness 로 판정(본 PR 이 건드리지 않은 파일). 최종 확증
`--rerun-tasks --no-build-cache`(genuine, 캐시 전면 무시) 실행 결과: **`BUILD SUCCESSFUL in 12m 28s`,
0 실패**.

### 마이그레이션 fresh Postgres probe

```
docker exec samhan-postgres psql -U samhan -d postgres -c "DROP DATABASE IF EXISTS accounting_probe;" -c "CREATE DATABASE accounting_probe OWNER samhan;"
for f in $(ls V*.sql | sort -V); do docker exec -i samhan-postgres psql -U samhan -d accounting_probe -v ON_ERROR_STOP=1 < "$f"; done
```
V1~V64 전 파일 에러 0건. `\d user_codef_import_scope` 로 `scope_mode character varying(20) not null`
+ `ck_user_codef_import_scope_mode CHECK (scope_mode::text = ANY (ARRAY['ALL','SELECTED']))` 확정.

### FE

- design-system: `npm run typecheck` 통과 · `npm run test` 23 파일/140 테스트 통과 · `npm run build` 통과.
- desktop: `npm run typecheck` 통과 · `npm run test` 134 파일/1021 테스트 통과(0 실패).
- Playwright mock hard gate: `npx playwright test --config=playwright.config.ts` → **`590 passed (20.4m)`**,
  실패/unexpected/flaky 0건. 실행 후 `docs/qa/**`·`clients/desktop/playwright/**/screenshots/**` 커밋
  스크린샷 원복 + `test-results`/`playwright-report` 정리 완료.

### 뮤테이션 개별 RED 실측

DTO 애노테이션(`@NotNull`/`@Pattern`/`@AssertTrue`) 전체 제거 후 신규 `*RequestTest` 실행,
서비스층 `validateScope(...)` 호출 제거 후 기존 직접-호출 유닛 테스트 실행 — 3 도메인 × 2 레이어
= 6 실험 전부 결정적 RED 확인 후 원복(diff clean 확인):
- CODEF DTO 제거 → `CodefImportScopeRequestTest` 6건 중 4건 FAILED(위반 기대 4건 정확히 실패).
- CODEF 서비스 제거 → `UserCodefImportScopeServiceTest` 1/1 FAILED.
- 일마감 DTO 제거 → `CreateDailyClosingRequestTest` 7건 중 4건 FAILED.
- 일마감 서비스 제거 → `DailyClosingServiceSourceKindTest` 6건 중 1건 FAILED("서비스 이중 가드" 케이스).
- 안전재고 DTO 제거 → `SafetyStockSetRequestTest` 8건 중 4건 FAILED.
- 안전재고 서비스 제거 → `SafetyStockServiceTest` 17건 중 1건 FAILED("서비스 이중 가드" 케이스).

## 14. 남은 우려 (범위 밖 — 개발책임자 처분 대기)

- **CODEF 저장 시 type 필터로 다른 카테고리 선택이 조용히 유실**: `effectiveSelection` 이 저장
  (`buildScopePayload`)에도 사용되며, `type` 드롭다운이 특정 카테고리로 좁혀진 상태에서 저장하면
  다른 카테고리의 기존 선택이 저장 payload 에서 빠진다(화면엔 남아있어 보이지만 저장 안 됨). item5
  와 근접한 계열이나 이번 지시 범위(가져오기 payload)를 벗어나 **범위 밖으로 보류** — 별도 이슈
  등록 권고.
- (기존 pre-existing, 본 라운드 무관) scope 저장 후 쿼리 미무효화/staleTime · `findAlerts` 부분
  miss 시 제품명 전체 미확인화(#773 계열) · 일마감 unlock `partnerCode` null=전체.

## 15. CODEX LUNA R2 fix (2026-07-21)

### R2 발견과 수정

- **BLOCKING-1**: 저장된 CODEF `scopeMode=ALL`을 복원한 뒤 `buildImportPayload()`가 `type='ALL'`
  을 고정하던 결함을 수정했다. 이제 저장된 `defaultImportType`을 `type`으로 전달하고 refs
  필드는 생략한다. 따라서 `CARD+ALL`, `BANK+ALL`, `LOAN+ALL`, `ALL+ALL`은 각각 해당
  범위만 CODEF에서 전체 열거한다. 저장 `SELECTED`는 기존 explicit-empty 저장 ref 경로를 유지한다.
  FE 4조합 테스트와 mock 4조합 테스트를 추가했다.
- **BLOCKING-2**: real-QA `describe.serial` 각 CODEF 테스트가 시작 시 현재 복원 상태를 UI에서
  해제해 미선택 전제를 세우도록 `resetCodefScopeToUnset()`을 추가했다. D3/D3b/D6가 이전
  실행의 ALL 행이나 직전 테스트의 저장 상태에 의존하지 않으며, S4 주석도 실제 refs 생략
  경로와 일치시켰다.
- **V64 롤백 대응**: DB 기본값 `DEFAULT 'SELECTED'`를 채택했다. V64 적용 후 구버전 ORM이
  `scope_mode` 컬럼을 INSERT 목록에서 생략해도 PostgreSQL이 보수적인 SELECTED를 채우므로
  신규 저장이 23502/500으로 깨지지 않는다. 신규 앱의 `scopeMode` 필수 계약과 서비스 가드는
  유지하며, 기본값은 구버전 롤백 호환성 전용이다.
- **기존 빈-ref 행**: `SELECTED + 빈 refs` 복원은 성공으로 표시하지 않고 `role=alert`로
  재선택 필요를 안내하며 저장·가져오기를 잠근다. 항목을 다시 선택하면 저장으로 회복된다.
- **권한/서비스 가드**: 세 화면 전체 칩에서 권한이 없으면 role/tabIndex/handler를 제거하고
  `aria-disabled=true`를 부여했다. CODEF 서비스 테스트에는 null/invalid mode와 `ALL+ref`
  반대 모순을 독립 고정했다.

### R2 검증 원문

아래에는 이번 라운드 실행 결과를 명령 종료 후 그대로 누적한다.

### R2 실제 검증 결과

- 데스크톱 관련 Vitest: `npx vitest run src/renderer/routes/components/CodefImportScopeForm.test.tsx src/renderer/api/mock.test.ts src/renderer/routes/SafetyStockAlertsPage.test.tsx src/renderer/routes/DailyClosingPage.test.tsx` → **4 files passed, 144 tests passed**. 전체 `npm run test`도 exit 0으로 종료했다.
- 데스크톱 typecheck:

  ```text
  > @samhan/desktop@0.1.0 typecheck
  > tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
  ```

  exit 0.
- design-system(`clients/web/design-system`): `npm run typecheck` exit 0, `npm run test` → **23 files passed, 140 tests passed**.
- BE:

  ```text
  ./gradlew :services:accounting-service:test :services:inventory-service:test
  BUILD SUCCESSFUL in 5m 49s
  26 actionable tasks: 3 executed, 1 from cache, 22 up-to-date
  ```

- fresh Postgres probe(`DROP/CREATE` 후 V1~V64를 `psql -v ON_ERROR_STOP=1`로 적용):

  ```text
  APPLY V64__add_user_codef_import_scope_mode.sql
  ALTER TABLE
  UPDATE 0
  ALTER TABLE
  ALTER TABLE
  COMMENT
   column_name |        column_default         | is_nullable
  -------------+------------------------------+-------------
   scope_mode  | 'SELECTED'::character varying | NO
  (1 row)

               conname             | pg_get_constraintdef
  ---------------------------------+---------------------------------------------------------------
   ck_user_codef_import_scope_mode | CHECK (((scope_mode)::text = ANY ((ARRAY['ALL'::character varying, 'SELECTED'::character varying])::text[])))
  (1 row)
  ```

- real-QA 목록 검증:

  ```text
  npx playwright test --config=playwright.config.ts --list playwright/825-s5-null-semantics-real-qa/825-s5-null-semantics-real-qa.spec.ts
  Listing tests:
  Total: 0 tests in 0 files
  DEFAULT_REAL_QA_EXIT=1

  npx playwright test --config=playwright.real-qa.config.ts --list
  Total: 5 tests in 1 file
  REAL_QA_EXIT=0
  ```

- Playwright mock 전량 1차 시도(기존 장기 실행 상태 재사용): `437 passed (19.3m)`, `31 skipped`와 `DC-2` 실패가 발생했다. 이는 최종 fresh webServer/CI reporter 실행으로 재검증·대체했다.

- 후속 분리 재현: 동일 `DC-2` 단독 실행은 새 mock webServer에서 `1 passed (11.8s)`였다. 전량 실행의 실패가 R2 소스 변경 자체인지 재확인하기 위해 fresh webServer 기준 전량을 재실행 중이다.
- fresh webServer 전량 재실행: `Running 590 tests using 1 worker` → **`590 passed (17.3m)`**. 첫 실행의 `DC-2` 실패는 재현되지 않았다. CI JSON reporter와 `assert-playwright-ran.mjs` 원문은 이어서 수집한다.
- 최종 CI reporter 전량: `Running 590 tests using 2 workers` → **`590 passed (9.0m)`**.
- 공식 guard 원문: **`[guard] expected=590 unexpected=0 skipped=0 flaky=0`**, exit 0.
- 최종 정리: 전량 실행이 덮어쓴 `docs/qa/**`와 추적된 `clients/desktop/playwright/**/screenshots/**`만 `git checkout --`로 좁혀 원복했고, 생성된 `test-results`·`playwright-report`·`playwright-json`은 제거했다. real-QA 스펙 파일은 원복하지 않았다.

실행 후 덮어쓴 `docs/qa/**`는 git 기준으로 원복했다. `clients/desktop/playwright/**/screenshots/**`의 추적 변경은 없었다.

## 16. R3 OPUS 4.8 적대검증 HIGH-3 fix — 라이브QA 'fixed-' 증거 정합화 (SONNET5, 2026-07-21)

**발견(R3 통합 차원)**: 위 §3(BLOCKING#1)·§15(R2 BLOCKING-1) 근본 fix 는 실제로 반영됐으나, 그
증거로 스펙에 심어둔 `fixed-*` 스크린샷 6개(`d1-f1-fixed-all-chip-remove-works` 등, R1 이
`defect-*`에서 개명)는 R1·R2 어느 라운드에서도 라이브 서버 재실행이 이뤄지지 않아 실제로는
**0장도 생성되지 않았다.** `docs/qa/825-s5-r1-liveqa/`에 커밋된 32장은 전부 `16cdfb626`(R1 fix
**이전**) 캡처이고, R1·R2 fix 커밋(`5f5d84d3a`/`43905b915`) 자체에는 PNG diff 가 0장이다
(`git show <sha> --name-only | grep -c '\.png$'` 로 실측 가능). 위 §13/§15 의 "라이브 QA
d1-f1/d2-f1/d3-f4 로 실증"이라는 서술은 전부 이 **결함 상태** 캡처를 결함 근거로만 인용한
것으로 인용 자체의 왜곡·은폐는 없었으나, 캐논 "라이브QA 매 라운드 스크린샷 다수" 요구가
R1·R2 2라운드 연속 미충족이었다는 점은 사실이다.

**정정**: R3(OPUS 4.8, QA SHA `4d678167`)가 이 슬라이스 최초로 실서버 재실행을 수행해
`docs/qa/825-s5-r3-liveqa/`에 63장을 커밋했다. 이 스펙의 `SHOTS` 상수(:41)는 여전히
`825-s5-r1-liveqa`를 가리키므로, R3 세션은 그 경로에 직접 캡처(→ 커밋된 R1 스크린샷 23장을
일시적으로 덮어씀) → 새 캡처를 `825-s5-r3-liveqa/official-suite/`로 복사 보존 →
`825-s5-r1-liveqa/`만 좁혀 `git checkout --`로 R1 베이스라인에 원복(diff 0 확인)하는 절차를
거쳤다(R3 보충3 §최종 `git status` 참조). 그 결과:
- `official-suite/d1-f1-fixed-all-chip-remove-works.png`, `official-suite/d2-f1-fixed-all-chip-remove-works.png`
  — 스펙 shot 이름과 **정확히 1:1 일치**하는 fix 확인 캡처.
- CODEF(D3, BLOCKING#1/BLOCKING-1 의 무대)만 스펙 리터럴(`d3-f4-fixed-all-import-succeeds`)과
  파일명이 다르다 — 재실행 시 `official-suite/d3-f4b-success-toast-visible.png`(D3b 시나리오·
  3초 자동소멸 전 성공 토스트 캡처)로 대체돼 있다. 다만 D3 의 fix 증거는 이 한 장이 아니라
  R3 루트의 `c-{bank,card,loan,all}+all-{1..4}.png` 16장(4조합 각각 저장 전/후/복원/실행결과 —
  §HIGH-1 BE fix 라이브 확증과 동일 자료, 화면 요약과 DB 로우수 독립 2원 교차검증 포함)이
  더 넓고 강한 증거를 이룬다 — 단일 shot 부재가 fix 미검증을 뜻하지 않는다.

**결론**: R1이 예고한 "fixed-" 증거는 R1·R2 시점에는 존재하지 않았고, R3에 이르러서야(2개는
동일 파일명으로, CODEF 1개는 더 넓은 대체 자료로) 실제로 확보됐다. 이 절만 그 정합을 사후
기록한다 — 스펙 파일의 shot 리터럴·`SHOTS` 상수 자체는 이번 라운드 fix 범위(문서 정정)
밖이라 손대지 않았다.
