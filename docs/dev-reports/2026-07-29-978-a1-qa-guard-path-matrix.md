# 2026-07-29 Issue #978 A-1 QA 출력 경로 표기 판정표

## 결론

경로 표기 형태별 자동 판정표를 clients/desktop/scripts/qa-output-path-guard.test.cjs에 추가했다.
같은 저장소의 커밋 QA 경로는 평범한 절대경로, 슬래시·혼합 표기, 자기 자신을 가리키는 UNC 4종, subst, mklink /J, 실제 다른 Git 워크트리의 -ProjectRoot에서 모두 BLOCK이었다. \\203.0.113.77\share\... 대조군은 ALLOW였다.

새 Node 표 판정은 cjs, mjs, 루트 mjs, TypeScript resolver 4개를 같은 입력표로 실행한다. Python, Git Bash, PowerShell, operational-validation.ps1의 기존 전용 회귀도 같은 focused 실행에 포함했다. 모든 출력 경로 판정은 QA_ALLOW_OVERWRITE 없이 수행했다.

## 형태별 판정표

| 형태 | 실제 입력 예 | 기대 | 실제 | 기대와 일치 |
|---|---|---:|---:|---:|
| 평범 | D:\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory | BLOCK | BLOCK | 예 |
| UNC - localhost | \\localhost\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory | BLOCK | BLOCK | 예 |
| UNC - 127.0.0.1 | \\127.0.0.1\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory | BLOCK | BLOCK | 예 |
| UNC - 컴퓨터명 | \\SAMHAN9440\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory | BLOCK | BLOCK | 예 |
| UNC - 자기 LAN IP | \\172.30.1.32\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory | BLOCK | BLOCK | 예 |
| 슬래시 | D:/dev/Samhan-Public/.claude/worktrees/t11-978a1/docs/qa/809-partner-product-price-memory | BLOCK | BLOCK | 예 |
| 혼합 | d:\dev/Samhan-Public/.claude/worktrees/t11-978a1/docs/qa/809-partner-product-price-memory | BLOCK | BLOCK | 예 |
| subst 드라이브 | subst W: D:\dev 후 W:\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\... | BLOCK | BLOCK | 예 |
| 크로스드라이브 junction | mklink /J로 만든 C:\Users\ewoo2\AppData\Local\Temp\...\docs-qa\... | BLOCK | BLOCK | 예 |
| 다른 Git 워크트리 -ProjectRoot | D:\dev\Samhan-Public\docs\qa\809-partner-product-price-memory를 -ProjectRoot D:\dev\Samhan-Public으로 실행 | BLOCK | BLOCK | 예 |
| 외부 호스트 UNC 대조군 | \\203.0.113.77\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\... | ALLOW | ALLOW | 예 |

