# PR #996 (#896 슬4) Shadow Live QA R2 보고서

## 1. 결론

**판정: PASS — 이번 라운드의 단일 각도인 “PR 적용 order-app의 사용자 수량·금액·주문 전송이 main과 같은가?”를 4개 모델에서 확인했다.**

- 브랜치 feat/896-s4-quantity-sync-config와 main에서 같은 전용 거래처로 같은 조작을 수행했다.
- 네 모델 모두 입력 수량 1에서 파생 펌프 수량, 소계, 합계가 완전히 같았다.
- 전송 직전 sendOrderFromUi에 전달되는 items와 주문 정보 envelope도 네 모델 모두 브랜치와 main이 완전히 같았다.
- 주문서 발송 버튼은 전송 직전 브라우저 브리지에서 QA 차단하여 실제 확정·전송하지 않았다. 실제 draft/order 생성 행은 0이다.
- V29 seed는 존재하지 않고 수량 동기화 규칙 테이블도 비어 있었다. 규칙 부재 상태에서도 기존 하드코딩 수식에 따른 수량·금액·주문 확인 화면이 정상 동작했다.
- 파트너 화면의 수량 동기화 관측 endpoint는 403이어서 규칙 화면 자체는 관측하지 못했다. 다만 DB의 세 규칙 테이블이 모두 0행인 것은 별도 읽기 확인했다.

실패 또는 차이를 발견했을 때 코드를 수정하지 않고 원문과 함께 보고하라는 지시를 따랐다.

## 2. 실행 범위와 환경

- 실행일: 2026-07-30 (Asia/Seoul)
- 작업 디렉터리: D:\dev\Samhan-Public\.claude\worktrees\w996-qtysync
- 브랜치 HEAD: f1db94f2d80f672711ee114a6d70693ff3ce77a3
- 비교군 main HEAD: 094faceac63662ad82e1e237030901bf93838b90
- 백엔드: 기존 healthy 스택 사용, 재배포하지 않음
- 프런트 기동 명령(브랜치와 main 동일):

~~~powershell
cd clients/web/order-app
VITE_APP_VERSION="2026/07/30-1" VITE_API_BASE_URL="http://localhost:8080/api/v1" npx vite --port 5223 --strictPort
~~~

- 브라우저: Node 스크립트에서 chromium.launch({ channel: 'chrome' }) 직접 호출
- 입력: 각 모델의 싱글 실링 수량 1, 모델별 독립 확인
- 실제 주문 발송: 하지 않음. sendOrderFromUi 호출 직전 인자를 캡처하고 QA 차단
- 전 거래처 1068689215는 조회·승인·사용하지 않음

## 3. QA 전용 throwaway 거래처 생성 및 인증

실재 거래처 계정을 승인하지 않고, 사업자번호가 비어 있던 신규 QA 전용 거래처를 실제 API 경로로 만들었다. 계정 생성에 raw SQL은 사용하지 않았다.

### 3.1 거래처 마스터 생성 원문

~~~text
POST http://localhost:8080/admin/partners
HTTP 200
request JSON:
{"partnerCode":"9909969967","bizNo":"9909969967","name":"QA 전용 PR996 슬4 THROWAWAY 거래처","address":"QA 정리대상","phone":"010-9969-9670","creditLimit":0}
~~~

### 3.2 승인 요청 원문

~~~text
POST http://localhost:8080/api/v1/auth/partner-register
HTTP 201
request JSON:
{"bizNo":"9909969967","memo":"QA-996-S4 throwaway real approval request"}
response:
{"success":true,"code":"OK","message":"성공","data":{"bizNo":"9909969967","status":"PENDING","message":"가입 신청이 접수되었습니다"}}
~~~

승인 요청 직후 상태는 PENDING이고 화면에는 가입 승인 대기중이 표시됐다. 관리자 승인 API를 실제로 호출했다.

~~~text
PATCH http://localhost:8080/api/v1/partner-approvals/9909969967/status
request JSON: {"status":"APPROVED"}
HTTP 200
resulting auth status: NEED_PW_SET
~~~

관리자 승인 후 실제 파트너 비밀번호 설정 경로를 통해 비밀번호를 설정하고, 파트너 로그인 API가 HTTP 200, status=OK를 반환하는 것까지 확인했다. 비밀번호와 토큰은 이 보고서에 기록하지 않는다.

인증 흐름 캡처:

