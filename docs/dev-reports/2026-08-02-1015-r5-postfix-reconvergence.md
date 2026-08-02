# PR #1060 / Issue #1015 — R5 postfix 재수렴 리뷰

작성일: 2026-08-02  
역할: 머지 전 재수렴 리뷰어  
대상 브랜치/HEAD: `feat/1015-order-app-access` / `647b03a783dd735b6de1c95fc8afdca8498bfb32`

## 최종 판정

**머지 차단.** 우선 요청한 현재 실 DB 수치는 통과한다.

- 미리보기 집합: **0건**
- 실제 차단 집합: **0건**
- 미리보기 − 실제 차단: **0건**
- 실제 차단 − 미리보기: **0건**
- 대칭 차집합: **0건**
- 잘못 차단되는 거래처(`실제 차단 − 미리보기/레거시 목적 집합`): **0건**

그러나 이 0은 인증행 2건이 아직 `createdAt + 30일`을 지나지 않은 현재 스냅샷의 결과일 뿐이다. HEAD의 실제 인증 기준 `max(lastLoginAt, 주문/출고 lastActivityAt, createdAt)`은 레거시와 기획 목적에 없는 로그인 면제를 추가한다. 주문·출고가 계속 0건이어도 로그인만 반복하면 만료가 계속 연장되어 “장기간 발주하지 않은 거래처의 주문서 앱 접근 차단”이 작동하지 않는다.

또한 주문/출고 서비스별 예외를 `null`로 바꾸는 구현은 가용성은 유지하지만 “조회 실패”와 “실제 활동 없음”을 구분하지 않는다. 최근 활동이 장애 난 서비스에만 있는 거래처는 남은 오래된 값으로 `LONG_UNUSED` 판정되어 잘못 차단될 수 있다. 이 경로 역시 머지 차단 사유다.

## 1. 공유 스택 배포본 나이 선확인

404/500을 HEAD 결함으로 오판하지 않기 위해 API 재현 전에 실행했다.

```text
samhan-slip-service|2026-08-02T04:30:03.970155657Z
samhan-partner-order-service|2026-07-31T15:51:50.533560637Z
samhan-api-gateway|2026-07-31T15:15:50.070347996Z
samhan-partner-auth-service|2026-07-29T10:47:25.006412113Z
samhan-postgres|2026-07-26T16:08:22.576572053Z
```

partner-auth 컨테이너는 HEAD fix(2026-08-02)보다 오래됐다. 따라서 아래 `access-preview` 500은 HEAD 결함으로 세지 않았고, HEAD 집합은 실 DB read-only 값과 HEAD 판정식을 결합해 측정했다.

## 2. 실 DB 집합 재측정

### 2.1 읽기 전용 보장과 기준시각

세 DB에서 모두 `BEGIN READ ONLY`로 조회했다. DB가 반환한 원문:

```text
partner_auth_db|2026-08-02 21:39:35.839118+09|read_only=on
partner_order_db|2026-08-02 21:39:36.035017+09|read_only=on
slip_db|2026-08-02 21:39:36.235276+09|read_only=on
```

집합 계산 기준시각은 첫 조회의 `2026-08-02 21:39:35.839118+09`로 고정했다. DB 객체 생성, 임시 테이블, DDL, INSERT/UPDATE/DELETE는 없었다. 세 DB의 실 조회 결과를 PowerShell 메모리에서 거래처코드로 결합했다.

### 2.2 인증·주문·출고 원문

활성 인증행:

```text
 partner_code |   biz_no   |    status     |         created_at         |       last_login_at        |    password_changed_at     | is_deleted
--------------+------------+---------------+----------------------------+----------------------------+----------------------------+------------
 1068689215   | 1068689215 | NEED_PW_INPUT | 2026-07-30 01:03:17.741187 | 2026-07-30 01:59:02.245854 | 2026-07-30 01:05:32.177929 | f
 2118712345   | 2118712345 | NEED_PW_INPUT | 2026-07-09 07:25:53.085447 | 2026-08-02 00:22:41.802872 | 2026-07-09 07:26:06.315707 | f
(2 rows)
```

두 인증 거래처코드의 확정 주문 `max(confirmed_at)`과 활성 OUTBOUND `max(slip_date)`는 모두 `NULL`이었다. 전체 주문/출고 그룹 조회에서 `1068689215` 주문행은 있으나 `confirmed_rows=0`, `2118712345` 그룹은 없었다. 출고 그룹에는 두 코드 모두 없었다.

HEAD 판정식을 실값에 적용한 실행 원문:

