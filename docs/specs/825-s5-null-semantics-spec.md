# #825 슬5 — ① null-semantics: '전체'와 '미선택'의 분리 (기획 spec)

> **OPUS 4.8 기획** · 신 캐논(2026-07-20 2차): OPUS 기획(본 spec·조기 PR) → CODEX LUNA 5.6 구현 → **FABLE5 5-agent 적대검증 + SONNET5 fix** → **CODEX SOL 5.6 + LUNA fix** → 0수렴 → PM 종합 머지.
> 에픽 #825(전역 입력 UX) 슬라이스 5. 슬4 에서 `CodefImportScope` 가 본 슬라이스로 이관됨(D-S4-05).

> ## 🚨 R1 정정 (2026-07-21 · FABLE5 적대검증 + SONNET5 fix)
>
> **§0 표 ③ "선택 리스트 `[]` = 전체" 는 실측 오류였다.** `CodefImportScopedService.resolveRefs` 를
> 다시 실측하면, 진짜 "전체 materialize"(CODEF 서버 목록 전체 열거)는 세 ref 배열이 모두
> **`null`(필드 자체 부재)** 일 때만 일어난다. 저장된 selections 의 ref 가 **`[]`인 것 자체는
> '전체'를 뜻하지 않는다** — `type=ALL` + explicit `[]` triple 은 "저장된 선택을 사용하라"는
> 별개의 신호였고, 저장된 선택의 refs 가 (어떤 이유로든) 비어 있으면 **무조건 400 거부**했다.
>
> 이 오독 위에 세운 **D-S5-01("저장 스키마 무변경")은 실측을 재확인한 뒤 개발책임자가
> 번복했다(결정 1)** — `[]`가 ALL 과 '미저장' 두 의미를 겸하는 한, ALL 로 저장한 직후
> 저장기반 가져오기가 "저장된 선택이 비어 있습니다" 400 으로 자기모순되는 걸 코드 계약만으로는
> 막을 수 없었다(BLOCKING#1, 라이브 QA d3-f4 로 실증). 아래 §2 D-S5-01/D-S5-06 이 정정된 결정이다.
> 일마감(partner_id)·안전재고(warehouse_id)는 이 정정과 무관 — 원래도 D-S5-04 읽기 의미
> 그대로이며 마이그 없음 유지.

## 0. 문제 — "비어 있음"이 두 의미를 겸한다

세 도메인에서 **빈 값이 '전체'와 '미선택' 두 가지로 해석**되며, 코드는 이를 구별하지 않는다. 실측 확인:

| # | 도메인 | 현행 표현 | 코드 근거 |
|---|---|---|---|
| ① | **일마감** 거래처 | `daily_closings.partner_id` **NULL = 전체 거래처 통합 마감** | `DailyClosing.java:31` `"partnerId NULL = 전체 거래처 통합 마감 snapshot"`, `:73` `@Column(name="partner_id")` nullable |
| ② | **안전재고** 창고 | `warehouseId == null` = 전체 창고 | `SafetyStockService.java:329`, `SafetyStockAlertResponse.java:22` `"warehouseId == null 일 때 '전체' 표기"` |
| ③ | **CODEF 가져오기 범위**(통장/카드/대출) | ~~선택 리스트 `[]` = 전체~~ **[R1 정정] refs 세 배열이 모두 `null`(필드 부재)일 때만 전체 materialize.** 저장 scope 의 refs=`[]` 는 전체를 뜻하지 않으며, scope_mode 로만 판별 가능(§2 D-S5-06) | `CodefImportScopedService.java` `resolveRefs`(정정 후 — `listAllFromCodef` 는 explicit-null triple 경로에서만 호출) |

**위험**: 사용자가 아무것도 고르지 않고 저장하면 시스템은 이를 **"전체"로 해석**한다. 일마감에서 이는 **의도치 않은 전체 마감**을 뜻하고, 회계 무결성 도메인이라 되돌리기 어렵다(원장 수정 금지 정책 — [[project_accounting_ledger_edit_policy]]).

## 1. 개발책임자 확정 결정 (2026-07-19 배치)

- **명시적 '전체' 칩을 도입** — **칩 0개 = 미선택 = 저장 차단**, '전체' 칩을 넣어야 전체 동작.
- **신규 입력에만 적용.** 기존 `null` 행은 그대로 둔다(조사 결과 dev `daily_closings` 0행·안전재고 `null` 0행).
- **prod cutover 시점에 별도 backfill 마이그레이션**으로 처리. 본 슬라이스 범위 밖.

## 2. 결정 (D-S5)

### D-S5-01 저장 스키마 무변경 — 일마감·안전재고 한정 [R1 CODEF 예외로 정정]
신규 enum/플래그 컬럼을 **추가하지 않는다**. 대신 **요청 DTO 에 선택 의도를 명시**하게 하고, 저장은 현행 표현(`null` / `[]` = 전체)을 유지한다.
- **근거**: ① 개발책임자 결정이 "신규 입력만·기존 행 유지·backfill 은 cutover 별도" 이므로 **저장 표현을 바꾸면 그 결정과 충돌**한다. ② `daily_closings` 는 마감 스냅샷(감사 도메인)이라 컬럼 추가·의미 변경의 파급이 크다. ③ 목적("실수로 전체마감하는 사고 차단")은 **입력 시점 강제만으로 달성**된다.
- ⟹ **일마감·안전재고**는 마이그레이션 **0건**. 기존 데이터 **무영향**. (변경 없음)
- 🚨 **[R1 정정] CODEF 는 이 결정에서 제외된다 — D-S5-06 참조.** §0 표 ③ 실측 오류(refs=`[]` 가 전체를 뜻하지 않음) 위에서 "저장 표현 유지만으로 충분하다"고 판단했으나, 실측을 바로잡자 CODEF 는 **scope_mode 를 저장하지 않고는 '전체 저장'과 '미저장'을 구별할 방법이 없다**(ALL 저장 직후 가져오기가 자기모순 400 — BLOCKING#1)는 것이 드러났다. 개발책임자가 CODEF 한정으로 "마이그 0건" 을 번복했다(결정 1, 2026-07-21).

### D-S5-02 요청 계약 = `scopeMode` 명시 필수
세 도메인의 쓰기 요청 DTO 에 **선택 모드를 필수 필드로 추가**한다.
```
scopeMode: ALL | SELECTED     (@NotNull)
```
- `SELECTED` 인데 선택 목록이 비어 있으면 **400 거부**(BE 불변식).
- `ALL` 이면 선택 목록은 비어 있어야 하며, 값이 함께 오면 **400 거부**(모순 입력 차단).
- 기존 API 소비자 호환: **필드 누락 = 400**(무음 폴백 금지). 무음 기본값을 두면 이 슬라이스의 목적 자체가 무너진다.

### D-S5-03 FE = 명시적 '전체' 칩
슬4 의 `MultiSelectAutocomplete`/`FreeTextChipInput` 패턴을 재사용한다(신규 공용 컴포넌트 작성 금지).
- 칩 영역에 **'전체' 칩**을 사용자가 명시적으로 넣을 수 있게 한다. '전체' 칩과 개별 선택은 **상호 배타**(전체를 넣으면 개별 칩 제거·비활성).
- **칩 0개 = 저장 버튼 비활성 + 안내 문구**("전체로 처리하려면 '전체'를 선택하세요"). BE 400 에 의존하지 않고 FE 에서 먼저 막는다(이중 가드).
- 라벨은 한국어, **UUID 미노출**(기존 opaque id 규약 상속).

### D-S5-04 기존 `null` 행의 읽기 의미는 불변
조회·집계 경로는 **현행 그대로** `null`/`[]` 를 '전체'로 읽는다. 본 슬라이스는 **쓰기 경로만** 조인다. 읽기 의미를 함께 바꾸면 기존 행의 해석이 달라져 결정과 충돌한다.

### D-S5-05 범위
- **포함**: accounting-service(일마감 쓰기·CODEF scope 쓰기), inventory-service(안전재고 쓰기), desktop FE 3화면.
- **제외**: backfill 마이그레이션(단, D-S5-06 CODEF scope_mode 컬럼은 신규 컬럼 추가이지 backfill 마이그레이션이 아니다 — 기존 행 값 자체를 소급 재해석하는 backfill 은 여전히 제외) · 읽기/집계 의미 변경 · 일마감·안전재고 저장 스키마 변경 · 타 도메인의 유사 null(전표 거래처는 별도 슬라이스에서 이미 처리됨).

### D-S5-06 [R1 신규] CODEF `user_codef_import_scope.scope_mode` 컬럼 추가
`accounting-service` 다음 Flyway 버전(V64, 실측 — V63 `widen_accounting_partner_code_100` 이 직전 최신)으로 `scope_mode VARCHAR(20) NOT NULL CHECK (IN ('ALL','SELECTED'))` 컬럼을 추가한다.
- **근거**: D-S5-01 정정 사유와 동일 — refs=`[]` 만으로는 ALL 저장과 미저장을 구별할 수 없어 `CodefImportScopedService.resolveRefs` 의 "저장 선택 사용" 분기가 ALL 저장 직후 가져오기를 자기모순으로 거부했다(BLOCKING#1). scope_mode 를 저장해야 그 분기에서 진짜 전체 열거(ALL)와 저장 ref 사용(SELECTED)을 정확히 나눌 수 있다.
- **기존 행 backfill 정책(소급 추정 각인 금지)**: 본 슬라이스 이전에 저장된 행(scopeMode 필드 자체가 없던 시절)은 저장 당시 의도를 코드로 알 수 없다. **`ALL` 로 단정하지 않는다** — 근거 없는 각인은 위조다. 대신 **`SELECTED` 로 보수적 backfill** 한다: 이러면 refs 가 비어 있는 기존 행은 오늘과 동일하게 "저장된 선택이 비어 있습니다" 거부가 유지되어(반대로 `ALL` 로 단정하면 저장 당시 의도치 않았을 수 있는 전체 열거로 동작이 조용히 바뀌는 회귀 위험이 있다) **회귀가 없다**. 사용자가 재저장하면 실제 scope_mode 로 자연스럽게 갱신된다. 근거 SQL 은 `V64__add_user_codef_import_scope_mode.sql` 주석에 동일하게 기록.
- **응답 계약**: `CodefImportScopeResponse` 에 `scopeMode` 를 추가한다. 저장된 행이 없으면(한 번도 저장한 적 없음) `null`(3-상태: `null`=미저장 / `ALL` / `SELECTED`)로 응답해 FE 재방문 복원이 '전체 저장'과 '미저장'을 정확히 구별하게 한다(H-4).
- **D-S5-01/04 와의 관계**: 일마감·안전재고의 읽기 의미(D-S5-04)·저장 스키마(D-S5-01)는 이 결정과 무관하게 그대로다. CODEF 도 **읽기(조회·집계) 의미 자체는 바꾸지 않는다** — scope_mode 는 "저장 선택 사용" 해석 분기를 정확하게 만드는 것이지, 기존 `import`(단일 ref) 등 다른 조회 경로의 null 해석을 바꾸는 것이 아니다.

## 3. 검증

**BE (실 Postgres IT)**
- `scopeMode=SELECTED` + 빈 목록 → **400**(세 도메인 각각).
- `scopeMode=ALL` + 목록 비어있음 → **저장 성공**, 저장된 표현이 현행과 동일(`null` / `[]`).
- `scopeMode=ALL` + 목록에 값 있음 → **400**(모순 입력).
- `scopeMode` 누락 → **400**(무음 폴백 없음).
- **기존 행 무영향**: 기존 `null` 행 조회·집계 결과가 변경 전과 동일함을 단언.
- ⚠️ **anti-false-green**: 각 400 가드를 제거하는 뮤테이션이 **결정적 RED** 여야 한다. `@Valid`/DTO 검증이 실 HTTP 경로에서 동작하는지 **MockMvc 가 아닌 실 요청**으로 확인([[feedback_live_qa_penetrates_it_masking]] — `service.create()` 직접 호출 IT 가 `@Valid` 를 우회해 HIGH 를 마스킹한 전례).
  - **[R1 발견·정정]** 세 DTO 모두 서비스층에 **동일 predicate 를 중복 검증**하는 이중 가드가 있어(GlobalExceptionHandler 가 `@AssertTrue` 위반과 `BusinessException`을 사실상 같은 문구로 렌더), MockMvc IT 만으로는 "DTO 레이어 애노테이션 전체 제거" 뮤테이션과 "서비스층 중복 가드 단독 제거" 뮤테이션을 **구별하지 못한다**(둘 다 400 유지 → false-green). 각 레이어를 독립적으로 죽이려면 ① DTO 레이어는 `jakarta.validation.Validator` 를 **서비스/컨트롤러 우회 직접 호출**하는 순수 유닛 테스트(`CreateDailyClosingRequestTest`/`CodefImportScopeRequestTest`/`SafetyStockSetRequestTest`), ② 서비스 레이어는 **`@Valid` 를 우회하는 직접 `service.xxx()` 호출** 유닛 테스트(이미 존재 — `invalidScopeRejectedBeforeAggregation` 류)가 각각 필요하다.

**FE**
- vitest: '전체' 칩 ↔ 개별 선택 상호 배타 · 칩 0개 시 저장 비활성 · 안내 문구 렌더.
- ⚠️ **mock 파리티**: mock 핸들러가 `scopeMode` 를 BE 와 동일 형식으로 제공해야 한다(#832·#854 R5 에서 반복된 함정).
- ⚠️ **design-system 변경 시 Playwright mock 스위트 전체 로컬 실행 필수**([[feedback_design_system_playwright_mock_suite]]). 공용 컴포넌트를 건드리지 않는 것이 원칙이나, 건드리면 590 전량 재실행.

**라이브 QA (실 Docker · 실 GUI)**
- 세 화면에서 ① 칩 0개 → 저장 차단(버튼 비활성 + 문구) ② '전체' 칩 → 저장 성공 ③ 개별 선택 → 저장 성공 을 **실서버 스크린샷 다수**로 캡처.
- 일마감은 회계 무결성 도메인이므로 **throwaway 데이터로만** 수행하고 캡처 후 정리([[feedback_qa_live_shared_data_readonly]]).

## 4. 기존 결정 교차검증 ([[feedback_spec_cross_check_prior_decisions]])
- 슬4 `D-S4-05` — CodefImportScope 를 본 슬라이스로 이관: **준수**.
- 2026-07-19 결정 배치 — "신규 입력만·기존 null 유지·cutover backfill 별도": **일마감·안전재고는 D-S5-01/04 그대로 구현**. **CODEF 는 R1 에서 개발책임자가 명시적으로 예외 처리했다**(D-S5-06) — "저장 표현 무변경" 자체가 실측 오류(§0 표 ③) 위에 세워진 결정이었음이 드러나, 소급 각인이 아닌 신규 컬럼 추가(기존 행은 보수적 SELECTED backfill, 근거 없는 ALL 단정 금지)로 정정. 즉 "기존 결정과 충돌"이 아니라 "그 결정을 성립시킨 전제 자체가 오독이었음을 재확인 후 개발책임자가 정식으로 번복"한 사례.
- 회계 원장 수정 금지([[project_accounting_ledger_edit_policy]]) — 마감 스냅샷 스키마·기존 행 무변경으로 **저촉 없음**(CODEF 는 원장/마감 도메인이 아니므로 이 정책 대상 밖).
- 칩 UI 는 슬4 컴포넌트 재사용([[feedback_chip_ui_multi_input]]) — 신규 공용 컴포넌트 금지. **[R1]** `TagChip` 자체에 버블링·ARIA 결함이 있어 design-system 레벨에서 fix(신규 컴포넌트 아님 — 기존 컴포넌트 hardening).

## 5. 범위 동결 (2026-07-20 결정)
리뷰가 발견한 **슬라이스 자체 코드의 결함**은 현 PR 에서 fix 한다. **새 기능·새 표면 추가 제안은 이슈 등록 + 다음 슬라이스가 기본값**이며, 현 PR 편입은 개발책임자 명시 결정 + PM 의 비용(라운드 1회 ≈ 3~4시간) 선제시가 있어야 한다. → [[feedback_throughput_parallel_scope_freeze_batch]]
