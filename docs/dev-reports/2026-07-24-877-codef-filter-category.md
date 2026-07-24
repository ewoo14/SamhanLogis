# #877 — CODEF 저장 시 type 필터 밖 카테고리 선택 무음 유실

- PR: #918 · 이슈: #877 · 파생 이슈: **#920**(동시성 무음 삭제)
- 기간: 2026-07-23(집PC) ~ 2026-07-24(회사PC)
- 파이프라인: OPUS 기획 → LUNA 구현 → OPUS 1차 → **SOL 2차** → LUNA fix → **OPUS 재수렴(R-1 발견)** → SONNET5 fix → 개발책임자 추가분(마스코트·조건부 컬럼) → **OPUS 재수렴2 3표면** → **SOL 3차** → 양측 0 수렴

---

## 1. 무엇이 문제였나

CODEF 가져오기 범위에서 계좌·카드를 함께 고른 뒤 `범위` 를 좁혀(예: 카드) 저장하면, **필터 밖 카테고리(계좌) 선택이 조용히 사라졌다.** `buildScopePayload` 의 `SELECTED` 분기가 `effectiveSelection(false)`(= 화면 필터 반영)를 저장해 `accountRefs: []` 를 PUT 했고, BE 는 그것을 verbatim 저장했다.

## 2. 무엇을 고쳤나 — 4단계 누적

| # | 변경 | 규모 |
|---|---|---|
| ① **#877 본체** | `buildScopePayload` SELECTED 분기 → `selection`(원본 3배열) | **1줄** |
| ② SOL-877-2 fix | `saveMutation.onSuccess` 에 `queryClient.setQueryData(scopeKey, saved)` | 순증 2줄 |
| ③ **R-1 fix** | `buildImportPayload` 의 **복원 clean SELECTED 분기 삭제** → dirty 경로로 합류 | 순감 4줄 |
| ④ 개발책임자 추가 | 빈 상태 마스코트 중앙 정렬(design-system) + 소스·매칭상태 **조건부** 컬럼 | +38 −10 |

## 3. 🚨 회고 ① — fix 가 스스로 결함을 만들었고, 그것이 진짜 결함이었다

**R-1**: 카드 범위로 저장한 **직후** [가져오기]를 누르면 **화면에 없는 계좌 거래가 실 회계 원장에 적재**됐다.

```
화면: 범위=카드 · 계좌 체크박스 0개
저장 PUT   accountRefs 3개 보존 · type=CARD        ← ①의 의도대로(정상)
가져오기 POST  type=ALL · accountRefs 3개 포함      ← 결함
응답 200  적재 25건  →  DB: CODEF_BANK 15행 실제 적재
```

**원인** — `buildImportPayload` 의 복원 clean SELECTED 분기가 `type:'ALL'` 을 하드코딩하고 저장된 3배열을 전량 보냈다. 그 설계는 *"저장 refs ⊆ defaultImportType"* 이라는 **암묵 불변식**에 기대고 있었는데, **①이 정확히 그 불변식을 깨뜨렸다.**

🔑 **유닛 테스트가 양쪽 반쪽을 각각 green 으로 pin 하고 있었다** — `D-877-01`(저장은 계좌 3개를 PUT 한다)과 `HIGH-4 브랜치 B`(복원 SELECTED 는 `type:'ALL'` 로 실행한다). 각각은 옳고 **합치면 결함**인데 22/22 green 이었다. 단위 테스트로는 구조적으로 못 잡는다.

**fix 는 값 교체가 아니라 분기 삭제**로 했다 — 이미 옳았던 dirty 경로로 합류시켜 *"저장을 눌렀는지"* 라는 **화면에 드러나지 않는 내부 상태가 실행 범위를 분기할 수 없는 구조**로 만들었다.

**선례** — `#825 슬5 R2 BLOCKING-1` 이 같은 계열(*"저장된 범위를 전체로 확대"*)을 **ALL 분기**에서 고쳤는데, 그 fix 가 SELECTED 분기에는 적용돼 있지 않았다.

## 4. 🚨 회고 ② — 기획서의 사전 처분을 PM 이 잘못 승계했다

기획서 §9 는 이 동작을 *"데이터는 올바름 · 라벨만 좁음(무음 유실 아님)"* 으로 규정했고, PM 이 그것을 이어받아 리뷰어들에게 **"토스트 라벨 seam = 재발견 금지"** 로 배포했다. 표면 C 리뷰어가 그 지시에 이의를 제기하며 올렸고 **그게 맞았다** — 결과물은 문구가 아니라 **회계 원장 행 15건**이었다.

⟹ **사전 공개 처분을 승계할 때는 그 처분의 근거 문장까지 검증할 것.** *"데이터는 올바름"* 한 줄이 틀렸다.

## 5. 🚨 회고 ③ — "없애라"를 실측 없이 만족시키지 않았다

개발책임자가 `소스`·`매칭상태` **2열 제거**를 지시했다. PM 이 fix 지시에 *"두 열은 탭이 좁혀진 상태에서만 중복이고 `전체` 탭에서는 유일한 구분 수단일 수 있다 — 먼저 실측하라"* 를 박았고, 구현자가 실측해 **정보 손실을 확정**했다:

```
전체 탭 185건 → CODEF_BANK 85 / CODEF_CARD 60 / CODEF_LOAN 40   ← 실제로 섞임
```