```text
MEASURED_AT=2026-08-02 21:39:35.839118+09

partnerCode status        lastOrderAt lastShipmentAt createdAt                  lastLoginAt                preview actualBlock orderDownBlock previewExpiresAt
----------- ------        ----------- -------------- ---------                  -----------                ------- ----------- -------------- ----------------
1068689215  NEED_PW_INPUT NULL        NULL           2026-07-30 01:03:17.741187 2026-07-30 01:59:02.245854   False       False          False 2026-08-29 01:03:17.741187
2118712345  NEED_PW_INPUT NULL        NULL           2026-07-09 07:25:53.085447 2026-08-02 00:22:41.802872   False       False          False 2026-08-08 07:25:53.085447

PREVIEW_COUNT=0
ACTUAL_BLOCK_COUNT=0
PREVIEW_MINUS_ACTUAL_COUNT=0
ACTUAL_MINUS_PREVIEW_COUNT=0
SYMMETRIC_DIFFERENCE_COUNT=0
WRONGLY_BLOCKED_COUNT=0
ORDER_SERVICE_DOWN_BLOCK_COUNT=0
ORDER_SERVICE_DOWN_NEW_FALSE_BLOCK_COUNT=0
```

### 2.3 수치 해석

현재 시점에는 두 거래처 모두 생성 후 30일 미만이므로 미리보기와 실제 차단이 우연히 함께 0이다. 특히 `2118712345`는 주문·출고 활동이 0건이어서 목적 기준 만료는 `createdAt + 30일 = 2026-08-08 07:25:53.085447`이다. HEAD 실제 인증은 최근 로그인까지 포함해 `2026-09-01 00:22:41.802872`로 23일 16시간 56분 48.717425초 늦춘다. 그 사이 로그인이 다시 성공하면 다시 30일 연장된다.

따라서 “현재 차집합 0”은 정책 수렴 증거가 아니다. `2026-08-08` 이후 주문·출고가 계속 없다면 미리보기에는 들어가지만 최근 로그인 때문에 실제 차단에서는 빠지는 집합 차이가 실데이터에서 예정되어 있다.

## 3. 각도 2 — `max`가 기능을 지나치게 느슨하게 하는가

### 결과: **그렇다 — BLOCK**

레거시 원문은 로그인 시각을 사용하지 않는다.

```javascript
// 로그 및 출고 내역에서 최신 시점 조회
const logTime = getLatestTime(NOTION_DB_ID_LOG, true);
const shipTime = getLatestTime(NOTION_DB_ID_SHIPPING, false);
const createdTime = new Date(user.createdTime).getTime();

// 일반 활동
const baseTime = Math.max(createdTime, logTime, shipTime);
const standardExpTime = baseTime + (30 * 24 * 60 * 60 * 1000);
```

레거시 사용자 문구도 다음과 같다.

```text
마지막 발주일로부터 30일까지의 기한을 의미합니다.
최종 주문일로부터 30일 간 발주 기록이 없어 사용이 제한되었습니다.
```

레거시는 별도 `tempAuthTime`이 있을 때만 임시승인을 해당 주 일요일까지 연장한다. 즉 “로그인 성공”과 “관리자 임시승인”은 서로 다른 개념이다.

기획/정찰 문서의 확정 해석도 같다.

```text
장기 미발주 판정: 실행 시각 기준 최근 30일 동안 `주문 성공` 로그도 없고 생성시각/출고일 기준 출고 활동도 없으며, 승인 DB 페이지 생성 후에도 30일이 지난 `승인` 거래처다.
선별 결과: 목록만 보여주는 것이 아니라 승인상태를 `장기미발주`로 PATCH해 주문서 앱 접근을 끊는다.
레거시 의미를 계승하려면 현행의 마지막 로그인/비밀번호 변경 기준을 그대로 재사용하면 안 된다.
```

반면 HEAD는 실제 상태조회·로그인·만료 API의 기준을 `max(lastLoginAt, 주문/출고 lastActivityAt, createdAt)`으로 정했다. 로그인은 차단 판정 전에 성공해야 갱신되지만, 한 번 성공한 뒤 매 30일 이내에 주문 없이 로그인만 반복하면 영구 면제된다. 이는 복구 유지를 해결하기 위해 일반 로그인까지 장기미발주 활동으로 승격한 정책 변경이며 Issue #1015의 기능 목적과 레거시 완전계승에 반한다.

## 4. 각도 3 — 서비스별 `null` 격리의 오차단 경로

