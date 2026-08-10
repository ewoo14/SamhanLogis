# #1113 S11 운영검증 smoke — 종료코드 및 ProjectRoot 가드

## 판정

- 결함 1: `test-s7-axis-redefined.ps1`의 판정과 프로세스 종료코드가 어긋난 결함을 수정했다.
- `scripts/check-local-stack-port-literals.ps1` 자체는 원인이 아니었다.
- 결함 2: S9가 `operational-validation.ps1`의 공용 port resolver를 `-ProjectRoot` 아래에서 로드하도록 바꾼 것이 원인이다. T-7/D-1의 `ProjectRoot`는 QA 경로 판정 대상일 뿐 공용 helper가 반드시 존재하는 체크아웃이어야 하지 않는데, S9 변경이 그 두 계약을 결합했다.

## 결함 1 — 재현과 수정

CI와 동일한 Windows PowerShell 5.1 계열 호출로 각각 실행했다.

```text
powershell.exe -NoProfile -NonInteractive -command ". 'tools/operational-validation/test-s7-axis-redefined.ps1'"
S7 axis regression tests passed.
EXIT=0

powershell.exe -NoProfile -NonInteractive -command ". 'scripts/check-local-stack-port-literals.ps1' -Root $PWD"
Local-stack port literal guard passed: all tracked .ps1 consumers use the resolver.
EXIT=0
```

원인은 S7 회귀 스크립트의 RED-A③ mutation이다. 임시 git 저장소에 `bad.ps1`을 추가한 뒤 guard를 일부러 실패시키고도, 자식 `powershell.exe`의 `$LASTEXITCODE`를 그대로 둔 채 마지막에 `passed`를 출력했다. Windows PowerShell은 마지막 native child 종료코드 `1`을 부모 스크립트 종료코드로 물려준다.

수정은 mutation 결과를 `$mutationExitCode`에 저장하고 그 값으로 단정한 뒤, 그 **예상된 child RED**만 부모 스크립트 종료코드에 남지 않도록 `$global:LASTEXITCODE = 0`으로 복구하는 것이다. 단정 자체가 실패하면 `Assert-True`의 예외가 계속 nonzero를 만든다.

양방향 확인:

```text
정상 전건(RED-A): S7 axis regression tests passed. / EXIT=0
단정 강제 실패(RED-B 임시 변형): FAIL: failure count expected 0, got 0 / RED-B_EXIT=1
```

## 결함 2 — 원인 증명

S9 커밋 `140095ee9`의 UTF-16 LE 파일을 `encoding='utf-16'`으로 디코드해 S7과 비교했다.

S7에는 자체 `Resolve-OperationalPort` 함수가 있었고, S9는 이를 제거한 뒤 다음을 추가했다.

```powershell
$portResolver = Join-Path $ProjectRoot 'scripts\lib\local-stack-port.ps1'
. (Resolve-Path -LiteralPath $portResolver)
```

실패 테스트의 실행 원문은 다음과 같다.

```text
T-7:
Resolve-Path : Cannot find path '...\t7-decoy-project-root\scripts\lib\local-stack-port.ps1'
operational-validation.ps1:69

D-1:
Resolve-Path : Cannot find path '...\d1-other-real-checkout\scripts\lib\local-stack-port.ps1'
operational-validation.ps1:69
```

두 테스트 모두 `QA_ALLOW_OVERWRITE=1` 가드 메시지에 도달하지 못하고, QA 경로 fixture도 만들기 전에 helper 누락으로 종료됐다. 따라서 단정을 현재 동작에 맞춰 바꾸지 않고, 공용 helper는 스크립트가 실제로 위치한 checkout에서 로드하도록 고쳤다. `-ProjectRoot`는 기존대로 validation 대상 트리와 ProjectRoot 기반 QA anchor에만 사용한다.

## 검증

수정 후 `clients/desktop/scripts/qa-output-path-guard.test.cjs --test-name-pattern 'T-7|D-1'` 실행 결과뿐 아니라 전체 파일 실행 결과:

```text
tests 47
pass 47
fail 0
EXIT=0
```

## 변경 파일

- `tools/operational-validation/test-s7-axis-redefined.ps1`
- `infrastructure/scripts/operational-validation.ps1` (UTF-16 LE 유지)
- `docs/dev-reports/2026-08-08-1113-s11-exit-code-and-projectroot-guard.md`

커밋과 push는 하지 않았다.
