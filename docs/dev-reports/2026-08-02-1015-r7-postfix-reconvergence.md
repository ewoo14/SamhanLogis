# PR #1060 / Issue #1015 — R7 postfix 재수렴 리뷰

작성일: 2026-08-03 (KST)  
역할: 머지 전 재수렴 리뷰어  
대상 브랜치/HEAD: `feat/1015-order-app-access` / `8d3fe4140`  
데이터 등급: **`[DEV-SEED]` 로컬 실 DB** (`samhan-postgres`의 실제 저장 행, 합성 데이터 아님 / production 실데이터 아님)

## 판정 요약

**머지 차단(BLOCK).** R6가 조회 실패를 활동 없음과 분리해 오차단을 막은 방향은 맞지만, 새로 생긴 보류는 다음 두 이유로 수렴하지 않았다.

1. **R7-01 — 보류가 무기한·무표식 fail-open이다.** 주문 또는 출고 조회 하나라도 실패하면 신규 장기미발주 판정을 하지 않는다. 이 보류에는 영속 상태, 만료 상한, last-known-good, 재평가 작업, 사용자 안내, 관리자 경고, 로그·metric이 없다. 장애가 계속되면 신규 차단 보류도 계속된다.
2. **R7-02 — 미리보기와 실제 차단의 공통 판정기가 다시 갈라져 있다.** 실제 차단은 `max(업무활동, createdAt, accessRestoredAt)`을 쓰지만 미리보기는 업무활동이 하나라도 있으면 `createdAt`과 `max`하지 않는다. 인증행 생성 전에 오래된 업무활동이 있는 거래처는 미리보기만 조기 후보가 된다.

추가로 만료 API의 `expiredAlready`는 `expiresAt < now`, 실제 차단은 `expiresAt <= now`여서 정확한 경계시각에 boolean이 다르다(R7-03). 현재 `[DEV-SEED]` 스냅샷 수치는 모두 0이지만 코드 불변식이 보장된 것은 아니다.

## 1. 최우선 각도 — 보류 상태의 사용자 노출과 지속 시간

### 1.1 보류의 실체

`PartnerActivityClient`는 주문·출고 호출을 각각 수행하고 `RestClientException`을 잡아 성공 여부를 `false`로 반환한다. `PartnerActivity.isLookupComplete()`는 두 호출이 모두 성공해야 true다. `PartnerAccessPolicy`는 incomplete이면 다음처럼 처리한다.

```text
미리보기 장기미발주 판정     false
실제 인증 장기미발주 판정   false (expirationAt=null)
만료 API 만료시각           null
```

보류는 DB에 저장되는 상태가 아니다. 요청마다 두 외부 원천을 다시 조회해 계산하는 순간적 결과다. 기존에 이미 `LONG_UNUSED`로 저장된 행은 `evaluateEffectiveStatus()`의 조기 반환 때문에 계속 차단되지만, 아직 `NEED_PW_INPUT`/`OK`인 행에는 **새로운 `LONG_UNUSED` 전이가 발생하지 않는다.** 현재 `[DEV-SEED]`에는 기존 `LONG_UNUSED`가 0건이므로 장기 장애 동안 자동 장기미발주 차단 대상은 계속 0건이다.

### 1.2 거래처 사용자에게 보이는 것

- 상태조회: 기존 `NEED_PW_INPUT` 또는 `OK`와 정상 문구가 그대로 보인다. 보류/조회 장애 표시는 없다.
- 로그인: 올바른 자격증명이고 다른 차단 상태가 아니면 정상 인증 흐름을 계속 탄다. 조회 실패 자체는 로그인 오류로 보이지 않는다.
- 만료 API: `expiresAt=null`, `expiredAlready=false`, `remainingDays=30`을 HTTP 200으로 반환한다. `remainingDays=30`은 실제 만료일을 모르는 상태인데도 정상 30일처럼 보이는 값이다.
- 주문서 앱: `expiresAt`이 truthy일 때만 사용기한을 표시한다. 최초 조회가 보류면 사용기한이 표시되지 않는다. 이미 타이머가 표시된 뒤 후속 polling에서 `expiresAt=null`이 오면 기존 표시를 지우는 분기가 없어 오래된 만료일이 남을 수 있다.
- `LONG_UNUSED` 안내문은 여전히 “마지막 로그인일…” 기준이라고 적혀 있어 R6 확정 기준(주문 성공·출고·생성시각)과도 다르다. 이번 보류 결함과 별도의 사용자 문구 불일치다.