### 결과: **경로 존재 — BLOCK**

`PartnerActivityClient.get()`은 주문과 출고 호출 각각의 모든 `RestClientException`(4xx/5xx/timeout 포함)을 잡아 `ActivityEnvelope(null)`로 바꾼다. 두 호출이 서로 격리되어 인증 요청 자체가 500으로 중단되지 않는 점은 확인된다.

하지만 판정기는 `null`을 “조회 실패”가 아니라 “활동 없음”으로 처리한다. 주문 서비스만 실패한 경우 계산은 다음과 같이 축소된다.

```text
정상: max(lastLoginAt, lastOrderAt, lastShipmentAt, createdAt)
주문 장애: max(lastLoginAt, NULL, lastShipmentAt, createdAt)
```

최근 30일 활동이 주문에만 있고 로그인·출고·생성시각이 30일보다 오래된 거래처는 주문 서비스 장애 순간 실제보다 오래된 것으로 판정되어 `LONG_UNUSED`로 저장되고 로그인이 거부된다. 미리보기 역시 같은 reader를 사용하므로 후보에 잘못 포함되어 비밀번호 초기화 대상으로도 노출될 수 있다.

선행 정찰의 장애 계약 원문은 다음과 같다.

```text
활동 원천 하나가 실패한 상태에서 미활동으로 판정하면 정상 거래처 접근을 끊을 수 있다. 레거시의 부분 조회 후 계속 처리 동작은 fail-closed가 아니라 판정 중단으로 재설계할 필요가 있다.
```

현재 실 인증행 2건에는 원래 확정 주문 활동이 없으므로 주문 장애를 대입해도 신규 오차단은 **0건**이었다. 이는 구조적 경로가 없다는 뜻이 아니라 현재 작은 모집단에 “최근 주문만 있는 거래처”가 없다는 뜻이다.

## 5. 각도 4 — R3-02 관리자 복구 실 경로

### 결과: **코드 실 경로 유지, 라이브 상태전이 미실행**

도달 경로는 다음과 같이 연결돼 있다.

```text
Desktop 상태 dropdown에서 APPROVED 선택
→ PATCH /api/v1/partner-approvals/{partnerCode}/status
→ PartnerApprovalService.updateStatus(..., APPROVED)
→ 저장 상태가 LONG_UNUSED이면 PartnerAuth.restoreFromLongUnused()
→ status=NEED_PW_INPUT, lastLoginAt=LocalDateTime.now()
→ 다음 상태조회/로그인은 HEAD의 max 기준이 복구시각을 소비
```

게이트웨이의 `partner-auth-approvals-v1` 라우트와 `JwtAuthentication`, controller의 UPDATE 권한 가드도 남아 있다. 따라서 R3-02를 끊는 정적 연결 단절은 찾지 못했다.

그러나 현재 실 DB의 `LONG_UNUSED` 행은 **0건**이고, 복구 PATCH는 DB write다. 사용자 제약에 따라 상태를 만들거나 기존 행을 변경하지 않았으므로 실제 게이트웨이 PATCH → DB 전이 → 후속 상태조회/로그인까지의 라이브 증명은 수행하지 않았다. “실 경로로 완전 검증됨”으로 판정하지 않는다.

또한 R3-02 복구를 유지하려고 `lastLoginAt`을 기준에 포함시킨 방식은 각도 2의 일반 로그인 영구 면제를 만든다. 복구 기준시각과 일반 로그인 시각을 같은 정책 신호로 사용한 것이 충돌의 직접 원인이다.

## 6. 게이트웨이 재현 원문

요청된 계정으로 로그인했다. 토큰 문자열 자체는 보고서에 기록하지 않았다.

```text
LOGIN
HTTP_STATUS=200
TOKEN_PRESENT=True
```

승인 목록:

```text
REQUEST=http://localhost:8080/api/v1/partner-approvals?status=APPROVED&page=0&size=100
{"success":true,"code":"OK","message":"성공","data":{"content":[{"partnerCode":"1068689215","partnerName":"주식회사 중앙유통","status":"APPROVED","approvalRequestedAt":"2026-07-30T01:03:17.741187","pcTutorialDone":true,"mobileTutorialDone":false,"assignedManagerName":null},{"partnerCode":"2118712345","partnerName":"2118712345","status":"APPROVED","approvalRequestedAt":"2026-07-09T07:25:53.085447","pcTutorialDone":false,"mobileTutorialDone":false,"assignedManagerName":null}],"pageable":{"pageNumber":0,"pageSize":100,"sort":{"sorted":false,"unsorted":true,"empty":true},"offset":0,"paged":true,"unpaged":false},"totalElements":2,"totalPages":1,"last":true,"numberOfElements":2,"first":true,"size":100,"number":0,"sort":{"sorted":false,"unsorted":true,"empty":true},"empty":false},"timestamp":"2026-08-02T12:40:58.700961728Z"}
HTTP_STATUS=200
```

