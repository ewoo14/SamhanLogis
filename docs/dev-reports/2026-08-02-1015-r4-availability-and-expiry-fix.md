# PR #1060 / Issue #1015 — R4 가용성·만료 기준 fix 보고서

작성일: 2026-08-02  
담당: R3 fix  
대상 모듈: `services/partner-auth-service`  
기준 HEAD: `d9a3057b0`

## 판정

R3-01과 R3-04를 코드와 회귀 테스트로 해소했다. 로그인 활동·관리자 복구·주문/출고 활동 중 가장 최근 시각을 실제 인증 기준으로 사용하고, 만료 API도 같은 기준을 사용한다. 주문·출고 조회의 4xx/5xx/timeout은 활동값 `null`로 격리되어 인증을 중단시키지 않는다.

실거래 DB write/DDL, Docker 이미지 재빌드, 공유 스택 변경은 수행하지 않았다. 따라서 현재 운영 DB의 집합 차집합과 실거래처 0건 수치는 이번 라운드에서 재측정하지 않았으며, 해당 항목은 미검증으로 명시한다.

## ① 원인

- `PartnerAccessPolicy.isLongUnused()`는 주문·출고 활동이 없으면 `PartnerAuth.createdAt`을 fallback으로 사용했다.
- `PartnerAuthService.evaluateEffectiveStatus()`가 미리보기용 fallback을 상태조회와 로그인에도 그대로 적용했다. `2118712345`처럼 활동 0건이어도 최근 로그인한 거래처가 인증행 생성 30일 뒤 `LONG_UNUSED`로 차단될 수 있었다.
- 관리자 복구는 `lastLoginAt`을 현재시각으로 갱신했지만 공통 판정기는 `lastLoginAt`을 읽지 않아, 다음 상태조회/로그인에서 오래된 `createdAt`으로 되돌아갔다.
- `GET /partner-expiration`은 `PartnerAuth.expirationAt()`만 호출하고, 상태조회·로그인의 주문/출고 활동 판정과 다른 값을 반환했다.
- `PartnerActivityClient.get()`의 `RestClient.retrieve()` 예외가 전파되어 주문 또는 출고 서비스 장애가 인증 경로의 실패가 되었다.

## ② RED 2건

RED는 production fix 적용 전에 새 테스트만 추가해 실행했다.

### R3-01 로그인 활동 반영 실패

재현 조건: `2118712345`, `createdAt = now - 31일`, `lastLoginAt = now - 1일`, 주문·출고 활동 없음, 올바른 비밀번호.

```text
PartnerAuthServiceAccessSetTest > recentLoginPreventsCreatedAtFallbackFromBlockingAuthentication() FAILED
    org.opentest4j.AssertionFailedError at PartnerAuthServiceAccessSetTest.java:49

2 tests completed, 2 failed
```

동일 실행에서 R3-04도 함께 RED였고, 이 테스트의 기대값은 `PartnerStatus.OK`였다. 기존 구현은 `createdAt + 30일`을 사용해 로그인 전에 `LONG_UNUSED`로 분기했다.

### R3-04 외부 장애가 인증을 막음

주문 endpoint에 HTTP 503을 주입하고 출고 endpoint는 정상 응답하도록 한 재현이다.

```text
PartnerActivityClientTest > failedActivityServiceIsIsolatedSoAuthenticationCanContinue() FAILED
    org.springframework.web.client.HttpServerErrorException$ServiceUnavailable at PartnerActivityClientTest.java:48

2 tests completed, 2 failed
```

실패 원문은 `PartnerActivityClient.get()`의 `retrieve()`에서 예외를 그대로 반환한 사실을 확인한다.

## ③ fix와 선택 근거·버린 대안

### 적용한 fix

`PartnerAccessPolicy`에 실제 인증 전용 기준을 추가했다.

```text
authentication base = max(lastLoginAt, order/shipment lastActivityAt, createdAt fallback)
authentication expiresAt = base + 30일
```

- 실제 상태조회·로그인은 `isAuthenticationLongUnused()`를 사용한다.
- `GET /partner-expiration`은 `authenticationExpirationAt()`을 사용한다.
- 활동이 없는 최근 로그인은 `lastLoginAt`이 `createdAt`보다 최신이므로 차단되지 않는다.
- 관리자 복구가 갱신한 `lastLoginAt`도 다음 판정에서 소비되므로 즉시 재차단되지 않는다.
- 주문/출고 활동이 로그인보다 최신인 기존 계약도 보존하기 위해 `lastLoginAt` 단일 우선이 아니라 세 기준의 최댓값을 사용한다.
- `PartnerActivityClient`는 주문과 출고를 각각 `RestClientException`으로 감싸 해당 서비스 실패만 `new ActivityEnvelope(null)`로 완화한다. 한 서비스가 실패해도 다른 서비스의 활동은 계속 사용된다.

### 선택 근거

