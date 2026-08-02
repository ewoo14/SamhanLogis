# PR #1060 적대검증 — 접근 허용/차단 도달성

- 대상: PR #1060 / Issue #1015 / `feat/1015-order-app-access`
- 검증일: 2026-08-02 KST
- 각도: 접근 허용·차단 집합, 과다 차단, 응답 대상과 실제 권한의 일치
- 제약 준수: 코드·DB 수정 없음, Docker 재빌드·재기동 없음, 합성 데이터·목업 없음

## 판정

**BLOCK — 결함 3건.**

1. **R-01 (BLOCK): 미리보기 대상 집합과 실제 로그인 차단 집합이 서로 다른 기준으로 계산된다.** PR은 미리보기만 주문·출고 활동 기준으로 바꿨고, 실제 상태조회·로그인은 계속 마지막 로그인/비밀번호 변경 시각으로 차단한다.
2. **R-02 (BLOCK): 주문·출고 활동이 한 건도 없는 거래처가 후보에서 영구 제외된다.** 레거시는 활동 집합에 없고 인증행 생성 후 30일을 넘긴 승인 거래처를 대상으로 삼지만, PR은 최근 활동 시각이 `null`이면 무조건 제외하며 인증행 생성시각도 검사하지 않는다.
3. **R-03 (BLOCK): 기존 OUTBOUND 2,303행 중 2,003행(86.97%)의 `partner_code`가 비어 있어 PR의 거래처코드 조회가 이 활동을 볼 수 없다.** 현재 인증 2행과 연결되는 행은 0건이지만, 빈 행에는 `business_number`도 없어 영향 거래처 수를 복원할 수 없다. 영향 거래처 수는 **0이 아니라 산정 불가**다.

현재 실 데이터의 즉시 오차는 0건이다. 다만 이는 활성 파트너 인증행 2건이 모두 생성 후 30일 미만이고 실제 상태조회도 허용 상태이기 때문이다. 데이터가 아직 결함 경계에 도달하지 않았다는 뜻이지 구현 집합이 일치한다는 뜻이 아니다.

## ① 바뀐 표면

첫 확인 원문:

```text
> git log --oneline -10
579e3a19f [FIX] #1015 partner-auth-service 다운스트림 기본 포트 불일치
0a7ed66b8 [FEAT] #1015 장기미발주 판정을 주문·출고 시각 기준으로 교정
d95793c61 docs(recon): #1015 주문서 접근권한 정찰 — 결함 2건 해소 · 선별 기준이 다름
f152af623 docs(recon): #1015 정찰 착수 — 조기 PR 개설
5e8dade1f [FEAT] #1009 레거시 GAS 종합견적서 완전계승 — 기획 (조기 PR) (#1010)
9cafd6689 [FIX] #1042 재고 현황 조회가 항상 400 — 품목 필터 부재 (#1043)
27f37ce55 memory: 머지 안 된 마이그레이션이 다른 트랙 전부를 막는다
c8774e6b2 [FEAT] #1014 문서 자동저장·이력 계열 완전계승 — 정찰 (조기 PR) (#1038)
fe3fac68b [FEAT] #1011 가입고→DPS 비교 완전계승 — 정찰 (조기 PR · 중복 입고 위험) (#1040)
930f14e52 [FEAT] #1015 주문서 앱 접근권한 설정 — 정찰 (조기 PR · 표시≠실제 결함 2건) (#1028)
```

```text
> git diff origin/main...HEAD --stat
 .../renderer/routes/SalesOrderApprovalsPage.tsx    | 17 ++-----
 docs/dev-reports/2026-08-02-1015-ci-fix.md         | 55 ++++++++++++++++++++++
 docs/dev-reports/2026-08-02-1015-impl.md           | 43 +++++++++++++++++
 docs/dev-reports/2026-08-02-1015-recon.md          | 19 ++++++++
 .../partnerauth/PartnerAuthServiceApplication.java |  4 +-
 .../partnerauth/client/PartnerActivityClient.java  | 53 +++++++++++++++++++++
 .../config/PartnerActivityClientProperties.java    | 21 +++++++++
 .../logis/partnerauth/service/PartnerActivity.java | 14 ++++++
 .../partnerauth/service/PartnerActivityReader.java |  9 ++++
 .../service/PartnerApprovalService.java            | 27 ++++++++---
 .../src/main/resources/application.yml             |  4 ++
 .../service/OrderAppAccessPreviewTest.java         | 35 ++++++++++++--
 .../service/PartnerApprovalServiceTest.java        |  3 +-
 .../repository/PartnerOrderRepository.java         |  5 ++
 .../web/PartnerActivityController.java             | 29 ++++++++++++
 .../logis/slip/repository/SlipRepository.java      |  6 +++
 .../logis/slip/web/PartnerActivityController.java  | 30 ++++++++++++
 17 files changed, 348 insertions(+), 26 deletions(-)
```

