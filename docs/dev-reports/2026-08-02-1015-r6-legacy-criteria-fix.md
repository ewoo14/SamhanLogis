# PR #1060 / Issue #1015 — R6 레거시 기준 재수렴 fix

작성일: 2026-08-02  
대상 브랜치: `feat/1015-order-app-access` / `f115ef699`  
작업 범위: `partner-auth-service` 모듈

## 1. 레거시 원문과 기준 확정

원문: `tools/legacy-gas/거래처 발송 주문서/Code.js:2938-2961`

```javascript
// 로그 및 출고 내역에서 최신 시점 조회
const logTime = getLatestTime(NOTION_DB_ID_LOG, true);
const shipTime = getLatestTime(NOTION_DB_ID_SHIPPING, false);
const createdTime = new Date(user.createdTime).getTime();

// 일반 활동
const baseTime = Math.max(createdTime, logTime, shipTime);
const standardExpTime = baseTime + (30 * 24 * 60 * 60 * 1000);
```

`getLatestTime(..., true)`의 필터는 `로그` 속성의 `주문 성공`이고, 두 번째 호출은 출고 내역이다. 레거시 원문에는 `lastLoginAt`이 없다. **기준 확정: 로그인은 면제 사유가 아니며, 주문 성공·출고·생성시각만 30일 판정에 사용한다.**

## 2. RED 2건

수정 전에 `PartnerAuthServiceAccessSetTest`에 다음 실패 테스트를 먼저 추가하고 실행했다.

1. `recentLoginDoesNotExemptPartnerWithNoOrderOrShipmentActivity`
   - 생성시각 31일 전, 로그인 1일 전, 주문·출고 없음.
   - RED: 현재 HEAD가 `OK`를 반환했으나 기대값은 `LONG_UNUSED`.
2. `activityLookupFailureDoesNotBlockAuthenticationAsIfThereWereNoActivity`
   - 주문·출고 reader에 `order service 503` 예외 주입.
   - RED: 현재 인증이 `IllegalStateException`으로 중단됐고, `조회 실패`를 별도 상태로 보존하지 못함.

RED 실행 결과:

```text
5 tests completed, 2 failed
recentLoginDoesNotExemptPartnerWithNoOrderOrShipmentActivity() FAILED
activityLookupFailureDoesNotBlockAuthenticationAsIfThereWereNoActivity() FAILED
```

## 3. fix 및 장애/차단 긴장 해소 근거

`PartnerAccessPolicy`의 미리보기·실제 인증 기준을 모두 `PartnerActivity + access_restored_at + createdAt`으로 통일했다. `lastLoginAt`은 로그인 이력 저장만 수행하고 장기미발주 판정에는 사용하지 않는다.

주문·출고 조회 결과에는 원천별 성공 여부를 추가했다. `PartnerActivityClient`는 503/4xx/timeout을 `null 활동`으로 바꾸지 않고 `orderLookupSucceeded`/`shipmentLookupSucceeded`가 false인 snapshot을 반환한다. 판정기는 두 원천 중 하나라도 실패하면 후보 선별과 실제 차단을 보류한다. 즉, 인증은 계속 진행되고 활동을 모르는 상태에서 거래처를 차단하지 않는다. 같은 정책을 preview에도 적용해 두 집합이 같은 보수적 결과를 낸다.

관리자 복구는 `lastLoginAt`을 재사용하지 않고 `access_restored_at`을 별도 영속 필드로 기록한다. 복구 유예는 유지되며, 이후 정상 로그인 반복은 유예를 다시 연장하지 않는다.

버린 대안:

- `max(lastLoginAt, 주문/출고, createdAt)`: 로그인만 반복하면 무기한 면제되어 레거시 원문과 기능 목적을 위반한다.
- 장애 원천을 `null`로만 표현: 조회 실패와 실제 무활동을 합쳐 오차단을 만든다.
- 장애를 인증 예외로 전파: 외부 장애가 주문서 앱 인증을 막으므로 R3-04를 회귀시킨다.
- 장애 시 무조건 활동 없음으로 처리: 차단을 fail-closed로 만들어 불변식 ③을 위반한다.

