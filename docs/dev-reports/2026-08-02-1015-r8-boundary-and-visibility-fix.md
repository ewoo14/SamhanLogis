# PR #1060 / Issue #1015 — R8 경계·보류 노출 수정 보고서

작성일: 2026-08-03 (KST)  
대상 브랜치: `feat/1015-order-app-access`  
데이터 등급: **`[DEV-SEED]` 로컬 Docker PostgreSQL 실 저장 행** (production 실데이터 아님)

## 1. 결함 원인

### ① 보류가 보이지 않음

R6의 fail-open 보정은 주문·출고 조회 실패를 활동 없음과 분리했지만, `PartnerAccessPolicy.readSafely()`가 `PartnerActivity.unavailable()`을 반환한 뒤 미리보기의 후보 필터에서 탈락시켰다. 컨트롤러 응답은 후보 `List`만 반환했으므로, 조회 실패로 0건이 된 경우와 실제 후보가 0건인 경우를 관리자 화면에서 구분할 수 없었다.

### ② `createdAt` 비대칭

미리보기의 `isLongUnused()`는 업무 활동이 있으면 그 시각을 기준으로 고정하고 `createdAt`을 다시 최댓값에 포함하지 않았다. 실제 인증·만료 쪽 `authenticationExpirationAt()`은 `createdAt`까지 비교했다. 인증행 생성 후 30일이 안 된 거래처에서 오래된 주문·출고가 있으면 두 경로가 갈라질 수 있었다.

### ③ 만료 경계 부등호 불일치

실제 차단은 `!expiresAt.isAfter(now)`(즉 `expiresAt <= now`)였지만 만료 API는 `expiresAt.isBefore(now)`(즉 `expiresAt < now`)였다. `expiresAt == now`인 정확한 30일 경계에서 실제 차단은 true, API `expiredAlready`는 false였다.

## 2. RED 재현 원문

두 테스트를 수정 전에 먼저 작성하고 다음 명령을 실행했다.

```text
./gradlew.bat :services:partner-auth-service:test \
  --tests com.samhanair.logis.partnerauth.service.OrderAppAccessPreviewTest.previewExposesDeferredLookupInsteadOfSilentlyReturningNoCandidates \
  --tests com.samhanair.logis.partnerauth.service.PartnerAuthServiceAccessSetTest.expirationApiTreatsExactlyThirtyDaysAsExpiredLikeAuthenticationBlock \
  --no-daemon
```

결과: 컴파일 성공, 2 tests completed, 2 failures.

```text
OrderAppAccessPreviewTest > previewExposesDeferredLookupInsteadOfSilentlyReturningNoCandidates() FAILED
java.lang.AssertionError:
Expecting actual:
  []
not to be an instance of: java.util.List

PartnerAuthServiceAccessSetTest > expirationApiTreatsExactlyThirtyDaysAsExpiredLikeAuthenticationBlock() FAILED
org.opentest4j.AssertionFailedError:
Expecting value to be true but was false
```

경계 테스트는 `LocalDateTime.of(2026, 8, 3, 0, 0)`을 고정하고 생성시각을 정확히 30일 전으로 설정했다. `ZoneId`, `Instant.now()`, OS 기본 타임존을 사용하지 않으므로 `ubuntu-latest`에서도 같은 경계값을 검증한다.

## 3. Fix 및 보류 노출 방식의 근거

### Fix

- 신규 `PartnerAccessPreviewResponse` envelope를 추가했다.
  - `candidates`
  - `deferred`
  - `deferredPartnerCount`
  - `deferredSources` (`ORDER`, `SHIPMENT`)
- 미리보기는 보류 건을 후보에서 제외하되, 보류 여부·영향 건수·실패 원천을 같은 응답에 포함한다.
- 데스크톱 주문서 승인 화면은 보류 시 `주문·출고 조회 실패로 N건의 판정이 보류되었습니다` 경고를 표시한다. 따라서 대상 0건과 조회 보류를 구분할 수 있다.
- `isLongUnused()`와 `authenticationExpirationAt()`이 공통 `latestBaseline()`을 사용하도록 통합했다. 기준은 `max(주문 성공, 출고, createdAt, access_restored_at)`이며 로그인 시각은 포함하지 않는다.
- 만료 API의 비교를 `!expiresAt.isAfter(now)`로 바꿔 실제 차단과 `<=`를 공유한다.
- `access_restored_at` 복구 경로와 기존 복구 테스트는 변경하지 않았다.

### 노출 방식을 이렇게 정한 이유

관리자 미리보기는 이미 후보를 계산하는 화면이고, 기존 후보 배열을 `candidates`로 보존하면서 메타데이터를 추가하면 “후보 목록”과 “판정 불능 영향”을 한 번에 확인할 수 있다. HTTP 200을 유지하므로 정상 후보가 일부 있는 부분 장애에서도 관리자 조치가 가능하다.

### 검토 후 버린 대안

- **HTTP 503만 반환**: 장애가 명확해지지만 정상 조회된 후보까지 잃고, 화면에서 영향 건수·실패 원천을 표시할 수 없어 버렸다.
- **응답 헤더만 추가**: 네트워크 도구를 열어야 하므로 관리자 화면의 기본 사용 흐름에서 보류가 계속 숨겨진다.
- **로그/metric만 추가**: 운영자는 볼 수 있지만 영업 관리자가 현재 화면에서 알 수 없고, “0건”과 “보류”가 계속 같아 버렸다.
- **보류 행을 실제 DB에 저장**: 조회 실패 상태의 영속화·재평가·만료 정책이라는 새 업무 규칙이 필요하고, 공유 DB write/DDL 금지 범위를 넘으므로 채택하지 않았다.

