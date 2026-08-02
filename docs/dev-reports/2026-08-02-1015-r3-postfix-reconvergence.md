# PR #1060 fix 후 재수렴 리뷰 — 새 판정 표면

- 대상: PR #1060 / Issue #1015 / `feat/1015-order-app-access`
- 기준 HEAD: `0f2436003`
- 측정일: 2026-08-02 KST
- 범위: `ffa8acad7..0f2436003` fix가 새로 건드린 판정·상태 전이·응답 집합
- 제약 준수: 코드·DB 행 수정 없음, Docker 재빌드·재기동 없음, 합성 데이터·목업 없음. DB 조회는 모두 `BEGIN READ ONLY` 안에서 수행했다.

## 판정

**BLOCK — fix가 만든 새 표면에서 차단 결함 3건과 가용성 결함 1건을 확인했다.**

1. **R3-01 (BLOCK): 활동 0건 fallback을 실제 인증 차단에도 그대로 사용해, 로그인은 정상적으로 계속해도 인증행 생성 30일 후 차단된다.** 현재 시각에 새로 차단되는 실거래처는 **0건**이다. 그러나 활동 0건 승인 거래처가 **2건**, 그중 **1건은 7일 이내(2026-08-08)** 경계를 넘는다. 이 거래처는 2026-08-02에도 로그인한 행이지만 주문·출고가 없으므로, 계속 로그인해도 신규 판정의 만료일은 연장되지 않는다.
2. **R3-02 (BLOCK): 활동 0건·30일 초과 거래처는 관리자 복구가 불가능하다.** 복구는 `lastLoginAt`만 현재시각으로 갱신하지만 공통 판정기는 이를 읽지 않고 오래된 `createdAt`을 다시 사용한다. 다음 상태조회는 다시 `LONG_UNUSED`, 다음 로그인은 저장 상태까지 `LONG_UNUSED`로 되돌린다. 현재 저장 `LONG_UNUSED` 행은 **0건**이므로 현재 실데이터 영향은 0건이다.
3. **R3-03 (BLOCK): 실제 차단 기준과 주문 앱 만료 API·화면 안내가 다시 분기됐다.** 실제 상태조회·로그인은 주문/출고 또는 `createdAt+30일`을 쓰지만 `GET /partner-expiration`은 계속 `lastLoginAt` 우선 값을 쓴다. 실 인증행 **2/2건**의 만료시각이 다르며, 한 행은 **23일 16시간 56분** 차이다.
4. **R3-04 (BLOCK): 상태조회와 로그인에 주문·출고 서비스 두 개가 동기 필수 의존성으로 새로 들어왔다.** 둘 중 한 호출이라도 4xx/5xx/timeout이면 `PartnerActivityClient`가 예외를 완화하지 않으므로 상태조회·로그인이 실패한다. 미리보기의 조회 실패가 실제 인증 가용성으로 새어 들어간 것이다. 공유 스택은 fix 이전 이미지여서 이 실패를 라이브로 유발하지 않았고, 코드 경로로 판정했다.

R-03의 기존 출고 데이터 결손은 그대로다. 활성 OUTBOUND **2,303건**, `partner_code` 결손 **2,003건**, 그 2,003건은 `business_number`도 모두 결손이다. 따라서 영향 거래처 수는 이번에도 **산정 불가**이며 0건으로 바꾸지 않는다.

## ① fix가 만든 새 표면

`ffa8acad7..0f2436003`의 기능 변경은 다음 네 경계다.

- `PartnerAccessPolicy`: 주문·출고 활동이 없으면 `partner_auth.created_at`을 기준으로 삼는 30일 판정 신설.
- `PartnerApprovalService.previewLongUnused`: 미리보기 후보가 위 판정기를 사용.
- `PartnerAuthService.evaluateEffectiveStatus`: 상태조회와 로그인도 활동 조회 및 위 장기미사용 판정을 사용.
- 실제 인증 경로가 매 요청마다 partner-order-service와 slip-service의 내부 활동 API를 동기 호출.

변경량 원문:

```text
29  0  services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAccessPolicy.java
1   4  services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java
6   2  services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java
```

공통 판정기 원문(`PartnerAccessPolicy.java:12-17`):

