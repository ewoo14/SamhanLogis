# PR #1060 / 이슈 #1015 R13 — 머지 전 재수렴 리뷰

## 0. 판정

**BLOCK.** HEAD `181be6a656f0b8742428cd05ee1cec335b16c97e`의 구현식은 미리보기·인증·만료 API 모두 `expiresAt.isBefore(now)`를 사용한다. 정확히 30일은 활성이고 30일+1초부터 차단하는 방향도 레거시와 같다.

그러나 이번 라운드의 최우선 요구인 **경계 3지점 × 실제 3경로 직접 실행**은 충족되지 않았다. 기존 테스트는 정확히 30일에서만 실제 `previewLongUnused`·`checkStatus`·`getExpiration`을 함께 호출한다. 29일과 30일+1초는 미리보기/인증 공통 정책 메서드만 직접 실행하며, 만료 API 서비스 호출은 없다. 코드 수정·신규 테스트·합성 데이터 금지 제약 때문에 누락 칸을 새 fixture로 메우지 않았다.

또한 `/access-preview/report`의 호출·표시 코드는 남아 있지만, 보류 경고를 실제 렌더한 자동 테스트가 없고 이 세션에는 연결 가능한 브라우저가 없어 화면 확인을 수행하지 못했다. API JSON이나 터미널 출력을 화면 증거로 대체하지 않았다.

## 1. 9칸 경계 실행표와 레거시 대조

### 1.1 판정 기준

- 기준시각: `2026-08-03T00:00:00`
- baseline: 주문·출고 없음, `createdAt`만 각각 29일 전 / 정확히 30일 전 / 30일+1초 전
- 활성: 미리보기 후보 아님, 인증 차단 아님, `expiredAlready=false`
- 차단: 미리보기 후보, 인증 `LONG_UNUSED`, `expiredAlready=true`
- `정책 실행`: `PartnerAccessPolicy.isPreviewCandidate` 또는 `isAuthenticationLongUnused`를 해당 입력으로 직접 호출한 기존 테스트
- `경로 실행`: 실제 서비스 진입점 `previewLongUnused`·`checkStatus`·`getExpiration`을 해당 입력으로 호출한 기존 테스트

### 1.2 실행 결과

| 입력 | 레거시 | 미리보기 | 인증 | 만료 API | 3경로 레거시 일치 |
|---|---|---|---|---|---|
| 29일 | 활성 | **활성** — 정책 실행, `false` | **활성** — 정책 실행, `false` | **미실행** — 해당 입력의 `getExpiration` 호출 없음 | 미확정 |
| 정확히 30일 | 활성 | **활성** — 경로 실행, 후보 0건 | **활성** — 경로 실행, `NEED_PW_INPUT` | **활성** — 경로 실행, `expiredAlready=false` | 예 |
| 30일+1초 | 차단 | **차단** — 정책 실행, `true` | **차단** — 정책 실행, `true` | **미실행** — 해당 입력의 `getExpiration` 호출 없음 | 미확정 |

9칸의 결과값 관점에서는 정책식이 `활성/활성/차단`으로 정렬된다. 하지만 실행 깊이를 구분하면 실제 경로 실행은 정확히 30일의 3칸뿐이다. 29일·30일+1초의 미리보기/인증 4칸은 공통 정책 실행이고, 만료 API 2칸은 실행되지 않았다. 따라서 “같은 입력을 세 경로에 직접 넣었다”는 완료 주장을 할 수 없다.

### 1.3 fresh 실행 원문

다음 두 테스트를 포함한 관련 4개 class를 `--rerun-tasks`로 실행했다.

```text
> Task :services:partner-auth-service:test

BUILD SUCCESSFUL in 41s
9 actionable tasks: 9 executed
```

JUnit 결과에서 경계 테스트는 모두 GREEN이었다.

```text
OrderAppAccessPreviewTest: tests=6 failures=0 errors=0 skipped=0
  legacyBoundaryIsActiveAtExactlyThirtyDaysAndExpiresOnlyAfterIt()
PartnerAuthServiceAccessSetTest: tests=6 failures=0 errors=0 skipped=0
  allAccessPathsTreatExactlyThirtyDaysAsActive()
```

