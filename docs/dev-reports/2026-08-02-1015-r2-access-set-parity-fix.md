# PR #1060 / Issue #1015 라운드 fix — 주문서 앱 접근 집합 정합성

검증일: 2026-08-02 KST  
브랜치: `feat/1015-order-app-access`  
범위: R-01·R-02 수정, R-03 원인 판별. Docker 이미지 재빌드·DB 쓰기는 하지 않았다.

## ① 원인

- R-01: `PartnerApprovalService.previewLongUnused()`는 주문·출고 활동을 읽었지만, `PartnerAuthService`의 상태조회·로그인은 `PartnerAuth.expirationAt()`의 마지막 로그인/비밀번호 변경 시각을 사용했다.
- R-02: 미리보기는 활동 시각이 `null`이면 즉시 제외했다. 레거시 기준인 “활동 집합에 없어도 인증행 생성 후 30일 경과”의 생성시각 fallback이 없었다.
- R-03: `slip`의 활성 OUTBOUND 2,303행 중 2,003행에 `partner_code`가 없고, 이 2,003행 모두 `business_number`도 없어 현재 데이터만으로 거래처 귀속을 복원할 수 없다.

## ② RED 원문

### R-01 RED

새 실제 상태조회 계약 테스트가 활동 reader를 주입하려 했으나 생산 코드가 아직 해당 계약을 제공하지 않았다.

```text
PartnerAuthServiceTest.java:99: error: constructor PartnerAuthService in class PartnerAuthService cannot be applied to given types;
  required: PartnerAuthRepository,PartnerLoginAttemptRepository,PartnerSessionRepository,PasswordEncoder,PartnerAuthJwtProperties,DcConfigClient,SmsClient
  found:    PartnerAuthRepository,PartnerLoginAttemptRepository,PartnerSessionRepository,PasswordEncoder,PartnerAuthJwtProperties,DcConfigClient,SmsClient,PartnerActivityReader
  reason: actual and formal argument lists differ in length
> Task :services:partner-auth-service:compileTestJava FAILED
BUILD FAILED
```

### R-02 RED

활동 없음·인증행 생성 31일 전인 승인 거래처를 넣고 미리보기를 실행했다.

```text
OrderAppAccessPreviewTest > previewIncludesApprovedPartnerWithNoActivityWhenAuthWasCreatedOverThirtyDaysAgo() FAILED
    org.opentest4j.AssertionFailedError at OrderAppAccessPreviewTest.java:84
3 tests completed, 1 failed
> Task :services:partner-auth-service:test FAILED
> Task :services:partner-auth-service:test
BUILD FAILED
```

두 테스트의 fixture는 서비스가 실제로 보유하는 `PartnerAuth` 승인 상태와 주문·출고 reader 응답(`null/null` 또는 실제 시각)을 사용했다. 30일 경계는 영속 audit `created_at`에 대응하는 시각을 주입했다.

## ③ fix

`PartnerAccessPolicy`를 추가해 두 경로가 같은 판정을 사용하게 했다.

```text
활동 시각(max(order, shipment))이 있으면 활동 시각 + 30일
활동이 없으면 partner_auth.created_at + 30일
```

- 미리보기와 `checkStatus()`/`tryLogin()`이 모두 `PartnerAccessPolicy`를 호출한다.
- 이미 `LONG_UNUSED`, `LOCKED`, `ACCESS_DENIED`, `PENDING`, `NEED_PW_SET`인 상태의 기존 차단·보호 의미는 유지했다.
- 기존 Spring IT에도 내부 활동 reader mock을 추가해 외부 서비스 경계를 격리했다.
- Linux 단정 점검: 비교는 Java `LocalDateTime`과 PostgreSQL 표준 `COUNT/FILTER/MAX`만 사용하며 Windows 경로·로케일·파일시스템 동작에 의존하지 않는다.

## ④ GREEN 원문

R-01/R-02 전용 테스트 및 기존 핵심 서비스 테스트:

```text
> .\gradlew :services:partner-auth-service:test --tests '...OrderAppAccessPreviewTest' --tests '...PartnerAuthServiceAccessSetTest' --tests '...PartnerAuthServiceTest' --no-daemon
> Task :services:partner-auth-service:test
BUILD SUCCESSFUL in 51s
```