미리보기:

```text
REQUEST=http://localhost:8080/api/v1/partner-approvals/access-preview?unusedDays=30
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-08-02T12:40:58.971333412Z"}
HTTP_STATUS=500
```

위 500은 partner-auth 컨테이너가 2026-07-29 생성된 stale 배포본이므로 HEAD 결함으로 세지 않았다.

공개 상태조회·만료 API의 clean UTF-8 원문:

```text
REQUEST=http://localhost:8080/api/v1/auth/partner-status?bizNo=1068689215
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","status":"NEED_PW_INPUT","partnerName":"주식회사 중앙유통","message":"비밀번호를 입력하세요"},"timestamp":"2026-08-02T12:40:45.908818105Z"}
HTTP_STATUS=200
REQUEST=http://localhost:8080/api/v1/auth/partner-expiration?bizNo=1068689215
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","expiresAt":"2026-08-29T01:59:02.245854","expiredAlready":false,"remainingDays":26},"timestamp":"2026-08-02T12:40:46.177313062Z"}
HTTP_STATUS=200

REQUEST=http://localhost:8080/api/v1/auth/partner-status?bizNo=2118712345
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"2118712345","status":"NEED_PW_INPUT","partnerName":null,"message":"비밀번호를 입력하세요"},"timestamp":"2026-08-02T12:40:46.460442893Z"}
HTTP_STATUS=200
REQUEST=http://localhost:8080/api/v1/auth/partner-expiration?bizNo=2118712345
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"2118712345","expiresAt":"2026-09-01T00:22:41.802872","expiredAlready":false,"remainingDays":29},"timestamp":"2026-08-02T12:40:46.723696314Z"}
HTTP_STATUS=200
```

이 만료 응답은 stale 배포본의 로그인 기준과 HEAD의 현재 두 실거래처 결과가 우연히 동일한 값이다. HEAD의 주문·출고 기반 동작을 라이브로 증명하는 근거로 사용하지 않았다.

## 7. 재수렴 조건

1. 실제 차단 기준에서 일반 로그인 성공을 장기미발주 활동으로 볼지 정책을 레거시·Issue 목적과 일치시켜 확정해야 한다. 현재처럼 로그인만으로 무기한 연장되는 계약은 수용할 수 없다.
2. 관리자 복구 유예는 일반 로그인과 구분된 명시적 신호/기간으로 보존해야 한다. 레거시에는 별도 `tempAuthTime` 계약이 있다.
3. 주문 또는 출고 한 서비스 조회 실패를 “활동 없음”으로 확정해 차단/초기화하지 않아야 한다. 장애 상태와 실제 무활동을 구분하고 오차단 없는 계약을 실행 검증해야 한다.
4. 같은 실 DB에서 미리보기·실제 차단 양방향 차집합과 잘못 차단 수를 다시 측정해야 한다.

## 8. 이 라운드가 보지 않은 것

- Docker 이미지를 재빌드·재시작하지 않았으므로 HEAD를 공유 게이트웨이에서 직접 실행하지 않았다.
- DB write/DDL 금지 때문에 실제 파트너 로그인 POST, 관리자 상태 PATCH, 비밀번호 초기화, `LONG_UNUSED` 복구 후 재로그인을 실행하지 않았다.
- 현재 실 DB에 `LONG_UNUSED` 행과 최근 주문만 있는 인증 거래처가 없어 R3-02와 주문 장애 오차단을 라이브 상태전이로 재현하지 않았다.
- 합성 데이터, 임의 fixture, 임시 DB 행을 만들지 않았다.
- 제공된 71 tests GREEN은 이번 라운드에서 재실행하거나 성공 근거로 인용하지 않았다.
- UI 시각 회귀, 접근성, 전체 성능/N+1, SMS, 세션·JWT 만료, 동시성, 주문/출고 외 기능은 조사하지 않았다.
- 접근 가능한 공유 로컬 스택 DB 외 별도 외부 production DB가 존재하는지는 조사하지 않았다. 본 수치는 지정 작업환경의 `samhan-postgres` 실데이터 스냅샷에 한정한다.

## 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1015-r5-postfix-reconvergence.md`