### 1.3 관리자에게 보이는 것

- incomplete인 신규 후보는 미리보기에서 탈락한다.
- API는 보류 메타데이터 없이 정상 목록을 반환하므로, 모든 대상이 보류된 경우 Desktop은 `현재 대상 0건`으로 표시한다. 진짜 대상 0건과 구분할 수 없다.
- `PartnerActivityClient`의 catch에는 로그가 없고 별도 metric/health 상태도 추가되지 않았다. 운영자가 “몇 거래처가 얼마나 오래 보류 중인지” 알 표면이 없다.

### 1.4 얼마나 오래 지속되는가

애플리케이션 정책상 상한은 **없다**. 두 원천이 한 요청에서 모두 성공할 때까지 요청마다 보류된다. 한 서비스가 수일·수주 또는 영구 장애면 신규 차단도 같은 기간 무기한 보류된다. 명시적 connect/read timeout도 이 client 구성에 없으므로 개별 요청 대기시간은 애플리케이션 설정으로 확정돼 있지 않다.

따라서 R6의 “오차단 방지용 fail-open” 자체는 합리적이나, **무기한·무표식 상태까지 의도했다고 볼 근거는 없다.** 최소한 보류 사실/원천/최초·최근 실패시각/영향 건수의 사용자 또는 관리자 표면과 운영 경보, 허용할 최대 지속시간 또는 last-known-good freshness 정책이 먼저 확정돼야 한다.

## 2. 각도 2 — 차단되면 안 되는 거래처 실 DB 계수

### 2.1 읽기 전용 원문

세 DB에서 `BEGIN READ ONLY`로 조회했다.

```text
partner_auth_db  | 2026-08-03 00:23:22.930569+09 | read_only=on
partner_order_db | 2026-08-03 00:23:23.082237+09 | read_only=on
slip_db          | 2026-08-03 00:23:23.246739+09 | read_only=on
```

활성 인증행 원문:

```text
partner_code status        created_at                  last_login_at
1068689215  NEED_PW_INPUT 2026-07-30 01:03:17.741187 2026-07-30 01:59:02.245854
2118712345  NEED_PW_INPUT 2026-07-09 07:25:53.085447 2026-08-02 00:22:41.802872

status=NEED_PW_INPUT 2건 / LONG_UNUSED 0건
```

업무활동 원문:

```text
partner_order_db:
1068689215 rows=1, confirmed_rows=0, last_order_at=NULL
2118712345 group 없음

slip_db active OUTBOUND:
두 partner_code 모두 group 없음
```

V3는 공유 로컬 DB에 적용하지 않았으므로 기존 행의 `access_restored_at` 실값은 존재하지 않는다. 정적 V3 계약대로 기존 행은 적용 후 `NULL`인 것으로만 계산했다.

### 2.2 HEAD 판정식 적용 결과

기준시각 `2026-08-03 00:23:22.930569+09`:

| `[DEV-SEED]` 거래처코드 | 기준시각 | 만료시각 | 미리보기 | 실제 차단 |
|---|---|---|---:|---:|
| `1068689215` | `created_at` | `2026-08-29 01:03:17.741187` | false | false |
| `2118712345` | `created_at` | `2026-08-08 07:25:53.085447` | false | false |

```text
PREVIEW_COUNT=0
ACTUAL_BLOCK_COUNT=0
PREVIEW_MINUS_ACTUAL_COUNT=0
ACTUAL_MINUS_PREVIEW_COUNT=0
SYMMETRIC_DIFFERENCE_COUNT=0
WRONGLY_BLOCKED_COUNT=0
```

**잘못 차단 0건**이다. 단, 이는 production 수치가 아니라 `[DEV-SEED]` 로컬 실 DB 2행의 현재 스냅샷이며 두 행이 아직 `createdAt+30일` 전이기 때문이다.

## 3. 각도 3 — 미리보기와 실제 차단 대칭성

### 실측

현재 `[DEV-SEED]` 대칭 차집합은 **0건**이다.

### 정적 불변식

그러나 대칭성이 코드로 유지되지 않는다.

```java
// preview: 활동이 있으면 createdAt과 비교하지 않음
LocalDateTime base = activity.lastActivityAt();
...
if (base == null) base = auth.getCreatedAt();

// actual/expiration: createdAt이 더 최근이면 createdAt 사용
LocalDateTime base = activity.lastActivityAt();
...
if (base == null || auth.getCreatedAt().isAfter(base)) base = auth.getCreatedAt();
```

