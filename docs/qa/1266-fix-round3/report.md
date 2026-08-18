# PR #1266 fix 라운드 3 QA 보고

실행일: 2026-08-18 (KST)  
브랜치: `fix/uuid-not-in-api-response`  
검증 기준: `dcf89db8d`

## ① 401 실제 원인 — 요청·응답·서버 로그 원문

브랜치 `slip-service`의 `HeaderAuthenticationFilter`는 보호 경로에서 먼저 `X-Samhan-Gateway-Attestation`을 검증하고, 그 다음 `X-User-Id`로 인증을 만든다. 첫 기동에서는 attestation을 Spring 옵션 `--SAMHAN_GATEWAY_ATTESTATION=...`으로 잘못 전달해 환경변수가 비어 있었다. `SecurityConfig`가 다음 원문으로 부팅을 중단했다.

```text
SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled
```

부팅 후 attestation 없이 같은 요청을 직접 보낸 원문이다.

```text
curl.exe -sS -D - "http://127.0.0.1:28086/slips/cleanup/history?programType=SLIP_CLEANUP&mode=MANUAL_NAMED&page=0&size=50" -H "X-User-Id: a0000000-0000-0000-0000-000000000001"

HTTP/1.1 401 
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Pragma: no-cache
Expires: 0
X-Frame-Options: DENY
Content-Length: 0
Date: Mon, 17 Aug 2026 17:52:05 GMT

--- response body ---

```

응답 본문은 빈 문자열(`Content-Length: 0`)이다. 서버 로그 원문에는 401 전용 메시지가 없었다. 해당 필터가 컨트롤러보다 앞에서 즉시 응답하기 때문이다.

```text
2026-08-18T02:48:00.889+09:00 ... Started SlipServiceApplication in 16.349 seconds (process running for 17.031)
2026-08-18T02:48:23.115+09:00 ... Initializing Spring DispatcherServlet 'dispatcherServlet'
2026-08-18T02:48:23.116+09:00 ... Completed initialization in 1 ms
2026-08-18T02:48:23.195+09:00 ... Serializing PageImpl instances as-is is not supported ...
```

즉 원인은 토큰 만료나 역할 부족이 아니라, 브랜치 서비스 기동 시 필수 gateway attestation 환경변수가 전달되지 않은 실행 조건이었다. `docker logs samhan-api-gateway --since 10m`에서 `401`, `cleanup/history`, `auth/login`을 찾은 결과는 빈 출력이었다.

## ② 브랜치 JAR 기동 및 인증 방법

- 공유 `samhan-postgres`를 읽어 `codex1266-r3-pg` 격리 PostgreSQL(포트 15467)에 `slip_db`, `inventory_db`, `groupware_db`를 복제했다. 공유 DB에는 write하지 않았다.
- 브랜치 JAR를 `services/slip-service/build/libs/slip-service.jar`로 기동했다.
- slip-service: `127.0.0.1:28086`
- 실제 `SAMHAN_GATEWAY_ATTESTATION`, `SAMHAN_INTERNAL_TOKEN`, DB 자격은 환경변수로만 주입했다. QA 비밀번호는 `resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')`로 취득했으며 보고서에 평문을 기록하지 않았다.
- 로그인 요청: `POST http://127.0.0.1:8080/auth/login`, `dev_master`
- 로그인 원문 요약:

```text
LOGIN status=200 bodyKeys=success,code,message,data,timestamp
COOKIE access_token=true
JWT payload keys=sub,iat,exp,departmentName,name,isSystemMaster,groups
JWT sub present=true groupsType=string isSystemMaster=true
```

- 격리 프록시가 로그인 쿠키의 JWT payload에서 `sub`, `groups`, `isSystemMaster`를 읽고 실제 attestation과 함께 `X-User-Id`, `X-User-Groups`, `X-Is-System-Master`, `X-Samhan-Gateway-Attestation`을 브랜치 JAR로 전달했다.
- 정상 요청은 브랜치 직접 URL에서 `200`이었고, 저장 후 목록 응답은 `totalElements=2`였다.

## ③ A — 전표정리 저장내역 목록

실제 Playwright에서 로그인 → `/sales/slip-cleanup` → `저장내역` 탭 → `조회`를 클릭했다.

```text
A 목록 행 수=2
A 화면 주제=2026. 08. 18. 오전 02:50	사용자	PR1266-R3 실제 복원 검증	명시	1
GET /slips/cleanup/history?programType=SLIP_CLEANUP&mode=MANUAL_NAMED&page=0&size=50&from=2026-08-01&to=2026-08-18 -> 200 rows=2, totalElements=2
```

