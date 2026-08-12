# PR #1191 재수렴 적대검증 — 격리 DB UTF-8 복제 하네스

검증일: 2026-08-12  
검증자: CODEX SOL  
대상: `scripts/qa/clone-db-utf8.sh`  
원칙: 공유 `samhan-postgres`에는 `pg_dump`와 `SELECT`만 실행하고, 손상 주입은 별도 fixture/격리 컨테이너에만 실행

## 결론

**깨진 복제본이 통과하는 경로가 아직 있다. 멀쩡한 복제본이 차단되는 경로도 있다. 도달 가능한 결함은 3건이다.**

1. 컬럼 값의 정렬된 멀티셋만 지문화하므로, 두 행의 한글 값을 서로 바꿔 행-값 결합이 깨져도 `EXIT=0`이다.
2. `text`/`varchar`/`char` 밖의 JSONB·배열·메타데이터는 비교하지 않는다. DB 안의 무관한 검사 대상 한글 컬럼 하나가 `found=1`을 만족하면, 이 구조들의 한글을 깨뜨려도 `EXIT=0`이다.
3. 검사 대상 컬럼에 한글 행이 0개인 정상 DB는 무조건 `EXIT=1`이다. ASCII-only 정상 DB뿐 아니라 한글이 JSONB·배열·컬럼명·enum·주석에만 있는 정상 DB도 차단됐다.

직전 구멍 2건, 한 행·한 글자 손상, 검사 대상 한글이 0개인 JSONB/배열 손상, 메타데이터-only 손상, 검사 대상 문자열의 `?`·U+FFFD(`�`, UTF-8 `efbfbd`)·빈 문자열 치환은 모두 `EXIT=1`이었다. 실제 `partner_db`와 원래부터 정당한 `?`가 있는 정상 복제는 `EXIT=0`이었다.

## 도달 가능한 결함

### SOL-RC-1 — 값 멀티셋이 같으면 행-값 결합 손상이 PASS

소스의 `id=1|서울`, `id=2|부산`을 격리본에서 `id=1|부산`, `id=2|서울`로 맞바꿨다. 행별 데이터는 깨졌지만 컬럼의 값 멀티셋과 한글/물음표 행 수가 모두 같아 통과했다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_swap'
FAULT_TARGET=qa-clone-utf8-20260812220812-290
UPDATE 2
1|부산
2|서울
INJECTED=True
[clone] isolated container: qa-clone-utf8-20260812220812-290
[clone] dumping sol_re_swap from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_swap
[clone] PASS sol_re_swap
[clone] PASS all databases; isolated container and dump files will be removed
INNER_EXIT=0
LEFTOVERS=
```

### SOL-RC-2 — 무관한 한글 text가 있으면 미검사 구조 손상이 PASS

`a_guard.name='정상'`을 그대로 둔 채 JSONB 중첩 한글을 U+FFFD로, 한글 배열을 빈 문자열로 바꿨다. `a_guard`가 DB 수준 `found=1`을 만족했고 JSONB·배열은 컬럼 순회 대상이 아니어서 통과했다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_unchecked'
FAULT_TARGET=qa-clone-utf8-20260812220823-625
UPDATE 1
정상|{"outer": {"name": "�"}}|
INJECTED=True
[clone] dumping sol_re_unchecked from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_unchecked
[clone] PASS sol_re_unchecked
[clone] PASS all databases; isolated container and dump files will be removed
INNER_EXIT=0
LEFTOVERS=
```

같은 조건에서 한글 컬럼명을 `broken_name`으로 바꾸고 한글 테이블 주석을 `BROKEN`으로 바꿔도 통과했다. enum 한글 값은 복제본에 남겨 두었다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_meta_decoy'
FAULT_TARGET=qa-clone-utf8-20260812220831-1313
DO
COMMENT
정상|broken_name|integer
정상|state|USER-DEFINED
INJECTED=True
[clone] dumping sol_re_meta_decoy from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_meta_decoy
[clone] PASS sol_re_meta_decoy
[clone] PASS all databases; isolated container and dump files will be removed
INNER_EXIT=0
LEFTOVERS=
```

### SOL-RC-3 — 검사 대상 한글 0건인 정상 DB가 차단됨

손상시키지 않은 ASCII-only 정상 DB가 차단됐다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd <repo> && bash scripts/qa/clone-db-utf8.sh sol_re_ascii_ok'
[clone] isolated container: qa-clone-utf8-20260812220529-1060
[clone] dumping sol_re_ascii_ok from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_ascii_ok
UTF-8 검증 실패: db=sol_re_ascii_ok source 한글 행을 검사 대상 컬럼에서 찾지 못함
EXIT=1
LEFTOVERS=
```

손상시키지 않은 JSONB/배열-only 정상 DB와 컬럼명/enum/주석-only 정상 DB도 같은 이유로 각각 `EXIT=1`이었다.

