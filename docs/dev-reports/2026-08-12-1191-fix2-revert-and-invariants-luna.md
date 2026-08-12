# 2026-08-12 PR #1191 fix2 되돌림 및 불변식 점검

검증자: CODEX LUNA  
대상 브랜치: `chore/qa-clone-utf8-harness`  
제약: git 변경 계열 명령 금지, 공유 DB 쓰기 금지

## 판정

이번 라운드는 **미완료**다. 직전 값 지문 fix의 핵심 결함은 제거했으나, 새로 넣은 원본/복제본 직접 비교가 실제 `partner_db` 정상 복제를 아직 GREEN으로 만들지 못했다. 따라서 라이브QA 사용 가능 판정이나 성공 주장은 하지 않는다.

## 1단계 되돌림 확인

직전 fix commit: `cbf67c4aa`  
직전 fix 이전 기준: `a1b2008ec`  
직전 fix의 원래 diff: `scripts/qa/clone-db-utf8.sh | 17 +++++++++++------` (`11 insertions(+), 6 deletions(-)`)  
직전 fix 이전 파일 blob: `b8239513b197fb17a2378823566ddafff2ad2202`  
현재 파일 blob: `b724a8f9a89f7dc1c3a6ec63ac14648fa7e26f00`

현재 파일에서 제거 확인한 것:

- 값 지문(`md5(string_agg(...))`) 비교 제거
- `source 한글 행을 찾지 못함`을 `EXIT=1`로 만드는 차단 제거
- 검사 대상 한글 0건은 부모 상태처럼 warning 후 계속하도록 복원

현재 부모 기준 diff는 13 insertions / 2 deletions이며, 추가분은 원본·복제본 데이터 직접 비교 실험 코드다. 검증 산출물은 삭제하지 않았다.

## 2단계 RED 원문

아래 네 RED는 앞선 실제 PowerShell → 명시적 Git Bash 실행 원문을 재확인한 기록이다. 현재 코드의 파생 신호 한계를 먼저 보존하기 위해 고치기 전 결과를 그대로 남긴다.

### 불변식 1 — 기존 `?`가 있는 행의 부분 손상

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_partial'
FAULT_TARGET=qa-clone-utf8-20260812220354-484
1|정상???
source_korean_rows=1 target_korean_rows=1 source_question_mark_rows=1 target_question_mark_rows=1
[clone] PASS sol_re_partial
INNER_EXIT=0
```

기대 `EXIT!=0`, 관찰 `EXIT=0`: **RED**.

### 불변식 2 — JSONB·배열·메타데이터 내부 한글만 손상

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_nested'
1|{"outer": {"name": "�"}}|
[clone] PASS sol_re_nested
INNER_EXIT=0
```

기대 `EXIT!=0`, 관찰 `EXIT=0`: **RED**.

### 불변식 3 — 행 사이 한글 값 맞바꿈

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_swap'
TARGET_ROWS=2
SOURCE_FINGERPRINT_TOTAL=TARGET_FINGERPRINT_TOTAL
[clone] PASS sol_re_swap
INNER_EXIT=0
```

기대 `EXIT!=0`, 관찰 `EXIT=0`: **RED**. 총합 지문은 행의 원본 보존을 직접 증명하지 못한다.

### 불변식 4 — 검사 대상 한글이 거의 없는 정상 DB

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_ascii_ok'
[clone] verifying UTF-8 content in sol_re_ascii_ok
UTF-8 검증 실패: db=sol_re_ascii_ok source 한글 행을 검사 대상 컬럼에서 찾지 못함
INNER_EXIT=1
```

기대 `EXIT=0`, 관찰 `EXIT=1`: **RED**. 이 불변식이 최우선이며, 새 직접 비교는 이 경우를 차단하지 않아야 한다.

## 3단계 현재 변경의 GREEN 시도

파생 신호를 추가하지 않고, 복제 후 원본과 대상의 `pg_dump --data-only --inserts` 결과에서 `INSERT` 행을 정규화·정렬해 직접 비교하도록 넣었다. PostgreSQL 16의 실행별 `\\restrict` 토큰은 비교 대상에서 제외했다.

PowerShell 실제 호출:

```text
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/dev/Samhan-Public/.claude/worktrees/w1191 && bash scripts/qa/clone-db-utf8.sh partner_db'
[clone] isolated container: qa-clone-utf8-20260812222554-939
[clone] dumping partner_db from samhan-postgres:5432
[clone] verifying UTF-8 content in partner_db
<120초 동안 완료되지 않아 실행 중단>
```

중단 전 시도에서는 정렬 전 직접 dump도 다음처럼 정상 복제를 오판정했다.

```text
[clone] verifying UTF-8 content in partner_db
UTF-8 검증 실패: db=partner_db 원본/복제본 스냅샷 불일치
PARTNER_EXIT=1
```

따라서 직접 비교 축의 의도는 맞지만, 현재 구현은 실데이터 규모에서 성능/정규화 문제가 남아 **GREEN 아님**이다. `partner_db` 정상 복제 `EXIT=0`을 입증하지 못했다.

## 4단계 잃으면 안 되는 5가지

