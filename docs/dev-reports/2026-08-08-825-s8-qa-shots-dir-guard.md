# PR #1120 / 이슈 #825 — S8 QA 캡처 경로 가드 재수렴

## 결론

PR 커밋 산출물에서 H-2 우회는 1건이었다. `825-s5-verification.spec.ts`의
`SHOTS`가 `path.resolve(.../docs/qa-shots/...)`를 직접 사용하고 있었다.
`resolveQaShotsDir(...)`를 경유하도록 수정했으며, 가드 테스트 자체는 완화하지 않았다.

수정된 캡처 목적지는 기본적으로 `825-s5-verify/_local`로 나가므로 커밋된
`docs/qa-shots` 증거를 재실행으로 덮어쓰지 않는다. 라이브 캡처 spec/driver가 아니므로
`-real-qa` 문서 경로에도 두지 않았다.

## S8 전수 점검 — PR에서 커밋된 spec/driver

| 파일 | 유형 | 캡처 목적지 | H-2 결과 | 조치 |
|---|---|---|---|---|
| `clients/desktop/playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts` | 신규 mock spec | 없음 | PASS | 유지. 3개 소비처 계약만 검증 |
| `clients/desktop/playwright/825-s5-verification/825-s5-verification.spec.ts` | 신규 mock spec + 증거 캡처 | `SHOTS` → `resolveQaShotsDir(path.resolve(.../docs/qa-shots/825-s5-verify))` | 수정 후 PASS | 유지. 보고서·PNG의 실행 증거를 생성 |
| `clients/desktop/playwright/ac-5-chip-multiselect/ac-5-chip-multiselect.spec.ts` | 기존 mock driver 갱신 | 없음 | PASS | 유지. S4~S7의 AC-5 계약 회귀 보존 |
| `clients/desktop/playwright/codef-fe-bc3/codef-fe-bc3.spec.ts` | 기존 mock driver 갱신 | 없음 | PASS | 유지. 모바일 모달 도달성 회귀 보존 |
| `clients/desktop/playwright/d2-order-merge/d2-order-merge.spec.ts` | 기존 mock driver 갱신 | 없음 | PASS | 유지. 단일 창고 즉시 확정 회귀 보존 |
| `clients/desktop/playwright/partner-order-list-badge-refresh/partner-order-list-badge-refresh.spec.ts` | 기존 mock driver 갱신 | 없음 | PASS | 유지. 단일 창고 즉시 확정 회귀 보존 |

드라이버를 제거하지 않았다. 위 4개 기존 driver는 캡처 증거가 아니라 S4~S7 동작 회귀를
검증하는 실행 표면이며, S2/S5 spec은 실제 보고서와 캡처를 생성하는 증거 표면이다.

## 검증 원문 요약

| 명령 | 결과 |
|---|---|
| `npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts` | `Test Files 1 passed (1)` / `Tests 49 passed (49)` / `0 failed` / exit 0 |
| `npx playwright test 825-s2-slice1-contract 825-s5-verification` | `Running 7 tests using 1 worker` / `7 passed (12.5s)` / exit 0 |
| `npx vitest run` (`clients/web/design-system`) | `Test Files 26 passed (26)` / `Tests 201 passed (201)` / `0 failed` / exit 0 |
| `npm run typecheck` (`clients/desktop`) | exit 0. 하위 `node --test`는 `tests 2`, `pass 2`, `fail 0` 및 `tests 50`, `pass 50`, `fail 0` |
| `npx playwright test --list` | `Total: 667 tests in 121 files` / exit 0 |
| `npx playwright test` (`clients/desktop`) | 10분 제한까지 종료되지 않아 exit `124`; 최종 pass/fail 집계 없음. 이 결과를 green으로 해석하지 않음 |

design-system은 현재 워크트리 실제 수치가 201/201이었다. 요청된 200/200을 맞추기 위해
테스트를 삭제하거나 무훼손 영역을 변경하지 않았다.

## 신규 파일 목록 (origin/main 대비)

- `clients/desktop/playwright/825-s2-slice1-contract/825-s2-slice1-contract.spec.ts`
- `clients/desktop/playwright/825-s5-verification/825-s5-verification.spec.ts`
- `docs/dev-reports/2026-08-08-825-s1-global-input-ux-recon.md`
- `docs/dev-reports/2026-08-08-825-s2-slice1-contract-and-three-consumers.md`
- `docs/dev-reports/2026-08-08-825-s3-playwright-fixture-and-trigger-contract.md`
- `docs/dev-reports/2026-08-08-825-s4-modal-search-input.md`
- `docs/dev-reports/2026-08-08-825-s5-verification.md`
- `docs/dev-reports/2026-08-08-825-s6-ac5-contract-update.md`
- `docs/dev-reports/2026-08-08-825-s7-ci-red-fix.md`
- `docs/qa-shots/825-s5-verify/01-approval-multiple-filter-retains-selection.png`
- `docs/qa-shots/825-s5-verify/02-bank-partner-filtered-target.png`
- `docs/qa-shots/825-s5-verify/03-warehouse-zero-results-cancel-enabled.png`
- `docs/dev-reports/2026-08-08-825-s8-qa-shots-dir-guard.md`

커밋·push는 하지 않았다. Docker 스택도 재기동하지 않았다.