- [승인요청 입력](screenshots/r2-branch-approval-request-input.png)
- [승인요청 접수](screenshots/r2-branch-approval-request-sent.png)
- [승인 대기 상태](screenshots/r2-branch-approval-request-status.png)
- [승인 후 상태](screenshots/r2-branch-approved-status.png)
- [비밀번호 설정 입력](screenshots/r2-branch-password-set-input.png)
- [로그인 준비](screenshots/r2-branch-login-ready.png)
- [로그인 성공](screenshots/r2-branch-login-success.png)

## 4. 규칙 부재 상태 확인

파트너 로그인 후 수량 동기화 관측 호출은 다음 원문으로 실패했다.

~~~text
[quantity-sync shadow] S-03 설정 관측 불가: Request failed with status code 403
~~~

그 뒤 Docker PostgreSQL의 읽기 확인으로 규칙 테이블을 세었다. V29 seed나 QA 거래처용 규칙을 만들지 않았다.

~~~text
          table_name          | total | active
------------------------------+-------+--------
 quantity_sync_rule           |     0 |      0
 quantity_sync_source         |     0 |      0
 quantity_sync_target         |     0 |      0
(3 rows)

rule_key ... (0 rows)
~~~

따라서 이번 측정은 설정 규칙이 비어 있는 상태에서 기존 파생 수식과 주문 흐름이 동작하는지를 확인한 것이다.

## 5. 수량·금액 대조표

모든 행의 입력 수량은 해당 싱글 실링 세트 1개이다. 소계는 원래 싱글 실링 세트의 소계이고, 파생 펌프 소계는 ADP-F075SP 행의 소계이며, 합계는 화면 preview의 세트 합계이다.

| 모델 | 입력 수량 | 브랜치 세트 소계 | main 세트 소계 | 브랜치 펌프 수량 / 소계 | main 펌프 수량 / 소계 | 브랜치 합계 | main 합계 | 대조 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| AC072BSCPBH2SY | 1 | 1,430,000 | 1,430,000 | 1 / 79,200 | 1 / 79,200 | 1,509,200 | 1,509,200 | 동일 |
| AC090BSCPBH2SY | 1 | 1,490,000 | 1,490,000 | 1 / 79,200 | 1 / 79,200 | 1,569,200 | 1,569,200 | 동일 |
| AC130BSCPHH2SY | 1 | 1,730,000 | 1,730,000 | 1 / 79,200 | 1 / 79,200 | 1,809,200 | 1,809,200 | 동일 |
| AC145BSCPHH2SY | 1 | 1,860,000 | 1,860,000 | 1 / 79,200 | 1 / 79,200 | 1,939,200 | 1,939,200 | 동일 |

화면 실제 캡처:

| 모델 | 브랜치 수량 입력 | 브랜치 preview | 브랜치 전송 직전 | main 수량 입력 | main preview | main 전송 직전 |
|---|---|---|---|---|---|---|
| AC072BSCPBH2SY | [캡처](screenshots/r2-branch-AC072BSCPBH2SY-quantity.png) | [캡처](screenshots/r2-branch-AC072BSCPBH2SY-preview.png) | [캡처](screenshots/r2-branch-AC072BSCPBH2SY-final.png) | [캡처](screenshots/r2-main-AC072BSCPBH2SY-quantity.png) | [캡처](screenshots/r2-main-AC072BSCPBH2SY-preview.png) | [캡처](screenshots/r2-main-AC072BSCPBH2SY-final.png) |
| AC090BSCPBH2SY | [캡처](screenshots/r2-branch-AC090BSCPBH2SY-quantity.png) | [캡처](screenshots/r2-branch-AC090BSCPBH2SY-preview.png) | [캡처](screenshots/r2-branch-AC090BSCPBH2SY-final.png) | [캡처](screenshots/r2-main-AC090BSCPBH2SY-quantity.png) | [캡처](screenshots/r2-main-AC090BSCPBH2SY-preview.png) | [캡처](screenshots/r2-main-AC090BSCPBH2SY-final.png) |
| AC130BSCPHH2SY | [캡처](screenshots/r2-branch-AC130BSCPHH2SY-quantity.png) | [캡처](screenshots/r2-branch-AC130BSCPHH2SY-preview.png) | [캡처](screenshots/r2-branch-AC130BSCPHH2SY-final.png) | [캡처](screenshots/r2-main-AC130BSCPHH2SY-quantity.png) | [캡처](screenshots/r2-main-AC130BSCPHH2SY-preview.png) | [캡처](screenshots/r2-main-AC130BSCPHH2SY-final.png) |
| AC145BSCPHH2SY | [캡처](screenshots/r2-branch-AC145BSCPHH2SY-quantity.png) | [캡처](screenshots/r2-branch-AC145BSCPHH2SY-preview.png) | [캡처](screenshots/r2-branch-AC145BSCPHH2SY-final.png) | [캡처](screenshots/r2-main-AC145BSCPHH2SY-quantity.png) | [캡처](screenshots/r2-main-AC145BSCPHH2SY-preview.png) | [캡처](screenshots/r2-main-AC145BSCPHH2SY-final.png) |

