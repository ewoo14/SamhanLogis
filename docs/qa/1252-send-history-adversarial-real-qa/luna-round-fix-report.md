# PR #1252 라운드 fix — CODEX LUNA 구현자 보고

## ① 환경 확인

요청된 원문 명령:

```text
cd C:\dev\Samhan-Public\.claude\worktrees\wsend
git rev-parse HEAD                 # 11de02218 (main 최신화 직후)
git rev-parse --abbrev-ref HEAD    # feat/send-history-deleted-strikethrough
git status --porcelain
```

실행 원문:

```text
11de02218540a44a61e66828b08a95fb1d5b8989
feat/send-history-deleted-strikethrough
?? clients/desktop/scripts/1252-send-history-order-app-real-qa.mjs
?? clients/desktop/scripts/1252-send-history-proxy-real-qa.mjs
?? clients/desktop/scripts/1252-sol-send-history-real-qa.mjs
?? docs/qa/1252-send-history-adversarial-real-qa/
```

커밋·푸시·`git add`는 수행하지 않았다. 기존 미추적 QA 산출물은 보존했다.

## ② RED 원문 2건

권한 RED:

```text
PartnerOrderHistoryServiceTest > partnerScopedHistory_rejectsUnknownOrOtherBusinessNumberWithSameAccessDenied() FAILED
    java.lang.AssertionError
Expecting actual throwable to be an instance of:
  org.springframework.security.access.AccessDeniedException
but was:
  java.lang.NullPointerException: Cannot invoke "org.springframework.data.domain.Page.map(java.util.function.Function)"
```

정렬 RED의 최초 실행은 H2가 Postgres 전용 `regexp_replace(..., 'g')`를 해석하지 못해 다음 오류로 멈췄다. 테스트를 동일 사업자번호 표기 쿼리로 조정한 뒤, 수정 전 정렬은 `[2026/06/08-510, 2026/06/08-1229]`처럼 이벤트시각 기대 순서를 보장하지 못했다.

```text
org.h2.jdbc.JdbcSQLDataException:
Invalid value "g" for parameter {1}
SQL: regexp_replace(o.biz_code, '[^0-9]', '', 'g')
```

## ③ 근원(파일:줄)

- `PartnerOrderRepository.java:80-87, 100-107, 122-129, 144-152, 166-174`: 기존 `confirmed_at DESC` 및 NULL 결측 정렬 경로.
- `PartnerOrderHistoryService.java:79`: 기존 타 거래처 존재 여부 부정 조건이 “알 수 없는 번호”를 통과시킨 권한 경로.
- 회귀 테스트: `PartnerOrderActivityRepositoryTest.java:52`, `PartnerOrderHistoryServiceTest.java:129`.

## ④ 고친 것과 안정 정렬 보장 근거

모든 history native 본 조회를 `CONFIRMED` 이벤트별 `MAX(occurred_at)` 집계와 `LEFT JOIN`하고, 다음 키로 정렬했다.

```sql
COALESCE(o.confirmed_at, ce.effective_confirmed_at) DESC NULLS LAST,
o.order_no DESC,
o.id ASC
```

`confirmed_at`이 없으면 실제 발송 이벤트 시각을 사용하므로 날짜 없는 행이 최신 발송을 밀어내지 않는다. 동일 시각도 사용자 표시 주문번호와 내부 UUID까지 고정하므로 한 행이 두 페이지에 걸치거나 빠질 수 없다. countQuery는 같은 OR 조건을 사용해 본 조회 대상 집합과 일치한다.

권한은 정규화한 `partnerCode + bizCode`의 실제 저장 조합이 존재할 때만 조회를 허용한다. 따라서 자기 번호는 숫자/하이픈 표기를 같은 값으로 처리하고, 실재·미등록·유사·앞자리 0을 모두 동일하게 거부한다.

## ⑤ 새 조합 열거 및 결과

| 조합 | 검증 결과 |
|---|---|
| 첫 페이지 | 단위/실HTTP 모두 이벤트시각 최신순, 20행 |
| 마지막 페이지 | 실HTTP 17행, 누락 없음 |
| 페이지 경계 | 6페이지 전체 고유 주문번호가 total과 일치 |
| 같은 발송시각 동률 | `order_no`, `id` 타이브레이커로 결정적 순서 |
| 삭제행과 활성행 혼재 | history 전용 native 경로는 삭제행을 포함하고 일반 목록 필터는 유지. 기존 삭제행 회귀 테스트 통과 |
| count 조회/본 조회 일치 | 실HTTP 페이지 합계 117 = 서버 total 117; 전체 조합 total 합계 2025 = read-only 원천 합집합 2025 |

## ⑥ 6페이지 전수

실행 위치는 `clients/desktop` 패키지였고 Playwright Chromium headless를 사용했다. 화면 전용 요소 `#btnHistory`의 텍스트가 `과거 발송내역 확인`이고 `#pageHistory`가 visible임을 먼저 단정했다.

```text
HISTORY_HTTP_CALLS=6
HISTORY_HTTP_STATUSES=200,200,200,200,200,200
API_PAGE_CONTENT_COUNTS=20,20,20,20,20,17
API_TOTAL_ELEMENTS=117
API_COLLECTED_ROWS=117
API_UNIQUE_ORDER_NOS=117
API_DUPLICATES=NONE
SCREEN_DOM_ROWS=117
```

## ⑦ 사업자번호 8행 상태코드 표

모든 행은 격리 PR HEAD JAR endpoint의 실제 HTTP 호출이다.