레거시 원문은 `Math.max(createdTime, logTime, shipTime)`이다. 따라서 실제 차단 쪽이 레거시에 맞고 미리보기 쪽이 어긋난다. 인증행 생성 전에 존재한 오래된 주문/출고 활동이 30일을 넘었지만 인증행 생성은 최근인 거래처는 미리보기에는 포함되고 실제 차단에서는 제외된다. 현 DB 2행에는 확정 활동이 없어 이 분기가 발현되지 않았을 뿐이다.

## 4. 각도 4 — `access_restored_at` 관리자 복구 유지

### 확인한 연결

```text
PATCH 승인상태 APPROVED
→ PartnerApprovalService.updateStatus
→ LONG_UNUSED이면 PartnerAuth.restoreFromLongUnused()
→ status=NEED_PW_INPUT, accessRestoredAt=LocalDateTime.now()
→ managed entity dirty checking
→ 다음 상태조회/로그인/만료 계산에서
   max(activity, accessRestoredAt, createdAt)+30일
```

정적 연결은 유지된다. `lastLoginAt`은 더 이상 복구 기준에 쓰이지 않아 정상 로그인 반복이 유예를 연장하지 않는다.

### 실제 유지 검증 여부

**라이브 영속 검증은 하지 못했다.** 공유 DB에는 V3가 미적용이고 `LONG_UNUSED` 행도 0건이다. DB write/DDL 금지 때문에 `PATCH → commit → 새 트랜잭션 재조회 → 상태조회/로그인`을 실행하지 않았다.

fresh 테스트는 다음과 같다.

```text
./gradlew.bat :services:partner-auth-service:test --no-daemon --rerun-tasks
BUILD SUCCESSFUL
72 tests / 0 failures / 0 errors / 0 skipped
```

`adminRestoreRemainsEffectiveOnNextStatusCheck` 등은 GREEN이지만 mock repository가 같은 엔티티 인스턴스를 재사용한다. 이는 `access_restored_at`의 실제 INSERT/UPDATE와 새 persistence context 재조회까지 증명하지 않는다. 따라서 “정적 연결 + 회귀 GREEN”, “라이브 실제 유지 미검증”으로 판정한다.

## 5. 각도 5 — V3 마이그레이션 정적 검토

원문:

```sql
-- 관리자 장기미발주 복구를 일반 로그인 시각과 분리한다.
ALTER TABLE partner_auth ADD COLUMN access_restored_at TIMESTAMP;
```

정적 판정: **기존 행 파괴 없음.** 신규 컬럼은 nullable이고 DEFAULT, NOT NULL, backfill, type cast, 기존 컬럼 변경, index 재작성, 데이터 갱신이 없다. 기존 행은 그대로 유지되고 새 컬럼만 `NULL`이 된다. JPA의 `@Column(name="access_restored_at") LocalDateTime`과 PostgreSQL `TIMESTAMP`도 일치한다. V1→V2→V3 파일 순서와 중복 컬럼도 저장소 기준 발견되지 않았다.

주의: 실제 공유 DB에는 V3를 적용하지 않았다. 따라서 실행시간·lock 시간·운영 DB별 Flyway history 충돌은 검증하지 않았다.

## 6. 각도 6 — 만료 API와 실제 차단 값

`getExpiration()`과 실제 차단은 모두 `PartnerAccessPolicy.authenticationExpirationAt()`을 호출하므로 **만료시각 baseline은 같다.** 조회 실패 때도 실제 차단은 false이고 API는 `expiredAlready=false`라 큰 방향은 같다.

다만 정확한 경계 비교가 다르다.

```text
실제 차단: !expiresAt.isAfter(now)  → expiresAt <= now
만료 API:  expiresAt.isBefore(now)  → expiresAt < now
```

`now == expiresAt`인 정확한 순간에는 실제 차단=true, API `expiredAlready=false`다. 또한 보류 시 API의 `remainingDays=30`은 “30일 남음”과 “판정 불가”를 구분하지 못한다. 따라서 같은 helper 사용은 확인했지만 응답 계약까지 완전히 같은 값이라고 판정하지 않는다.

## 7. 재현 원문

### 7.1 레거시 기준

`tools/legacy-gas/거래처 발송 주문서/Code.js:2938-2961`:

```javascript
const getLatestTime = (dbId, isLog) => {
  const filter = isLog ? {
    and: [
      { property: '거래처코드', number: { equals: Number(cleanBiz) } },
      { property: '로그', rich_text: { contains: '주문 성공' } }
    ]
  } : {
    property: '거래처코드', number: { equals: Number(cleanBiz) }
  };
```

