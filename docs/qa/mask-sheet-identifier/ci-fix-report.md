# PR #1262 CI 실패 해소 보고서

실행일: 2026-08-17  
대상 워크트리: `chore/mask-sheet-identifier`  
커밋·푸시·스테이징: 수행하지 않음

## ① 실패 원인 판정

CI 원문상 실패는 `빌드 검증 + 단위 테스트` 단계의 테스트 단정 실패였다.

```text
Test Suites: 1 failed, 19 passed, 20 total
Tests:       9 failed, 347 passed, 356 total
Process completed with exit code 1.
```

RED 원문(식별자 값은 제외하고 파일·행과 판정 정보만 기록):

```text
expect(received).toHaveLength(expected)
Expected length: 2
Received length: 0
at Object.<anonymous> (test/calc-fidelity.test.js:209:17)

TypeError: Cannot read properties of undefined (reading 'map')
at Object.map [as getSingleSets] (lib/code.js:842:27)
at Object.getSingleSets (test/calc-fidelity.test.js:238:22)

TypeError: Cannot read properties of undefined (reading 'home')
at Object.home (test/calc-fidelity.test.js:369:25)

TypeError: Cannot read properties of undefined (reading 'single')
at Object.single (test/calc-fidelity.test.js:391:25)

TypeError: Cannot read properties of undefined (reading 'comm')
at Object.comm (test/calc-fidelity.test.js:422:30)

Test Suites: 1 failed, 19 passed, 20 total
Tests:       9 failed, 347 passed, 356 total
```

판정: 마스킹으로 생긴 fixture 계약 불일치다. `calc-fidelity.test.js`의 주입 키만 마스킹 placeholder가 되었고, 보류된 실행 코드의 `openById()`는 실행 코드가 공개한 기존 상수를 사용한다. 그 결과 `injectSheet()`와 `openById()`가 서로 다른 키를 사용해 주입 시트가 조회되지 않았다. 인프라 또는 flaky 증거는 없다.

## ② 고친 내용

- `clients/web/estimate-app/test/calc-fidelity.test.js:67`
  - 테스트 fixture의 시트 키를 실행 코드가 공개한 `_constants.SRC_SHEET_ID` 참조로 변경했다.
  - fixture 값의 의미나 실행 동작은 변경하지 않았다.
  - 마스킹된 값을 다시 평문으로 복원하지 않고, 실행 코드와 fixture가 동일한 계약 키를 공유하게 한 것이다.
- 수정 범위는 위 테스트 파일 한 줄이다.
- 실행 코드, Spring 기본값, legacy GAS 원문, 기존 50파일 마스킹 산출물은 변경하지 않았다.

## ③ GREEN

```text
npm ci
added 382 packages, and audited 383 packages

npm test -- --runInBand test/calc-fidelity.test.js
Test Suites: 1 passed, 1 total
Tests:       43 passed, 43 total

npm test -- --runInBand
Test Suites: 20 passed, 20 total
Tests:       356 passed, 356 total

.\gradlew.bat assemble
Exit code: 0
```

## ④ credential guard 실행 결과 원문

최초 `bash scripts/check-credential-plaintext.sh` 실행은 Windows bash/WSL에서 약 7분 동안 출력과 종료 신호가 없고 CPU 0 상태로 정지해 회수했다. 해당 실행의 원문 출력은 다음과 같다.

```text
(출력 없음)
```

동일 명령을 Git Bash 실행 파일로 직접 재실행했다. 총 179.2초 후 정상 완주했다.

```text
============================================================
 SP-08-8 자격 평문 비공개 가드 — 검사 시작
============================================================

 [PASS] 자격 평문 비공개 — 위반 없음
============================================================
```

## ⑤ 보류 항목이 그대로인지 확인

- 실행 코드: 이번 라운드 working-tree diff 없음.
- Spring 기본값: 이번 라운드 working-tree diff 없음.
- legacy GAS 원문: 이번 라운드 working-tree diff 없음.
- PR의 문서·fixture 50파일 마스킹 산출물: 되돌리거나 평문화하지 않음.
- 현재 추가 working-tree 변경은 `clients/web/estimate-app/test/calc-fidelity.test.js` 한 파일뿐이다.

## ⑥ 프로세스 회수

- 이번 라운드의 npm/Jest 프로세스: 종료됨.
- credential guard의 최초 정지 bash/WSL 프로세스: 회수됨.
- 재실행한 Git Bash guard: 정상 종료됨.
- Gradle daemon: `gradlew.bat --stop`으로 1개 종료.
- 컨테이너: 새로 기동하거나 중지하지 않았다. 기존 공유 컨테이너 24개는 그대로 유지했다.
- 최종적으로 이번 라운드가 남긴 의도된 프로세스·컨테이너 잔여: 0개.