실제 기능 변경은 다음이다.

- 데스크톱 미리보기 문구·기준을 고정 30일 주문/출고 활동으로 변경.
- partner-auth가 거래처별 주문 확정시각과 OUTBOUND 전표일을 두 내부 API로 읽도록 변경.
- 주문·출고 중 더 최근 시각이 30일 이상 오래된 승인 상태 행만 미리보기로 반환.
- 승인 목록 RBAC, 실제 파트너 상태조회·로그인 차단 로직, 상태변경·비밀번호 초기화 로직은 변경하지 않음.

작성자 자동포함 규칙 적용 여부: 이 diff에는 작성자/소유자/대상자 집합을 생성하거나 응답하는 필드가 없다. `git diff ... | rg -i "owner|creator|createdBy|author|target|recipient|대상자|작성자|소유자"`의 유일한 결과는 삭제된 DOM `e.target.value` 1행이었다. 따라서 작성자를 `OR ownerId`로 우회하는 코드는 이 변경 표면에 없으며, 이 라운드는 시스템 전체의 작성자 자동포함을 재검증한 것이 아니다.

## 기존 행 분포 — 실행 원문

쓰기 전 기존 분포부터 읽었다. 모든 SQL은 `BEGIN READ ONLY`와 `COMMIT` 사이에서 실행했다.

### 파트너 인증

```text
status        | is_deleted | rows
--------------+------------+-----
NEED_PW_INPUT | f          | 2

active_total | eligible_status_total | eligible_created_over_30d
-------------+-----------------------+--------------------------
2            | 2                     | 0

biz_no    | partner_code | status        | created_at                 | last_login_at
----------+--------------+---------------+----------------------------+---------------------------
1068689215| 1068689215   | NEED_PW_INPUT | 2026-07-30 01:03:17.741187 | 2026-07-30 01:59:02.245854
2118712345| 2118712345   | NEED_PW_INPUT | 2026-07-09 07:25:53.085447 | 2026-08-02 00:22:41.802872
```

### 주문

```text
total | confirmed | confirmed_partner_codes | missing_partner_code
------+-----------+-------------------------+---------------------
2024  | 30        | 30                      | 0
```

- 인증행 `1068689215`: 주문 1행, `confirmed_at` 0행.
- 인증행 `2118712345`: 주문 0행.

### 출고

```text
total | active_outbound | outbound_partner_codes | missing_partner_code
------+-----------------+------------------------+---------------------
2455  | 2303            | 16                     | 2035
```

활성 OUTBOUND만 다시 좁힌 원문:

```text
active_outbound_blank_partner_code | matches_current_auth_by_business_number | distinct_business_numbers
-----------------------------------+-----------------------------------------+--------------------------
2003                               | 0                                       | 0
```

즉 활성 OUTBOUND 2,303행 중 2,003행(86.97%)은 PR의 `partner_code = :partnerCode` 조회로 귀속할 수 없다. 이 2,003행은 `business_number`도 비어 있어 현재 DB만으로 영향 거래처 수를 복원할 수 없다.

## ② 각도 1~4 실측 숫자

### 각도 1 — 보여야 할 사람에게 보이는가

사내 관리화면 권한 집합:

```text
active_accounts | master_bypass | materialized_view | materialized_update | effective_view | effective_update
----------------+---------------+-------------------+---------------------+----------------+-----------------
27              | 2             | 18                | 12                  | 20             | 14
```

- VIEW 허용 대상: **20명**(MASTER 2명 포함).
- UPDATE 허용 대상: **14명**(MASTER 2명 포함).
- DB 권한행과 컨트롤러 가드에서 확인된 누락: **0명**.
- 실 게이트웨이 `dev_master` 목록 조회: HTTP 200, 2행 반환.
- 비MASTER 18명의 실 토큰을 발급해 전수 호출하지는 않았다. 따라서 “20명 모두 라이브 200”으로 확대 해석하지 않는다.

파트너 주문서 앱 접근 집합:

- 활성 인증행: **2건**.
- 상태조회가 실제 허용 단계(`NEED_PW_INPUT`)를 반환한 행: **2건**.
- 현재 빠지는 행: **0건**.

실행 원문:

```text
REQUEST bizNo=1068689215
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"1068689215","status":"NEED_PW_INPUT","partnerName":"주식회사 중앙유통","message":"비밀번호를 입력하세요"},"timestamp":"2026-08-02T10:09:55.818056424Z"}
HTTP_STATUS=200
REQUEST bizNo=2118712345
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"2118712345","status":"NEED_PW_INPUT","partnerName":null,"message":"비밀번호를 입력하세요"},"timestamp":"2026-08-02T10:09:56.087309480Z"}
HTTP_STATUS=200
```

