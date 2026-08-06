# PR #1047 / Issue #1012 라운드 fix 보고서

## 범위와 판정

이번 라운드는 우선순위 ① 분류 칩 도달성만 구현했다. ② 레거시 입출고 내역의 월 차원과 ③ 레거시 입출고 분석 항목은 미착수다. 요청된 시간 부족 시 기준에 따라 ①을 완성하고 미착수 범위를 숨기지 않는다.

## ① 원인

`filterInOutRows`는 선택 칩과 행의 `chips` 교집합이 없으면 행을 제거한다. 확정 원천 82라인이 모델 61행으로 정상 집계된 현재 실 DB 상태에서는 `products.model_name`, `slip_lines.category_key`, 품목명 보조 분류가 모두 0/61이므로 61행의 `chips`가 전부 빈 집합이다. 그 결과 무필터 61행이 어떤 칩을 선택해도 0행이 됐다.

행 집계(82라인 → 61행)는 변경하지 않았다. 분류 근거가 없는 행에 임의 분류를 부여하지 않고, 선택 필터에서 해당 행을 보존하는 fail-open 규칙을 적용했다.

## ② RED 원문

fix 전 테스트를 추가하고 대상 워크트리에서 실행했다.

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1012b/clients/desktop

❯ src/renderer/routes/warehouse/inoutAnalysisModel.test.ts (6 tests | 1 failed)
× 분류 근거가 없는 행은 칩 선택으로 사라지지 않는다
  → expected [] to have a length of 1 but got +0

AssertionError: expected [] to have a length of 1 but got +0
  at src/renderer/routes/warehouse/inoutAnalysisModel.test.ts:27:53

Test Files  1 failed (1)
Tests       1 failed | 5 passed (6)
```

처음 표준 `npm test`는 stale `out/main/index.js` 신선도 게이트로 중단됐고, 이는 코드 테스트 실패가 아니었다. RED 원문은 게이트를 우회한 임의 실행이 아니라 대상 테스트의 실제 실패 결과다.

## ③ fix

`filterInOutRows`에서 계산된 칩 집합이 빈 경우 `true`를 반환한다.

- 정본/라인/품목명 중 하나라도 분류 근거가 있으면 기존 OR 매칭을 유지한다.
- 세 source가 모두 비어 있는 구 저장 행은 선택 칩 때문에 사라지지 않는다.
- 무필터 전체 반환과 행 집계는 그대로다.
- 임의의 여섯 분류를 행에 기록하거나 다른 화면·필터 계약을 변경하지 않았다.

## ④ GREEN 원문

```text
RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t1012b/clients/desktop

✓ src/renderer/routes/warehouse/inoutAnalysisModel.test.ts (7 tests)

Test Files  1 passed (1)
Tests       7 passed (7)
```

61행 fixture에서 여섯 칩 각각을 선택한 결과도 61행으로 통과했다.

## ⑤ 불변식 실측

### 1. 칩별 매칭 건수

이번 테스트 fixture는 실제 API 응답이 만들 수 있는 상태인 `modelCode/productName/categoryKey=null` 61행이다. `modelChips`의 품목명·상품 대분류 source가 모두 비어 있는 상태를 그대로 만들었다.

| 칩 | 선택 후 매칭 행 | 무필터 기준 | 판정 |
|---|---:|---:|---|
| 실외기 | 61 | 61 | 통과 |
| 실내기 | 61 | 61 | 통과 |
| 홈멀티 | 61 | 61 | 통과 |
| 싱글중대형 | 61 | 61 | 통과 |
| 상업멀티 | 61 | 61 | 통과 |
| 판넬 | 61 | 61 | 통과 |
| 합계(칩별 결과의 합) | 366 | 61 | 칩별 OR 결과 표기 |

여섯 결과의 합계 366은 동일 행이 여러 칩 결과에 중복 포함되는 합산값이다. 요구된 “합계가 61행을 덮는가”는 칩별 결과 각각이 61행을 보존하는지로 측정했으며, 어느 칩도 0행이 아니다. 실제 분류 근거가 있는 행은 기존 매칭만 통과하므로 정상 분류 행을 다른 칩에 임의로 노출하지 않는다.

### 2. 행 집계

| 원천 라인 | 무필터 모델 행 | fix 후 무필터 모델 행 |
|---:|---:|---:|
| 82 | 61 | 61 |

82 → 61 축약은 유지됐다. 이 라운드의 변경은 filter 단계뿐이다.

### 3. 레거시 내역(19) 월 차원

미착수. 기존 조사에서 확인한 실 DB 모델-월 점은 79점(4개월)이며, 이번 코드에는 월 필드를 추가하지 않았다. 따라서 표현 점 수는 **0/79**, 미충족이다.

### 4. 레거시 분석(20) 항목

미착수. 전년/당년 출고 추이, 수요예측, Top 3, Bottom 3, 추천·알림의 산출·표현 건수는 모두 **0건 구현**이다.

### 5. 다른 화면·필터 차단 여부

| 검증 대상 | 결과 |
|---|---|
| 분류 근거가 있는 `실외기` 행의 `홈멀티` 선택 | 기존처럼 제외 |
| 분류 근거가 있는 `판넬 + COMMERCIAL_MULTI` 행의 `실외기/판넬` 선택 | 기존 OR 매칭 유지 |
| 분류 근거가 없는 레거시 행의 칩 선택 | 행 보존 |
| 무필터 | 원본 배열 그대로 반환 |
| 다른 화면/API | 변경 없음 |

## ⑥ 모듈 전체 테스트

- `clients/desktop`: `npm run build` — exit 0.
- `clients/desktop`: `npm test` — exit 0, 실패 0. 전체 Vitest 실행 완료.
- `clients/desktop`: `npm run typecheck` — exit 0.
- 대상 회귀: `npx vitest run src/renderer/routes/warehouse/inoutAnalysisModel.test.ts` — 7/7 통과.
- Docker 이미지 재빌드, DB write/DDL, 게이트웨이 실호출은 하지 않았다.

## ⑦ 파일별 변경량

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.ts` | +3 | -0 |
| `clients/desktop/src/renderer/routes/warehouse/inoutAnalysisModel.test.ts` | +23 | -0 |
| `docs/dev-reports/2026-08-02-1012-r2-chip-reachability-fix.md` | +78 (신규) | -0 |

## 새로 만든 파일

- `docs/dev-reports/2026-08-02-1012-r2-chip-reachability-fix.md`

기존 파일 2개는 수정했고, 커밋·푸시·브랜치 조작은 수행하지 않았다.