## 4. GREEN 결과

핵심 RED 2건과 `createdAt` 대칭 고정 테스트가 GREEN이다.

```text
./gradlew.bat :services:partner-auth-service:test --no-daemon --rerun-tasks
BUILD SUCCESSFUL
75 tests / 0 failures / 0 errors / 0 skipped
```

기존 기준 72건 대비 신규 테스트 3건이 추가되어 75건이다. 프런트 타입 검증은 `clients/desktop/node_modules/.bin/tsc`가 없는 상태라 실행하지 못했다. 의존성 설치·Docker 재빌드·재기동은 하지 않았다.

## 5. 불변식 1~6 실측

### 1) 보류 상태 노출

- 코드: `PartnerAccessPreviewResponse.deferred=true`, `deferredPartnerCount`, `deferredSources`를 반환한다.
- RED→GREEN: 조회 예외 1건에서 기존 `[]` 대신 보류 envelope가 반환됨을 테스트했다.
- UI: 데스크톱 화면에서 보류 건수와 `ORDER`/`SHIPMENT` 원천을 경고로 표시한다.
- `[DEV-SEED]` 현재 조회: 인증 활성 2건, 현재 두 외부 원천이 정상 응답한 테스트/DB 스냅샷에서 보류 실건수는 0건이다. 장애를 주입하거나 컨테이너를 재빌드하지 않았으므로 라이브 장애 경고 캡처는 생성하지 않았다.

### 2) 미리보기·실제 차단 `createdAt` 대칭

- 코드: 두 경로가 `latestBaseline()`의 동일한 `max` 결과를 사용한다.
- 고정 테스트: 업무 활동은 45~60일 전, `createdAt`은 기준시각 1일 전으로 두어 preview와 authentication 양쪽 모두 `false`임을 확인했다.
- 실측: 현재 `[DEV-SEED]` 2건은 주문 확정 활동 1건(confirmed 0건) 및 OUTBOUND 0건이어서 후보 0건이다. preview/actual 대칭 차집합은 **0건**으로 계산된다.

### 3) 만료 경계 `<=`

- RED: 정확히 생성시각+30일인 `2026-08-03T00:00:00`에서 기존 만료 API가 `false`였다.
- GREEN: 같은 고정 시각에서 실제 차단 판정과 만료 API `expiredAlready` 모두 `true`다.
- 타임존: `LocalDateTime` 고정값만 사용했고 시스템 타임존을 읽지 않는다. Linux CI에서도 동일하다.

### 4) 잘못 차단 0·대칭 차집합 0

`[DEV-SEED]` read-only 조회 결과:

```text
partner_auth_db: active NEED_PW_INPUT 2건, LONG_UNUSED 0건
partner_order_db: 두 biz_no 대상 1건, CONFIRMED 0건
slip_db: 두 partner_code 대상 active OUTBOUND 0건
PREVIEW_COUNT=0
ACTUAL_BLOCK_COUNT=0
PREVIEW_MINUS_ACTUAL_COUNT=0
ACTUAL_MINUS_PREVIEW_COUNT=0
WRONGLY_BLOCKED_COUNT=0
```

DB 수치는 production이 아닌 `[DEV-SEED]` 로컬 스냅샷이며, 세 DB 모두 `BEGIN TRANSACTION READ ONLY` 안에서 `SELECT`만 수행했다.

### 5) 레거시 기준 유지

`lastLoginAt`은 판정 기준 계산에 사용하지 않는다. 주문 성공·출고·`createdAt`만 사용하고, 관리자 복구 시각은 별도 복구 기준으로 포함한다. `unusedDays`는 기존 API 호환 입력으로 유지되며 판정은 고정 레거시 30일이다.

### 6) 관리자 복구 `access_restored_at`

`PartnerAccessPolicy.latestBaseline()`에 `access_restored_at`을 유지했고, `PartnerApprovalService`의 `LONG_UNUSED → APPROVED` 복구 호출도 변경하지 않았다. 기존 `adminRestoreRemainsEffectiveOnNextStatusCheck`가 전체 모듈 테스트에서 GREEN이다. 공유 DB write 금지 때문에 실제 DB PATCH·commit·새 persistence context 재조회는 수행하지 않았다.

## 6. 모듈 전체 테스트

```text
명령: ./gradlew.bat :services:partner-auth-service:test --no-daemon --rerun-tasks
결과: BUILD SUCCESSFUL
테스트: 75
실패: 0
오류: 0
skip: 0
```

Docker 이미지 재빌드·공유 DB write/DDL·브랜치 조작·commit/push는 수행하지 않았다.

## 7. 파일별 변경량

```text
clients/desktop/src/renderer/api/sales.ts                                      +10 / -2
clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx                +10 / -4
services/partner-auth-service/src/main/java/.../PartnerApprovalsController.java +4  / -4
services/partner-auth-service/src/main/java/.../PartnerAccessPolicy.java         +10 / -11
services/partner-auth-service/src/main/java/.../PartnerApprovalService.java      +35 / -10
services/partner-auth-service/src/main/java/.../PartnerAuthService.java          +1  / -1
services/partner-auth-service/src/test/java/.../OrderAppAccessPreviewTest.java   +34 / -0
services/partner-auth-service/src/test/java/.../PartnerAuthServiceAccessSetTest.java +31 / -0
services/partner-auth-service/src/main/java/.../PartnerAccessPreviewResponse.java +16 / -0 (신규)
```

## 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1015-r8-boundary-and-visibility-fix.md`
- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/dto/PartnerAccessPreviewResponse.java`
