# QA 격리 DB UTF-8 복제

## 언제 쓰는가

공유 `samhan-postgres` 데이터를 라이브 QA용 격리 PostgreSQL 컨테이너로 복제할 때 사용합니다. 인자로 지정한 DB만 복제하며 원본은 `pg_dump`로 읽기만 합니다.

## 사용법

`infrastructure/.env.local`에 다음 자격을 설정하고 Git Bash에서 실행합니다.

```bash
export QA_CLONE_SOURCE_USER=samhan
export QA_CLONE_SOURCE_PASSWORD='원본 비밀번호'
export QA_CLONE_TARGET_USER=qa_clone
export QA_CLONE_TARGET_PASSWORD='격리본 비밀번호'
bash scripts/qa/clone-db-utf8.sh slip_db partner_db
```

스크립트는 custom-format dump를 파일로 만들고 격리 컨테이너에 복원합니다. 원본에 한글이 있던 스키마의 `text`/`varchar`/`char` 컬럼을 자동으로 찾아, 격리본에서 한글이 사라졌거나 `?`가 발견되면 DB·테이블·컬럼·행 수·표본을 출력하고 0이 아닌 코드로 종료합니다. 성공·실패와 관계없이 임시 컨테이너와 dump 파일은 정리합니다.

## 왜 PowerShell 파이프를 쓰면 안 되는가

실측 원문:

> 공유 원본 (samhan-postgres)   실서버 QA — 6월 택배비 지출결의  
>                               (주)한국냉동물류 · (주)서울택배  
> 격리 복제본                   ??? QA ? 6? ??? ????  
>                               ????? · ????

원인은 `pg_dump | pg_restore`를 PowerShell 파이프로 흘린 것입니다. 파이프가 바이너리 dump를 텍스트로 취급해 콘솔 코드페이지로 재인코딩할 수 있습니다. 이 스크립트는 파일 경유(`docker exec ... > dump`, `docker cp`)만 사용하므로 PowerShell 파이프를 통과하지 않습니다. 공유 DB에는 `CREATE`/`INSERT`/`UPDATE`를 실행하지 않습니다.

## 운영 주의

- DB 이름은 인자로 명시하고 자격은 스크립트에 기록하지 않습니다.
- QA 스크린샷 판정 전에 검증 PASS를 통과해야 합니다.
- 기본 격리 컨테이너 호스트 포트는 `55432`이며 `QA_CLONE_TARGET_PORT`로 바꿀 수 있습니다.