```java
static boolean isLongUnused(PartnerAuth auth, PartnerActivity activity, LocalDateTime now) {
    LocalDateTime base = activity == null ? null : activity.lastActivityAt();
    if (base == null) {
        base = auth.getCreatedAt();
    }
    return base != null && !base.plusDays(PartnerAuth.LONG_UNUSED_DAYS).isAfter(now);
}
```

실제 인증 적용 원문(`PartnerAuthService.java:110-116`):

```java
if (auth.getStatus() == PartnerStatus.LONG_UNUSED) {
    return PartnerStatus.LONG_UNUSED;
}
PartnerActivity activity = partnerActivityReader.read(auth.getPartnerCode());
if (PartnerAccessPolicy.isLongUnused(auth, activity, LocalDateTime.now())) {
    return PartnerStatus.LONG_UNUSED;
}
```

## 기존 행 분포를 먼저 센 원문

```text
BEGIN
    status     | existing_rows
---------------+---------------
 NEED_PW_INPUT |             2
(1 row)

 stored_long_unused | effective_long_unused_now | effective_ok_now | unprotected_other_statuses
--------------------+---------------------------+------------------+----------------------------
                  0 |                         0 |                2 |                          0
(1 row)
COMMIT
```

인증행 상세:

```text
   biz_no   | partner_code |    status     |         created_at         |      fallback_cutoff       |       last_login_at        |    password_changed_at
------------+--------------+---------------+----------------------------+----------------------------+----------------------------+----------------------------
 2118712345 | 2118712345   | NEED_PW_INPUT | 2026-07-09 07:25:53.085447 | 2026-08-08 07:25:53.085447 | 2026-08-02 00:22:41.802872 | 2026-07-09 07:26:06.315707
 1068689215 | 1068689215   | NEED_PW_INPUT | 2026-07-30 01:03:17.741187 | 2026-08-29 01:03:17.741187 | 2026-07-30 01:59:02.245854 | 2026-07-30 01:05:32.177929
(2 rows)
```

주문·출고 활동 원문:

```text
 partner_code | total | confirmed | last_confirmed_at
--------------+-------+-----------+-------------------
 1068689215   |     1 |         0 |
(1 row)

 partner_code | active_outbound | last_outbound_at
--------------+-----------------+------------------
(0 rows)
```

두 인증 거래처 모두 확정 주문과 활성 OUTBOUND가 0건이므로 신규 정책의 기준시각은 `created_at`이다.

기존 출고 분포 원문:

```text
 active_outbound | blank_partner_code | blank_both
-----------------+--------------------+------------
            2303 |               2003 |       2003
(1 row)
```

## ② 항목별 실측 숫자

### 1. 차단되면 안 되는 거래처

현재 시각의 집합 차이:

```text
 new_blocked_vs_old_sliding | no_activity_recent_joiners | will_cross_within_7d
----------------------------+----------------------------+----------------------
                          0 |                          2 |                    1
(1 row)
```

- fallback 때문에 **현재 새로 차단되는 거래처: 0건**.
- 활동 0건이지만 생성 30일 미만인 최근 가입 승인 거래처: **2건**.
- 7일 이내 신규 경계를 넘는 거래처: **1건**.
- 그 1건(`2118712345`)은 측정 당일인 2026-08-02에도 로그인했다. 종전 슬라이딩 만료는 2026-09-01까지 연장됐지만 신규 실제 차단은 2026-08-08로 고정된다.

따라서 “현재 0건”은 안전 판정이 아니다. 신규 판정은 로그인 같은 정상 인증 활동을 전혀 반영하지 않으며, 주문·출고가 없는 한 생성일 기준으로 반드시 차단한다.

### 2. 미리보기 조건의 실제 차단 누출

- 현재 계산상 미리보기 후보: **0건**.
- 현재 계산상 실제 동적 `LONG_UNUSED`: **0건**.
- 현재 집합 차집합: **0건**.
- 그러나 미리보기의 `createdAt` fallback을 실제 로그인 차단까지 적용한 행: 활동 0건 승인 거래처 **2건 전부**.
- 내부 활동 조회의 인증 경로 필수 의존성: **2서비스/요청**(partner-order, slip).