subst는 W:를 사용했고, 테스트 종료 후 매핑 해제를 확인했다. junction은 mklink /J로 만들었으며 링크를 담은 임시 부모만 제거했다. 저장소의 docs/qa/** 또는 커밋된 screenshot 파일을 대상으로 쓰기·삭제하지 않았다.

## RED-first 기록

새 경로 표기에서 실패-개방(ALLOW)은 발견되지 않았다. 따라서 실패-개방 재현 RED 테스트를 먼저 저장한 뒤 resolver를 고치는 단계는 이번 라운드에 해당하지 않는다. 변경은 판정표 테스트와 이 보고서뿐이며 resolver 구현은 수정하지 않았다.

첫 시도에서는 cmd.exe /c mklink /J의 Node 인자 인용이 깨지는 테스트 하네스 오류가 났다. 이는 가드 판정 전 링크 생성 실패이며 저장소 경로에 쓰지 않았다. mklink 인자를 /d, /c, mklink, /J, 링크, 대상의 별도 argv로 바꾼 뒤 GREEN이 됐다.

## 실행 명령과 출력 원문

### 새 판정표 + 기존 관련 회귀

명령:

~~~powershell
$env:NODE_PATH = 'D:\dev\Samhan-Public\clients\desktop\node_modules'; node --test --test-name-pattern='978-A-1|T-8|T-9|T-10|T-15|T-16|T-17|T-18|T-19|D-1|D-2|N-3' clients/desktop/scripts/qa-output-path-guard.test.cjs
~~~

출력 원문:

~~~text
[978-A-1 path matrix] mklink /J created: Junction created for C:\Users\ewoo2\AppData\Local\Temp\samhan-978-a1-path-matrix\cross-drive-junction-parent\docs-qa <<===>> D:\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa
[978-A-1 path matrix] 평범	BLOCK	D:\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] 슬래시	BLOCK	D:/dev/Samhan-Public/.claude/worktrees/t11-978a1/docs/qa/809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] 혼합	BLOCK	d:\dev/Samhan-Public/.claude/worktrees/t11-978a1/docs/qa/809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] UNC-localhost	BLOCK	\\localhost\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] UNC-127.0.0.1	BLOCK	\\127.0.0.1\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] UNC-computername	BLOCK	\\SAMHAN9440\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] UNC-self-LAN-IP	BLOCK	\\172.30.1.32\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] subst	BLOCK	W:\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] cross-drive-junction-mklink	BLOCK	C:\Users\ewoo2\AppData\Local\Temp\samhan-978-a1-path-matrix\cross-drive-junction-parent\docs-qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 path matrix] 외부 UNC	ALLOW	\\203.0.113.77\d$\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa\809-partner-product-price-memory	resolvers=cjs,mjs,root-mjs,ts
[978-A-1 cleanup] subst W: released=true
[978-A-1 cleanup] mklink /J parent removed=true
[978-A-1 path matrix] -ProjectRoot-other-worktree	BLOCK	D:\dev\Samhan-Public\docs\qa\809-partner-product-price-memory
✔ 978-A-1 경로 표기 판정표 — 같은 docs/qa 물리 위치의 평문·UNC·슬래시·subst·mklink /J 는 모두 BLOCK, 외부 UNC 는 ALLOW 이다 (757.8427ms)
✔ 978-A-1 경로 표기 판정표 — 실제 다른 Git 워크트리를 -ProjectRoot 로 지정해도 그 워크트리의 docs/qa 는 BLOCK 이다 (2128.2238ms)
✔ T-18 (2026-07-28 R5 재수렴 결함2/D-2) — qa-shots-dir.ps1 의 Resolve-QaShotsDir 는 subst 드라이브·크로스드라이브 junction 을 통해 지정된 커밋 경로도 차단한다 (3908.5512ms)
✔ T-17 (2026-07-28 R5 재수렴 결함2) — operational-validation.ps1 은 subst 드라이브를 통해 지정된 커밋 경로도 차단한다 (2254.8122ms)
✔ D-2 (2026-07-28 R5 재수렴) — operational-validation.ps1 은 크로스드라이브 junction 을 통해 지정된 커밋 경로도 차단한다 (1655.4549ms)
✔ T-19 (2026-07-28 R5 재수렴 결함3) — operational-validation.ps1 도 자기 LAN IP UNC admin-share 를 차단한다 (1845.1052ms)
✔ D-1 (2026-07-28 R5 재수렴, R4 회귀) — operational-validation.ps1 을 -ProjectRoot 로 다른 "실존하는" 체크아웃을 가리키면 그 체크아웃의 커밋 docs/qa 도 보호된다 (3139.9096ms)
✔ T-8 (2026-07-28 R4 재수렴 결함3) — qa_shots_dir.py 도 자기 자신을 가리키는 UNC admin-share 표기를 차단한다 (546.3242ms)
✔ T-9 (2026-07-28 R4 재수렴 결함3) — qa-shots-dir.sh 도 자기 자신을 가리키는 UNC admin-share 표기를 차단한다 (908.8918ms)
✔ T-15 (2026-07-28 R5 재수렴 결함1) — qa-shots-dir.sh 는 UNC 슬래시(//host/C$/...)·혼합(\\host\\C$/...) 표기도 차단한다 (1996.4458ms)
✔ T-16 (2026-07-28 R5 재수렴 결함2) — qa-shots-dir.sh 는 subst 드라이브를 통해 지정된 커밋 경로도 차단한다 (2119.5409ms)
✔ T-10 (2026-07-28 R5 재수렴 결함3) — 4 resolver(cjs/mjs/root-mjs/ts)가 자기 LAN IP UNC admin-share 도 차단한다(고정 별칭 목록이 아니라 로컬 인터페이스 실측 기반 — R4 는 localhost/127.0.0.1/컴퓨터명만 인정했다) (50.6892ms)
✔ N-3 (2026-07-28 R5 재수렴 부수) — 진짜 다른 호스트를 가리키는 UNC admin-share 는 10개 resolver 사본 전부에서 여전히 ALLOW 다(과차단 0) (26953.1789ms)
✔ 957-RED-1 — Node 물리 조회가 false로 흡수되면 안 되고 커밋 QA 대상은 차단되어야 한다 (2.1874ms)
✔ 957-RED-2 — Python commonpath 조회 실패는 False가 아니라 명시적 실패여야 한다 (568.8155ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 50821.612
~~~

### 첫 mklink 하네스 오류 원문

명령:

~~~powershell
$env:NODE_PATH = 'D:\dev\Samhan-Public\clients\desktop\node_modules'; node --test --test-name-pattern='978-A-1 경로 표기 판정표' clients/desktop/scripts/qa-output-path-guard.test.cjs
~~~

출력 원문:

~~~text
The filename, directory name, or volume label syntax is incorrect.
[978-A-1 cleanup] mklink /J parent removed=true
✖ 978-A-1 경로 표기 판정표 — 같은 docs/qa 물리 위치의 평문·UNC·슬래시·subst·mklink /J 는 모두 BLOCK, 외부 UNC 는 ALLOW 이다 (417.4752ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 3178.9137

✖ failing tests:

test at clients\\desktop\\scripts\\qa-output-path-guard.test.cjs:246:1
✖ 978-A-1 경로 표기 판정표 — 같은 docs/qa 물리 위치의 평문·UNC·슬래시·subst·mklink /J 는 모두 BLOCK, 외부 UNC 는 ALLOW 이다 (417.4752ms)
  Error: Command failed: C:\WINDOWS\system32\cmd.exe /d /c mklink /J "C:\Users\ewoo2\AppData\Local\Temp\samhan-978-a1-path-matrix\cross-drive-junction-parent\docs-qa" "D:\dev\Samhan-Public\.claude\worktrees\t11-978a1\docs\qa"
  The filename, directory name, or volume label syntax is incorrect.

      at genericNodeError (node:internal/errors:985:15)
      at checkExecSyncError (node:internal/errors:985:15)
      at execFileSync (node:internal/child_process:925:15)
      at TestContext.<anonymous> (D:\dev\Samhan-Public\.claude\worktrees\t11-978a1\clients\desktop\scripts\qa-output-path-guard.test.cjs:275:28)
      at async Test.run (node:internal/test_runner/test:1125:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:358:3) {
    status: 1,
    signal: null,
    output: [ null, '', 'The filename, directory name, or volume label syntax is incorrect.\r\n' ],
    pid: 28296,
    stdout: '',
    stderr: 'The filename, directory name, or volume label syntax is incorrect.\r\n'
  }
~~~

### 파일 안전 확인 명령

명령:

~~~powershell
git ls-files docs/qa/__*
git diff --check
git status --porcelain
~~~

출력 원문:

~~~text

~~~

첫 명령은 docs/qa/__* 픽스처 추적 파일이 없음을 확인했고, git diff --check는 출력이 없었다. 보고서 작성 후 최종 git status --porcelain은 의도한 테스트 파일과 보고서만 남도록 다시 확인한다.

## 이 라운드가 보지 않은 것

- A-2: Docker의 다른 OS 컨테이너(mcr.microsoft.com/powershell, Linux Node)는 실행하지 않았다.
- A-3: net use 매핑 드라이브는 다루지 않았다. 이번 자동표의 매핑 드라이브 행은 subst만이다.
- A-4: 라인엔딩·인코딩 자체의 회귀는 다루지 않았다.
- A-5: operational-validation.ps1의 선재 Join-Path 배열 버그는 범위 밖이다.
- services/**, clients/web/**, Docker stack, DB는 읽거나 실행하지 않았다.
- 실제 screenshot PNG를 생성하거나 커밋 증거를 덮어쓰는 실험은 하지 않았다. 새 Node 표는 mkdirSync를 차단했고, 실제 다른 워크트리 검사는 PowerShell New-Item sentinel로 쓰기 직전에 멈추게 했다.
- 새 표 테스트의 공통 자동 매트릭스는 Node 4개 resolver(cjs/mjs/root-mjs/ts)에 대한 전수다. Python·Git Bash·PowerShell 및 operational-validation.ps1은 기존 전용 회귀 테스트를 focused 실행으로 확인했지만, 모든 경로 형태와 모든 10개 resolver의 완전한 Cartesian 조합은 이번 라운드에서 새로 만들지 않았다.

## 변경 파일

- clients/desktop/scripts/qa-output-path-guard.test.cjs: 표 기반 경로 판정과 실제 subst/mklink /J/다른 워크트리 검증 추가.
- docs/dev-reports/2026-07-29-978-a1-qa-guard-path-matrix.md: 판정표, 실행 원문, 안전 정리 및 미검증 범위 기록.

커밋·브랜치 조작·PR 생성은 하지 않았다.