### 각도 2 — 보이면 안 되는 사람에게 보이는가

- 활성 사내 계정 27명 중 VIEW 비허용: **7명**.
- UPDATE 비허용: **13명**.
- 활성 외부 파트너 인증행: **2건**. `partnerSelfService=false`인 관리화면이므로 외부 파트너는 관리목록 비허용 대상이다.
- 무토큰·위조 MASTER 헤더·무효 Bearer의 우회 성공: **0/3경로**.

실행 원문:

```text
REQUEST=NO_TOKEN
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
HTTP_STATUS=401
REQUEST=FORGED_MASTER_HEADER
{"success":false,"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다"}
HTTP_STATUS=401
REQUEST=INVALID_BEARER
{"success":false,"code":"INVALID_TOKEN","message":"유효하지 않은 토큰입니다"}
HTTP_STATUS=401
```

발견한 무권한 접근 경로: **0건**. 단, 외부 파트너 토큰과 7개 VIEW 비허용 직원 토큰을 실제로 발급한 전수 호출은 하지 않았다.

### 각도 3 — 차단되면 안 되는 것이 차단되는가

현재 실 데이터:

- 실제 상태조회에서 차단된 파트너: **0/2건**.
- 레거시 30일 전환의 필요조건인 “승인 상태이면서 인증행 생성 후 30일 초과” 충족: **0/2건**.
- 따라서 현재 시점에 잘못 차단된 것으로 확정되는 파트너: **0건**.

그러나 다음 두 경로 때문에 판정은 통과가 아니다.

- R-01: 최근 주문/출고가 있어 미리보기에서 빠져도, 로그인/비밀번호 변경이 30일 전이면 실제 로그인은 `LONG_UNUSED`로 차단된다.
- R-03: 기존 활성 OUTBOUND 2,003행은 거래처코드가 없어 최근 출고임에도 활동 집합에 들어갈 수 없다. 이 행들로 인해 잘못 후보가 될 거래처 수는 데이터로 귀속할 수 없어 **산정 불가**다.

“현재 0건”은 현재 인증행 2건에 대한 시점 실측이고, R-01/R-03의 결함 수를 0으로 만드는 근거가 아니다.

### 각도 4 — 대상자 목록과 실제 권한이 일치하는가

현재 행에 한정하면:

- 승인 목록 응답 `APPROVED`: **2건**.
- 실제 상태조회 `NEED_PW_INPUT`: **2건**.
- 현재 목록/실제 상태 불일치: **0건**.
- 주문·출고 활동 30일 대상: **0건**.
- 실제 차단 상태: **0건**.

구현 계약은 불일치한다.

- 미리보기 집합: 승인계열 상태 ∩ `max(lastOrderAt,lastShipmentAt) != null` ∩ 최근 활동이 30일 이전.
- 실제 차단 집합: 마지막 로그인(없으면 비밀번호 변경)이 30일 이전.
- 레거시 집합: 승인 ∩ 최근 30일 주문·출고 활동 집합에 없음 ∩ 인증행 생성 후 30일 초과.

세 집합은 동일하지 않다. 현재 교집합 밖의 데이터가 아직 인증행 2건에 없을 뿐이다.

## ③ 재현 — 파일:줄과 근거

### R-01 — 미리보기와 실제 권한이 다른 집합

- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:74-88`: 미리보기는 주문·출고 중 최근 활동 시각으로 계산.
- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:104-113`: 실제 상태조회는 `auth.expirationAt()`으로 `LONG_UNUSED` 평가.
- 같은 파일 `:194-228`: 실제 로그인도 같은 평가 결과로 로그인 차단.
- `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:248-261`: `expirationAt()`은 마지막 로그인, 없으면 비밀번호 변경 시각을 사용.
- PR diff에는 `PartnerAuthService`나 `PartnerAuth.expirationAt()` 변경이 없다.

이 구조에서는 미리보기 응답이 실제 접근권한의 대상자 집합이 아니다. 알림·필터·통계가 미리보기 목록을 사용하면 실제 차단과 어긋난다.

### R-02 — 활동 없음 행 영구 누락 + 생성시각 가드 누락

- `PartnerApprovalService.java:81-85`: `lastActivityAt != null`을 요구하므로 주문·출고가 한 번도 없는 행은 제외.
- `tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:22-39`: 최근 활동 집합에 없고 `client.createdTime < thresholdDate`이면 전환.
- `OrderAppAccessPreviewTest.java:19-63`: 두 테스트 모두 활동 시각을 최소 하나 제공한다. 양쪽 모두 `null`인 행 및 인증행 생성 30일 경계 테스트가 없다.