전체 partner-auth-service도 다시 실행했다.

```text
> Task :services:partner-auth-service:test

BUILD SUCCESSFUL in 41s
9 actionable tasks: 9 executed
```

```text
SUITES=13 TESTS=77 FAILURES=0 ERRORS=0 SKIPPED=0
```

### 1.4 레거시 원문 대조

지정 원문 `tools/legacy-gas/거래처 발송 주문서/Code.js:2938-2961`은 주문 성공 로그와 출고 최신 행을 읽는다. 인접 원문은 다음과 같다.

```js
const logTime = getLatestTime(NOTION_DB_ID_LOG, true);
const shipTime = getLatestTime(NOTION_DB_ID_SHIPPING, false);
const createdTime = new Date(user.createdTime).getTime();
const baseTime = Math.max(createdTime, logTime, shipTime);
const standardExpTime = baseTime + (30 * 24 * 60 * 60 * 1000);
```

실제 차단 포함 방향은 `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js`의 다음 원문으로 확정된다.

```js
const thresholdDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
if (!isActive && client.createdTime < thresholdDate) {
```

활동 조회도 `on_or_after: thresholdIso`이므로 정확히 threshold인 활동은 활성이다. 레거시는 29일 활성, 정확히 30일 활성, 30일+1초 차단이다. HEAD의 공통 판정식도 소스상 동일하다.

```java
return expiresAt != null && expiresAt.isBefore(now);
```

`PartnerAuthService.getExpiration()`도 R12에서 별도 비교를 제거하고 같은 인증 정책을 호출한다.

```java
boolean expired = PartnerAccessPolicy.isAuthenticationLongUnused(auth, activity, now);
```

즉 구현 정적 대조는 일치하지만, 만료 API의 나머지 두 경계 직접 실행이 빠져 있어 9칸 실행 게이트는 미완료다.

## 2. 오답 테스트 전수 훑기

### 2.1 전수 범위

`services/partner-auth-service/src/test` 전체에서 다음 단정과 fixture를 검색·대조했다.

- `expiredAlready`, `remainingDays`, `expiresAt`
- `isPreviewCandidate`, `isAuthenticationLongUnused`, `isLongUnused`
- `previewLongUnused`, `LONG_UNUSED`
- `minusDays`, `minusSeconds`, 29일·30일·30일+1초
- PR 전체 test diff와 R12에서 수정한 기존 테스트

R11이 지적한 정확히 30일의 `expiredAlready=true` 기대값은 현재 `false`로 수정됐고 fresh GREEN이다. 다른 경계 boolean에서 레거시와 반대인 기대값은 찾지 못했다.

### 2.2 남은 잘못된 설명·false-green 가능성

잘못된 boolean 기대값은 아니지만 다음 테스트 설명과 fixture는 현재 정책을 정확히 증명하지 않는다.

1. `PartnerAuthServiceTest.getExpiration_30일_슬라이딩_계산`의 표시명은 `getExpiration — lastLoginAt + 30일 = expiresAt`이다. 현재 실제 기준에는 `lastLoginAt`이 포함되지 않는다. fixture가 `lastLoginAt`과 `createdAt`을 둘 다 10일 전으로 맞춰서 `expiredAlready=false`만 단언하므로, 로그인 기준이 무시돼도 GREEN이다.
2. `PartnerAuthServiceTest.login_30일_미사용_시_LONG_UNUSED`도 주석은 `31일 전 lastLogin`을 강조하지만 실제 GREEN을 만드는 권위 fixture는 함께 넣은 `createdAt=31일 전`이다. 결과 기대값은 맞지만 이름·주석이 낡았다.
3. `expirationApiUsesTheSameBaselineAsAuthenticationBlock`은 `expiresAt` 동일성과 `checkStatus=LONG_UNUSED`만 단언하고 `expiredAlready`를 단언하지 않는다. R11의 별도 boolean 불일치를 이 테스트 하나로는 잡을 수 없다.
4. 실제 서비스 진입점 기준 29일·30일+1초 6칸, 특히 `getExpiration` 2칸이 고정돼 있지 않다.