R-01 상태조회와 로그인 모두 최근 활동 2일 전 + 마지막 로그인 90일 전 fixture에서 각각 허용 상태/`OK`를 확인했다.

## ⑤ 불변식 실측

### 1. 미리보기 집합 = 실제 차단 집합

실 DB 읽기 전용 기준:

- 활성 `partner_auth`: **2건** (`NEED_PW_INPUT` 2건)
- 두 인증행의 주문 확정 활동: **0건**
- 두 인증행의 활성 OUTBOUND 활동: **0건**
- 인증행 생성시각 30일 초과: **0/2건**
- 공통 정책 미리보기 후보: **0건**
- 공통 정책 실제 상태조회/로그인 차단 후보: **0건**
- 양 집합 차집합: **0건**

현재 데이터의 0은 경계 데이터가 없어서 나온 값이며, 정책 동일성을 증명하는 코드는 공통 판정기로 보장한다.

### 2. 활동 이력 없는 승인 거래처 복원

- 실 DB 레거시 대조 결과: 생성 후 30일 초과 + 활동 없음 **0건 복원**(활성 인증 2건 모두 생성 후 30일 미만).
- 31일 경계 회귀 fixture: **1건 복원**, 2일 된 인증행은 제외되어 **1/2**가 복원됐다.

### 3. 잘못 차단하면 안 되는 거래처

- 실 DB에서 공통 정책 기준 잘못 차단: **0건** (`0/2`).
- R-03 공란 출고행에 대한 잘못 차단 여부: 거래처 식별자가 없어 **산정 불가**. 이를 0건으로 합산하지 않았다.

### 4. 무권한 우회 401

이 라운드는 인증 controller/게이트웨이 가드를 변경하지 않았다. 기존 적대검증 실측은 다음과 같았다.

```text
NO_TOKEN             HTTP_STATUS=401
FORGED_MASTER_HEADER HTTP_STATUS=401
INVALID_BEARER       HTTP_STATUS=401
```

이번 라운드에는 Docker 재빌드 금지 및 공유 배포본 제약으로 이 3개 라이브 경로를 재실행하지 않았다. 따라서 이번 라운드 fresh 판정은 **미검증**, 기존 증거는 **3/3 차단**으로 구분한다.

### 5. R-03 원인 판별

읽기 전용 SQL 실측:

```text
active_outbound | blank_partner_code | blank_both
2303            | 2003               | 2003
```

`2003 / 2303 = 86.97%`이며, 공란행의 `business_number`도 전부 공란이다. 따라서 현재 조회축(`partner_code`)을 다른 컬럼으로 바꾸면 해결되는 문제가 아니라 원천 데이터 식별자 결손이다. 이 PR에서는 backfill·DB 쓰기를 하지 않고 영향 거래처 수를 **산정 불가**로 남긴다.

## ⑥ 모듈 전체 테스트

명령:

```text
.\gradlew :services:partner-auth-service:test --no-daemon
```

최종 출력:

```text
67 tests completed, 0 failures, 0 skipped
BUILD SUCCESSFUL in 55s
```

Testcontainers skip: **0건**. Docker 이미지 재빌드는 하지 않았다. 중간 전체 실행에서 새 reader mock이 없던 기존 IT 2건이 실패했으며, `PartnerAuthControllerIT`에 `PartnerActivityReader` mock을 추가한 뒤 전체 테스트를 다시 실행해 위 결과를 얻었다.

## 파일별 변경량

추가분과 삭제분을 분리해 기록한다.

```text
services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAccessPolicy.java       +29/-0
services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java     +1/-4
services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java         +6/-2
services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/it/PartnerAuthControllerIT.java         +7/-0
services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/OrderAppAccessPreviewTest.java  +32/-0
services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceAccessSetTest.java +75/-0
services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceTest.java     +18/-1
```

## 새로 만든 파일

- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAccessPolicy.java`
- `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceAccessSetTest.java`
- `docs/dev-reports/2026-08-02-1015-r2-access-set-parity-fix.md`
