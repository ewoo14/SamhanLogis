# PR #1124 / Issue #1123 — S13 SOL 적대검증

- 검증일: 2026-08-08
- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\t1123`
- 검증 대상 HEAD: `8297371ea`
- 제한 준수: 재배포 없음, 실 서버 HTTP 호출 없음, DB 변경 없음, 제품 코드 수정 없음, `git` 명령 없음, 전체 Gradle 스위트 실행 없음

## 결론

**실 사용자가 밟을 수 있는 경로로 재현되는 결함 0건.**

다만 주 기능의 현재 DB 발화 조건이 0건이므로, 마감 날짜의 실제 차단·예외 권한자의 실제 통과·야간 전환은 **판정 불가**다. 이 세 항목을 결함 0으로 세지 않았다.

PM의 1차 전제는 맞다. `clients/` 운영 소스에는 `slip-closing-baselines` 호출이 없다. 이 PR의 관리자 API는 슬라이스 2 UI 전에 들어간 **의도된 백엔드 선행 슬라이스**이며, 현재 사용자 화면 배선 누락을 이 PR의 결함으로 판정하지 않았다.

## 1차 각도 — 관리자 API의 사용자 화면 도달성

### 실측 원문

```text
Command: rg -n -S "slip-closing-baselines|slipClosingBaseline|closing-baseline" clients
Exit code: 0
clients\desktop\playwright\929-r6-normalize-before-judge-real-qa\929-r6-normalize-before-judge-real-qa.spec.ts:176:    await page.screenshot({ path: join(shots, '01-daily-closing-baseline-absent.png'), fullPage: true })
clients\desktop\playwright\929-r5-route-collision-real-qa\929-r5-route-collision-real-qa.spec.ts:151:    await page.screenshot({ path: join(shots, '01-daily-closing-baseline-absent.png'), fullPage: true })
```

두 매치는 API 호출이 아니라 스크린샷 파일명이다. 사용자가 어느 화면에서 어떤 조작으로 관리자 API를 호출하는지 지목할 `clients/desktop/src`의 `파일:줄`은 **없다**.

권한 설정 화면에는 코드의 표시명만 존재한다.

```text
clients/desktop/src/renderer/api/permissionsApi.ts:148:  | 'slip.closed-date-admin'
clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:447:  'slip.closed-date-admin': '마감 기준선 관리',
```

이는 관리자 API 호출 UI가 아니라 권한 행의 이름을 보여 주는 경로다.

### 의도 판정

배선 누락이 아니라 백엔드 선행 범위다. `docs/dev-reports/2026-08-08-1123-s9-admin-path-and-permission.md:12`가 이 PR에서 “칩 UI, 날짜 범위 일괄 추가, 지난 날짜 자동 마감, 날짜 검색은 변경하지 않았다”고 명시한다. PR 본문도 다음 작업을 “슬라이스 2 칩 UI”로 분리한다.

따라서 현재 관리자 API는 gateway를 통과하는 서버 API일 뿐, 실 사용자의 화면 조작 경로는 아니다. UI 없는 상태에서 관리자 API를 사용자 기능으로 도달 가능하다고 세지 않았다.

### PM grep 반증 여부와 증거 무결성

PM grep을 반증하지 못했다. 오히려 같은 결과를 재현했다.

S12 보고서의 표에 적힌 `await call(...)`은 운영 프런트 소스가 아니라 삭제된 임시 Playwright 드라이버가 `test-results/error-context.md`에 남긴 소스 스냅샷이다.

```text
clients/desktop/test-results/1123-s11-live-real-qa-1123-9e08d-al-qa-PR-1124-S11-라이브-적대-검증-renderer/error-context.md:440:  164 |   let created = await call(request, manager, 'OUTBOUND 오늘 기준선 생성', 'POST', '/admin/slip-closing-baselines', { slipType: 'OUTBOUND', baselineDate: today })
clients/desktop/test-results/1123-s11-live-real-qa-1123-9e08d-al-qa-PR-1124-S11-라이브-적대-검증-renderer/error-context.md:448:  172 |   created = await call(request, manager, 'OUTBOUND 익일 기준선 생성', 'POST', '/admin/slip-closing-baselines', { slipType: 'OUTBOUND', baselineDate: tomorrow })
```

S12 보고서 자체도 `clients/desktop/src`에 호출 소스가 없고 QA renderer 산출물이라고 구분한다. 위 원문은 현재 다시 검색되며, 수치 불일치도 확인되지 않았다. 따라서 증거 무결성 결함으로 별도 집계하지 않았다.

## 2차 각도 — gateway 라우트 충돌과 권한

### 경로와 순서

```text
services/api-gateway/src/main/resources/application.yml:614:        - id: slip-service-admin
services/api-gateway/src/main/resources/application.yml:617:            - Path=/admin/slips/**
services/api-gateway/src/main/resources/application.yml:619:            - StripPrefix=1
services/api-gateway/src/main/resources/application.yml:620:            - JwtAuthentication
services/api-gateway/src/main/resources/application.yml:669:        - id: slip-dispatch-admin-noprefix
services/api-gateway/src/main/resources/application.yml:672:            - Path=/admin/dispatch-tasks,/admin/dispatch-tasks/**,/admin/dispatch-board,/admin/dispatch-board/**,/admin/external-carriers,/admin/external-carriers/**,/admin/external-dispatches,/admin/external-dispatches/**,/admin/slip-cutoffs,/admin/slip-cutoffs/**,/admin/slip-closing-baselines,/admin/slip-closing-baselines/**,/admin/dispatch-groups,/admin/dispatch-groups/**,/admin/carriers,/admin/carriers/**,/admin/dispatches/pre-classify
services/api-gateway/src/main/resources/application.yml:674:            - JwtAuthentication
```

`/admin/slip-closing-baselines`는 `/admin/slips/**`의 `slips/` 세그먼트와 일치하지 않고, `/admin/slip-cutoffs`와도 별도 세그먼트다. 새 base/wildcard 패턴은 기존 경로의 부분 문자열을 소비하지 않는다. 따라서 라우트 선언 순서가 바뀌어도 기존 `/admin/slips/**`를 strip 라우트 대신 no-strip 라우트로 보내거나 `/admin/slip-cutoffs`를 가로채는 경로는 확인되지 않았다.

### 인증·인가

gateway의 `JwtAuthentication` 뒤에서 컨트롤러가 메서드별 동적 권한을 다시 검사한다.

```text
services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingBaselineAdminController.java:30:    @GetMapping
services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingBaselineAdminController.java:31:    @RequirePermission(page = SlipClosingPageCodes.ADMIN, action = PermissionAction.VIEW)
services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingBaselineAdminController.java:36:    @PostMapping
services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingBaselineAdminController.java:37:    @RequirePermission(page = SlipClosingPageCodes.ADMIN, action = PermissionAction.CREATE)
services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingBaselineAdminController.java:43:    @DeleteMapping("/{id}")
services/slip-service/src/main/java/com/samhanair/logis/slip/web/closing/SlipClosingBaselineAdminController.java:44:    @RequirePermission(page = SlipClosingPageCodes.ADMIN, action = PermissionAction.DELETE)
```

`PermissionAspect`는 계정 ID가 없거나 잘못됐으면 거부하고(`PermissionAspect.java:193-196`), 동적 권한이 없으면 거부한다(`PermissionAspect.java:207-209`). 권한 없는 계정은 인증을 통과해도 목록 조회·기준선 생성·삭제를 실행할 수 없다.

현재 auth DB 발화 조건은 다음과 같다.

```text
         page_code          | active_account_rows | can_view_true | can_create_true | can_delete_true
----------------------------+---------------------+---------------+-----------------+-----------------
 slip.closed-date-admin     |                   3 |             3 |               3 |               3
 slip.closed-date-exception |                   3 |             3 |               3 |               0
(2 rows)

 enabled_accounts | admin_permission_accounts | enabled_accounts_without_admin_permission
------------------+---------------------------+-------------------------------------------
               32 |                         3 |                                        29
(1 row)
```

실 HTTP 403은 금지 조건 때문에 호출하지 않았다. 정적 권한 경계와 DB 권한 보유/비보유 수만 확인했다.

## 3차 각도 — 마감 날짜 생성 차단과 예외

### 발화 조건을 먼저 센 SQL 원문

```text
 current_database | current_date | current_setting
------------------+--------------+-----------------
 slip_db          | 2026-08-08   | Asia/Seoul
(1 row)

 slip_type | baseline_date | enabled | is_deleted | total_rows
-----------+---------------+---------+------------+------------
 INBOUND   | 2026-08-08    | f       | f          |          2
 OUTBOUND  | 2026-08-08    | f       | f          |          2
(2 rows)

 slip_type | rule_type | count
-----------+-----------+-------
(0 rows)
```

활성 기준선 0건, 날짜 규칙 0건이다. 현재 정책으로 닫힌 날짜에 놓인 active 전표도 0건이다.

```text
 existing_active_slips_on_currently_closed_dates
-------------------------------------------------
                                               0
(1 row)
```

따라서 실제 차단 요청과 실제 예외 통과는 모두 표본 0건이며 **판정 불가**다.

### 차단되면 안 되는 정상 전표 수

현재 비활성 정책에서는 과거 날짜가 단지 과거라는 이유로 닫히지 않는다. 실 데이터 분포는 다음과 같다.

```text
 active_slips_total | active_past_slips | active_past_outbound | active_past_inbound
--------------------+-------------------+----------------------+---------------------
                395 |               367 |                  325 |                  42
(1 row)
```

현재 정책으로 잘못 닫힌 날짜의 active 전표는 위 SQL대로 0건이다. 다만 367건은 기존 전표 분포이지 신규 생성 시도 표본이 아니다. 활성 정책에서 마감되지 않은 과거 날짜의 신규 생성 성공/오차단은 실 mutation을 하지 않아 **판정 불가**다.

### 예외 권한자

현재 DB에는 `slip.closed-date-exception` CREATE 권한 계정이 3개 있으나 닫힌 날짜가 0건이므로 가드의 예외 분기가 실 데이터로 발화하지 않는다. 권한자의 실제 통과는 **판정 불가**다.

정적 소비 지점은 `SlipClosedDateGuard.java:36-38`이며, 닫힌 날짜에만 계정 UUID와 `slip.closed-date-exception` CREATE 권한을 검사한다.

### 기준일 당일·시간대·야간

`SlipClosedDateGuard.java:45-47`의 자동 기준선 계약은 다음 세 조건의 교집합이다.

```java
baseline.isEnabled()
        && slipDate.isBefore(baseline.getBaselineDate())
        && !slipDate.isAfter(LocalDate.now(clock))
```

- 기준선 당일은 열린다. 기준선보다 **이전**인 날짜만 자동 마감된다.
- 오늘을 닫으려면 익일을 기준선으로 둔다. S11 임시 드라이버 원문도 `익일 기준선은 오늘을 닫는다`고 명시한다(`error-context.md:447-450`).
- `Clock` bean은 `TimeConfig.java:18-20`에서 `Asia/Seoul`로 고정된다. 날짜 판정에는 시각 필드가 없으므로 같은 KST 날짜 안에서 주간/야간에 결과가 바뀌지 않고, KST 자정에만 `today`가 전환된다.

현재 활성 정책이 0건이라 이 경계의 실 런타임 결과는 **판정 불가**다. 정적 계약과 KST 설정의 불일치는 확인되지 않았다.

## 좁은 검증 명령 원문

전체 Gradle 스위트는 실행하지 않았다. 관련 클래스만 실행했다.

```text
Command: .\gradlew.bat :services:slip-service:test --tests "com.samhanair.logis.slip.service.closing.SlipClosedDateGuardTest" --tests "com.samhanair.logis.slip.service.closing.SlipClosingBaselineAdminServiceTest" :services:api-gateway:test --tests "com.samhanair.logis.gateway.it.ApiGatewayContextLoadIT" --no-daemon --console=plain
Exit code: 0
BUILD SUCCESSFUL in 23s
22 actionable tasks: 2 executed, 1 from cache, 19 up-to-date
```

## 이 라운드가 보지 않은 것

- 재배포 후 gateway의 실제 HTTP 응답
- 사용자 화면에서 관리자 API를 호출하는 흐름 — 현재 운영 프런트 소스에 그 흐름이 없음
- 활성 기준선 또는 날짜 규칙을 만든 뒤 7개 생성 경로 각각의 실 차단
- 닫힌 날짜에서 예외 권한자/비권한자의 실제 통과·거부
- KST 자정 전후의 실행 중 서비스 실 요청
- 슬라이스 2 범위인 칩 UI, 단일·범위 추가, 검색, 제거 후 재개방
- 슬라이스 3 범위인 회계 분개전표·견적서·주문서 확대

## 신규 파일

- `docs/dev-reports/2026-08-08-1123-s13-sol-adversarial.md`
