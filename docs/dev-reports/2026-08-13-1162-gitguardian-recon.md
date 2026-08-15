# PR #1162 GitGuardian 실패 원인 조사

- 조사일: 2026-08-13 KST
- PR: `#1162` (`fix/it-ephemeral-credentials`)
- 조사 HEAD: `4535b919f4e47b6c0bf6d3b1983fb7c7da8a2abd`
- 조사 원칙: git 읽기만 수행. 자격 원문은 출력·기록하지 않고 `<REDACTED>`로 표기.

## 결론

GitGuardian이 현재 HEAD에서 검출한 것은 **실제 자격 값이 아니라 환경변수 이름 `SAMHAN_SLIP_MINIO_SECRET_KEY`** 이다.

GitHub check-run `94339436517`의 공개 본문은 다음 1건을 지목한다.

| 항목 | 확인값 |
|---|---|
| Incident / occurrence | `35927897` / `288769213` |
| Detector | `Generic High Entropy Secret` |
| 최초 검출 커밋 | `ae2609670d8804618a1590e7eeab501f839bc04e` |
| 파일 | `infrastructure/scripts/ensure-local-env.ps1` |
| GitHub 추가 라인 | `R94` |
| GitGuardian이 값으로 해석한 토큰 | `SAMHAN_SLIP_MINIO_SECRET_KEY` — 자격 값이 아니라 env key 이름 |

검출 원문은 `1 secret uncovered!`, `scan of 8 commits`이다. 같은 incident는 최초 발생 시점인 check-run `93408726817`에서 두 occurrence로 보고됐다.

| occurrence | 당시 라인 | 현재 코드의 문맥 |
|---|---:|---|
| `288769213` | 94 | `$requiredKeys` 배열 |
| `288769243` | 84 | `$secretKeys` 배열 |

두 줄에 공통으로 연속 등장하는 부분은 아래와 같다. 여기에는 자격 값이 없다.

```text
'SAMHAN_S3_SECRET_KEY', 'SAMHAN_SLIP_MINIO_SECRET_KEY'
```

GitGuardian의 공개 detector 명세는 민감한 assigned variable 뒤의 `,`도 assignment token으로 인정하고, 뒤의 15자 이상 고엔트로피 문자열을 값으로 해석한다. 따라서 다음과 같이 오인한 것이다.

```text
assigned_variable = SAMHAN_S3_SECRET_KEY   # 이름에 secret 포함
assignment_token  = ,                      # 공식 명세상 허용
value             = SAMHAN_SLIP_MINIO_SECRET_KEY
```

후자의 길이는 28자, Shannon entropy 실측은 `3.798 bits/char`로 공개 임계값 `3`을 넘는다. 동일 토큰이 84·94행에 반복되므로 같은 incident 아래 두 occurrence로 묶인 것도 일치한다. 현재 check 본문에는 94행 occurrence 하나만 남아 있다.

따라서 **이 1건에 한해서는 근거가 확인된 false positive**다. `CHANGE_ME_LOCAL_ONLY` 플레이스홀더를 검출한 것도, 기본 브랜치 환경 때문에 실패한 것도 아니다.

## 1. 검출 항목

### 현재 HEAD의 권위 있는 check-run 출력

```text
NAME=GitGuardian Security Checks
CONCLUSION=failure
TITLE=1 secret uncovered!
SUMMARY=1 secret were uncovered from the scan of 8 commits in your pull request.

GitGuardian id: 35927897
Status: Triggered
Secret: Generic High Entropy Secret
Commit: ae2609670d8804618a1590e7eeab501f839bc04e
Filename: infrastructure/scripts/ensure-local-env.ps1
Line: R94
```

check-run의 `output.text`는 대시보드와 달리 secret 원문을 제공하지 않지만 incident·occurrence·커밋·파일·라인은 제공한다. 최초 실패 check-run까지 역추적하고 두 occurrence의 교집합 및 공개 detector 문법을 적용해 위 env key 이름을 특정했다.

### 커밋별 발생 시점