격리 DB에 검증용 명시 저장 1건을 만든 뒤 목록에서 행이 2건으로 확인됐다. 목록 화면에는 `PR1266-R3 실제 복원 검증`, 전표 수 `1` 및 기존 행의 전표 수 `0`이 보였다.

## ④ B — 목록 행 클릭 후 상세 복원

첫 번째 실제 행을 클릭했다. UUID를 화면에서 사용자가 보거나 입력하지 않았고, 클릭 이벤트가 내부 id로 상세 API를 호출했다.

```text
GET /slips/cleanup/history/87676a7d-e10b-41d5-90e6-82fc8b24fe39 -> 200 detailTopic=PR1266-R3 실제 복원 검증, payloadEntries=1
B 복원 배너="복원: 2026. 08. 18. 오전 02:50 사용자 'PR1266-R3 실제 복원 검증'\n닫기"
B 복원 payload 화면 식별자=QA-1266-R3 visible=true
```

복원 후 실행 탭에서 `전표 정리 리스트 총 1건`, 전표번호 `QA-1266-R3`, 거래처 `QA1266`, 지역 `서울`, 라인 수 `1`, 합계 `₩125,000`이 화면에 표시됐다. 전표정리 목록→상세 복원 성공이다.

## ⑤ C — 인쇄·tooltip 표시 축

이번 복원 화면에서 실제 표시 텍스트와 캡처를 확인했다. 복원 화면에는 UUID가 표시되지 않고 전표번호·거래처코드·거래처명·지역·금액만 표시됐다. 이 화면에는 별도 인쇄 버튼이나 UUID tooltip이 존재하지 않아 인쇄·tooltip 전수 검증은 완료하지 못했다.

## ⑥ 스크린샷 — 직접 열어 확인한 결과

캡처는 `resolveQaShotsDir()`를 사용했고 실행 시 `QA_SHOTS_DIR=C:\dev\Samhan-Public\.claude\worktrees\wuuid\docs\qa\1266-fix-round3\screenshots`를 지정했다. 두 PNG 모두 생성 후 직접 열어 화면 내용을 확인했다.

1. [01-slip-cleanup-history-list.png](C:/dev/Samhan-Public/.claude/worktrees/wuuid/docs/qa/1266-fix-round3/screenshots/01-slip-cleanup-history-list.png) — 목록 표 **2행**. 저장주제 2건, 전표 수 `1`과 `0` 확인.
2. [02-slip-cleanup-restored.png](C:/dev/Samhan-Public/.claude/worktrees/wuuid/docs/qa/1266-fix-round3/screenshots/02-slip-cleanup-restored.png) — 복원 화면 **1건**. 복원 배너, `QA-1266-R3`, 거래처, 지역, 라인 수, 합계금액 확인. UUID 비노출.

## ⑦ 남은 미검증

- 인쇄 양식과 tooltip 전수: 이번 라운드에서는 대상 화면의 별도 인쇄/UUID tooltip이 없어 전수 클릭 검증 미완료.
- 일정 상세: 앞 라운드에서 desktop route 자체가 404인 PR 무관 항목으로 판정되어 이번 라운드에서도 제외.
- slip 기존 CI 실패 1건은 `origin/main`에서도 동일 실패한 기존 결함이며, 테스트 삭제·skip·allowlist 처리를 하지 않았다.

## ⑧ 변경 파일 및 `git status --porcelain` 원문

PM 커밋 대상 변경 경로:

```text
clients/desktop/playwright/1266-fix-round3-real-qa/1266-fix-round3-real-qa.mjs
clients/desktop/playwright/1266-fix-round3-real-qa/auth-diagnostic.mjs
clients/desktop/playwright/1266-fix-round3-real-qa/branch-proxy.mjs
docs/qa/1266-fix-round3/report.md
docs/qa/1266-fix-round3/screenshots/01-slip-cleanup-history-list.png
docs/qa/1266-fix-round3/screenshots/02-slip-cleanup-restored.png
```

마지막 실행의 `git status --porcelain` 원문:

```text
?? clients/desktop/playwright/1266-fix-round3-real-qa/
?? docs/qa/1266-fix-round3/
```

`git add`, `git commit`, `git push`는 실행하지 않았다.

## ⑨ 프로세스·컨테이너 회수

- 회수: branch slip JAR PID 90944, 격리 proxy PID 23052, Vite preview PID 41232.
- 회수: 격리 컨테이너 `codex1266-r3-pg`.
- 최종 확인: 포트 `28086`, `28126`, `5126`, `15467` LISTEN 없음.
- `samhan-*` 공유 컨테이너 24개는 그대로 유지했다. 기존 `sol1265-pg` 격리 컨테이너도 다른 작업 범위로 판단하여 건드리지 않았다.