공유 DB write/DDL 실행과 Docker 이미지 재빌드는 하지 않았다. 새 V3 migration은 코드 산출물로만 추가했다.

## 4. GREEN

RED 2건 수정 후 대상 테스트와 503 client 테스트가 통과했다. 이후 모듈 전체 테스트를 실행했다.

```text
BUILD SUCCESSFUL
72 tests completed, 0 failed
```

71 tests에서 감소하지 않았고, R6 회귀 테스트 2건과 장애 원천 상태 assertion이 추가됐다.

## 5. 불변식 1~6 실측

| 불변식 | 실측 결과 |
|---|---|
| 1. 레거시 기준 | `Code.js:2938-2961` 원문 대조 완료. 로그인 제외, 주문 성공·출고·생성시각 기준으로 확정 |
| 2. preview/실제 동일 기준 | `OrderAppAccessPreviewTest`, `PartnerAuthServiceAccessSetTest` GREEN. 정책 호출점이 모두 `PartnerAccessPolicy`로 수렴 |
| 3. 조회 실패와 활동 없음 구분 / 오차단 0 | 주문 503 예외 주입 시 `PartnerActivity.orderLookupSucceeded=false`; 인증은 `OK`, 장기미발주 차단 false. 실패를 활동 없음으로 판정하지 않음 |
| 4. 외부 장애가 인증을 막지 않음 | `PartnerActivityClientTest`에서 주문 HTTP 503 + 출고 HTTP 200 주입. 인증 실패 전파 없이 주문 실패 상태와 출고 시각을 함께 보존 |
| 5. 관리자 복구 | `adminRestoreRemainsEffectiveOnNextStatusCheck`, 기존 restore 테스트 GREEN. 별도 `access_restored_at`으로 복구 기준 보존 |
| 6. 잘못 차단 거래처 0 | 최근 로그인만 있는 정상 계정은 `LONG_UNUSED`로 차단되고, 조회 실패 계정은 차단되지 않음. 모듈 테스트 실패 0건 |

공유 실 DB의 현재 집합 수치(직전 보고서의 preview/actual 대칭 차집합 0)는 변경하지 않았고, 이번 fix에서 DB 상태 전이를 추가로 만들지 않았다. 따라서 새 코드의 실 DB 상태전이 수치는 미실행이며, 위 장애·로그인 경로는 격리된 테스트 fixture로 재현했다.

## 6. 모듈 전체 테스트

실행 명령:

```powershell
.\gradlew.bat :services:partner-auth-service:test
```

결과: **72 tests / 0 failed / BUILD SUCCESSFUL**.

## 7. 파일별 변경량

`git diff --numstat`와 신규 파일을 기준으로 추가·삭제를 분리했다.

| 파일 | +N | -M |
|---|---:|---:|
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/client/PartnerActivityClient.java` | 17 | 7 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java` | 10 | 6 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAccessPolicy.java` | 27 | 7 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerActivity.java` | 20 | 1 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java` | 1 | 1 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java` | 2 | 2 |
| `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/dto/ExpirationResponse.java` | 1 | 1 |
| `services/partner-auth-service/src/main/resources/db/migration/V3__partner_auth_access_restore_at.sql` | 2 | 0 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/client/PartnerActivityClientTest.java` | 2 | 0 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerApprovalServiceTest.java` | 2 | 1 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceAccessSetTest.java` | 27 | 1 |
| `services/partner-auth-service/src/test/java/com/samhanair/logis/partnerauth/service/PartnerAuthServiceTest.java` | 1 | 0 |
| `docs/dev-reports/2026-08-02-1015-r6-legacy-criteria-fix.md` | 83 | 0 |

## 새 파일 경로 목록

- `services/partner-auth-service/src/main/resources/db/migration/V3__partner_auth_access_restore_at.sql`
- `docs/dev-reports/2026-08-02-1015-r6-legacy-criteria-fix.md`
