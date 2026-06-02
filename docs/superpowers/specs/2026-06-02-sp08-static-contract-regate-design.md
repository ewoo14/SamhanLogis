# Slice 3-A2-① : 정적계약 스펙 재게이트 — 설계 (Spec)

- 작성일: 2026-06-02
- 슬라이스: 3-A2 후속 ① (정적계약 배치)
- 선행: #344 (3-A2 desktop Playwright CI hard gate — QUARANTINE 39 파일 투명 격리)
- 성격: 테스트 부채 청산 (FE 테스트 스펙 수리 + 재게이트). 프로덕션 코드 무변경 원칙.

---

## 1. 배경

#344(3-A2)는 `clients/desktop/playwright/**` 신규 mock 회귀 스펙을 CI hard gate로 묶으면서,
기존 미실행 레거시 스펙 39개(77 fail)를 **파일 단위** `testIgnore`로 투명 격리(QUARANTINE)했다.
파일 단위 격리라, 격리 파일 안에서 통과하던 개별 test도 동반 제외되어 게이트 수집이 416 → 171로 줄었다.

본 슬라이스는 그 39개 중 **순수 정적계약 성격(브라우저 불요 · 백엔드/FE 소스를 읽어 문자열 포함을 단언) 22개**를
verify-then-fix로 수리하고 `testIgnore`에서 제거하여 게이트 커버리지를 복원한다.
RBAC·드리프트UI 브라우저 스펙과 sp-09 vendor shell은 후속 슬라이스(범주별 독립 PR)로 분리한다.

### 1.1 triage 핵심 결론 (2026-06-02 전수 실행)