| PR 커밋 | GitGuardian | 비고 |
|---|---|---|
| `db692e813` | SUCCESS | `No secrets detected` |
| `d54df428c` | SUCCESS | `No secrets detected` |
| `ae2609670` | FAILURE | 최초 발생, 동일 incident의 84·94행 두 occurrence |
| `969294826` | FAILURE | 94행 occurrence 지속 |
| `21b555482` | FAILURE | 동일 incident 지속 |
| `99997034e` | FAILURE | 동일 incident 지속 |
| `83193b28c` | FAILURE | 동일 incident 지속 |
| `4535b919f` | FAILURE | 동일 incident 지속 |

`ae2609670`은 해당 스크립트를 새 파일로 추가한 커밋이고 현재 HEAD의 조상이며, `origin/main`의 조상은 아니다. 이 시점부터 실패했으므로 다른 PR과 다른 환경 문제가 아니라 PR 내용에 반응한 것이다.

## 2. 알아낸 경로와 명령 원문

### A. HEAD·PR·diff 기준 검증

```powershell
git rev-parse HEAD
git branch --show-current
git status --short
git rev-parse 4535b919f
git rev-parse origin/main
gh pr view 1162 --repo ewoo14/Samhan-Public --json number,state,headRefName,headRefOid,baseRefName,url,title

git diff --shortstat origin/main..HEAD
git diff --shortstat origin/main...HEAD
git merge-base origin/main HEAD
gh pr view 1162 --repo ewoo14/Samhan-Public --json changedFiles,additions,deletions,commits
```

결과:

```text
현재 HEAD = PR headRefOid = 4535b919f4e47b6c0bf6d3b1983fb7c7da8a2abd
작업트리 변경 0
origin/main...HEAD = 72 files changed, 649 insertions(+), 257 deletions(-)
origin/main..HEAD  = 134 files changed, 1008 insertions(+), 2644 deletions(-)
merge-base = e554b7cd472dd0b890a5d64d2fa9a9db4527f2ba
```

GitHub PR의 `72/+649/-257`은 merge-base 비교인 세 점(`...`)과 정확히 일치한다. 두 점(`..`)은 PR 브랜치가 마지막으로 main을 병합한 뒤 main에 생긴 변화까지 역방향으로 포함하므로 PR 전수조사 기준으로 사용하지 않았다.

### B. GitHub check-run 본문

```powershell
gh api 'repos/ewoo14/Samhan-Public/commits/4535b919f4e47b6c0bf6d3b1983fb7c7da8a2abd/check-runs?per_page=100'
gh api 'repos/ewoo14/Samhan-Public/check-runs/93408726817'
```

첫 명령의 GitGuardian `output.title / output.summary / output.text`에서 현재 1건을 확인했다. 두 번째 명령으로 최초 실패 시점의 두 occurrence를 확인했다. 응답의 remediation 문구는 revoke·rotate·history rewrite를 일반 지침으로 제시하지만, 해당 incident 토큰 자체는 env key 이름이다.

커밋별 재현에 사용한 명령:

```powershell
$shas = git log --reverse --format='%H' origin/main..HEAD
foreach ($sha in $shas) {
  gh api "repos/ewoo14/Samhan-Public/commits/$sha/check-runs?per_page=100"
}
```

### C. 검출 커밋과 라인

```powershell
git show -s --format='full=%H%nparents=%P%nauthorDate=%aI%nsubject=%s' ae2609670d8804618a1590e7eeab501f839bc04e
git diff-tree --no-commit-id --name-status -r ae2609670d8804618a1590e7eeab501f839bc04e -- infrastructure/scripts/ensure-local-env.ps1
git show ae2609670d8804618a1590e7eeab501f839bc04e:infrastructure/scripts/ensure-local-env.ps1
git blame -L 94,94 -- infrastructure/scripts/ensure-local-env.ps1
```

자격 원문 노출을 막기 위해 `git show` 결과는 메모리에서 84·94행의 quoted literal 이름과 길이·문자군·entropy만 추출했다. 값 RHS는 출력하지 않았다.