따라서 PR은 레거시의 “활동 없음”을 “활동 시각이 존재하면서 오래됨”으로 바꿨고, 반대로 생성 직후 행도 오래된 외부 활동이 있으면 후보로 넣는다.

### R-03 — 기존 출고행의 활동 집합 탈락

- `services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:28-32`: `s.partnerCode = :partnerCode`만 조회.
- `services/slip-service/src/main/java/com/samhanair/logis/slip/web/PartnerActivityController.java:22-25`: 그 단일 조회값을 그대로 반환.
- 실 DB: 활성 OUTBOUND 2,303행 중 빈 `partner_code` 2,003행, 현재 인증 사업자번호와 `business_number` 매칭 0행, 비어 있지 않은 사업자번호 종류도 0개.

기존 행 backfill 또는 구 규약 식별자 fallback 없이 이 조회를 레거시 완전계승의 권위로 사용할 수 없다.

### 배포본 나이 판별 — 라이브 500은 PR 결함으로 계수하지 않음

```text
> docker inspect -f '{{.Name}} {{.Created}} {{.Config.Image}}' ...
/samhan-api-gateway 2026-07-31T15:15:50.070347996Z infrastructure-api-gateway
/samhan-partner-auth-service 2026-07-29T10:47:25.006412113Z infrastructure-partner-auth-service
/samhan-partner-order-service 2026-07-31T15:51:50.533560637Z infrastructure-partner-order-service
/samhan-slip-service 2026-08-02T04:30:03.970155657Z infrastructure-slip-service
```

PR head의 미리보기/내부 활동 경로보다 배포본이 오래됐다. `git show origin/main:.../PartnerApprovalService.java`에는 미리보기 코드가 있지만, 실행 중 partner-auth 로그는 다음을 반환했다.

```text
org.springframework.web.servlet.resource.NoResourceFoundException: No static resource api/v1/partner-approvals/access-preview.
```

게이트웨이 실행 원문:

```text
REQUEST unusedDays=30
{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-08-02T10:08:54.854253018Z"}
HTTP_STATUS=500
```

또한 신규 내부 컨트롤러는 아직 `origin/main`에도 없다.

```text
fatal: path 'services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/web/PartnerActivityController.java' exists on disk, but not in 'origin/main'
fatal: path 'services/slip-service/src/main/java/com/samhanair/logis/slip/web/PartnerActivityController.java' exists on disk, but not in 'origin/main'
```

따라서 위 500/경로 부재는 stale 배포 증거로만 기록하고 PR #1060 결함 건수에는 넣지 않았다.

## ④ 최종 판정

**머지 차단.** CI 42건 green은 다음을 검증하지 못했다.

- 주문·출고 기준 미리보기와 실제 로그인 차단 기준의 동일성.
- 주문·출고가 한 건도 없는 승인행의 레거시 30일 경계.
- 인증행 생성시각 30일 가드.
- `partner_code`가 비어 있는 기존 OUTBOUND 2,003행의 계승 경로.

필요 수렴 조건은 “미리보기만 주문·출고 기준”이 아니라 실제 접근 판정과 대상자 응답이 하나의 집합 산출을 공유하는 것이다. 기존 빈 `partner_code` 출고행의 backfill/fallback 정책도 함께 확정되어야 한다.

## ⑤ 이 라운드가 보지 않은 것

- Docker 이미지를 재빌드하지 않았으므로 PR head의 신규 미리보기·내부 활동 API를 라이브로 실행하지 않았다.
- DB 쓰기 금지 때문에 상태 PATCH, 비밀번호 초기화 POST, 파트너 로그인 POST(로그인 시도/세션 저장)를 실행하지 않았다.
- 제공된 `dev_master` 외 직원 계정 및 외부 파트너의 비밀번호를 추정하거나 사용하지 않았다. 따라서 7개 VIEW 비허용 직원, 18개 비MASTER VIEW 허용 직원, 외부 파트너 토큰의 전수 라이브 호출은 조사하지 않았다.
- 합성 데이터·목업을 사용하지 않았고, 기존 Mockito 테스트도 실행 증거로 사용하지 않았다.
- 알림 발송, 비밀번호 이력 회전, 실제 SMS, UI 스크린샷, 성능/N+1, 동시성, 접근성은 조사하지 않았다.
- 작성자 자동포함은 이번 변경 표면에 작성자/대상자 집합이 없어 시스템 전체 회귀를 조사하지 않았다.

## 새로 만든 파일

- `docs/dev-reports/2026-08-02-1015-r-access-reachability.md`