- **확정된 실 회귀(REAL_REGRESSION)는 0건.**
- 22개 정적계약 파일의 실패는 거의 전부 **단일 의도된 변경**에서 비롯한다:
  Phase 1 권한 재편(#316)이 Spring Security `@PreAuthorize("hasAnyRole('A','B')")` 정적 가드를
  애너테이션 기반 `@RequirePermission(page=..., action=PermissionAction.X)` 동적 가드로 교체했고,
  스펙들이 옛 `hasAnyRole(...)` 문자열을 grep 하므로 전부 실패한다.
  → 20개 버그가 아니라 1개 리팩터의 그림자다.
- 검증: partner-order-service main java 에 `@RequirePermission` 실재 / `hasAnyRole` 0건 확인.

---

## 2. 범위

### 2.1 대상 22파일 (수리 + 재게이트)

모두 브라우저 불요. dev server(vite mock) 기동과 무관하게 결과가 결정적이다.

**sp-08 정적계약 (17)**
`sp-08-3-2-arologis-history`, `sp-08-3-3-slip-cleanup-history`, `sp-08-3-4-dispatch-sms-history`,
`sp-08-3-dispatch-parity`, `sp-08-4-1-partner-order-list-detail`, `sp-08-4-2-partner-order-edit-put`,
`sp-08-4-3-order-delete-and-estimate-convert`, `sp-08-4-4-order-print-form`,
`sp-08-5-1-purchase-slip-list-detail`, `sp-08-5-2-purchase-slip-edit-put`,
`sp-08-5-3-purchase-slip-soft-delete`, `sp-08-5-5-purchase-print-form`,
`sp-08-6-1-sales-slip-list-detail`, `sp-08-6-2-sales-slip-edit-put`,
`sp-08-6-3-sales-slip-soft-delete`, `sp-08-6-4-sales-print-form`, `sp-08-6-5-accounting-daily-ledger`

**동일성격 정적계약 (5)**
`operational`(env 템플릿 grep), `partner-ui-menu-gap`(requiredRole prop grep),
`purchase-inspection-cta`(`void slipsQuery.refetch()` — sp-08-5-1과 동일 수정),
`sp-06-notion-db-crud`(StripPrefix 주석 단언 과대), `sp-d6-1-permission-migration`(SYSTEM_ONLY_PAGES 리네임)

### 2.2 별도 처리

- **삭제**: `sp-08-legacy-gas-db-api-parity`
  스펙이 `tools/legacy-gas` 로컬/외부 raw 스냅샷을 `fs.readFileSync` 하는데 그 트리는 repo에 커밋된 적이 없다
  (삭제 이력도 없음 = 처음부터 로컬 전용). CI 게이트가 원천적으로 불가하므로 스펙 디렉토리를 삭제하고
  `testIgnore` 항목도 제거한다. legacy GAS parity 검증은 운영 raw DB 트랙으로 대체한다.
- **이연**: `sp-08-6-6-tax-invoice-emit`
  유일한 브라우저 selector 테스트(2/11 fail — "신규 작성" 버튼/컬럼 라벨 미표시). 성격이 브라우저+mock 수리라
  다음 "브라우저 배치" 슬라이스로 이연하고 `testIgnore`에 유지한다.

### 2.3 비대상 (후속 슬라이스)

- 브라우저 selector/mock 드리프트: admin-hr, tax-invoice-batch, supplier-profile, phase-2-5, phase-2-6c,
  permission-overhaul/applayout, sp-09-1/2/3, sp-08-6-6
- RBAC 거동 드리프트: sp-d1, sp-d2(`|| true` self-flag 제거 포함), sp-d3 (sp-d4는 이미 전량 pass)
- 폐기/이연 후보: sp-09-4(KFTC detail-modal = Phase 11 미구현), sp-09-5(미구현 OCR 의존 + `fileInput.isAttached` API 오용)

---

## 3. 처리 분류 (verify-then-fix)

| 클래스 | 해당 파일(예) | 실패 양상 | 처리 |
|---|---|---|---|
| **A. RBAC 마이그레이션 드리프트** | 3-2, 3-3, 3-4, 4-2, 4-3, 4-4, 5-2, 5-3, 6-2, 6-3, 6-5, partner-ui-menu-gap, sp-d6-1 | `hasAnyRole('X','Y')` / `@PreAuthorize` 문자열 부재 | 컨트롤러의 현 `@RequirePermission(page, action)`을 소스로 확인하여 단언 교체. **page/action 정확성 검증** |
| **B. 이름/라벨 드리프트** | 4-1(`findDetailById`/var), 5-1·purchase-inspection-cta(`void slipsQuery.refetch()`), 6-1(`SAVED:'저장'`), operational(env 키), sp-06(StripPrefix 과대단언) | 메서드/변수/라벨/주석 변경 | 현 소스 확인 후 단언 갱신. 단언 범위가 과대하면 정밀화 |
| **C. 경로 ENOENT** | 6-2(`SalesSlipUpdateIT.java` 이동) | `fs.readFileSync` ENOENT | IT 파일 새 경로로 repoint |
| **D. 정적 소스 재구성** | 5-5(print CSS/`window.print()` 이동), 6-4(invoice useQuery 이동) | 단언 대상 코드가 다른 파일/위치로 이동 | 현 위치 확인 후 단언 갱신 |
| **E. 역(negative) 단언 플립** | 3-dispatch-parity(`not.toContain "/arologis/dispatch-sms/send"` — 라우트가 이제 존재) | 금지하던 패턴이 출현 | **회귀 가능성 최우선 검토.** 라우트 추가가 의도된 기능이면 단언 갱신, 아니면 회귀로 플래그 |

---

## 4. 핵심 원칙 — verify-then-fix

단순 문자열 swap을 금지한다. `hasAnyRole('SALES','MANAGER','MASTER')`를 기계적으로 `@RequirePermission`으로 바꾸면
**"이 역할들이 접근 가능"이라는 계약 의미가 증발**한다(역할↔권한 매핑이 컨트롤러 애너테이션에서 DB seed 로 이동했기 때문).

따라서 각 파일마다:

1. 컨트롤러의 새 `@RequirePermission(page=X, action=Y)`가 **올바른 page/action 인지** 실제 소스로 확인한다.
2. 단언을 "이 endpoint 는 권한 가드된다 + page/action 이 이것이다"를 검증하도록 갱신한다.
3. PR 본문에 파일별 **"드리프트 vs 회귀" 판정 근거를 1줄** 남긴다(E 클래스는 상세히).

근거: [[feedback_enforcement_real_http_test]] / [[feedback_ci_test_filter_false_green]] 계열 false-green 경계.

---

## 5. 재게이트 절차

1. 수정한 22파일 각각의 `clients/desktop/playwright.config.ts` `testIgnore` 항목(`'**/<dir>/**'`)을 제거한다.
2. `sp-08-legacy-gas-db-api-parity`: 스펙 디렉토리 삭제 + `testIgnore` 항목 제거.
3. `sp-08-6-6-tax-invoice-emit`: `testIgnore` 유지(이연).
4. 게이트 전체 재실행 → 신규 복귀 파일 전량 green + **skipped=0** 확인.
   `scripts/assert-playwright-ran.mjs`가 `expected===0`/`unexpected>0`/`skipped>0` 시 실패시키므로
   silent skip 으로 false-green 이 새어나갈 수 없다.

> ⚠️ 회귀 방지: 재게이트로 복귀하는 것은 수리한 파일의 실패 test 뿐 아니라 그 파일 안에서 이미 통과하던 test 도 포함된다(파일 단위 격리의 역).

---

## 6. 워크플로우 & 검증

- **구현 주체**: Codex 디스패치([[feedback_codex_implements_claude_reviews]]). 단언 갱신·스펙 삭제·`testIgnore` 편집은 Codex.
  Claude 는 기획·verify-then-fix 판정·dual 5-agent 리뷰. 파일 수정만 Codex, commit 은 Claude 대행([[feedback_codex_sandbox_git]]).
- **PR 조기 발행**: 1차 push 직후 즉시 PR, 리뷰/CI는 열린 PR 위 후속 커밋([[feedback_open_pr_early]]).
- **dual 5-agent 사이클 N=2**([[feedback_cycle_n2_mandatory]]): Claude 5-agent → fix → Codex 5-section → fix.
  verify-then-fix 판정의 false-green 여부를 양쪽 cross-check.
- **검증 범위**: 정적계약 스펙은 소스 grep 단언이라 런타임 미관여 → **Docker 실 QA 불요**(dev-report 에 사유 명시).
  검증은 로컬 게이트 전수 green + CI `Desktop Playwright` 잡 green(skipped=0)으로 한다.
- **문서 동기화**([[feedback_continuous_docs_sync]]): dev-report `slice-3-a2-desktop-playwright-ci-gate.md` 추적목록에서
  복귀 22파일 체크 + 신규 dev-report + DECISIONS(legacy-gas 삭제 근거, verify-then-fix 판정 요약) + 핸드오프 갱신.

---

## 7. 완료 기준 (Acceptance)

1. 대상 22파일이 `testIgnore`에서 제거되고 게이트에서 **수집·실행·전량 green**.
2. `sp-08-legacy-gas-db-api-parity` 삭제 완료 + `testIgnore` 항목 제거.
3. `sp-08-6-6-tax-invoice-emit`는 `testIgnore` 유지(이연).
4. 게이트 재실행 결과 **skipped=0**, `assert-playwright-ran.mjs` 가드 통과.
5. 프로덕션 코드 무변경(스펙 외 수정이 발생하면 = 실 회귀 발견 → 별도 명시·검토).
6. PR 본문에 파일별 "드리프트 vs 회귀" 판정 근거 표 + CI green.
7. dev-report 추적목록 갱신(복귀 22 / 삭제 1 / 이연 1 / 잔여 후속 명시).

## 8. 위험 & 완화

| 위험 | 완화 |
|---|---|
| 단순 swap 으로 회귀를 false-green 처리 | verify-then-fix 의무 + PR 판정 근거 + dual N=2 cross-check |
| E 클래스(역단언 플립)가 실 회귀 은폐 | 최우선 정밀 검토, 라우트 추가의 의도성 소스/PR 이력으로 확인 |
| page/action 오매핑 | 컨트롤러 실제 애너테이션 값으로 단언, 권한 seed(auth V39+)와 교차 확인 |
| 재게이트 후 환경 의존 flaky | 정적 grep 스펙은 환경 비의존 — flaky 위험 최소(브라우저 배치 슬라이스와 분리한 이유) |

## 9. 결정 기록 (DECISIONS 예정)

- D-3A2R-01: legacy-gas parity 스펙 **삭제** — 커밋되지 않은 로컬 raw 스냅샷 의존으로 CI 게이트 불가.
- D-3A2R-02: sp-08-6-6 **이연** — 유일 브라우저 selector 테스트, 다음 브라우저 배치로 분리.
- D-3A2R-03: 정적계약 배치 범위 = sp-08 17 + 동일성격 5 = **22파일** (triage Batch 1 정렬).
- D-3A2R-04: 검증은 게이트 green + CI 로 한정, **Docker 실 QA 불요**(소스 grep, 런타임 미관여).
- D-3A2R-05: `operational-validation.spec.ts`의 영구 비활성 `test.describe.skip` UI 스모크 4건 **삭제**(개발책임자 결정) — 재게이트 시 silent-skip 가드(`skipped=0`) 위반. `manual/`·`audit/` 스위트와 중복되는, 게이트 미실행 비활성 코드. 정적계약 검증부는 게이트 유지.
- D-3A2R-06: hard gate 편입 스펙의 false-green(=`page.setContent()` 합성 HTML 자기검증 / `test.skip(!isServerAvailable)` 잔존)은 **실 컴포넌트 정적 소스 단언으로 전환**(소스가 없으면 실-라우트 중복 테스트로 대체·삭제). dual 5-agent 리뷰 사이클1~3 수렴(Codex+Claude QA/FE, 최종 APPROVE). 잔여: PermissionMatrix system.* 셀 **클라이언트 readonly(`isSystemOnly`/`disabled`) 미구현** — MASTER 전용은 서버 시드(V37) 강제, sp-d6-1에 TODO 박제·후속 FE 슬라이스 추적.