### D. 공식 detector 명세

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri 'https://docs.gitguardian.com/secrets-detection/secrets-detection-engine/detectors/generics/generic_high_entropy_secret'
```

2026-08-05 갱신 문서에서 확인한 핵심 조건:

- assigned variable 이름에 `secret`, `token`, `api key`, `credential`, `auth` 중 하나가 포함됨
- assignment token에 `,` 포함
- 값 정규식 길이 범위 15~1024자
- Shannon entropy 최소 3

### E. PR 추가·삭제 라인 전수

```powershell
git diff --unified=0 --no-color origin/main...HEAD
git grep -n -I -F '<메모리에서 추출한 값; 출력 시 REDACTED>' <merge-base> --
git log --reverse -S '<메모리에서 추출한 값; 출력 시 REDACTED>' --format='%H %aI %s' origin/main --
```

diff parser는 hunk의 old/new line counter를 별도로 추적하고, `password|secret|token|credential|access-key|PGPASSWORD|POSTGRES_|MINIO_|RABBIT_|JWT_` 문맥을 전수 분류했다. 실제 값은 문자열 길이·발생 파일·라인 수만 남겼다.

### F. 실행 중 개발 스택과 삭제값의 동등성 비교

```powershell
docker ps -a --filter 'name=samhan-' --format '{{.Names}}\t{{.Status}}'
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' <container>
```

`docker inspect` 값은 출력하지 않았다. merge-base의 삭제 대상 literal과 메모리 안에서 case-sensitive equality만 비교했다.

```text
postgres  source length 13 / live length 13 / exact_equal=True
minio     source length 13 / live length 13 / exact_equal=True
rabbit    source length 13 / live length 13 / exact_equal=True
grafana   source length 13 / live length 13 / exact_equal=True
internal service token source length 28 / live length 28 / exact_equal=True
```

## 3. 진짜 자격인가 플레이스홀더인가

### GitGuardian이 직접 검출한 토큰

`SAMHAN_SLIP_MINIO_SECRET_KEY`는 **진짜 자격도 플레이스홀더도 아닌 환경변수 이름**이다. 84·94행은 필요한 key 이름을 나열할 뿐 값은 없다.

실제 값은 다음 흐름에서 별도로 처리된다.

- `30~40`: `RandomNumberGenerator`로 24 random bytes 생성
- `121~124`: 이미 실행 중인 컨테이너가 있으면 기존 환경값 조회
- `126~132`: 기존 값이 없을 때만 random 값 생성
- `133~154`: key 이름에 메모리상의 값을 매핑
- `180`: gitignored `infrastructure/.env`에 기록
- `.gitignore:61`: `.env` 제외

따라서 현재 check 실패 1건은 검출 위치와 토큰까지 확인된 오탐이다.

### PR이 삭제한 값

반대로 PR의 삭제 라인에는 **진짜로 사용 중인 개발 자격**이 있다. 이것은 GitGuardian의 현재 1건과 별개의 중대 발견이다.

| 마스킹 분류 | origin/main 현재 발생 | PR 삭제 | 실사용 근거 |
|---|---:|---:|---|
| `<REDACTED: 13자 개발 스택 공통 비밀번호>` | 75파일 137회 | 43파일 88회 | PostgreSQL·MinIO·RabbitMQ·Grafana 컨테이너 값과 각각 exact match |
| `<REDACTED: 28자 내부 서비스 토큰>` | 71파일 95회 | 39파일 50회 | 실행 중 `samhan-slip-service` 값과 exact match |
| `<REDACTED: 9자 로컬 시드 로그인 비밀번호>` | 2파일 11회 | 2파일 11회 | `scripts/seed-local-stack.ps1:104~108`에서 5계정 로그인에 실제 사용 |
| `<REDACTED: 14자 probe DB 값>` | 1파일 1회 | 1파일 1회 | `scripts/probe-896-s2-fresh-postgres.ps1:9`의 DB 접속 변수 |
| `<REDACTED: 17자 고정 Testcontainers 값>` | 테스트 1곳 | PR에서 삭제 | 일회용 컨테이너용 고정값. 공유 개발 스택 자격이라는 증거는 없음 |

대표적인 실사용 삭제 위치:

- `infrastructure/docker-compose.yml:41,138,185`
- `infrastructure/docker-compose.local-all.yml:22,28,391,429,489,521,557,589,624`
- `services/*/src/main/resources/application.yml`의 DB·내부 토큰·MinIO fallback
- MinIO storage 구현 4곳의 `@Value` fallback
- `clients/web/estimate-app/lib/*.js`의 내부 토큰 fallback
- `scripts/seed-local-stack.ps1:104~108`

`origin/main`은 PR이 아직 열려 있으므로 이 값들을 현재도 포함한다.

## 4. 🔴 커밋 히스토리와 rotation

### 이력

마스킹 값별 `git log -S` 결과:

| 분류 | origin/main에서 확인된 가장 이른 count-change 커밋 | PR 제거 커밋 |
|---|---|---|
| 13자 개발 스택 공통 비밀번호 | `75f9a6192037af458d728285d8d244980555177f` (2026-05-04) | `db692e813`, `ae2609670` |
| 28자 내부 서비스 토큰 | `75f9a6192037af458d728285d8d244980555177f` (2026-05-04) | `ae2609670` |
| 9자 시드 로그인 비밀번호 | `5ac0445794b2c59d2ecaa48d14cb39aed6256b09` (2026-05-22) | `21b555482` |
| 14자 probe DB 값 | `ebf9737c9b74ca765f447077cab3bce9c18dfe59` (2026-07-29) | `21b555482` |
| 17자 고정 Testcontainers 값 | `4d28804cbeac20857928bddcaf26f5ce01cc9a52` (2026-05-05) | `21b555482` |

`git log -S`의 첫 행은 저장소에서 해당 문자열 count가 처음 바뀐 커밋을 뜻하며, 모든 최초 생성 경위를 보장하는 것은 아니다. 하지만 현재 `origin/main`에 값이 있고 실행 컨테이너와 일치한다는 판정에는 영향이 없다.

### rotation 판정

🔴 **rotation이 필요하다.** 이유는 다음 세 가지가 동시에 성립하기 때문이다.

1. 값이 현재 `origin/main`과 장기 git 이력에 평문으로 남아 있다.
2. 삭제 대상 13자 값과 내부 토큰이 현재 실행 중인 개발 스택 값과 exact match다.
3. PR의 `ensure-local-env.ps1:121~124`는 실행 중인 컨테이너가 있으면 그 기존 값을 재사용한다. 즉 PR을 merge하는 것만으로는 노출된 값을 폐기하지 않고 오히려 새 gitignored `.env`로 승계할 수 있다.

우선 rotation 대상:

- PostgreSQL 및 이를 공유하는 서비스 DB 자격
- RabbitMQ
- MinIO/S3 호환 key
- Grafana admin
- 내부 서비스 인증 토큰
- 아로로지스/JWT secret이 동일 패턴으로 노출·재사용됐는지 별도 equality 확인 후 함께 rotation
- 시드 계정이 공유 개발환경에서 실제 생성됐다면 해당 로그인 비밀번호

단순 로컬 Testcontainers 전용 고정값은 외부 서비스 폐기 대상이 아니다. probe 값도 현재 서비스 값과 같다는 증거는 없으므로 대상 시스템을 확인한 뒤 판정한다.

## 5. `.gitguardian.yaml` 대조

```powershell
git diff --name-status origin/main...HEAD -- .gitguardian.yaml
git log --format='%H %aI %s' origin/main..HEAD -- .gitguardian.yaml
git diff HEAD^ HEAD -- .gitguardian.yaml
git show ae2609670d8804618a1590e7eeab501f839bc04e:.gitguardian.yaml
git show HEAD:.gitguardian.yaml
```

확인 결과:

- `ae2609670`: 기존 `ignored-matches`와 `ignored-paths`를 전부 제거하고 `version: 2`만 남김. 같은 커밋에서 새 스크립트와 incident가 처음 생김.
- `4535b919f`: 문서·기록 9개 glob과 불변 Flyway/짝 IT 4파일을 `secret.ignored-paths`에 추가함.
- `infrastructure/scripts/ensure-local-env.ps1`은 HEAD allowlist 대상이 아님.
- `4535b919f` 직전 `83193b28c`도 이미 같은 incident로 FAILURE였음.

따라서 HEAD의 allowlist 축소/정리는 이번 incident를 새로 만든 원인이 아니다. allowlist 제거로 detector가 실질적으로 작동하게 된 것은 맞지만, 실패 표면은 PR이 추가한 env key 목록이다.

## 6. 다음 한 걸음

두 트랙을 분리해야 한다.

1. **GitGuardian check 복구는 코드 수준 fix로 가능**하다. incident `35927897`의 두 occurrence가 env key 이름임을 근거로, 이 토큰에만 한정된 inline ignore 또는 detector가 쉼표를 assignment로 오인하지 않도록 key 목록 표현을 바꾼 뒤 exact SHA check를 재실행한다. 스크립트 전체 path allowlist나 자격 값 기반 전역 allowlist는 쓰지 않는다.
2. **실제 자격 폐기는 개발책임자 조정이 필요**하다. 새 자격 생성 → gitignored env/secret store 배포 → 컨테이너·DB·메시지 브로커·스토리지·Grafana·서비스 토큰 동시 전환 → 기존 값 폐기 → 접속 회귀 검증 순서가 필요하다. PR merge만으로 rotation이 되지 않는다.

권고 우선순위는 **rotation 계획 확정 및 실행을 먼저 보안 blocker로 등록하고**, 병행해서 env key 이름 오탐만 좁게 해소하는 것이다. history rewrite는 협업 파괴 위험이 있으므로 별도 결정 사항이며, 이미 노출된 자격 폐기를 대체하지 못한다.

## 7. 알아내지 못한 것과 실패 원문

### 알아내지 못한 것

- 대시보드의 incident 상세 상태·GitGuardian 내부 fingerprint·자동 validity 결과는 권한 없이 조회할 수 없었다.
- 현재 check 본문이 최초의 84·94행 두 occurrence 중 94행만 표시하는 내부 dedup/state-transition 이유는 공개 API에 나오지 않는다.
- 아로로지스/JWT secret, 9자 시드 로그인, 14자 probe 값이 회사PC·공유 원격환경에서도 현재 유효한지는 이 PC의 컨테이너 equality만으로 단정할 수 없다.

이 미확인 사항은 현재 incident의 토큰 판정이나 13자 개발 스택 값·내부 토큰 rotation 필요성을 바꾸지 않는다.

### ggshield 설치·실행

기존 설치는 없었다. `uvx` 격리 실행으로 `ggshield 1.53.0`과 63개 패키지 설치는 성공했다.

최초 실행:

```powershell
uvx ggshield --version
uvx ggshield secret scan commit-range --help
```

실패 원문:

```text
ggshield, version 1.53.0
Installed 63 packages in 700ms
Error: 'cp949' codec can't decode byte 0xec in position 14: illegal multibyte sequence
```

UTF-8 강제 후 help는 성공했다.

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
uvx ggshield secret scan commit-range --help
```

요청된 스캔과 단일 커밋 격리 스캔:

```powershell
uvx ggshield secret scan commit-range 'origin/main..HEAD' --no-check-for-updates
uvx ggshield secret scan commit-range `
  'd54df428c6bbcba92e88a2aa02f93f56fef5b67a..ae2609670d8804618a1590e7eeab501f839bc04e' `
  --all-secrets --no-check-for-updates
```

두 명령의 종료코드는 `3`, 실패 원문은 동일했다.

```text
Warning: C:\dev\Samhan-Public\.claude\worktrees\w1162\.gitguardian.yaml: Config key ignored-paths is deprecated, use ignored_paths instead.
Error: A GitGuardian API key is needed to use ggshield.
To get one, authenticate to your dashboard by running:

    ggshield auth login

If you are using an on-prem version of GitGuardian, use the --instance option to point to it.
Read the following documentation for more information: https://docs.gitguardian.com/ggshield-docs/reference/auth/login
```

`--show-secrets`는 API key가 없는 데다 값 원문 노출 금지 때문에 실행하지 않았다. 권한이 생기더라도 JSON을 파일로 받아 마스킹 후 읽어야 한다.

### 대시보드 URL 직접 조회

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri 'https://dashboard.gitguardian.com/workspace/474443/incidents/35927897?occurrence=288769213'
```

HTTP 200, body 9,322 bytes였지만 애플리케이션 shell만 반환했고 body에 incident ID·occurrence ID·detector명이 없었다. 로그인 권한 없는 상세 데이터 우회 경로가 되지 못했다.

### 조사 helper의 비보안 실패·경고

PowerShell/.NET의 SHA helper 첫 시도:

```text
Method invocation failed because [System.Security.Cryptography.SHA256] does not contain a method named 'HashData'.
FullyQualifiedErrorId : MethodNotFound
```

`SHA256.Create().ComputeHash()`로 바꿔 메모리 내 동등성 표식만 계산했고 보고서에는 dictionary attack 보조정보가 될 수 있는 hash/fingerprint도 남기지 않았다.

`rg`에 존재하지 않는 경로를 함께 준 시도:

```text
rg: infrastructure/.gitignore: 지정된 파일을 찾을 수 없습니다. (os error 2)
```

실제 ignore 근거는 루트 `.gitignore:61`에서 확인했다.

`git log -S`는 결과를 정상 반환했지만 일부 `.docx` textconv에서 다음 경고가 네 번 발생했다.

```text
C:\Program Files\Git\usr\bin\astextplain: line 18: docx2txt.exe: command not found
```

해당 경고는 소스·설정 파일의 count-change 결과에 영향을 주지 않았고 명령 종료코드는 0이었다.

## fix 라운드

### 1. 선택한 수단과 이유

inline ignore가 아니라 **문제의 두 key 목록 표현만 변경**했다. `$secretKeys`와 `$requiredKeys`의 마지막 두 항목을 쉼표로 같은 배열에 이어 쓰지 않고, 기존 배열에 각각 `@('SAMHAN_S3_SECRET_KEY') + @('SAMHAN_SLIP_MINIO_SECRET_KEY')`를 결합했다. 이 표현은 PowerShell에서 동일한 두 문자열을 만들면서 민감한 변수명 뒤의 쉼표가 다음 고엔트로피 문자열의 assignment token으로 읽힐 구문을 제거한다.

이 수단이 더 좁은 이유는 다음과 같다.

- 두 배열의 해당 항목 표현만 바꾸며 실행 값과 key 목록 의미는 보존한다.
- 특정 토큰에 대한 inline ignore조차 추가하지 않으므로, 같은 줄에 향후 진짜 자격 값이 추가되는 경우까지 숨기지 않는다.
- `ensure-local-env.ps1` 전체 path, 전역 allowlist, 자격 값 기반 allowlist, `.gitguardian.yaml`은 변경하지 않았다.

### 2. 변경 전/후 라인 원문과 실제 바이트

변경 전 파일의 UTF-8 바이트:

```text
84:         'SAMHAN_AROLOGIS_JWT_SECRET', 'SAMHAN_S3_SECRET_KEY', 'SAMHAN_SLIP_MINIO_SECRET_KEY'
84 UTF-8 HEX: 20 20 20 20 20 20 20 20 27 53 41 4D 48 41 4E 5F 41 52 4F 4C 4F 47 49 53 5F 4A 57 54 5F 53 45 43 52 45 54 27 2C 20 27 53 41 4D 48 41 4E 5F 53 33 5F 53 45 43 52 45 54 5F 4B 45 59 27 2C 20 27 53 41 4D 48 41 4E 5F 53 4C 49 50 5F 4D 49 4E 49 4F 5F 53 45 43 52 45 54 5F 4B 45 59 27
94:         'SAMHAN_S3_ACCESS_KEY', 'SAMHAN_S3_SECRET_KEY', 'SAMHAN_SLIP_MINIO_SECRET_KEY'
94 UTF-8 HEX: 20 20 20 20 20 20 20 20 27 53 41 4D 48 41 4E 5F 53 33 5F 41 43 43 45 53 53 5F 4B 45 59 27 2C 20 27 53 41 4D 48 41 4E 5F 53 33 5F 53 45 43 52 45 54 5F 4B 45 59 27 2C 20 27 53 41 4D 48 41 4E 5F 53 4C 49 50 5F 4D 49 4E 49 4F 5F 53 45 43 52 45 54 5F 4B 45 59 27
```

변경 후 목록 결합 줄은 85·95행으로 이동했다.

```text
85:     ) + @('SAMHAN_S3_SECRET_KEY') + @('SAMHAN_SLIP_MINIO_SECRET_KEY')
85 UTF-8 HEX: 20 20 20 20 29 20 2B 20 40 28 27 53 41 4D 48 41 4E 5F 53 33 5F 53 45 43 52 45 54 5F 4B 45 59 27 29 20 2B 20 40 28 27 53 41 4D 48 41 4E 5F 53 4C 49 50 5F 4D 49 4E 49 4F 5F 53 45 43 52 45 54 5F 4B 45 59 27 29
95:     ) + @('SAMHAN_S3_SECRET_KEY') + @('SAMHAN_SLIP_MINIO_SECRET_KEY')
95 UTF-8 HEX: 20 20 20 20 29 20 2B 20 40 28 27 53 41 4D 48 41 4E 5F 53 33 5F 53 45 43 52 45 54 5F 4B 45 59 27 29 20 2B 20 40 28 27 53 41 4D 48 41 4E 5F 53 4C 49 50 5F 4D 49 4E 49 4F 5F 53 45 43 52 45 54 5F 4B 45 59 27 29
```

### 3. ggshield 스캔

변경 전·후 모두 다음 명령을 실행했다.

```powershell
$env:PYTHONUTF8='1'; $env:PYTHONIOENCODING='utf-8'
uvx ggshield secret scan commit-range 'origin/main..HEAD' --no-check-for-updates
```

두 실행의 원문은 동일했다.

```text
Warning: C:\dev\Samhan-Public\.claude\worktrees\w1162\.gitguardian.yaml: Config key ignored-paths is deprecated, use ignored_paths instead.
Error: A GitGuardian API key is needed to use ggshield.
To get one, authenticate to your dashboard by running:

    ggshield auth login

If you are using an on-prem version of GitGuardian, use the --instance option to point to it.
Read the following documentation for more information: https://docs.gitguardian.com/ggshield-docs/reference/auth/login
GGSHIELD_EXIT_CODE=3
```

### 4. 스크립트 정상 동작 확인

PowerShell 5.1에서 helper를 dot-source한 뒤 실제 초기화 경로를 실행했다. 자격 값 자체는 출력하지 않았다.

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ErrorActionPreference = 'Stop'
. '.\infrastructure\scripts\ensure-local-env.ps1'
$resultPath = Initialize-SamhanLocalEnv -ProjectRoot (Get-Location).Path
```

실행 원문:

```text
PARSE_ERRORS=0
INITIALIZE_RESULT_PATH=C:\dev\Samhan-Public\.claude\worktrees\w1162\infrastructure\.env
REQUIRED_KEY_COUNT=21
REQUIRED_KEY_MISSING_COUNT=0
PROCESS_ENV_SECRET_KEY_PRESENT=True
```

컨테이너 재사용 함수도 별도로 실행해 값 원문 없이 확인했다.

```powershell
. '.\infrastructure\scripts\ensure-local-env.ps1'
$existing = Get-RunningContainerEnvValue -Container 'samhan-postgres' -Key 'POSTGRES_PASSWORD'
```

```text
RUNNING_CONTAINER_VALUE_PRESENT=True
RUNNING_CONTAINER_VALUE_LENGTH=13
DOCKER_COMMAND_PRESENT=True
```

필수 key 검증과 기존 `.env`/컨테이너 값을 사용하는 초기화 경로를 막는 새 결함은 확인되지 않았다.

### 5. 손대지 않은 것

이번 라운드는 GitGuardian 오탐 해소만 수행했다. 실제 개발 스택 비밀번호와 내부 서비스 토큰의 rotation은 전부 별도 트랙이며, `.env`, 실행 중 컨테이너, DB, 브로커, 스토리지, Grafana, 서비스 자격, git history는 변경하지 않았다. `.gitguardian.yaml`도 변경하지 않았다.

### 6. 못 한 것

- GitGuardian 원격 API 인증 정보가 없어 변경 전·후 원격 GREEN 결과를 확인하지 못했다.
- ggshield의 로컬 스캔은 두 번 모두 API key 필요 오류로 종료 코드 3이었다.
- 개발책임자 결정 대기 중인 자격 rotation과 history rewrite는 수행하지 않았다.