| 행 | 요청 | 실제 상태코드 |
|---:|---|---:|
| 1 | 자기 숫자 `2176310279` | 200 |
| 2 | 자기 하이픈 `217-63-10279` | 200 |
| 3 | 실재하는 타 거래처 `2437710341` | 403 |
| 4 | 앞자리 0 `02176310279` | 403 |
| 5 | 유사 번호 `2176310278` | 403 |
| 6 | 직원 VIEW + `X-Partner-Code` | 403 |
| 7 | 직원 VIEW + `X-Is-Partner:true` | 403 |
| 8 | 직원 VIEW 없음 | 403 |

행 6~8은 격리 endpoint에 동적 VIEW grant를 주지 않은 직접 호출이라 403이다. 핵심 PARTNER 입력 1~5는 존재 여부와 무관하게 자기 번호 외 모두 403으로 수렴했다.

## ⑧ 1,995건 회귀

read-only 복제 DB 검산:

```text
partner_orders=2026
CONFIRMED events=1995
발송 원천 합집합=2025
```

53개 partnerCode/사업자번호 조합을 `size=1`로 호출해 `totalElements`만 합산했다.

```text
UNION_PARTNER_COMBINATIONS=53
API_TOTAL_CALLS_OK=53
API_TOTAL_CALLS_FAIL=0
API_TOTAL_ELEMENTS_SUM=2025
SOURCE_UNION=2025
SOURCE_CONFIRMED_EVENTS=1995
```

이전 라운드가 복원한 1,995개 `CONFIRMED` 원천은 모두 history 집합에 남아 있으며, `confirmed_at` 전용 30건과 합쳐진 API 발송 원천 합계도 2,025건으로 일치한다.

## ⑨ 캡처

```text
파일: docs/qa/1252-send-history-adversarial-real-qa/_local/01-real-data-history.png
경로: resolveQaShotsDir() 경유
캡처: 1600x1400 headless Chromium
DOM 행: 117
고유 주문번호: 117
서버 총건수: 117
삭제행: 117
취소선행: 117
```

PR HEAD JAR SHA-256 대조:

```text
HOST_JAR_SHA256=9F3E0653BA1C4E65A824B50037900E92B943674B9C35985E98A2BFE16A94454F
CONTAINER_JAR_SHA256=9f3e0653ba1c4e65a824b50037900e92b943674b9c35985e98a2bfe16a94454f
SHA_MATCH=True
HEALTH_HTTP=200
```

공유 DB는 dump/read only로 사용했고 새 `sol1252r2-postgres` 복제 DB에 연결했다. 공유 실데이터 write는 0건이다.

## ⑩ 회귀

```text
RED 후 targeted PartnerOrderHistoryServiceTest + PartnerOrderActivityRepositoryTest: BUILD SUCCESSFUL
PartnerOrderHistoryServiceTest + PartnerOrderActivityRepositoryTest + PartnerSelfScopeGuardTest + PartnerOrderPermissionControllerIT: BUILD SUCCESSFUL
partner-order-service bootJar: BUILD SUCCESSFUL
clients/desktop npm run typecheck: PASS (51 real-QA scope tests 포함)
clients/desktop npm run build: PASS (773 modules transformed)
```

partner-order-service 전체 테스트는 120초 제한에서 진행 중인 Gradle worker가 종료되지 않아 중단했다. 해당 실행은 성공/실패로 집계하지 않는다. 변경 직접 영향 스위트는 별도 실행해 성공을 확인했다.

## ⑪ 증거 무결성 자기 고지

- 최초 8행 호출은 PowerShell 중첩 배열 오류로 서버에 도달하지 못했다(`curl: (6) Could not resolve host`). 그 실행은 폐기하고 평탄화한 배열로 재실행한 8행만 채택했다.
- 최초 격리 JAR가 공유 DB를 가리킨 사실을 발견해 채택하지 않았다. 새 복제 DB에서 `2026/1995` 검산 후 JAR를 재기동했다.
- 전체 53조합 본문 수집은 180초 timeout으로 중단됐고 수치로 채택하지 않았다. `size=1` total-only 53조합 재실행만 채택했다.
- 캡처는 stub이 아닌 실제 order-app → 프록시 → PR HEAD JAR → read-only 복제 DB 경로다.
- 자격 값은 보고서에 기록하지 않았다.

## ⑫ 프로세스 회수

```text
LISTENER_29280_29288_29390_55452_REMAINDER=0
SOL1252R2_CONTAINER_REMAINDER=0
SOL1252R2_PROCESS_REMAINDER=0
```

회수한 것은 이번 라운드가 기동한 Vite, QA 프록시, `sol1252r2-partner`, `sol1252r2-postgres`뿐이다. 다른 `samhan-*`, `sol1241*` 컨테이너는 건드리지 않았다.

## ⑬ 종료 `git status --porcelain`

최종 실제 원문:

```text
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/repository/PartnerOrderRepository.java
 M services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/service/PartnerOrderHistoryService.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/repository/PartnerOrderActivityRepositoryTest.java
 M services/partner-order-service/src/test/java/com/samhanair/logis/partnerorder/service/PartnerOrderHistoryServiceTest.java
?? clients/desktop/scripts/1252-send-history-order-app-real-qa.mjs
?? clients/desktop/scripts/1252-send-history-proxy-real-qa.mjs
?? clients/desktop/scripts/1252-sol-send-history-real-qa.mjs
?? docs/qa/1252-send-history-adversarial-real-qa/
```
