# S1 자격 `.env` 이전 — 이슈 #1101

## 결정 및 실제 파일

- 실제 자격 파일: `infrastructure/.env.local` (저장소 추적 밖)
- 추적 가능한 키 목록: `infrastructure/env-templates/qa-credentials.env` (값 없음)
- 키: `QA_DEV_DEFAULT_PASSWORD`, `QA_MASTER_PASSWORD`, 계정별 `QA_*_LOGIN_ID`/`QA_*_PASSWORD`
- 양 PC 절차: `docs/dev-environment-setup-multi-pc.md`에 복사·입력 절차를 추가했다.
- `git check-ignore` 확인: `.gitignore:61-63`의 `.env`, `.env.local`, `.env.*.local` 규칙으로 실제 파일이 무시된다.

## RED-C 실증 원문

`infrastructure/.env.local`을 구현자가 직접 파싱해 `QA_DEV_MANAGER_LOGIN_ID`와 `QA_DEV_MANAGER_PASSWORD`를 읽었다.

```text
status=200; token=<redacted>; token_present=True; source=C:\dev\Samhan-Public\.claude\worktrees\t1101\infrastructure\.env.local
```

호출: `POST http://127.0.0.1:8080/api/v1/auth/login` · 응답 `200` · 토큰 원문 미출력. Docker·서비스 재기동은 하지 않았다.

## RED-A / RED-B 측정

| 측정 | 결과 |
|---|---:|
| `origin/main` 기준 `git grep -c` 파일 수 | 78 |
| `origin/main` 기준 평문 발생 건수 | 144 |
| 수정 후 docs 평문 발생 건수 | 0 |
| 수정 후 docs 파일 수 | 0 |
| 계정명 표본 | 유지 |

브리핑의 73파일·132건과 달리, 작업 시점의 `origin/main`을 동일 명령으로 재측정한 값은 78파일·144건이었다. 세 패턴은 docs에서 각각 0건이다.

## RED-D 가드

`scripts/check-credential-plaintext.sh`에 `PATTERN_DEV_QA`를 추가하고, 문서 스캔 범위에 연결했다. 새 패턴은 문서 범위만 검사하도록 해 개발 시드 migration·기존 테스트의 의도된 개발 전용 표본을 오차단하지 않는다.

- 새 패턴 대상 docs 직접 스캔: 0건
- 추적 저장소 전체 스캔: 기존 seed/test 및 QA harness에 같은 문자열이 남아 있음. 이번 S1의 명시 범위인 docs 밖이므로 수정하지 않았다.
- 기존 전체 guard 실행: Windows Git Bash에서 기존 패턴들의 반복 recursive grep이 5분 제한 내 완료되지 않아 PASS/FAIL 원문을 확보하지 못했다.

## 새로 만든 파일

- `infrastructure/env-templates/qa-credentials.env`
- `docs/dev-reports/2026-08-07-1101-s1-credential-env-migration.md`

`infrastructure/.env.local`은 실제 자격 파일이지만 `.gitignore`에 의해 `git status --porcelain` 목록에 나타나지 않는 것이 정상이다.

## 남은 차단

기존 전체 guard의 반복 스캔 성능 문제는 별도 DevOps 작업으로 남긴다. S1 변경 자체는 docs RED-A 0건, 계정명 보존, `.env.local` 직접 로그인 200, 새 문서 패턴 0건까지 확인했다.

## 2026-08-07 범위 확장 — 운영 문서 7건

PM 재검증으로 확인된 `.claude/memory/` 6건과 `README.md` 1건의 비밀번호 값만 제거했다. 계정명과 각 문장의 규칙·가이드 의미는 유지하고, 모두 `infrastructure/.env.local` 또는 해당 키 참조로 바꿨다. `.gitguardian.yaml:22-34`는 변경하지 않았다.

확장 후 대상 범위(`docs/`, `.claude/memory/`, `README.md`)의 세 평문 패턴은 `git grep` 기준 0건이다.

### RED-D 좁은 가드 실측

기존 전체 가드의 느린 recursive scan을 피하기 위해 S1 전용 범위를 추가했다. 다음 명령을 실제 실행했다.

```text
CREDENTIAL_GUARD_SCOPE=s1 bash scripts/check-credential-plaintext.sh
============================================================
 SP-08-8 자격 평문 비공개 가드 — 검사 시작
============================================================
 [PASS] S1 docs/memory 개발 QA 평문 없음
```

검사 범위는 추적된 `docs/`와 `.claude/memory/`이며, 걸린 건수는 0건이다. 따라서 오차단 대상도 0건이고, 정상 문서를 차단하지 않았다. `README.md`는 별도로 `git grep` 0건을 확인했다.