## 6. 전송 직전 payload 대조

주문서 발송 직전 sendOrderFromUi(items, order)에 들어간 값이다. 네 모델 모두 브랜치와 main의 배열 순서, 모델, 수량, 단가, 세트 ID, 플래그가 같았다. 아래에서 표기하지 않은 has360, has4way, hasStand, hasOneWayDc, hasDeluxeDc, hasGrade1Dc는 모든 항목에서 false였다.

### 6.1 모델별 items 내용

| 입력 모델 | 전송 직전 items — 브랜치와 main 공통 |
|---|---|
| AC072BSCPBH2SY | 싱글 실링61: AC072BNCPBH1 × 1 @ 565,915; AC072BXAPBH5 × 1 @ 850,170; AR-EH05 × 1 @ 13,915. 실링용 드레인펌프75: ADP-F075SP × 1 @ 79,200. |
| AC090BSCPBH2SY | 싱글 실링62: AC090BNCPBH1 × 1 @ 589,915; AC090BXAPBH3 × 1 @ 886,170; AR-EH05 × 1 @ 13,915. 실링용 드레인펌프75: ADP-F075SP × 1 @ 79,200. |
| AC130BSCPHH2SY | 싱글 실링63: AC130BNCPHH1 × 1 @ 685,915; AC130BXAPHH3 × 1 @ 1,030,170; AR-EH05 × 1 @ 13,915. 실링용 드레인펌프75: ADP-F075SP × 1 @ 79,200. |
| AC145BSCPHH2SY | 싱글 실링64: AC145BNCPHH1 × 1 @ 737,915; AC145BXAPHH5 × 1 @ 1,108,170; AR-EH05 × 1 @ 13,915. 실링용 드레인펌프75: ADP-F075SP × 1 @ 79,200. |

실측한 items 배열의 모델별 차이 부분은 다음과 같다. 아래 배열은 브랜치와 main 각각에서 캡처한 실제 인자의 내용이며, 두 실행의 배열이 동일했다.

~~~json
// AC072BSCPBH2SY
[
  {"section":"SINGLE","setId":"싱글 실링61","setName":"싱글 실링","isSetHead":true,"name":"싱글 실링 실내기","model":"AC072BNCPBH1","unit":"EA","qty":1,"price":565915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링61","setName":"싱글 실링","isSetHead":false,"name":"무풍 4way 냉난방 프리미엄 실외기","model":"AC072BXAPBH5","unit":"EA","qty":1,"price":850170,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링61","setName":"싱글 실링","isSetHead":false,"name":"무선리모컨(냉난방전용)","model":"AR-EH05","unit":"EA","qty":1,"price":13915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"실링용 드레인펌프75","setName":"실링용 드레인펌프","isSetHead":true,"name":"실링용 드레인펌프","model":"ADP-F075SP","unit":"EA","qty":1,"price":79200,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false}
]

// AC090BSCPBH2SY
[
  {"section":"SINGLE","setId":"싱글 실링62","setName":"싱글 실링","isSetHead":true,"name":"싱글 실링 실내기","model":"AC090BNCPBH1","unit":"EA","qty":1,"price":589915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링62","setName":"싱글 실링","isSetHead":false,"name":"무풍 4way 냉난방 프리미엄 실외기","model":"AC090BXAPBH3","unit":"EA","qty":1,"price":886170,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링62","setName":"싱글 실링","isSetHead":false,"name":"무선리모컨(냉난방전용)","model":"AR-EH05","unit":"EA","qty":1,"price":13915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"실링용 드레인펌프75","setName":"실링용 드레인펌프","isSetHead":true,"name":"실링용 드레인펌프","model":"ADP-F075SP","unit":"EA","qty":1,"price":79200,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false}
]

// AC130BSCPHH2SY
[
  {"section":"SINGLE","setId":"싱글 실링63","setName":"싱글 실링","isSetHead":true,"name":"싱글 실링 실내기","model":"AC130BNCPHH1","unit":"EA","qty":1,"price":685915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링63","setName":"싱글 실링","isSetHead":false,"name":"무풍 4way 냉난방 프리미엄 실외기","model":"AC130BXAPHH3","unit":"EA","qty":1,"price":1030170,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링63","setName":"싱글 실링","isSetHead":false,"name":"무선리모컨(냉난방전용)","model":"AR-EH05","unit":"EA","qty":1,"price":13915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"실링용 드레인펌프75","setName":"실링용 드레인펌프","isSetHead":true,"name":"실링용 드레인펌프","model":"ADP-F075SP","unit":"EA","qty":1,"price":79200,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false}
]