인증 가용성이 우선이다. 미리보기는 후보를 넓게 발굴할 수 있지만 실제 로그인은 정상 로그인·관리자 복구·활동 이력을 모두 만료 기준에 반영해야 한다. 하나의 순수 계산 함수를 상태조회·로그인·만료 API가 공유하게 해 API 안내와 실제 차단의 불일치를 제거했다.

### 버린 대안

- **주문·출고 조회를 인증의 동기 필수 의존성으로 유지**: 4xx/5xx/timeout이 인증 실패로 전파되어 R3-04를 해결하지 못하므로 버렸다.
- **모든 경로를 `createdAt + 30일`로 통일**: 로그인 활동과 관리자 복구를 무시해 R3-01/R3-02를 재발생시키므로 버렸다.
- **모든 경로를 `lastLoginAt`만 사용**: 주문·출고 활동을 반영하지 못하고 기존 `checkStatusUsesRecentActivityEvenWhenLastLoginIsOlderThanThirtyDays` 계약을 깨므로 버렸다.
- **외부 장애 시 전체 활동을 실패 처리**: 인증 가용성이 멈추므로 버렸다. 서비스별 `null` 격리를 선택했다.

## ④ GREEN

RED 테스트 2건을 fix 후 같은 조건으로 재실행했다.

```text
BUILD SUCCESSFUL in 35s
PartnerActivityClientTest — 통과
PartnerAuthServiceAccessSetTest — 통과
```

추가 회귀 테스트까지 포함한 대상 테스트 실행도 통과했다.

```text
6 tests completed, 0 failed
BUILD SUCCESSFUL in 37s
```

## ⑤ 불변식 1~5 실측

1. **정상 인증 활동이 만료 판정에 반영된다 — 검증됨(테스트).**
   `2118712345`를 `createdAt - 31일`, `lastLoginAt - 1일`, 주문·출고 없음으로 구성하고 올바른 로그인 결과를 `OK`로 확인했다. 즉 `createdAt` fallback이 최근 로그인 활동을 덮지 않는다.

2. **관리자 복구가 유지된다 — 검증됨(테스트).**
   `LONG_UNUSED`를 관리자 `APPROVED`로 복구한 뒤 다음 `checkStatus`에서 `NEED_PW_INPUT`을 확인했다. 복구가 갱신한 `lastLoginAt`을 실제 판정기가 소비한다.

3. **만료 API와 실제 차단 값 차이 0 — 검증됨(테스트 기준).**
   동일 auth/activity fixture에서 `getExpiration().expiresAt`과 `PartnerAccessPolicy.authenticationExpirationAt()`이 동일함을 확인했고, 그 만료시각을 지난 상태조회가 `LONG_UNUSED`가 됨을 확인했다. 운영 실 인증행 2건 재조회는 공유 DB write 금지 범위 밖의 read-only 실측이 이번 세션에 포함되지 않아 미실행이다.

4. **외부 장애가 인증을 막지 않는다 — 검증됨(실패 주입 테스트).**
   주문 endpoint에 HTTP 503을 주입하고 출고 endpoint는 정상 응답시켜 `PartnerActivityClient.read()`가 예외 없이 주문 활동 `null`과 출고 활동 시각을 반환하는 것을 확인했다. 따라서 장애가 인증 경로로 전파되지 않는다.

5. **차단되면 안 되는 거래처 0 · 앞 라운드 집합 차집합 0 — 미검증(운영 집합).**
   이번 라운드는 공유 DB write/DDL과 운영 데이터 재측정을 하지 않았다. 코드 회귀 테스트에서는 해당 차단 경로를 방지했지만 운영 집합 수치 0은 주장하지 않는다.

## ⑥ 모듈 전체 테스트

실행 명령:

```text
./gradlew.bat :services:partner-auth-service:test --no-daemon --rerun-tasks
```

결과: **71 tests / 0 failed / 0 errors / 0 skipped**, `BUILD SUCCESSFUL`.

직전 보고된 67건보다 4건 증가했으며 테스트 수가 줄지 않았다. Docker 이미지 재빌드 없이 로컬 Gradle 테스트만 실행했다.

## ⑦ 파일별 변경량

`git diff --numstat` 기준이며, 새 파일은 전체 줄을 추가로 계산했다.

| 파일 | +N | −M |
|---|---:|---:|
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/client/PartnerActivityClient.java` | +11 | −6 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAccessPolicy.java` | +19 | −0 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java` | +3 | −2 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceAccessSetTest.java` | +99 | −0 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/client/PartnerActivityClientTest.java` | +53 | −0 |
| `docs/dev-reports/2026-08-02-1015-r4-availability-and-expiry-fix.md` | +145 | −0 |

기존 R3 보고서는 수정하지 않았다.

## 새 파일 경로 목록

- `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/client/PartnerActivityClientTest.java`
- `docs/dev-reports/2026-08-02-1015-r4-availability-and-expiry-fix.md`
