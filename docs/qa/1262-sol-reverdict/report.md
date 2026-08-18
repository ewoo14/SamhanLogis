# PR #1262 CODEX SOL 적대검증 재판정

## ① 검증 SHA

- 검증 HEAD: `f7a1e9cff954dfec85a72b89f764e2feb8a2d85b`
- fix 커밋: `f7a1e9cff`
- 브랜치: `chore/mask-sheet-identifier`
- 비교 기준: `origin/main...HEAD`
- 식별자 값 자체는 이 보고서에 기록하지 않는다.

## ② 앞 판정 2건 재현 시도 결과

1. `docs/qa/1241-luna-ci-fix-report.md:55`
   - 직접 열어 확인한 결과 식별자는 placeholder로 치환되어 있다.
   - 앞 라운드의 마스킹 누락은 사라졌다.
2. `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts:172`
   - placeholder 문자열 포함 단정이 제거되었다.
   - 현재 fixture는 legacy GAS 원문의 실제 상수 선언이 placeholder가 아닌 형태로 보존되는지를 검사한다.
   - `tools/legacy-gas/종합견적서/Code.js` 원문에 새 정규식을 직접 적용한 결과 `True`, placeholder 합성 문자열에는 `False`였다.
   - 따라서 정본은 실행 fixture가 아니라 **보류된 legacy GAS 원문**이며, 앞 라운드의 원문 모순은 사라졌다.

## ③ 전수 검색 실측

- 동일 식별자로 tracked repository 전체를 재검색한 실측: **9파일·9건**.
- 구현자 보고의 총량 9파일·9건은 재현되었다.
- 그러나 분류는 재현되지 않았다.
  - 정당한 보류: **8파일·8건** — 실행 코드 1파일·1건, Spring 기본값 2파일·2건, legacy GAS 원문 5파일·5건.
  - 마스킹 누락: **1파일·1건** — `services/product-service/src/main/java/com/samhanair/logis/product/client/GoogleSheetsClient.java:125`.
- 위 1건은 메서드의 `@param` Javadoc 예시다. 실행 코드도, Spring 기본값도, legacy GAS 원문도 아니다. 이를 세 번째 Spring 기본값으로 세어 “보류 9·누락 0”으로 분류한 주장은 원문과 맞지 않는다.
- 따라서 **증거 무결성 결함 1건**이다.

## ④ 보호 대상 diff 및 화면 도달 확인

- `git diff origin/main...HEAD`에서 실행 코드, Spring 기본값, legacy GAS 원문과의 교집합: **0파일**.
- 기본값 제거·변경은 없으며, 과거 시트 동기화 IT 5건을 깨뜨린 경로는 건드리지 않았다.
- fix 커밋의 실질 변경은 문서 1줄 마스킹, 계약 fixture 1줄 정정, QA 로그 마스킹과 보고서 추가다.
- 실행 경로·라우트·화면·API 표면 변경이 없고 CI의 web/electron/mobile Playwright도 통과했다.
- 실 사용자가 화면을 통해 재현할 수 있는 신규 결함: **0건**.

## ⑤ credential guard·Jest 재현

- `C:\Program Files\Git\bin\bash.exe scripts/check-credential-plaintext.sh`
  - 결과: `[PASS] 자격 평문 비공개 — 위반 없음`
  - 종료코드: **0**
- `clients/web/estimate-app`에서 `npm test -- --runInBand`
  - 결과: **21 suites passed, 360 tests passed, 0 snapshots**
  - 종료코드: **0**
- 두 종료코드는 각 프로세스 종료 직후 `$LASTEXITCODE`로 별도 수집했다.

## ⑥ CI 판정

- PR HEAD: `f7a1e9cff954dfec85a72b89f764e2feb8a2d85b`.
- GitGuardian Security Checks: **PASS**.
- Credential Plaintext Guard 2종: **PASS**.
- 현재 실패 3건은 모두 `Set up job` 단계다.
  - `accounting-deposit-mapping-it`: action archive 다운로드 HTTP 429.
  - `phase9-10`: action archive 다운로드 HTTP 429.
  - `product-quantity-sync-schema`: action archive 다운로드 HTTP 429 반복 후 502.
- 세 실패 모두 테스트나 PR 코드를 실행하기 전 GitHub action 다운로드에서 끝난 외부 장애이며 이 PR 원인이 아니다.
- 보고서 작성 시점에 `Desktop Playwright (mock 회귀 hard gate)` 1건은 pending이고, 나머지 확인된 UI E2E와 빌드·가드는 통과했다.

## ⑦ 머지 판정

**머지 불가 — 도달 결함 0건 · 증거 무결성 1건.**

차단 사유는 `services/product-service/src/main/java/com/samhanair/logis/product/client/GoogleSheetsClient.java:125`의 문서 식별자 1건을 보호 대상으로 잘못 분류해 “누락 0건”이라고 보고한 것이다. 실 사용자 화면 도달 결함은 발견하지 않았다.

## ⑧ 프로세스 회수

- Jest 실행 전후 PID 대조 결과 새 Node 잔여: **0개**.
- credential guard의 Git Bash 프로세스: 정상 종료, 잔여 **0개**.
- 이번 검증이 기동한 Node·Jest·bash 프로세스 최종 잔여: **0개**.
- 컨테이너는 조회만 했고 중지·재시작·변경하지 않았다. 실측 수는 검증 시작 **26개**, 최종 **24개**였으며, 이 검증은 공유 컨테이너 24개를 건드리지 않았다.
- 다른 워크트리는 접근하거나 변경하지 않았다.