// AC145BSCPHH2SY
[
  {"section":"SINGLE","setId":"싱글 실링64","setName":"싱글 실링","isSetHead":true,"name":"싱글 실링 실내기","model":"AC145BNCPHH1","unit":"EA","qty":1,"price":737915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링64","setName":"싱글 실링","isSetHead":false,"name":"무풍 4way 냉난방 프리미엄 실외기","model":"AC145BXAPHH5","unit":"EA","qty":1,"price":1108170,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"싱글 실링64","setName":"싱글 실링","isSetHead":false,"name":"무선리모컨(냉난방전용)","model":"AR-EH05","unit":"EA","qty":1,"price":13915,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false},
  {"section":"SINGLE","setId":"실링용 드레인펌프75","setName":"실링용 드레인펌프","isSetHead":true,"name":"실링용 드레인펌프","model":"ADP-F075SP","unit":"EA","qty":1,"price":79200,"has360":false,"has4way":false,"hasStand":false,"hasOneWayDc":false,"hasDeluxeDc":false,"hasGrade1Dc":false}
]
~~~

각 항목의 공통 구조는 다음과 같다. 모델별 위 표의 값만 달라지고, 브랜치와 main 캡처값은 동일했다.

~~~json
{
  "section": "SINGLE",
  "setId": "싱글 실링61|싱글 실링62|싱글 실링63|싱글 실링64",
  "setName": "싱글 실링",
  "isSetHead": true,
  "unit": "EA",
  "qty": 1,
  "price": "위 모델별 표의 단가",
  "has360": false,
  "has4way": false,
  "hasStand": false,
  "hasOneWayDc": false,
  "hasDeluxeDc": false,
  "hasGrade1Dc": false
}
~~~

실제 캡처에서는 해당 구조에 name과 model이 함께 표시됐다. 모든 모델의 펌프 항목은 setId=실링용 드레인펌프75, setName=실링용 드레인펌프, model=ADP-F075SP, qty=1, price=79200, isSetHead=true였다.

### 6.2 주문 정보 envelope

네 모델에서 브랜치와 main에 공통으로 전달된 주문 정보는 다음과 같다. <모델>만 각 행의 입력 모델로 치환되며, 주소·전화번호는 QA 전용 가짜 값이다.

~~~json
{
  "bizno": "9909969967",
  "managerName": "",
  "addr": "QA996S4 THROWAWAY ADDRESS PR996-S4-CLEANUP",
  "auditAddr": "QA996S4 THROWAWAY ADDRESS PR996-S4-CLEANUP",
  "tel": "010-0109-9699",
  "due": "2026-07-30",
  "payDue": "2026-07-30",
  "memo": "QA-996-S4-THROWAWAY <모델> pre-send",
  "homeRate": 0,
  "commRate": 0,
  "isMobile": false
}
~~~

UI의 주문서 발송 버튼은 위 payload를 만든 뒤 브라우저 내 QA 차단 함수가 가로막았다. 따라서 이 payload는 “전송 직전” 실측값이고, 백엔드로 전송된 주문 payload라고 주장하지 않는다.

## 7. 주문 데이터와 사전 상태

계정·거래처 생성 전 후보 사업자번호 9909969967의 기존 행은 다음 테이블에서 모두 0이었다.

~~~text
partner_db.partners                  candidate rows: 0
partner_auth_db.partner_auth         candidate rows: 0
partner_order_db.partner_orders      candidate rows: 0
~~~

측정 중 실제 주문을 확정하거나 전송하지 않았으며, draft도 생성되지 않았다. 기존 기준 전체 물리 행은 partners=7030, partner_auth 관련 기준 행 수는 10, partner_orders=599였다.

## 8. 정리 원문

측정 후 관리자 API로 인증 접근을 차단하고, 관리자 API로 거래처 마스터를 삭제했다. 두 API 모두 실제 운영 경로이며 hard delete는 수행하지 않았다.

~~~text
PATCH /api/v1/partner-approvals/9909969967/status
request: {"status":"ACCESS_DENIED"}
HTTP 200
response:
{"success":true,"code":"OK","message":"성공","data":{"partnerCode":"9909969967","partnerName":"9909969967","status":"ACCESS_DENIED","approvalRequestedAt":"2026-07-30T16:27:06.681540","pcTutorialDone":true,"mobileTutorialDone":false,"assignedManagerName":null},...}

DELETE /admin/partners/9909969967
HTTP 200
response:
{"success":true,"code":"OK","message":"성공","data":null,"timestamp":"2026-07-30T07:54:05.764429484Z"}
~~~

인증 endpoint와 주문 front-event log에는 삭제 API가 없었다. 따라서 QA 전용으로 생성된 인증 시도·세션·front-event log·거래처 revision은 저장소의 soft-delete 규칙에 맞춰 아래처럼 비활성화했다. 계정 생성에 raw SQL을 사용한 것이 아니며, 정리에도 hard delete를 사용하지 않았다.

~~~text
partner_auth_db
BEGIN
UPDATE partner_session ... biz_no='9909969967' ... -> UPDATE 18
UPDATE partner_login_attempt ... biz_no='9909969967' ... -> UPDATE 18
UPDATE partner_auth ... biz_no='9909969967' ... -> UPDATE 1
COMMIT

partner_order_db
BEGIN
UPDATE partner_order_front_event_log ... biz_no='9909969967' ... -> UPDATE 68
UPDATE partner_order_drafts ... biz_no='9909969967' ... -> UPDATE 0
COMMIT

partner_db
BEGIN
UPDATE partner_revisions ... partner_code='9909969967' ... -> UPDATE 1
COMMIT
~~~

위 SQL은 삭제가 아닌 is_deleted=TRUE, deleted_at=NOW(), deleted_by='qa-996-r2' soft-delete 정리였다. 주문 draft/order에는 생성된 행이 없어서 UPDATE 0이고, 물리적으로 남아 있는 것은 감사·보존 데이터다.

## 9. 정리 후 재계수

재계수 시 physical은 soft-delete 보존 행까지 포함하고, active는 실제 사용 가능한 행이다. qa_physical과 qa_active는 후보 사업자번호/거래처 코드에 대한 값이다.

~~~text
partner_db
    table_name      | physical | active | qa_physical | qa_active
-------------------+----------+--------+-------------+----------
 partners          |     7031 |   7030 |           1 |         0
 partner_revisions |       29 |     28 |           1 |         0

partner_auth_db
    table_name          | physical | active | qa_physical | qa_active
-----------------------+----------+--------+-------------+----------
 partner_auth          |       11 |      2 |           1 |         0
 partner_login_attempt |       46 |     28 |          18 |         0
 partner_session       |       43 |     25 |          18 |         0

partner_order_db
    table_name                  | physical | active | qa_physical | qa_active
-------------------------------+----------+--------+-------------+----------
 partner_order_drafts          |     2028 |   2028 |           0 |         0
 partner_order_front_event_log |      173 |    105 |          68 |         0
 partner_orders                |      599 |    597 |           0 |         0
~~~

정리 결과 QA 거래처·인증·세션·front-event log의 활성 행은 모두 0이며, QA 주문 draft/order도 0이다. 물리 행 수가 생성 전 숫자로 돌아가지 않는 이유는 hard delete 금지 및 감사 데이터 보존 때문이다. dc_config_db에는 QA 거래처용 설정 행을 만든 적이 없고 후보 행은 계속 0이다.

## 10. 신규 산출물 전체 목록

이번 라운드에서 새로 만든 보고서와 실제 브라우저 캡처의 전체 목록이다. 캡처는 모두 r2- 접두사를 사용했다.

### 보고서

- docs/qa/996-s4-shadow-live/R2-REPORT.md

### 캡처

~~~text
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC072BSCPBH2SY-confirm.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC072BSCPBH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC072BSCPBH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC072BSCPBH2SY-quantity.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC090BSCPBH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC090BSCPBH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC090BSCPBH2SY-quantity.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC130BSCPHH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC130BSCPHH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC130BSCPHH2SY-quantity.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC145BSCPHH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC145BSCPHH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-AC145BSCPHH2SY-quantity.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-approval-request-input.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-approval-request-sent.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-approval-request-status.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-approved-status.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-gate.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-login-ready.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-login-success.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-not-found-auth.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-password-set-input.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-password-set-result.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-pending-before-approval.png
docs/qa/996-s4-shadow-live/screenshots/r2-branch-single-empty.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC072BSCPBH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC072BSCPBH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC072BSCPBH2SY-quantity.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC090BSCPBH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC090BSCPBH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC090BSCPBH2SY-quantity.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC130BSCPHH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC130BSCPHH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC130BSCPHH2SY-quantity.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC145BSCPHH2SY-final.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC145BSCPHH2SY-preview.png
docs/qa/996-s4-shadow-live/screenshots/r2-main-AC145BSCPHH2SY-quantity.png
~~~
