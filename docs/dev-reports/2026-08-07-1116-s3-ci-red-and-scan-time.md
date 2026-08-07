# #1116 S3 — CI G3a/G3b 실패와 스캔 시간 진단

## 결론

S2의 `3 passed / 1.45s`는 CI와 동일한 권위 검증으로 볼 수 없다. CI는 PR merge ref `73bc89a2a9f71c3da1416ff36261bfcccc265bfe`에서 실행했고, 로컬 S2 보고는 표적 제목 필터만 실행했다. 현재 worktree에서는 desktop 의존성이 없어 같은 명령도 Vitest 시작 전에 실패했다.

CI가 실제로 실행한 결과는 `47 passed / 2 failed`, `286.14s`였다. 실패는 G3a/G3b이며, G9는 통과했다.

## 로컬과 CI가 갈린 이유

- CI의 checkout 경로는 `/home/runner/work/Samhan-Public/Samhan-Public`이고, PR merge ref를 검사했다. 로컬은 `134818dcb`의 작업 worktree다.
- CI의 실패 파일 중 `docs/qa/ac1-warehouse-autocomplete/real-qa-driver.spec.ts.txt`와 `docs/qa/1075-s29-real-qa/interact-network.json`은 로컬과 CI blob hash가 동일했다. 따라서 이 차이는 단순히 CI에만 있는 파일 때문이 아니다.
- 반대로 CI가 검사한 `qa782-defaultqty-liveqa.mjs`는 S3 수정 전 버전이었다. CI hash는 `9f001f65...`, S3 worktree의 수정 후 hash는 `15d055ef...`다.
- S2의 `-t 'G3a:|G3b:|G9:'`는 G8b/G8c와 G9 parser sanity를 제외한다. 다만 G3a/G3b 자체가 같은 모집단에서 재현되어야 하므로, S2의 green은 현재 CI checkout·의존성·파일 상태와 동등한 검증으로 재현되지 않았다.
- 현재 로컬에서 동일한 Vitest 실행을 시도했을 때 `clients/desktop/node_modules`가 없어 `vitest/config` 로드 전에 종료됐다. 의존성 설치나 컨테이너 재빌드는 하지 않았다.

## CI AssertionError 실제 목록과 처리

### G3a 목록

CI가 보고한 목록은 다음 9건이다.

```text
docs/dev-reports/2026-07-28-851-s2-qa-guard-coverage.md
docs/qa/ac1-warehouse-autocomplete/real-qa-driver.spec.ts.txt
docs/qa/ac2-product-autocomplete/ac2-real-qa-driver.spec.ts.txt
docs/qa/ac3-partner-autocomplete/ac3-real-qa-driver.spec.ts.txt
docs/qa/phase-2-6c-inventory-deduction/claude-qa-cycle1.md
docs/qa/slice-c-warehouse-code-align/real-qa-driver.spec.ts.txt
docs/qa/sp-10-2-insung-quick-vendor/claude-qa-cycle2.md
docs/qa/sp-10-2-insung-quick-vendor/pr-body.md
docs/superpowers/plans/2026-05-15-d-ax-12-mobile-cross-import.md
```

이 중 `.md`, `.txt`는 G3a의 JS/CJS/MJS 스크립트 모집단이 아니다. S2에서 발견기 결과를 G3a/G3b에 그대로 전달한 분류 결함이므로, 발견 전 목록으로 줄이지 않고 발견 결과에서 JS/CJS/MJS 확장자만 G3a/G3b의 규칙에 전달하도록 고쳤다.

### G3b 목록

CI가 보고한 스크립트 8건은 모두 fallback 또는 인자에 `C:/dev/Samhan-Public`를 사용했다.

```text
clients/desktop/playwright/qa782-defaultqty-real-qa/qa782-defaultqty-liveqa.mjs
clients/desktop/playwright/qa782-defaultqty-real-qa/qa782-regression-qty1.mjs
clients/desktop/playwright/qa797-setpart-real-qa/capture.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-longname.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-mobile-closeup.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-mobile-isolate-handle.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-mobile-precise.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture.mjs
```

8개 모두 `../../docs/qa/...` 상대경로로 바꿨다. `resolveQaShotsDir`의 기본 동작은 그 committed directory 아래 `_local`을 사용하므로, `QA_OUT`/`QA_SHOTS_DIR` 명시 override 계약은 유지된다.

G3b 목록의 `docs/qa/1075-s29-real-qa/*.json` 3건은 CI 출력에 함께 보였지만 스크립트가 아니므로 G3b 대상에서 제외했다. JSON의 기록된 Vite URL은 QA 실행 증거이며 G3b를 JSON 검사로 확장하지 않았다.

## 66초 원인과 스캔 개선

CI 실측은 다음과 같다.

| 항목 | S2 CI 실측 |
|---|---:|
| G3a | 50,723 ms |
| G3b | 48,834 ms |
| G8b | 46,374 ms |
| G8c | 45,708 ms |
| G9 parser sanity | 46,512 ms |
| G9 | 46,802 ms |
| 전체 tests | 285.58 s |
| 전체 Vitest 명령 | 286.14 s |

원인은 정규식 백트래킹이 아니라 `discoveredEvidenceWriters()`가 각 테스트마다 레포 전수 디렉터리 순회와 파일 read/분석을 반복한 것이다. S3에서는 발견 결과를 모듈 캐시(`discoveredEvidenceWritersCache`)에 저장해 G3/G8/G9가 같은 배열을 재사용한다. 모집단 discovery의 디렉터리 skip이나 대상 목록 축소는 하지 않았다. G3a/G3b의 확장자 분리는 규칙의 대상이 JS/CJS/MJS라는 계약에 맞춘 분류다.

사후 CI 실측은 아직 없다. 사용자가 요구한 대로 이 worktree에서 commit/push하지 않았으므로 GitHub Actions에 S3 변경을 전달할 수 없었다. 따라서 `286.14s`는 수정 전 CI 권위값이고, 수정 후 CI 시간은 미측정으로 남긴다. 캐시의 효과를 CI에서 확정하려면 S3 변경이 포함된 새 CI 실행이 필요하다.

## 여전히 남은 것

- CI 재실행 전에는 G3a/G3b 0건과 최종 CI 시간은 확정할 수 없다.
- `docs/qa/1075-s29-real-qa`의 JSON 안 `t1075` 절대경로는 증거 데이터다. G3b를 JSON까지 확장하라는 요구가 없으므로 변경하지 않았다.
- 현재 로컬은 의존성 미설치로 Vitest/TypeScript 실행 검증을 완료하지 못했다.

## 신규/변경 파일 목록

신규 파일:

```text
docs/dev-reports/2026-08-07-1116-s3-ci-red-and-scan-time.md
```

변경 파일:

```text
clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts
clients/desktop/playwright/qa782-defaultqty-real-qa/qa782-defaultqty-liveqa.mjs
clients/desktop/playwright/qa782-defaultqty-real-qa/qa782-regression-qty1.mjs
clients/desktop/playwright/qa797-setpart-real-qa/capture.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-longname.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-mobile-closeup.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-mobile-isolate-handle.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture-mobile-precise.mjs
clients/desktop/playwright/qa798-setmarker-real-qa/capture.mjs
```