미리보기는 사람에게 후보를 넓게 제시할 수 있지만, 실제 인증은 저장된 승인/복구 상태와 로그인 활동을 무시하지 않는 보수적 규칙이 필요하다. 현재 구현은 “같은 장기미사용 계산”을 공유하는 수준을 넘어 미리보기 후보 조건을 실제 인증 차단 조건으로 사용한다.

또한 `evaluateEffectiveStatus`의 선보호 상태는 `LOCKED`, `ACCESS_DENIED`, `PENDING`, `NEED_PW_SET`뿐이다. `PW_EXPIRED`, `NOT_FOUND_AUTH`, `NOT_FOUND_SYSTEM`도 활동/생성일이 오래되면 응답이 `LONG_UNUSED`로 덮일 수 있다. 현재 해당 기존 행은 **0건**이다.

### 3. 상태 전이

현재 기존 행 분포:

- 저장 `NEED_PW_INPUT`: **2건**.
- 저장 `LONG_UNUSED`: **0건**.
- 저장 `OK`, `NEED_PW_SET`, `PW_EXPIRED`: 각 **0건**.
- 지금 즉시 동적 상태가 뒤집히는 행: **0건**.

그러나 복구 경로는 구조적으로 닫혀 있다.

`PartnerAuth.restoreFromLongUnused()` 원문:

```java
this.status = PartnerStatus.NEED_PW_INPUT;
// 관리자 복구를 새로운 접근 기준시각으로 삼아 다음 상태 조회에서 즉시 재선별되지 않게 한다.
this.lastLoginAt = LocalDateTime.now();
```

공통 판정기는 `lastLoginAt`을 읽지 않는다. 활동 0건이고 `createdAt+30일`을 지난 행의 전이는 다음과 같다.

```text
LONG_UNUSED --관리자 APPROVED--> NEED_PW_INPUT
NEED_PW_INPUT --다음 checkStatus--> 응답 LONG_UNUSED
NEED_PW_INPUT --다음 tryLogin--> 저장 LONG_UNUSED + 로그인 거부
```

비밀번호 초기화도 근본 복구가 아니다. `NEED_PW_SET` 동안은 선보호되지만 새 비밀번호 설정 후 `NEED_PW_INPUT`으로 돌아오면 같은 오래된 `createdAt` 판정을 다시 받는다.

### 4. 작성자/대상자 집합

fix diff에서 `ownerId`, `owner_id`, `createdBy`, `author`, `creator`, `participant`, `recipient`, 작성자·대상자·소유자 관련 추가/변경은 **0건**이다. 이 기능의 대상은 사용자 작성 문서가 아니라 `PartnerAuth.partnerCode` 거래처 행이므로 “작성자 자동 포함” 규칙을 적용할 작성자 필드 자체가 없다. `OR ownerId` 우회도 **0건**이다.

응답 대상과 실제 접근 판정은 현재 실데이터에서 다음과 같다.

- 승인 목록 응답 `APPROVED`: **2건**.
- 신규 정책상 미리보기 대상: **0건**.
- 신규 정책상 실제 차단 대상: **0건**.
- 현재 대상 목록/실제 차단 차집합: **0건**.

다만 실제 접근권한과 사용자 안내는 일치하지 않는다. 만료 API의 실 행별 계산 차이는 다음과 같다.

```text
   biz_no   |   new_policy_expires_at    | expiration_endpoint_expires_at |        mismatch
------------+----------------------------+--------------------------------+-------------------------
 2118712345 | 2026-08-08 07:25:53.085447 | 2026-09-01 00:22:41.802872     | 23 days 16:56:48.717425
 1068689215 | 2026-08-29 01:03:17.741187 | 2026-08-29 01:59:02.245854     | 00:55:44.504667
(2 rows)
```

실 인증행 **2/2건**이 불일치한다. `PartnerAuthService.getExpiration()`은 여전히 `auth.expirationAt()`을 호출하고, 주문 앱은 이 endpoint를 `getAccessExpiration`으로 호출한다. 주문 앱의 `LONG_UNUSED` 안내도 여전히 “마지막 로그인일(로그인 기록이 없으면 비밀번호 변경일)로부터 30일”이라고 표시한다. 응답/안내의 대상 권한과 실제 차단 기준이 다르다.

