# Designer Cycle 1 리뷰 — Audit Slice 5 P2 Minor Cleanup
> 작성일: 2026-05-19 | 담당: Designer Agent

---

## 검증 대상

`clients/web/design-system/src/components/Badge/Badge.module.css`

PR #256 에서 `.variant-success` 및 `.variant-warning` 의 RGB 하드코딩을 디자인 토큰으로 교체한 변경을 검증한다.

---

## 1. 변경 전/후 비교

### `.variant-success`

| 항목 | 변경 전 (_codex_commit_repo) | 변경 후 (현재) |
|---|---|---|
| background-color | `rgba(42, 157, 143, 0.12)` | `var(--color-success-50)` |
| border-color | `rgba(42, 157, 143, 0.32)` | `var(--color-success-200)` |
| color | `var(--color-success)` | `var(--color-success)` (유지) |

### `.variant-warning`

| 항목 | 변경 전 (_codex_commit_repo) | 변경 후 (현재) |
|---|---|---|
| background-color | `rgba(233, 165, 61, 0.14)` | `var(--color-warning-50)` |
| border-color | `rgba(233, 165, 61, 0.36)` | `var(--color-warning-200)` |
| color | `#8A5A12` (하드코딩) | `var(--color-warning-800)` |

---

## 2. 토큰 존재 검증

`tokens.css` `:root` 블록에서 해당 토큰 직접 확인:

| 토큰 | 값 | 존재 여부 |
|---|---|---|
| `--color-success-50` | `#ecfdf5` | 확인 (line 38) |
| `--color-success-200` | `#a7f3d0` | 확인 (line 39) |
| `--color-warning-50` | `#FEF6E7` | 확인 (line 43) |
| `--color-warning-200` | `#F8DA9A` | 확인 (line 44) |
| `--color-warning-800` | `#8C5C13` | 확인 (line 49) |

Scope 에서 명시한 `#8A5A12` (변경 전 하드코딩) vs `#8C5C13` (토큰값) 은 색조 차이 1단계이며, 토큰 기반으로 통일됨으로써 향후 팔레트 업데이트 시 일괄 반영 가능하다.

---

## 3. Dark Mode 일관성

`html[data-theme="dark"]` 블록에서 `--color-success-50`, `--color-success-200`, `--color-warning-50`, `--color-warning-200`, `--color-warning-800` 은 **override 없음** (line 418-477 전수 확인). 따라서 dark mode 시에도 `:root` 라이트 값이 그대로 적용되며 기존 동작과 동일하다. `.variant-warning` 의 `[data-theme='dark']` 전용 color override (`var(--color-warning)`) 는 변경 없이 유지되어 있어 dark mode 텍스트 대비 보존이 확인된다.

---

## 4. 사이드바 / PermissionMatrix 영향

Badge 컴포넌트는 `Badge.tsx` 에서 `variant-success` / `variant-warning` 클래스를 직접 매핑하며, 사이드바 및 PermissionMatrix 는 해당 클래스를 직접 참조하지 않는다 (grep 결과 영향 경로 0건). `VehicleMatchStatusBadge.tsx` 는 독립 컴포넌트로 Badge.module.css 를 사용하지 않아 영향 없음.

---

## 5. 판정

**APPROVED (수정 없음)**

3건의 RGB/하드코딩이 모두 존재하는 토큰으로 정확히 교체되었다. 토큰 값 존재, dark mode override 부재, 영향 범위 0건 모두 검증 완료. `.variant-danger` 의 `rgba(214, 80, 74, ...)` 패턴은 본 PR 스코프 외이며 후속 클린업 대상으로 별도 등록 권고.
