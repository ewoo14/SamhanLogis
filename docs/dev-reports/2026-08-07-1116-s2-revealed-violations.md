# 이슈 #1116 S2 — S1 발견 모집단에서 드러난 위반 판정

## 결론

S1 이후 CI에서 드러난 G3a/G3b/G9 실패를 재현·판정했다. G3a/G3b의 파일별 실제 위반은
발견되지 않았고, 두 테스트가 S1의 `derivedEvidenceWriters()`를 `describe` 내부 스코프에서
참조해 CI 병렬 실행 시 `ReferenceError`가 난 것이 원인이었다. 발견 resolver를 모듈 스코프로
옮겨 G3a/G3b가 실제 모집단을 검사하게 했다.

G9는 실제로 `ci.yml`의 `paths-ignore`가 무시하는 문서 표면 35건과 아로로지스 서비스 표면 1건을
발견했다. 가드를 약화하지 않고 `harness-guard.yml`의 pull_request/push 트리거에
`docs/**`와 `services/arologis-service/**`를 추가했다.

## 위반별 판정

| 축 | 발견 대상 | 판정 | 근거 및 조치 |
|---|---|---|---|
| G3a | S1 discovery가 반환하는 JS/CJS/MJS/그 밖의 실행 스크립트 | (가) 해당 없음 | CI 원문에 G3a 파일 위반 목록이 나오지 않았고 실패는 `derivedEvidenceWriters is not defined`였다. 모듈 스코프 discovery resolver를 추가한 뒤 실제 G3a 검사가 통과했다. 목적지 `_local` 규칙은 유지했다. |
| G3b | 동일 모집단 | (가) 해당 없음 | CI 원문에 절대경로 파일 위반은 없고 동일한 `ReferenceError`였다. resolver 수정 뒤 G3b가 통과했다. 절대경로 규칙은 완화하지 않았다. |
| G9 | `docs/**` 아래 발견 파일 35건, `services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/DispatchManualService.java` 1건 | (가) 진짜 관할 누락 | `ci.yml`은 해당 경로를 무시하지만 변경 시 harness guard를 발동시키지 않았다. `harness-guard.yml` 양 이벤트에 두 경로를 추가했다. |

G9의 36개 문서 파일은 문서 본문/QA 증거 표면에 존재하는 파일이며, 가드가 문서 변경을
조용히 통과시키지 않도록 명시적으로 `docs/**` 관할로 등록했다. Java 파일은
`services/arologis-service/**` 전용 CI가 따로 존재하지만 해당 CI가 이 하네스 가드를 실행하지
않으므로, 하네스 워크플로에도 동일 표면을 등록했다.

## G9 발견 파일 목록

```text
docs/dev-reports/2026-07-20-854-outbox-selfinvocation-tx.md
docs/dev-reports/2026-07-28-851-s2-qa-guard-coverage.md
docs/dev-reports/slip-first-slice.md
docs/dev-reports/sp-09-4-kftc-shell.md
docs/qa/1075-s27-real-qa/screenshots/05-user-spec-filled.png
docs/qa/1075-s29-real-qa/interact-network.json
docs/qa/1075-s29-real-qa/network.json
docs/qa/1075-s29-real-qa/probe-network.json
docs/qa/ac1-warehouse-autocomplete/real-qa-driver.spec.ts.txt
docs/qa/ac2-product-autocomplete/ac2-real-qa-driver.spec.ts.txt
docs/qa/ac3-partner-autocomplete/ac3-real-qa-driver.spec.ts.txt
docs/qa/choreb-opus-b/n1-notice-screen.png
docs/qa/choreb-sonnet-r1/matrix-purchase-3-update-modal.png
docs/qa/choreb-sonnet-r4-fence-notice/n1-notice-screen.png
docs/qa/p0-5/TM-VERIFICATION.md
docs/qa/phase-2-6c-inventory-deduction/claude-be-cycle1.md
docs/qa/phase-2-6c-inventory-deduction/claude-qa-cycle1.md
docs/qa/slice-c-warehouse-code-align/real-qa-driver.spec.ts.txt
docs/qa/slice-d1-confirm-no-autopublish/claude-be-cycle2.md
docs/qa/slice-d2-order-merge/claude-be-cycle1.md
docs/qa/slice-d2-order-merge/claude-qa-cycle1.md
docs/qa/sp-09-2-aligo-sms-real-send/claude-be-cycle1.md
docs/qa/sp-09-2-aligo-sms-real-send/codex-be-cycle1.md
docs/qa/sp-09-4-kftc-shell/claude-be-cycle1.md
docs/qa/sp-10-2-insung-quick-vendor/claude-be-cycle1.md
docs/qa/sp-10-2-insung-quick-vendor/claude-be-cycle2.md
docs/qa/sp-10-2-insung-quick-vendor/pr-body.md
docs/qa/sp-10-2-insung-quick-vendor/tm-claude-cycle1.md
docs/qa/sp-10-2-insung-quick-vendor/tm-codex-cycle1.md
docs/superpowers/plans/2026-05-14-arologis-extract.md
docs/superpowers/plans/2026-05-14-samhan-dispatch-board.md
docs/superpowers/plans/2026-05-14-samhan-dispatch-modification.md
docs/superpowers/plans/2026-05-15-d-ax-12-mobile-cross-import.md
docs/superpowers/plans/2026-05-15-samhan-signature-copy.md
docs/superpowers/plans/2026-05-31-order-merge-to-slip.md
services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/DispatchManualService.java
```

## 평문 비밀번호 리터럴(RED-B④)

| 파일 | 판정 | 결정 |
|---|---|---|
| `scripts/seed-local-stack.ps1:70-74` 5건 | (나) 정당한 예외 | 로컬 스택 시드 전용 테스트 계정이며 QA 로그인·역할별 시나리오가 이 계약을 사용한다. 리터럴 값은 이 문서에 재기록하지 않는다. 임의 삭제하지 않았다. |

위 예외는 이 보고서의 예외 목록에 등록했다. Credential Plaintext Guard가 소비자 키/자격
접근을 검사하는 축과 로컬 시드 계정 리터럴을 검사하는 RED-B④는 별도 축으로 유지한다.

## 스캔 시간

| 측정 | 결과 |
|---|---:|
| CI G9 원문 측정 | 43.075초 (테스트 소요) |
| 로컬 표적 G3a/G3b/G9 (최종 재측정) | 0.739초 (테스트 소요), 전체 명령 1.45초 |
| S1 자격 discovery 참고값 | 약 1.5초 (S1 보고서) |

CI의 43초는 G9 실패 상태에서 전체 저장소 discovery를 수행한 값이며, 모집단을 다시 좁히지
않고 유지한다. 이번 변경은 walker의 대상 축소가 아니라 resolver 스코프 수정과 워크플로
트리거 보강이다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1116-s2-revealed-violations.md`
- S1 discovery가 새로 관찰한 G9 표면 37건(위 목록)
- 평문 리터럴 5건: 기존 `scripts/seed-local-stack.ps1` 안에 존재하며 삭제·재작성하지 않음

## 검증

```text
npx vitest run src/renderer/test-utils/harness-false-green-guard.test.ts --reporter=verbose -t 'G3a:|G3b:|G9:'
3 passed, 0 failed — 1.45s (전체 명령), 테스트 소요 0.739s
npx eslint src/renderer/test-utils/harness-false-green-guard.test.ts
exit 0
npx tsc -p tsconfig.node.json --noEmit
exit 0
npx tsc -p tsconfig.web.json --noEmit
exit 0
```

컨테이너 재빌드, 창 생성, 외부 프로세스 상주, commit/push는 하지 않았다.