## ③ 게이트웨이 재현 원문

요청된 계정 로그인:

```text
HTTP_STATUS=200
TOKEN_PRESENT=True
```

승인 목록:

```text
"content":[
  {"partnerCode":"1068689215","status":"APPROVED","approvalRequestedAt":"2026-07-30T01:03:17.741187"},
  {"partnerCode":"2118712345","status":"APPROVED","approvalRequestedAt":"2026-07-09T07:25:53.085447"}
]
"totalElements":2
HTTP_STATUS=200
```

현재 실행 중 이미지는 fix 이전이므로 미리보기 신규 판정은 라이브 검증할 수 없었다.

```text
REQUEST=http://localhost:8080/api/v1/partner-approvals/access-preview?unusedDays=30
BODY={"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,...}
HTTP_STATUS=500
```

공개 상태조회와 만료 API 원문:

```text
REQUEST_STATUS bizNo=1068689215
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","status":"NEED_PW_INPUT","partnerName":"주식회사 중앙유통","message":"비밀번호를 입력하세요"},...}
HTTP_STATUS=200
REQUEST_EXPIRATION bizNo=1068689215
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","expiresAt":"2026-08-29T01:59:02.245854","expiredAlready":false,"remainingDays":26},...}
HTTP_STATUS=200

REQUEST_STATUS bizNo=2118712345
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"2118712345","status":"NEED_PW_INPUT","partnerName":null,"message":"비밀번호를 입력하세요"},...}
HTTP_STATUS=200
REQUEST_EXPIRATION bizNo=2118712345
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"2118712345","expiresAt":"2026-09-01T00:22:41.802872","expiredAlready":false,"remainingDays":29},...}
HTTP_STATUS=200
```

이 라이브 상태조회는 stale 이미지의 현행 상태를 기록한 것이며 HEAD 판정기의 성공 증거로 사용하지 않았다. 만료 API가 반환하는 로그인 기준 시각은 HEAD에서도 변경되지 않았으므로 DB 계산 대조에 사용했다.

## ④ 최종 판정과 재수렴 조건

**머지 차단.** 67개 테스트 통과와 현재 차집합 0건만으로 수렴하지 않았다.

재수렴에는 최소한 다음 계약이 하나로 확정되어야 한다.

- 활동 0건 fallback을 “미리보기 후보 산출”과 “실제 인증 차단” 중 어디까지 적용할지 분리한다.
- 관리자 복구 후 즉시 재차단되지 않도록 복구 기준시각을 공통 판정기가 실제로 소비하게 한다.
- `partner-status`, 실제 로그인, `partner-expiration`, 주문 앱 문구가 같은 만료 기준을 말하게 한다.
- 주문·출고 조회 실패가 실제 인증을 전면 중단시킬지, 보수적 fallback/저장 상태를 사용할지 확정하고 장애 계약을 검증한다.
- R-03의 식별자 결손 2,003건은 별도 데이터 복구 없이는 계속 산정 불가다.

## ⑤ 이 라운드가 보지 않은 것

- Docker 이미지 재빌드 금지 때문에 HEAD의 공통 판정기를 게이트웨이에서 직접 실행하지 않았다.
- DB 쓰기 금지 때문에 실제 파트너 로그인 POST, 상태 PATCH, 비밀번호 초기화 POST, 복구 후 재로그인을 실행하지 않았다.
- 합성 행·목업·Mockito fixture를 증거로 사용하지 않았다. 제공된 “67 tests 통과”도 재실행하지 않았다.
- R-03 결손 2,003건의 원거래처 귀속은 식별자가 없어 조사하지 못했다.
- 파트너 주문/출고 이외 기능, UI 시각 회귀, 접근성, 성능·N+1, SMS, 세션 만료, 동시성은 조사하지 않았다.
- 작성자 자동포함은 fix 표면에 작성자/대상자 모델이 없어 시스템 전체 문서·일정 기능까지 확장 조사하지 않았다.

## 새로 만든 파일

- `docs/dev-reports/2026-08-02-1015-r3-postfix-reconvergence.md`