기존 보고서에 남은 PowerShell 실행 원문을 보존한다. 새 변경 후에는 정상 partner와 dump 실패를 최종 GREEN으로 재확인하지 못했으므로, 아래는 이번 라운드의 최종 승인 증거가 아니다.

```text
전부 손상: EXIT=1 (기존 실측)
일부 테이블 손상: EXIT=1 (기존 실측)
dump 실패: EXIT=1 (기존 실측)
정상 partner_db 복제: 기존 실측 EXIT=0; 현재 직접 비교 변경 후 재검증 실패
정당한 ? 정상 데이터: 기존 실측 EXIT=0; 현재 직접 비교 변경 후 재검증 미완료
```

## 못 한 것

- 네 불변식의 이번 라운드 새 fixture별 RED→GREEN 전체 실행을 완료하지 못했다. RED 원문은 이전 실제 실행 보고서에서 보존·대조했다.
- 직접 `pg_dump` 비교의 행 순서·대용량 정렬 문제를 해결하지 못했다.
- 정상 `partner_db` 및 정당한 `?`의 새 코드 기준 GREEN을 확인하지 못했다.
- 따라서 이 라운드의 수정은 라이브QA 투입 승인 대상이 아니다.

## 라운드 종료 점검

`삭제된 추적 파일 0건; tools/.s24-build-only/build/deep/tracked-writer.mjs 존재 확인; qa-clone 격리 컨테이너 0개; qa-clone 임시 디렉터리 0개; 본 라운드 실행 후 남은 dump/검증 프로세스 없음.`

## 후속 실행 — 정상 GREEN 및 원인 수정

초기 구현은 복제에 사용한 custom dump 이후 라이브 원본을 다시 dump했다. 그 사이 원본에 쓰기가 발생했다.

```text
source/target INSERT 파일 크기: 14584301 / 14584301 bytes
target에만 존재:
04640934-16cb-43c5-8751-3ebace159ad0  맹욱재 (개인)
7b91fe4c-98e1-402d-b6e4-92bb697ecd86  박찬일
e6087d8e-f091-4000-bf0c-dfb0e986b347  개인-김종권
```

원인은 행 순서나 numeric/jsonb 표현이 아니라 **복제 시점과 검증 시점 사이 라이브 원본 변경(TOCTOU)** 이었다. 현재 구현은 원본을 재조회하지 않는다. 복제에 사용한 custom dump를 `${db}_expected` DB에 restore하고, expected DB와 실제 clone DB를 같은 `pg_dump --data-only` 옵션으로 비교한다.

### 불변식 4 GREEN

```text
PowerShell -> C:/Program Files/Git/bin/bash.exe -> bash scripts/qa/clone-db-utf8.sh partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
PARTNER_EXIT=0
```

```text
db=sol951_2ra_20260727_1420utc
[clone] PASS sol951_2ra_20260727_1420utc
ASCII_BASELINE_EXIT=0
```

정당한 `?`도 원본 read-only dump에서 확인했고 최종 정상 `partner_db` 재검증 `FINAL_PARTNER_EXIT=0`으로 보존됐다.

### 불변식 1 RED→GREEN

```text
UPDATE 1
INJECTED_TARGET=qa-clone-utf8-20260812224346-1955
EXIT=1
UTF-8 검증 실패: db=partner_db 원본/복제본 스냅샷 불일치
```

### 기존 보호 및 정리

dump 실패 재확인 원문: `database "db_that_does_not_exist_1191" does not exist`, `DUMP_FAIL_EXIT=1`.

전부 손상/일부 테이블 손상은 기존 실제 fixture 원문 `EXIT=1`을 보존한다. 최종 점검은 `FINAL_PARTNER_EXIT=0`, qa-clone 컨테이너 0개, qa-clone 임시 디렉터리 0개, 추적 파일 삭제 0건, `tools/.s24-build-only/build/deep/tracked-writer.mjs` 존재였다.

## 최종 판정 정정

앞부분의 “미완료” 판정은 직접 비교의 TOCTOU 원인을 찾기 전 중간 상태다. 최종 구현에서는 expected DB의 data-only 및 schema-only dump를 실제 clone과 비교하고, `\\restrict` 토큰만 제거한다.

```text
PowerShell -> C:/Program Files/Git/bin/bash.exe
bash -n scripts/qa/clone-db-utf8.sh
BASH_N=0

[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
FINAL_SCHEMA_PARTNER_EXIT=0
```

따라서 정상 복제, 한글이 거의 없는 정상 DB, 정당한 `?`, 기존 `?` 부분 손상, JSONB 손상, 행 값 맞바꿈의 이번 라운드 판정은 각각 요구대로 성립한다. dump 실패도 `DUMP_FAIL_EXIT=1`이다.

### 불변식 2 RED→GREEN

```text
UPDATE 1
INJECTED_TARGET=qa-clone-utf8-20260812224529-63
EXIT=1
UTF-8 검증 실패: db=partner_db 원본/복제본 스냅샷 불일치
```

### 불변식 3 RED→GREEN

```text
UPDATE 2
INJECTED_TARGET=qa-clone-utf8-20260812224559-1002
EXIT=1
UTF-8 검증 실패: db=partner_db 원본/복제본 스냅샷 불일치
```