따라서 **추가 오답 boolean은 0건**, **사실과 다른 테스트 설명 2건**, **경계 false-green을 허용하는 약한 단정/누락 2종**으로 판정한다.

## 3. mock 분기 회귀

전용 분기는 일반 목록 분기보다 먼저 있다.

```text
8022: if (method === 'GET' && url.includes('/api/v1/partner-approvals/access-preview/report')) {
8041: if (method === 'GET' && url.includes('/api/v1/partner-approvals')) {
```

저장소의 현재 요청 경로 전수 검색에서 report 경로 소비자는 정확한 `/api/v1/partner-approvals/access-preview/report` 하나다. 현재 다른 요청을 새 분기가 가로채는 충돌은 찾지 못했다. 단, `includes`이므로 미래의 suffix 하위경로까지 잡을 수 있다는 일반적 여지는 남는다.

mock 전체 단일 파일을 직접 실행했다.

```text
Test Files  1 passed (1)
Tests  129 passed (129)
Duration  1.58s
```

전용 회귀 테스트 `GET /access-preview/report 는 목록 Page가 아닌 후보 report를 반환한다`도 GREEN이다. 따라서 **현재 알려진 mock 요청 회귀는 0건**이다.

## 4. 보류 노출 유지

정적 wiring은 유지된다.

- `previewPartnerAccess()`가 `/api/v1/partner-approvals/access-preview/report`를 호출한다.
- `SalesOrderApprovalsPage`가 `previewQuery.data.deferred`를 확인한다.
- `deferredPartnerCount`와 `deferredSources`를 `role="alert"` 문구로 표시한다.
- R12 mock은 `deferred=true`, `deferredPartnerCount=1`, `deferredSources=['ORDER']`를 반환한다.

그러나 보류 문구를 렌더하는 Vitest/Playwright 테스트는 여전히 0건이다. 이 세션에는 연결 가능한 브라우저가 없어 화면 실행도 못 했다. **호출·표시 소스 유지 = 확인, 실제 화면 노출 = 조사하지 않음**이다. 터미널 mock 응답을 화면 증거로 사용하지 않았다.

## 5. DTO·오차단·차집합·로그인 비면제

### 5.1 DTO 하위호환

- 기존 `GET /access-preview`는 `ApiResponse<List<PartnerApprovalResponse>>`를 유지한다.
- 신규 `/access-preview/report`만 `PartnerAccessPreviewResponse`를 반환한다.
- `PartnerApprovalsControllerContractTest.accessPreviewKeepsLegacyArrayDataShape`가 fresh 전체 77 tests에 포함돼 통과했다.

다만 이 테스트는 controller 객체의 `data instanceof List`까지만 확인하며 실제 MockMvc/Jackson JSON 직렬화는 고정하지 않는다. 하위호환 소스는 유지됐지만 계약 테스트 강도는 제한적이다.

### 5.2 fresh `[DEV-SEED]` 읽기 전용 계수

세 DB 모두 `BEGIN TRANSACTION READ ONLY`와 `transaction_read_only=on`을 확인했다. `partner_auth_db` 측정시각은 `2026-08-03 01:41:25.423422+09`다.

```text
partner_code | status        | created_at                 | last_login_at
1068689215   | NEED_PW_INPUT | 2026-07-30 01:03:17.741187 | 2026-07-30 01:59:02.245854
2118712345   | NEED_PW_INPUT | 2026-07-09 07:25:53.085447 | 2026-08-02 00:22:41.802872
```

`partner_order_db`는 `1068689215`의 DRAFT 1행만 있고 `confirmed_at`은 null이었다. 두 거래처의 active slip 활동은 0행이었다.

```text
data_class | target_rows | legacy_preview_auth_block_count | expiration_expired_count | exact_boundary_count | wrongly_blocked_count | preview_auth_symmetric_difference_count
[DEV-SEED] | 2           | 0                               | 0                        | 0                    | 0                     | 0
```