R6 보고서에 이어지는 원문 기준은 `Math.max(createdTime, logTime, shipTime) + 30일`이다. 로그인은 면제 사유가 아니다.

### 7.2 배포본 나이 선확인

```text
samhan-api-gateway           2026-07-31T15:15:50.070347996Z
samhan-partner-auth-service  2026-07-29T10:47:25.006412113Z
samhan-partner-order-service 2026-07-31T15:51:50.533560637Z
samhan-slip-service          2026-08-02T04:30:03.970155657Z
```

partner-auth 배포본은 R6 HEAD보다 오래됐다. 따라서 아래 500과 구버전 만료값은 HEAD 결함/성공 증거로 세지 않았다.

### 7.3 게이트웨이 원문

지정 계정으로 `POST /auth/login`, 응답의 `data.token`을 사용했다. 토큰 문자열은 기록하지 않았다.

```text
LOGIN_HTTP=200 TOKEN_PRESENT=True

GET /api/v1/partner-approvals?status=APPROVED&page=0&size=100
HTTP 200, totalElements=2
content partnerCode=[1068689215, 2118712345]

GET /api/v1/partner-approvals/access-preview?unusedDays=30
HTTP 500
{"success":false,"code":"INTERNAL_ERROR","data":null,...}

GET /api/v1/auth/partner-status?bizNo=1068689215
HTTP 200, status=NEED_PW_INPUT
GET /api/v1/auth/partner-expiration?bizNo=1068689215
HTTP 200, expiresAt=2026-08-29T01:59:02.245854, expiredAlready=false, remainingDays=26

GET /api/v1/auth/partner-status?bizNo=2118712345
HTTP 200, status=NEED_PW_INPUT
GET /api/v1/auth/partner-expiration?bizNo=2118712345
HTTP 200, expiresAt=2026-09-01T00:22:41.802872, expiredAlready=false, remainingDays=28
```

위 만료시각은 stale 배포본의 로그인 기준 값이다. R6 HEAD의 주문·출고·생성시각 기준 라이브 결과가 아니다. `access-preview` 500도 2026-07-29 배포본에서 발생했으므로 결함 계수에서 제외했다.

## 8. 최종 재수렴 조건

1. 보류를 사용자/관리자가 정상 상태와 구분할 수 있어야 하고, 영향 건수·실패 원천·지속시간을 운영자가 관찰할 수 있어야 한다.
2. 무기한 fail-open을 명시적으로 수용할지, last-known-good freshness/유예 상한/재평가 정책을 둘지 제품·운영 계약을 확정해야 한다.
3. 미리보기와 실제 차단이 모두 레거시와 같은 `max(createdAt, 주문, 출고, accessRestoredAt)` 계산을 공유해야 한다.
4. 만료 API의 경계 boolean과 보류 응답이 실제 차단 의미와 같아야 한다.
5. V3 적용 환경에서 관리자 복구를 저장하고 새 트랜잭션으로 다시 읽은 뒤 유지되는 통합 증거가 필요하다.

## 9. 이 라운드가 보지 않은 것

- Docker 이미지 재빌드·재시작을 하지 않아 R6 HEAD를 게이트웨이에서 라이브 실행하지 않았다.
- 공유 DB write/DDL 금지로 V3 실제 적용, 관리자 복구 PATCH, 거래처 로그인 POST, `LONG_UNUSED` 상태 전이를 실행하지 않았다.
- 합성 데이터나 임시 fixture를 만들지 않았다. 인증행 생성 전 업무활동이 있는 비대칭 분기는 정적 코드 대조로만 확인했다.
- production DB 및 외부 운영 DB는 조회하지 않았다. 모든 수치는 지정 로컬 스택의 `[DEV-SEED]` 실 DB에 한정한다.
- 주문/출고 서비스를 실제로 중단시키거나 network fault를 주입하지 않았다. 보류 지속시간은 코드·설정·회귀 테스트를 대조했다.
- 전체 저장소 테스트, UI 시각 회귀, 접근성, 부하/N+1, SMS, 세션/JWT 만료, 동시성, 보안 침투, 주문/출고 외 기능은 조사하지 않았다.
- Flyway V3의 운영 lock 시간과 운영 `flyway_schema_history` 충돌은 실제 적용 금지 때문에 조사하지 않았다.

## 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1015-r7-postfix-reconvergence.md`
