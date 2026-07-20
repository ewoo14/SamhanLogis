# #825 슬5 — ① null-semantics: '전체'와 '미선택'의 분리 (기획 spec)

> **OPUS 4.8 기획** · 신 캐논(2026-07-20 2차): OPUS 기획(본 spec·조기 PR) → CODEX LUNA 5.6 구현 → **FABLE5 5-agent 적대검증 + SONNET5 fix** → **CODEX SOL 5.6 + LUNA fix** → 0수렴 → PM 종합 머지.
> 에픽 #825(전역 입력 UX) 슬라이스 5. 슬4 에서 `CodefImportScope` 가 본 슬라이스로 이관됨(D-S4-05).

## 0. 문제 — "비어 있음"이 두 의미를 겸한다

세 도메인에서 **빈 값이 '전체'와 '미선택' 두 가지로 해석**되며, 코드는 이를 구별하지 않는다. 실측 확인:

| # | 도메인 | 현행 표현 | 코드 근거 |
|---|---|---|---|
| ① | **일마감** 거래처 | `daily_closings.partner_id` **NULL = 전체 거래처 통합 마감** | `DailyClosing.java:31` `"partnerId NULL = 전체 거래처 통합 마감 snapshot"`, `:73` `@Column(name="partner_id")` nullable |
| ② | **안전재고** 창고 | `warehouseId == null` = 전체 창고 | `SafetyStockService.java:329`, `SafetyStockAlertResponse.java:22` `"warehouseId == null 일 때 '전체' 표기"` |
| ③ | **CODEF 가져오기 범위**(통장/카드/대출) | 선택 리스트 `[]` = 전체 | `CodefImportScopedService.java:76,116` (`isEmpty()` → 전체 materialize) |

**위험**: 사용자가 아무것도 고르지 않고 저장하면 시스템은 이를 **"전체"로 해석**한다. 일마감에서 이는 **의도치 않은 전체 마감**을 뜻하고, 회계 무결성 도메인이라 되돌리기 어렵다(원장 수정 금지 정책 — [[project_accounting_ledger_edit_policy]]).

## 1. 개발책임자 확정 결정 (2026-07-19 배치)

- **명시적 '전체' 칩을 도입** — **칩 0개 = 미선택 = 저장 차단**, '전체' 칩을 넣어야 전체 동작.
- **신규 입력에만 적용.** 기존 `null` 행은 그대로 둔다(조사 결과 dev `daily_closings` 0행·안전재고 `null` 0행).
- **prod cutover 시점에 별도 backfill 마이그레이션**으로 처리. 본 슬라이스 범위 밖.

## 2. 결정 (D-S5)

### D-S5-01 저장 스키마 무변경 — 입력 계약에서만 의도를 강제한다
신규 enum/플래그 컬럼을 **추가하지 않는다**. 대신 **요청 DTO 에 선택 의도를 명시**하게 하고, 저장은 현행 표현(`null` / `[]` = 전체)을 유지한다.
- **근거**: ① 개발책임자 결정이 "신규 입력만·기존 행 유지·backfill 은 cutover 별도" 이므로 **저장 표현을 바꾸면 그 결정과 충돌**한다. ② `daily_closings` 는 마감 스냅샷(감사 도메인)이라 컬럼 추가·의미 변경의 파급이 크다. ③ 목적("실수로 전체마감하는 사고 차단")은 **입력 시점 강제만으로 달성**된다.
- ⟹ 마이그레이션 **0건**. 기존 데이터 **무영향**.

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
- **제외**: backfill 마이그레이션 · 읽기/집계 의미 변경 · 저장 스키마 변경 · 타 도메인의 유사 null(전표 거래처는 별도 슬라이스에서 이미 처리됨).

## 3. 검증

**BE (실 Postgres IT)**
- `scopeMode=SELECTED` + 빈 목록 → **400**(세 도메인 각각).
- `scopeMode=ALL` + 목록 비어있음 → **저장 성공**, 저장된 표현이 현행과 동일(`null` / `[]`).
- `scopeMode=ALL` + 목록에 값 있음 → **400**(모순 입력).
- `scopeMode` 누락 → **400**(무음 폴백 없음).
- **기존 행 무영향**: 기존 `null` 행 조회·집계 결과가 변경 전과 동일함을 단언.
- ⚠️ **anti-false-green**: 각 400 가드를 제거하는 뮤테이션이 **결정적 RED** 여야 한다. `@Valid`/DTO 검증이 실 HTTP 경로에서 동작하는지 **MockMvc 가 아닌 실 요청**으로 확인([[feedback_live_qa_penetrates_it_masking]] — `service.create()` 직접 호출 IT 가 `@Valid` 를 우회해 HIGH 를 마스킹한 전례).

**FE**
- vitest: '전체' 칩 ↔ 개별 선택 상호 배타 · 칩 0개 시 저장 비활성 · 안내 문구 렌더.
- ⚠️ **mock 파리티**: mock 핸들러가 `scopeMode` 를 BE 와 동일 형식으로 제공해야 한다(#832·#854 R5 에서 반복된 함정).
- ⚠️ **design-system 변경 시 Playwright mock 스위트 전체 로컬 실행 필수**([[feedback_design_system_playwright_mock_suite]]). 공용 컴포넌트를 건드리지 않는 것이 원칙이나, 건드리면 590 전량 재실행.

**라이브 QA (실 Docker · 실 GUI)**
- 세 화면에서 ① 칩 0개 → 저장 차단(버튼 비활성 + 문구) ② '전체' 칩 → 저장 성공 ③ 개별 선택 → 저장 성공 을 **실서버 스크린샷 다수**로 캡처.
- 일마감은 회계 무결성 도메인이므로 **throwaway 데이터로만** 수행하고 캡처 후 정리([[feedback_qa_live_shared_data_readonly]]).

## 4. 기존 결정 교차검증 ([[feedback_spec_cross_check_prior_decisions]])
- 슬4 `D-S4-05` — CodefImportScope 를 본 슬라이스로 이관: **준수**.
- 2026-07-19 결정 배치 — "신규 입력만·기존 null 유지·cutover backfill 별도": **D-S5-01/04 가 그대로 구현**.
- 회계 원장 수정 금지([[project_accounting_ledger_edit_policy]]) — 마감 스냅샷 스키마·기존 행 무변경으로 **저촉 없음**.
- 칩 UI 는 슬4 컴포넌트 재사용([[feedback_chip_ui_multi_input]]) — 신규 공용 컴포넌트 금지.

## 5. 범위 동결 (2026-07-20 결정)
리뷰가 발견한 **슬라이스 자체 코드의 결함**은 현 PR 에서 fix 한다. **새 기능·새 표면 추가 제안은 이슈 등록 + 다음 슬라이스가 기본값**이며, 현 PR 편입은 개발책임자 명시 결정 + PM 의 비용(라운드 1회 ≈ 3~4시간) 선제시가 있어야 한다. → [[feedback_throughput_parallel_scope_freeze_batch]]
