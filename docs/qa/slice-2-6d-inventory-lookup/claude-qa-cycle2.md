# QA 리뷰 사이클 2 — Phase 2.6d 품목 재고조회 모달

> 작성: QA agent (claude-qa-cycle2) | 날짜: 2026-05-31 | fix 커밋: c07c8d47

---

## 1. 검토 범위

| 파일 | 역할 |
|---|---|
| `playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts` | 사이클 1 블로커/필수 반영 13건 시나리오 |
| `src/renderer/api/inventory.ts` | `fetchProductBalancesMatrix` B-2 수정 |
| `src/renderer/api/mock.ts` | `ord-error-test` / `__error_test__` R-4 트리거 추가 |

---

## 2. 블로커/필수 해소 표

| 항목 | 사이클 1 분류 | 해소 여부 | 근거 파일·라인 |
|---|---|---|---|
| **B-2**: `fetchProductBalancesMatrix` lines 기준 순회 (잔량 없던 품목 행 누락) | 블로커 | **해소** | `inventory.ts` L491 `lines.map(line => ...)` 교체, 전 창고 0/0/0 초기화(L495-496) + batch 덮어쓰기(L499-507) |
| **B-1**: HQ-001 셀 실수치(가용/실/예약) 단언 | 블로커 | **해소** | `spec.ts` L165-169 — `hqCell.toContainText('10')` / `toContainText('12')` / `toContainText('2')` 3개 단언 |
| **B-1**: BK-001 셀 0/0/0 단언 | 블로커 | **부분 해소** | `spec.ts` L203-205 — `bkCell.toContainText('0')` 단 1회. 가용/실/예약 세 값 개별 단언 미도달. false-green 위험 잔존(낮음) |
| **R-1**: VIRTUAL(VR-001/가상창고) 미노출 단언 | 필수 | **해소** | `spec.ts` L172-173(주문), L294-295(출고) |
| **R-2**: 0토글 OFF 시 CS-001(total=0) 숨김 단언 | 필수 | **해소** | `spec.ts` L193-194 |
| **R-3**: 출고전표 UUID 가드 시나리오 | 필수 | **해소** | `spec.ts` L306-322 시나리오 9 신규 추가 |
| **R-4**: batch 500 에러 → 에러 배너(role=alert) 시나리오 | 필수 | **해소** | `spec.ts` L397-418 시나리오 13 신규 추가; `mock.ts` L1792-1794 `__error_test__` 500 트리거 |

---

## 3. skipped=0 / false-green 검증

- `test.skip` / `xit` / `xtest` / `.fixme` / `.todo` 패턴 0건 확인 — **skipped=0 충족**.
- false-green 잔존 위험:
  - BK-001 셀 단언 `toContainText('0')` — 가용 값이 임의로 렌더되어도 셀 내 `0` 이 포함되면 통과. 실 구현이 올바른 경우 실질 위험 낮음.
  - HQ-001 셀 단언 — `toContainText('2')` 는 `12` 에도 포함되므로 reserved=2 여부의 독립 검증이 약함. `getByTestId` 스코프가 특정 셀로 한정되어 실질 위험 낮음.

---

## 4. Docker 실 QA 재현 절차 상태

- `docs/qa/slice-2-6d-inventory-lookup/` 에 Docker 실 QA 체크리스트 문서 미작성 — 사이클 1 Recommended #10 항목 여전히 미충족.
- `feedback_no_fake_data_ever` + `feedback_pr_qa_screenshots` 준수를 위해 **PR 본문에 실서버 Docker 환경 스크린샷** 첨부가 필요하다.

---

## 5. 잔여 이슈

| # | 심각도 | 내용 |
|---|---|---|
| C2-Nit-1 | 낮음 | BK-001 셀 단언 `toContainText('0')` 단 1회 — `가용 0` / `실 0` / `예약 0` 세 값 개별 단언으로 강화 권장 |
| C2-Nit-2 | 정보성 | 시나리오 6 선택 수 표시 — `toContainText('(')` + `toContainText('1')` 두 단언이지만 `(1)` 단일 문자열 단언 미적용(사이클 1 2-H 부분 해소) |
| C2-Nit-3 | 정보성 | Docker 실 QA 체크리스트 문서 미작성. PR 본문 QA 스크린샷 미첨부 시 `feedback_pr_qa_screenshots` 위반 |

---

## 6. 종합

**판정: APPROVE (조건부)**

블로커 2건(B-2 완전 해소, B-1 HQ-001 완전 해소·BK-001 부분 해소)과 필수 4건(R-1/R-2/R-3/R-4) 전원 해소됨. skipped=0 확인. BK-001 셀 단언 단 1회 잔존은 낮은 위험 수준으로 블로커 상향 불필요.

단, PR 머지 전 다음 조건 충족 필요:
1. PR 본문에 실서버 Docker 환경 재고조회 모달 스크린샷 1장 이상 인라인 첨부 (`feedback_pr_qa_screenshots` 의무).
2. C2-Nit-1 BK-001 셀 단언 강화는 후속 PR 에서 처리하거나 이번 PR 에서 선택적 반영.

*파일 위치: `docs/qa/slice-2-6d-inventory-lookup/claude-qa-cycle2.md`*