⟹ **조건부 표시**(탭을 좁히면 숨김, 전체 탭에선 유지)로 전환. 개발책임자가 **"조건부 유지"로 확정**했다.
하네스 정본 2-B①(*"'X 를 없애라'는 'X 를 담은 것 전체를 없애라'로 만족된다"*)를 지시 단계에서 차단한 사례다.

## 6. 🚨 회고 ④ — 워크트리가 design-system 변경을 서빙하지 않는다

```
워크트리 dist(11:21)  container-type 매치 1 · emptyCellSticky 1
메인 트리 dist(07-23) container-type 매치 0        ← junction 이 가리키는 곳
curl :5420/styles/global.css?direct | grep -c emptyCellSticky → 0
```

`clients/desktop/node_modules` 가 **메인 트리로의 심링크**라 `@samhan/design-system` 이 메인 트리 dist 로 해석된다. **구현자가 보고한 GREEN 이 `:5420` 에서 재현되지 않았다.** 세 리뷰어가 각자 이 함정을 만나 alias 서버로 우회했고, **PM 도 `:5490` 에 워크트리 dist 를 물려 라이브QA 를 재취득**했다.

⚠️ **결함이 아니라 측정 함정**이다 — CI 는 `npm ci` + `needs: frontend-ds`(사전 빌드)라 배포물에는 반영된다. 다만 **이 워크트리에서 `:5420` 만 보고 낸 design-system 판정은 전부 무효**다.

## 7. 검증

### 도달가능 0 — 양측 수렴
| 라운드 | 결과 |
|---|---|
| OPUS 재수렴2 표면A(design-system blast radius) | **0** — 50라우트 × 61 인스턴스 토글 A/B DIFF 0 |
| OPUS 재수렴2 표면B(조건부 컬럼) | **0** — 16조합 헤더/데이터 정합 |
| OPUS 재수렴2 표면C(선행 fix 무회귀) | **0** — ①②③ 실행 재확인 |
| **SOL 3차** | **0** — 각도 5개 전부 실행 |

### 표면A 가 찾은 유일한 실재 기전과 그 도달성
`container-type: inline-size` 는 **intrinsic sizing 기여도를 0** 으로 만든다 — 폭이 내용으로 결정되는 조상(`max-content`/`fit-content`/`inline-block`/`float`/`absolute`/flex item) 안에 DataTable 이 들어가면 **표가 2px 로 붕괴**한다(실측). 그러나 **61 인스턴스 × 조상 25단계 스캔 결과 해당 조상 0건** ⟹ 도달 불가.

Chromium 실측으로 `container-type` 이 **containing block 도 stacking context 도 만들지 않음**을 확인(대조군 `contain:layout` 은 반응 = 프로브 감도 검증).

### 라이브QA
- PM `:5490`(워크트리 design-system) — 마스코트 라벨 중심 **840 = 보이는 창 중심 840**(scrollLeft 0·max 양쪽), 월별손익분석 1161=1161. **9 passed**
- SOL `:5490` — 4 passed · 16조합 · 모달 안 표 · 375px · 상태머신
- 실 원장 write **0**(import POST 는 전부 `page.route` 가로채 합성 200) · DB 기준선 `85/60/40` 유지 · scope 원복

### 하네스 지표
| 라운드 | 도달가능 | c | r |
|---|---|---|---|
| OPUS 1차 | 0 | — | — |
| SOL 2차 | 2 (pre-existing) | 정의 불가 | 0.00 |
| OPUS 재수렴 | **1 (R-1, 슬라이스 유발)** | 0.50 | **1.00** |
| OPUS 재수렴2 | 0 | **0.00** ✅ | 0 |
| SOL 3차 | 0 | 0.00 | 0 |

`c ≥ 0.45 & r ≥ 0.5` 가 1회 발생했으나 **2연속이 아니라 다음 라운드에 0 으로 떨어져** fix 분할 동결은 발동하지 않았다.

## 8. 파생·이월
- **#920** 두 세션 동시 저장 시 상대 선택 무음 삭제 — pre-existing(낙관적 잠금 부재). 개발책임자 지시로 이슈 등록. **#922 바로빌 전환 시 자연 소멸 가능성** 있어 착수 보류 권고.
- pre-existing 관찰(게이트 아님) — `scopeHint` 3사유 중 2개가 렌더 불가 · 탭 전환 시 선택 전량 유실 · `BANK_TXN_SOURCE_LABEL` 4종 vs BE 5종(`KFTC` 누락).
- `MonthlyIncomeStatementPage` 는 DataTable 을 이중으로 감싸는 유일한 예외라 마스코트 fix 수혜를 온전히 못 받는다(사전 존재 아키텍처).

## 9. 관련
- 기획서 `docs/superpowers/plans/2026-07-24-877-codef-filter-category.md`
- 메모리 `feedback_harness_defect_zero_design`(2-B①·2-B②) · `feedback_pm_verify_what_measurement_proves` · `feedback_design_system_playwright_mock_suite` · `feedback_react_query_freshness_route_param_reset`
- 🔑 **바로빌 전환(#922)** — 이 화면의 데이터 원천이 CODEF → 바로빌로 교체 예정. `source` enum(`CODEF_BANK/CARD/LOAN`)과 그것을 노출하는 열이 개편 대상.