따라서 fresh dev 시드에서는 **잘못 차단 0, 미리보기↔인증 대칭 차집합 0**이다. 정확 경계 행도 0건이므로 이 수치는 9칸 규칙 일치의 증거가 아니다.

### 5.3 로그인 비면제

`latestBaseline()`은 주문·출고·`accessRestoredAt`·`createdAt`만 사용하고 `lastLoginAt`을 사용하지 않는다. `recentLoginDoesNotExemptPartnerWithNoOrderOrShipmentActivity`는 생성 31일·로그인 1일 fixture의 실제 `tryLogin()`이 `LONG_UNUSED`를 반환한다고 단언하며 fresh 관련 테스트에서 통과했다. 로그인 비면제는 유지된다.

## 6. 타임존 의존

경계 테스트는 `LocalDateTime.of(2026, 8, 3, 0, 0)`을 사용하고 통합 exact-boundary 테스트는 `LocalDateTime.now()`를 같은 값으로 static stub한다. `ZoneId`나 OS 기본 timezone 변환을 사용하지 않는다.

추가로 `TZ=UTC`와 JVM `-Duser.timezone=UTC`에서 두 경계 테스트를 `--rerun-tasks`로 직접 실행했다.

```text
BUILD SUCCESSFUL in 19s
9 actionable tasks: 9 executed
```

따라서 **현재 존재하는 경계 테스트는 UTC에서도 참**이다. 다만 존재하지 않는 29일·30일+1초 실제 만료 API 호출까지 증명하지는 않는다.

## 7. desktop 검증

```text
Test Files  1 passed (1)
Tests  129 passed (129)
```

```text
tsc -p tsconfig.node.json --noEmit
tsc -p tsconfig.web.json --noEmit
typecheck:real-qa: tests 2, pass 2, fail 0
real-qa-scope: tests 50, pass 50, fail 0
exit 0
```

첫 `npm test -- --run ...` 호출은 pretest 신선도 점검에서 `out/main/index.js` 부재로 Vitest 본체를 실행하지 않았다. 이를 GREEN으로 세지 않았고, `npx vitest run src/renderer/api/mock.test.ts`로 실제 129 tests를 별도 fresh 실행했다.

## 8. 재수렴 조건

1. 기존 테스트를 수정해 29일·정확히 30일·30일+1초 각각에서 실제 `previewLongUnused`·`checkStatus` 또는 `tryLogin`·`getExpiration`을 같은 입력/고정시각으로 호출하고 9칸을 모두 단언한다.
2. `/access-preview/report` 보류 응답이 `SalesOrderApprovalsPage`의 `role="alert"` 문구로 렌더되는 프런트 자동 테스트를 추가한다.
3. 낡은 `lastLoginAt + 30일` 테스트 이름·주석을 현재 주문·출고/생성/복구 baseline 계약으로 정정하고, 만료시각 자체도 단언한다.

## 9. 이 라운드가 보지 않은 것

- production DB, 외부 운영 DB, 실제 Notion 운영 데이터
- Docker 이미지 재빌드·재기동과 HEAD 서비스의 gateway 라이브 배포
- 실제 로그인/상태 전환/관리자 복구/비밀번호 초기화: 공유 DB write 금지로 미실행
- V3 migration 적용: DDL 금지로 미실행
- 실 UI 렌더·스크린샷·네트워크 캡처·접근성 트리·키보드 탐색: 연결 가능한 브라우저가 없어 미실행
- 외부 주문/전표 서비스 fault 주입과 장기 보류 지속시간
- 전체 desktop Vitest/Playwright, 전체 저장소 테스트, 부하·동시성·보안 침투·SMS/JWT 만료
- 저장소 밖 비공개 소비처와 배포 버전별 실제 사용량
- 레거시 Apps Script trigger의 운영 스케줄과 실행 이력

## 10. 새 파일 경로

- `docs/dev-reports/2026-08-02-1015-r13-postfix-reconvergence.md`