```text
db=sol_re_nested    EXIT=1
UTF-8 검증 실패: db=sol_re_nested source 한글 행을 검사 대상 컬럼에서 찾지 못함

db=sol_re_metadata  EXIT=1
UTF-8 검증 실패: db=sol_re_metadata source 한글 행을 검사 대상 컬럼에서 찾지 못함
```

## 요구된 9가지 실행 원문과 exit code

모든 호출은 PowerShell에서 명시적 Git Bash를 실행했다. `<fixture exports>`에는 별도 fixture의 사용자·비밀번호, `host.docker.internal:55691`, 격리 대상 포트 `55692`가 들어갔다. 자격은 출력하지 않았다.

### 1. 직전 구멍 2건

기존 `?`가 있는 `정상?한글`을 격리본에서 `정상???`으로 부분 손상했다. 한글 행과 물음표 행 수가 각각 원본과 같은 `1`, `1`이어도 지문 차이로 차단됐다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_partial'
FAULT_TARGET=qa-clone-utf8-20260812220354-484
UPDATE 1
1|정상???
INJECTED=True
[clone] dumping sol_re_partial from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_partial
UTF-8 검증 실패: db=sol_re_partial table=public.z_target column=name source_korean_rows=1 target_korean_rows=1 source_question_mark_rows=1 target_question_mark_rows=1
INNER_EXIT=1
LEFTOVERS=
```

검사 대상 문자열에는 한글이 없고 JSONB 중첩/배열에만 한글이 있는 DB에서 JSONB를 U+FFFD, 배열을 빈 문자열로 손상했다. `found=0` 차단으로 통과하지 않았다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_nested'
FAULT_TARGET=qa-clone-utf8-20260812220417-760
UPDATE 1
1|{"outer": {"name": "�"}}|
INJECTED=True
[clone] dumping sol_re_nested from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_nested
UTF-8 검증 실패: db=sol_re_nested source 한글 행을 검사 대상 컬럼에서 찾지 못함
INNER_EXIT=1
LEFTOVERS=
```

### 2. 한 행·한 글자 손상

한 행의 `한글`에서 한 글자만 다른 정상 한글로 바꿔 `한나`로 만들었다. 한글 행 수 `1→1`, 물음표 행 수 `0→0`인 상태에서도 지문 차이로 차단됐다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_onechar'
UPDATE 1
FAULT_TARGET=qa-clone-utf8-20260812220859-1485
1|한나
INJECTED=True
[clone] dumping sol_re_onechar from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_onechar
UTF-8 검증 실패: db=sol_re_onechar table=public.z_target column=name source_korean_rows=1 target_korean_rows=1 source_question_mark_rows=0 target_question_mark_rows=0
INNER_EXIT=1
LEFTOVERS=
```

폴링 중 테이블 생성 직후 트랜잭션 경계에서 선행 `UPDATE` 1회가 `relation "z_target" does not exist`로 실패했고, 재시도된 위 `UPDATE 1`만 실제 주입이다.

### 3. 한글이 JSONB·배열·중첩 구조 안에만 있음

1번 두 번째 실행과 같다. 손상 복제는 `INNER_EXIT=1`이었다. 다만 무관한 한글 text 컬럼이 함께 있으면 SOL-RC-2처럼 동일 구조 손상이 `INNER_EXIT=0`이다.

### 4. 한글이 컬럼명·enum 값·주석처럼 데이터 밖에만 있음

소스에는 한글 컬럼명, 한글 enum 값, 한글 테이블 주석만 있었다. 격리본의 컬럼명과 주석을 ASCII로 손상했지만 검사 대상 한글 행 0건 규칙으로 차단됐다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc <fixture exports> 'bash scripts/qa/clone-db-utf8.sh sol_re_metadata'
FAULT_TARGET=qa-clone-utf8-20260812220425-1308
DO
COMMENT
broken_name|integer
state|USER-DEFINED
INJECTED=True
[clone] dumping sol_re_metadata from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_metadata
UTF-8 검증 실패: db=sol_re_metadata source 한글 행을 검사 대상 컬럼에서 찾지 못함
INNER_EXIT=1
LEFTOVERS=
```

다만 무관한 한글 text 컬럼이 함께 있으면 SOL-RC-2의 메타데이터 재현처럼 `INNER_EXIT=0`이다.

### 5. `?`·U+FFFD·빈 문자열 치환

검사 대상 `text`에서 실행한 세 치환은 모두 차단됐다.

```text
# 한글 -> 한?
FAULT_TARGET=qa-clone-utf8-20260812220405-54
UPDATE 1
1|한?
UTF-8 검증 실패: db=sol_re_onechar table=public.z_target column=name source_korean_rows=1 target_korean_rows=1 source_question_mark_rows=0 target_question_mark_rows=1
INNER_EXIT=1
LEFTOVERS=

# 한글 -> U+FFFD; hex=efbfbd
FAULT_TARGET=qa-clone-utf8-20260812220433-698
UPDATE 1
1|�|efbfbd
UTF-8 검증 실패: db=sol_re_fffd table=public.z_target column=name source_korean_rows=1 target_korean_rows=0 source_question_mark_rows=0 target_question_mark_rows=0
INNER_EXIT=1
LEFTOVERS=

# 한글 -> 빈 문자열
FAULT_TARGET=qa-clone-utf8-20260812220445-66
UPDATE 1
1|0|
UTF-8 검증 실패: db=sol_re_empty table=public.z_target column=name source_korean_rows=1 target_korean_rows=0 source_question_mark_rows=0 target_question_mark_rows=0
INNER_EXIT=1
LEFTOVERS=
```

