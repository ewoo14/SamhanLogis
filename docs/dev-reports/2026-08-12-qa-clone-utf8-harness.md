# QA 격리 복제 하네스 UTF-8 안전화 실측 보고서

일시: 2026-08-12  
범위: `scripts/qa/clone-db-utf8.sh`, `docs/qa/clone-db-utf8-README.md` 및 본 보고서만 작성

## 1. RED — PowerShell 파이프 재현

실행 명령:

```powershell
docker exec samhan-postgres pg_dump -U samhan -d partner_db -Fp | Out-File -LiteralPath C:\Windows\Temp\qa-red-pipe.sql -Encoding ascii
docker exec qa-red-pipe-utf8 psql -U qa_clone -d partner_db -f /tmp/partner_db.sql
docker exec qa-red-pipe-utf8 psql -U qa_clone -d partner_db -At -c "SELECT partner_code, name FROM public.partners WHERE name LIKE '%?%' LIMIT 3"
```

출력 원문:

```text
CREATE INDEX
ALTER TABLE
ALTER TABLE
P0-6-C001|(?)??????
P0-6-C002|(?)????
P0-6-C003|???????(?)
P0-6-C001|(?)??????
```

공유 원본 `partner_db`의 한글 거래처명이 PowerShell 텍스트 파이프를 거친 복제본에서 `?`로 바뀌었다.

## 2. GREEN — 새 파일 경유 복제

실행 명령:

```powershell
$env:QA_CLONE_ENV_FILE='C:/dev/Samhan-Public/.claude/worktrees/w1158/infrastructure/.env.local'
$env:QA_CLONE_SOURCE_USER='samhan'
$env:QA_CLONE_SOURCE_PASSWORD='samhan_dev_pw'
$env:QA_CLONE_TARGET_USER='qa_clone'
$env:QA_CLONE_TARGET_PASSWORD='qa_clone_pw'
$env:QA_CLONE_SOURCE_HOST='127.0.0.1'
$env:QA_CLONE_TARGET_PORT='55433'
& 'C:\Program Files\Git\bin\bash.exe' -lc 'bash scripts/qa/clone-db-utf8.sh partner_db'
```

출력 원문:

```text
[clone] isolated container: qa-clone-utf8-20260812152646-787
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
```

검증 대상은 스키마에서 동적으로 찾은 `text`/`character varying`/`character` 컬럼이다. 원본에 한글 행이 있는 컬럼만 비교하며, 원본 대비 한글 행 감소 또는 물음표 행 증가 시 실패한다. 원문부터 있던 물음표는 허용하여 오탐을 막았다.

## 3. 가드 실패 — 격리 복제본 일부러 훼손

복제 완료 직후 격리 컨테이너의 `public.partners.name` 한 건만 `????`로 변경했다.

실행 출력 원문:

```text
corrupted=P0-6-C001 UPDATE 1
[clone] isolated container: qa-clone-utf8-20260812153339-1026
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
UTF-8 검증 실패: db=partner_db table=public.partners column=name source_korean_rows=8314 target_korean_rows=8313 source_question_mark_rows=0 target_question_mark_rows=1
  target sample: (二??쒖슱?앸같
??쒗솕臾쇱꽌鍮꾩뒪(二?
(二??좎쁺?ъ옣?먯옱
```

종료 코드는 1이었다. 실행 환경 PowerShell의 일부 오류 스트림 표시는 다음과 같이 부가 래핑되었다.

```text
CategoryInfo          : NotSpecified
FullyQualifiedErrorId : NativeCommandError
```

## 4. 정리 확인

모든 실측은 `trap` 또는 명시적 정리로 임시 컨테이너와 dump 파일을 제거했다. 공유 `samhan-postgres`에는 `pg_dump`/`psql SELECT`만 실행했고, 공유 DB에 쓰기 SQL을 실행하지 않았다. Git 명령은 실행하지 않았다.

## 결론

파일 경유 custom-format 복제는 Git Bash에서 실제 `partner_db`를 대상으로 한글 검증 PASS를 통과했다. PowerShell 파이프 방식의 `?` 변형은 재현되었고, 새 가드는 의도적으로 훼손한 격리 복제본을 0이 아닌 코드로 검출했다.
