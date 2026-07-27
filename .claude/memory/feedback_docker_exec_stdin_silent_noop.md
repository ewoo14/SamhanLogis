---
name: docker-exec-stdin-silent-noop
description: docker exec 는 이 환경에서 stdin 을 전달하지 않아 heredoc SQL 이 조용히 무시된다 — "실행된 것처럼 보이나 0행 처리"
metadata:
  type: feedback
---

**`docker exec` 는 이 환경(Windows + Git Bash)에서 stdin 을 전달하지 않습니다.** heredoc 이 **조용히 무시**되고 `psql` 이 **아무 출력 없이 exit 0** 으로 끝납니다.

```bash
# ❌ 조용히 아무것도 안 함 — 성공처럼 보인다
docker exec samhan-postgres psql -U samhan -d slip_db <<'SQL'
DELETE FROM slip_lines WHERE ...;
SQL

# ✅ 파일 경유
MSYS_NO_PATHCONV=1 docker cp ./cleanup.sql samhan-postgres:/tmp/cleanup.sql
docker exec samhan-postgres psql -U samhan -d slip_db -f /tmp/cleanup.sql
```

`-c "SQL"` 형태는 정상 동작합니다. 문제는 **stdin 경유**뿐입니다.

**Why**: 2026-07-27 #937 fix 구현자가 throwaway 정리 SQL 을 heredoc 으로 돌렸고 *"실행된 것처럼 보였으나 0행 삭제"* 였습니다. 실패가 아니라 **무동작**이라 로그·exit code 어디에도 흔적이 없습니다. 정리 검증을 `git status` 나 exit code 로만 하면 **오염이 남은 채 "정리 완료"로 보고**됩니다.

**How to apply**: 컨테이너 안에서 여러 줄 SQL 을 돌려야 하면 **반드시 `docker cp` + `psql -f`**. 그리고 정리 후에는 **행 수를 다시 세어** 0 임을 확인하십시오 — 명령이 돌았다는 것과 데이터가 지워졌다는 것은 별개입니다.

같은 계열: [[feedback_gradle_test_cache_false_green]] — 명령이 성공했다는 신호와 실제로 일했다는 증거를 구분하는 문제.