PowerShell `Start-Job`의 오류 스트림 직렬화에서는 실패 문구의 한글이 mojibake로 표시됐다. 위 DB/테이블/컬럼/수치와 종료코드는 직렬화된 원문에서 그대로 읽혔고, 동일한 `found=0` 실패 문구는 직접 PowerShell 호출에서 UTF-8로 재확인했다.

### 6. 정상 `partner_db` 복제

공유 DB에는 스크립트의 dump/조회만 실행했다.

```text
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd <repo> && bash scripts/qa/clone-db-utf8.sh partner_db'
[clone] isolated container: qa-clone-utf8-20260812220549-1234
[clone] dumping partner_db from 127.0.0.1:5432
[clone] verifying UTF-8 content in partner_db
[clone] PASS partner_db
[clone] PASS all databases; isolated container and dump files will be removed
PARTNER_EXIT=0
LEFTOVERS=
```

### 7. 원래부터 정당한 `?`가 있는 정상 복제

소스 한 행은 실제로 `문의?확인해니다`였고 손상 없이 복제했다.

```text
SOURCE_LEGIT_QUESTION:
1|문의?확인해니다
POWERSHELL_COMMAND=& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd <repo> && bash scripts/qa/clone-db-utf8.sh sol_re_question_ok'
[clone] isolated container: qa-clone-utf8-20260812220524-1388
[clone] dumping sol_re_question_ok from host.docker.internal:55691
[clone] verifying UTF-8 content in sol_re_question_ok
[clone] PASS sol_re_question_ok
[clone] PASS all databases; isolated container and dump files will be removed
EXIT=0
LEFTOVERS=
```

### 8. 한글이 거의 없는 정상 DB

ASCII-only 정상 DB가 `EXIT=1`로 차단됐다. 4번의 메타데이터-only 정상 DB, 3번의 JSONB/배열-only 정상 DB도 손상 없는 기준선에서 각각 `EXIT=1`이었다. 실행 원문은 SOL-RC-3에 기록했다.

### 9. PowerShell 실제 호출 환경

위 1~8과 추가 결함 재현을 모두 PowerShell에서 다음 형태로 실행했다.

```text
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd <repo> && bash scripts/qa/clone-db-utf8.sh <db>'
```

PowerShell 경유 결과는 손상 차단 `1`, 손상 통과 `0`, 정상 통과 `0`, 정상 오차단 `1`을 각각 그대로 보존했다. bare `bash`는 이 PC에서 `C:\WINDOWS\system32\bash.exe`이므로 사용하지 않았다.

## 증거 무결성 대조

`2026-08-12-1191-fix-detection-holes-luna.md`의 관련 실측과 대조했다.

- 기존 `?` 행 부분 손상: 보고된 `source/target korean=1/1`, `question=1/1`, `INNER_EXIT=1`을 재현했다.
- 검사 대상 한글 0건 + JSONB 손상: 보고된 `source 한글 행을 검사 대상 컬럼에서 찾지 못함`, `INNER_EXIT=1`을 재현했다.
- 정상 부분손상 fixture: 손상 없는 `sol_re_partial`이 `PASS`, `EXIT=0`임을 재현했다.
- 실제 `partner_db`: 정상 복제 `PARTNER_EXIT=0`을 재현했다.
- 공유 원본 `partners.name`: 현재 읽기 전용 실측도 `8314|0`, 조회 exit `0`이었다.
- 거래처명 `(주)서울택배`, `(주)한국냉동물류`, `대한화물서비스(주)` 세 값도 현재 원본에서 조회 exit `0`으로 재현됐다.
- Git Bash 문법 검사 `GIT_BASH_N=0`을 재현했다.

대조한 실측 출력에는 불일치가 없었다. 기존 보고서가 재현하지 않은 SOL-RC-1, SOL-RC-2, SOL-RC-3은 이번 실행에서 새로 확인했다.

## 못 한 것

- `?`, U+FFFD, 빈 문자열 외의 모든 가능한 유니코드 대체문자를 전수하지 않았다.
- `pg_restore` 자체 실패나 소스 DB 부재 경로는 이번 9개 질문 범위에서 다시 실행하지 않았다.

## 라운드 종료 점검

정리 후 최종 점검 결과를 아래 한 줄에 기록한다.

`삭제된 추적 파일 0건; tools/.s24-build-only/build/deep/tracked-writer.mjs 존재(42 bytes); 본 라운드 격리/fixture 컨테이너 0개; qa-clone dump 임시 디렉터리 0개; clone/fixture 검증 프로세스 0개.`
