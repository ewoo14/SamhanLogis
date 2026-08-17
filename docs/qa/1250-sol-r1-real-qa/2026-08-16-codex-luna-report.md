# PR #1250 CODEX LUNA 검증 보고서

## ① 환경 확인

요청 원문:

```powershell
cd C:\dev\Samhan-Public\.claude\worktrees\w1250
git rev-parse HEAD                 # 45346c569
git rev-parse --abbrev-ref HEAD    # feat/daily-closing-amount-edit
git status --porcelain
```

실행 결과 원문:

```text
45346c5694c845dcbcd5d699b039f7170d9adc5b
feat/daily-closing-amount-edit
```

시작 시 status는 빈 출력. commit/push/add는 하지 않았다.

## ② 번호 셋과 새 번호

검사 셋은 origin/main 1개, 현재 브랜치 1개, 지정 열린 브랜치 7개로 총 9개 ref다.

```text
origin/main: 83개, 최대 V122
현재 브랜치: 84개, 수정 전 V120 중복, 최대 V122
열린 7개 브랜치: 각 83개, 최대 V122
V123: 수정 전 9개 ref 모두 없음
```

기존 `V120__quarantine_unresolved_slip_partner_rows.sql`은 불변으로 두고 새 파일만 `V123__preserve_daily_closing_reference_amounts.sql`로 이동했다. 수정 후 V123은 9개 ref의 기존 파일과 겹치지 않는다.

## ③ fresh PostgreSQL 전체 적용 원문

```text
Successfully validated 84 migrations (execution time 00:00.462s)
Migrating schema "public" to version "120 - quarantine unresolved slip partner rows"
Migrating schema "public" to version "121 - normalize inbound purchase delivery tag"
Migrating schema "public" to version "122 - redesign outbound delivery tags and cutoffs"
Migrating schema "public" to version "123 - preserve daily closing reference amounts"
Successfully applied 84 migrations to schema "public", now at version v123 (execution time 00:00.642s)
 installed_rank | version |                 description                 | success
             84 | 123     | preserve daily closing reference amounts    | t
FRESH_FLYWAY_RESULT=PASS
CLEANUP network_remaining=0 container_remaining=0
```

## ④ 라이브 QA 4건과 ⑤ 금액 4단계

Playwright Chromium headless를 `clients/desktop`에서 실행했다. 해시 라우터는 `http://127.0.0.1:5517/#/accounting/daily-closings`, 고유 요소는 `daily-closing-nav`, `daily-closing-table`, `daily-closing-save-all`이다. PUT은 격리 `:28086` DB에만 보냈다.

1. 저장 후 재조회: 단가 105, 출고가 200, 할인율 47.5가 payload `105/200/0.475` 후 동일.
2. 정상 조합 HTTP 200. 진짜 모순(`unit=105.03, release=101, discountRate=0.5`) HTTP 400.
3. 음수·대값 payload `384394/200/-1920.97`, 화면 `-192,097%`, 저장 후 재조회 동일.
4. 직원 로그인 role MANAGER. 현재 워크트리 gateway jar `:28080`의 `GET /auth/admin/menu-catalog` HTTP 200. 기존 공유 gateway 구 jar는 401이므로 배포 시 현재 jar 반영 필요.

행 수/응답 건수: 선발행 `12/12`, 결과 `1/1`. 회계전표 행은 disabled·직접 PUT 409.

| 단계 | 수량 | 단가 | 공급가 | VAT | 합계 | 출고가 | 할인율 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 편집 전 | 1 | 384,394 | 349,449 | 34,945 | 384,394 | 200 | -192,097 |
| 편집 중 | 1 | 105 | 95 | 10 | 105 | 200 | 47.5 |
| 저장 payload | — | 105 | 서버 계산 | 서버 계산 | 서버 계산 | 200 | 0.475 |
| 저장 후 재조회 | 1 | 105 | 95 | 10 | 105 | 200 | 47.5 |

## ⑥ 유지 항목

단가 기준 분리·출고가 편집 시 단가 유지, DELIVERED/COMPLETED 범위, 회계전표 수정 금지, 운임·절삭 비제외, 약정DC 미사용, 선결제 표기, #1230 다중선택·정렬·필터는 유지했다. migration은 두 저장값 컬럼만 추가한다.

## ⑦ 캡처

`resolveQaShotsDir()` 목적지는 `docs/qa/1250-sol-r1-real-qa/_local/`이다.

```text
01-pre-edit-real-qa.png|156706
02-editing-105-q2-real-qa.png|158552
03-requery-105-q2-real-qa.png|150577
04-accounting-posted-block-real-qa.png|73886
```

## ⑧ 회귀

- 핵심 slip 테스트: BUILD SUCCESSFUL.
- 비-IT `*Test`: 1,117개 중 1,115 통과, 2 실패. 기존 반올림 기대 불일치 `36668.67/36669`, `110006/110007`.
- slip 전체: `command timed out after 604029 milliseconds`.
- IT 96개: PowerShell `*IT` 확장으로 Gradle `No tests found for given includes: [.git]`; 미실행이며 결함 0으로 판정하지 않는다.
- desktop `npm run typecheck`: PASS, scope 51/51. `npm run build:web`: PASS, 775 modules transformed.

## ⑨ 증거 무결성 자기 고지

라이브 PUT은 격리 PostgreSQL 복제본에만 남겼다. 공유 DB write는 없었다. 초기 500(Docker DNS), 400(원천 `productPrice=null` 테스트 데이터 기대 불일치)은 성공으로 합산하지 않았다. 공유 gateway 401과 현재 gateway jar 200을 구분했다.

## ⑩ 프로세스 회수

기동 대상은 renderer 5517, slip 28086, gateway 28080, 격리 PostgreSQL/컨테이너 3개다. Docker Desktop을 재기동한 뒤 회수했다.

```text
residual qa containers: 0
residual QA ports (5517/28080/28086): 0
DockerServer=29.6.2
```

기존 `samhan-*` 공유 컨테이너는 유지했다.

## ⑪ 최종 status 원문

```text
 M clients/desktop/playwright/1250-sol-r1-real-qa/1250-sol-r1-real-qa.spec.ts
 D services/slip-service/src/main/resources/db/migration/V120__preserve_daily_closing_reference_amounts.sql
?? docs/qa/1250-sol-r1-real-qa/2026-08-16-codex-luna-report.md
?? services/slip-service/src/main/resources/db/migration/V123__preserve_daily_closing_reference_amounts.sql
```

commit/push/add는 하지 않았다.
