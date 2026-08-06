# 주문서 앱 접근권한 설정 레거시 대조 조사

## 조사 범위

- 상위 폴더를 직접 나열해 레거시 원본 폴더명이 `장기미발주 거래처 선별`, `기간별 비빌번호 재설정`(원문 오탈자 포함)임을 확인했다.
- 개발책임자 지정에 따라 위 두 폴더만 조사하며, 소스 수정·실행·DB 쓰기 없이 정적 원문과 현행 화면/라우트를 대조한다.
- 각 폴더의 기능 소스는 `Code.js` 하나이며, 별도로 GAS 설정 파일 `appsscript.json`이 있다.

## 레거시 원문 조사

### 1. 장기미발주 거래처 선별

#### 판정 기준과 제외 규칙

- 기준 기간은 실행 시각부터 정확히 30일 전이다. 원문: `const thresholdDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:19`). 기간은 코드에 고정되어 있고 사용자 입력 경로는 없다.
- 활동 판정은 두 원천의 거래처코드를 합친 집합이다. 원문: `getActiveBizNosFromLog_(thresholdIso, activeBizNos);`, `getActiveBizNosFromShipping_(thresholdIso, activeBizNos);` (같은 파일:25-26).
- 주문 로그는 최근 30일 안에 생성됐고 로그 텍스트에 주문 성공이 포함된 행만 활동으로 센다. 원문: `{ timestamp: 'created_time', created_time: { on_or_after: thresholdIso } },`, `{ property: '로그', rich_text: { contains: '주문 성공' } }` (같은 파일:74-75).
- 출고는 페이지 생성시각 또는 `출고일` 중 하나가 최근 30일 안이면 활동으로 센다. 원문: `timestamp: 'created_time',` / `created_time: { on_or_after: thresholdIso }` 및 `property: '출고일',` / `date: { on_or_after: thresholdIso }` (같은 파일:120-125).
- 활동 원천의 식별자는 `거래처코드` 숫자이며(같은 파일:100-101, 151-152), 승인 DB 쪽 거래처코드는 숫자 이외 문자를 제거한 뒤 숫자로 바꿔 비교한다. 원문: `const numBizNo = Number(String(client.bizNo).replace(/[^\d]/g, ''));` (같은 파일:32).
- 조사 대상 자체는 승인상태가 `승인` 또는 `장기미발주`인 거래처뿐이다. 원문: `{ property: '승인상태', select: { equals: '승인' } },`, `{ property: '승인상태', select: { equals: '장기미발주' } }` (같은 파일:171-172). 그 밖의 상태는 조회에서 제외된다.
- 거래처코드를 숫자로 정규화한 결과가 0/빈 값이면 아무 처리도 하지 않는다. 원문: `if (!numBizNo) continue;` (같은 파일:33).
- `승인` 거래처를 장기미발주로 바꾸는 검사는 월요일에만 한다. 원문: `if (client.status === '승인' && isMonday) {` (같은 파일:38). 코드 주석은 `월요일 자정에만 체크`라고 쓰지만(같은 파일:37), 함수 자체에는 자정 판정이 없고 요일만 검사한다.
- 최종 장기미발주 판정은 **최근 30일 활동 없음 AND 승인 DB 페이지 생성시각이 30일보다 오래됨**이다. 원문: `if (!isActive && client.createdTime < thresholdDate) {` (같은 파일:39). 따라서 신규 생성 30일 이내 거래처는 활동이 없어도 제외된다.

#### 선별 후 실행 동작

- 목록 표시 기능이 아니라 승인 DB의 `승인상태`를 실제 변경한다. 판정된 거래처는 `updateClientStatus_(client.pageId, '장기미발주');`로 전환한다(같은 파일:41). 변경 payload는 `'승인상태': { select: { name: newStatus } }`이고 Notion 페이지에 PATCH한다(같은 파일:214-230).
- 역방향 자동 복구도 있다. 상태가 `장기미발주`인 거래처에 최근 활동이 생기면 매일 `승인`으로 바꾼다. 원문: `else if (client.status === '장기미발주') {`, `if (isActive) {`, `updateClientStatus_(client.pageId, '승인');` (같은 파일:49-52).
- 위험 메모: 주문 로그 또는 출고 조회가 HTTP 200이 아니면 해당 조회 루프는 로그만 남기고 중단한다(같은 파일:93-96, 144-147). 두 조회 결과를 합친 집합이 불완전해져도 뒤의 상태 변경은 계속되므로, 원천 조회 실패 시 실제 활동 거래처를 미활동으로 오판할 수 있다.

### 2. 기간별 비빌번호 재설정

#### 대상과 기간

- 함수명과 로그상 월간 작업이다. 원문: `function rotatePasswordsMonthly() {` 및 `Logger.log('>> 🔄 [월간작업] 비밀번호 로테이션 시작...');` (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:2,13`). 그러나 함수 내부에는 날짜·기간 입력이나 월별 판정식이 없다.
- 승인상태 등으로 거르지 않고 인증 DB의 전체 페이지를 pagination으로 조회한다. 원문: `// 전체 사용자 페이지 조회`와 `const payload = cursor ? { start_cursor: cursor } : {};` (같은 파일:15,22).
- 다섯 비밀번호 이력 칸(`현재PW`, `과거1`~`과거4`)이 전부 비어 있는 페이지만 제외한다. 원문: `if (!valCurrent && !val1 && !val2 && !val3 && !val4) { continue; }` (같은 파일:54-56). 즉 현재값이 비어 있어도 과거 이력 하나라도 있으면 대상이다.

#### 재설정 값과 전달

- 새 비밀번호를 생성하지 않는다. 기존 값을 한 칸씩 과거 이력으로 밀고 가장 오래된 이력은 덮어쓰며, 현재 비밀번호를 빈 문자열로 초기화한다. 원문: `'과거5': makeRichText_(val4)`부터 `'과거1': makeRichText_(valCurrent),` 및 `'현재PW': makeRichText_('')` (같은 파일:60-65).
- 변경은 각 인증 DB 페이지에 PATCH로 전송한다. 원문: `UrlFetchApp.fetch(updateUrl, { method: 'patch', ... payload: JSON.stringify({ properties: updateProps }) ... })` (같은 파일:69-75).
- 거래처에게 새 값을 알리는 이메일·문자·화면 메시지 등의 전달 동작은 이 파일에 없다. 생성되는 새 값 자체가 없으며, 코드가 하는 일은 현재값 제거와 이력 이동뿐이다.

#### 되돌리기 가능성

- 실행 취소 함수나 과거값을 `현재PW`로 되돌리는 경로는 이 파일에 없다. 매 실행은 `과거4`를 `과거5`로 덮고 `현재PW`를 비우므로 자동·일괄 복구는 **불가능**하다(같은 파일:58-66).
- 직전 현재값은 실행 직후 `과거1`에 복사되므로 데이터 조각은 남지만(같은 파일:64), 이를 복원하는 구현은 없다. 반복 실행 시 이력은 계속 뒤로 밀리고 가장 오래된 값은 소실된다.
- 두 `appsscript.json`에는 `Asia/Seoul`, 빈 dependencies, 로깅·런타임 설정만 있고 설치형/시간 기반 트리거 정의는 없다(각 `appsscript.json:1-7`). 따라서 `월요일 자정`, `매일`, `월간`의 실제 실행 시각·주기는 저장된 두 폴더만으로 **확인불가**하며, GAS 프로젝트 외부 트리거 설정에 달려 있다.

## 현행 대조

### 거래처별 주문서 승인현황 화면과 라우트

- 현행 데스크톱에 대응 화면이 **있다**. 구현 파일은 `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:56-267`, 화면 제목은 `주문서 승인`이다(같은 파일:67-70, 218-220).
- 화면 자체가 기존 장기미발주 메뉴 통합을 명시한다. 원문: `기존 \`/sales/long-pending\` (장기미발주) 메뉴를 본 화면으로 통합.` (같은 파일:4).
- 사용자 식별 열은 `거래처 코드`, `거래처명`이고(같은 파일:121-124), 행 키도 거래처코드다(같은 파일:257-261).
- 승인상태 6종 중 `장기미발주`가 포함되고(같은 파일:36-43), 각 행에서 상태를 직접 변경한다(같은 파일:136-158). 상태 필터도 제공한다(같은 파일:223-240).
- 서브 메뉴 등록은 `{ to: '/sales/order-approvals', label: '주문서 승인' }`이다(`clients/desktop/src/renderer/components/sales/SalesSubNav.tsx:20-26`).
- 이 화면에는 기간 설정 UI가 **없다**. 전체 렌더 구현 `SalesOrderApprovalsPage.tsx:208-267`의 상단 조작은 상태 필터뿐이며(223-240), 기간 state/query parameter도 없다(`statusFilter`만 선언:58, 목록 호출:74-79).
- 실제 라우트는 `path: '/sales/order-approvals'`이고 `sales.partner-order.list` VIEW 권한으로 감싼다(`clients/desktop/src/renderer/routes/index.tsx:503-512`).
- 좌측 사이드바에도 `/sales/order-approvals` → `주문서 승인` 링크가 등록되어 있다(`clients/desktop/src/renderer/components/AppLayout.tsx:754-759`). 따라서 문자열 검색 결과만이 아니라 실제 화면·라우트·사이드바 진입점이 모두 존재한다.
- 현행 목록 API는 `GET /api/v1/partner-approvals`이며 page/size와 선택적 status만 받는다(`clients/desktop/src/renderer/api/sales.ts:1032-1047`). 시작일·종료일·미발주 기간 parameter는 없다.
- API gateway에도 `/api/v1/partner-approvals/**`를 partner-auth-service로 전달하고 JWT 인증을 적용하는 실제 route가 있다(`services/api-gateway/src/main/resources/application.yml:547-554`).

### 현행 장기미사용 판정·실행

- 현행에도 `LONG_UNUSED("장기미발주")` 상태가 있다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerStatus.java:25-35`).
- 기간은 레거시와 같은 30일 상수지만 설정 가능하지 않다. `public static final int LONG_UNUSED_DAYS = 30;` (`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:52-53`).
- **기준 데이터는 레거시와 다르다.** 현행은 최근 주문 성공/출고가 아니라 `lastLoginAt`, 그것이 없으면 `passwordChangedAt`을 기준으로 30일을 더한다. 원문: `LocalDateTime base = lastLoginAt != null ? lastLoginAt : passwordChangedAt;`, `return base == null ? null : base.plusDays(LONG_UNUSED_DAYS);` (같은 파일:227-230).
- `lastLoginAt`은 로그인 성공 때만 갱신된다(같은 파일:172-179). 따라서 주문·출고가 있어도 로그인 시각/비밀번호 변경 시각이 오래됐으면 현행에서는 장기미사용으로 판정될 수 있고, 반대로 주문·출고가 없어도 최근 로그인만 했으면 판정되지 않는다.
- 현행 제외 상태는 `LOCKED`, `ACCESS_DENIED`, `PENDING`, `NEED_PW_SET`이다. 이 상태들은 만료 계산 전에 그대로 반환한다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:101-113`). 기준 시각이 아예 없으면 만료되지 않는다(`PartnerAuth.java:227-230`).
- 현행은 월요일 일괄 선별이 아니다. 인증상태 조회에서 유효 상태를 계산하고(`PartnerAuthService.java:94-98`), 실제 로그인 시 30일 만료가 확인되면 그때 `markLongUnused()`로 저장한다(같은 파일:202-206). 만료 로그인은 즉시 차단 응답한다(같은 파일:215-218).
- 승인현황 화면에서도 담당자가 행 상태를 `LONG_PENDING`으로 수동 변경할 수 있고(`SalesOrderApprovalsPage.tsx:136-158`), backend는 이를 `markLongUnused()`로 저장한다(`PartnerApprovalService.java:53-75`).
- 레거시의 `최근 주문/출고가 생기면 매일 승인 복구`에 대응하는 배치 복구는 현행에 없다. 엔티티에는 로그인 성공 시 `LONG_UNUSED`를 `NEED_PW_INPUT`으로 바꾸는 메서드가 있으나(`PartnerAuth.java:172-179`), 로그인 서비스는 LONG_UNUSED를 비밀번호 검증 전에 차단 반환한다(`PartnerAuthService.java:202-218`). 확인한 현재 경로만으로는 장기미사용 거래처의 자동 복구가 도달 가능한지 **확인불가**이며, 적어도 레거시와 같은 주문/출고 기반 자동 복구는 없다.

### 현행 비밀번호 초기화 대조

- 현행 승인현황 화면에는 거래처별 `비밀번호 초기화` 버튼이 있다(`clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:187-204`). 거래처 코드 하나를 `POST /api/v1/partner-approvals/{partnerCode}/reset-password`로 보낸다(`clients/desktop/src/renderer/api/sales.ts:1067-1079`).
- backend endpoint도 실제 등록되어 있으며 UPDATE 권한으로 보호된다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/controller/PartnerApprovalsController.java:77-83`).
- 이 관리자 초기화는 선택 거래처 한 곳의 기존 hash를 5건 FIFO 이력으로 옮기고 placeholder hash로 교체한 뒤 상태를 `NEED_PW_SET`으로 바꾼다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:78-82`, `.../domain/PartnerAuth.java:153-170`). 비밀번호/자격 값 자체는 본 보고서에 기록하지 않는다.
- 거래처의 다음 주문서 앱 접근에서는 `NEED_PW_SET` 상태에 비밀번호 설정 모달을 표시한다(`clients/web/order-app/index.html:8328-8336`). 사용자가 형식에 맞는 새 값을 직접 입력·확인한 뒤 설정 호출을 한다(같은 파일:8437-8475). 즉 레거시처럼 일괄적으로 현재값을 비우는 것과 달리, **개별 관리자 초기화 → 다음 접근에서 거래처가 새 값 선택** 흐름이다.
- 관리자 초기화 placeholder는 등록 연락처 PIN 소유 검증을 요구하지 않는 분기로 판정된다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:333-336`). 새 값은 직전값 및 최근 5회 이력과 중복될 수 없고(같은 파일:175-183), 통과하면 새 hash로 저장된다(같은 파일:186-188).
- 별도의 임시 비밀번호 발급 API도 있으나 승인현황의 관리자 초기화 버튼과는 다른 endpoint다(`PartnerAuthController.java:76-82`). 이 경로는 무작위 4자리 숫자 형식으로 생성해 등록 휴대폰으로 SMS 큐잉한다(`PartnerAuthService.java:284-306`). 그러나 현재 `SmsClient`는 **실제 발송 없이 로그 큐잉만** 한다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/client/SmsClient.java:7-12,25-28`).
- 현행 승인현황/라우트/API에서 기간을 입력해 다수 거래처 비밀번호를 일괄 초기화하는 기능은 **없다**. 화면은 행별 버튼만 제공하고(`SalesOrderApprovalsPage.tsx:187-204`), endpoint path도 거래처코드 단건 필수다(`PartnerApprovalsController.java:79-82`).
- 현행에도 초기화 실행을 되돌려 이전 hash/status를 복원하는 endpoint나 화면은 확인되지 않았다. 이력은 재사용 차단용 read-only 목록으로만 노출된다(`PartnerAuth.java:233-235`). 새 비밀번호 설정으로 다시 접근을 열 수는 있지만, 이는 원래 상태로의 rollback이 아니다.
- 추가 불일치: 현행 주문서 앱 안내문은 `최종 주문일로부터 30일 간 발주 기록이 없어 사용이 제한되었습니다.`라고 표시한다(`clients/web/order-app/index.html:8299-8305`). 실제 backend는 최종 주문일이 아니라 마지막 로그인/비밀번호 변경 시각을 쓰므로(`PartnerAuth.java:227-230`), 사용자 안내와 실행 판정이 서로 다르다.
- 복구 UI/실행 불일치: 화면 dropdown은 장기미발주 행에서도 `APPROVED` 선택지를 보여 호출하지만(`SalesOrderApprovalsPage.tsx:136-158`), backend의 APPROVED 분기는 PENDING만 승인하고 LOCKED만 해제하며 나머지 상태는 변경하지 않는다(`PartnerApprovalService.java:57-66`). 따라서 LONG_UNUSED → APPROVED 수동 선택은 현재 구현상 no-op이다. 개별 `비밀번호 초기화`로 NEED_PW_SET 전환 후 새 값을 설정하는 우회만 확인된다.
- 현행 `partner-auth-service/src/main` 전수 검색에서 장기미사용/초기화 관련 도달 코드는 위 엔티티·서비스·컨트롤러뿐이고 `@Scheduled`, cron, rotation 구현은 0건이었다. 데스크톱 renderer와 partner-auth main에서 `주문서 앱 접근권한 설정`, 기간+비밀번호, 기간+미발주 조합도 0건이었다. 이 0건만으로 부재 판정하지 않고, 위 실제 화면 전체·라우트·API 계약을 함께 확인해 기간 일괄 기능 부재를 판정했다.

## 동작 단위 대조표

| 레거시 동작 (원문 인용 + `파일:행번호`) | 현행 위치 또는 **없음** | 같음 / 다름 / 확인불가 | 다르면 무엇이 다른가 |
|---|---|---|---|
| 장기미발주 기준 기간: `const thresholdDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:19`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:52-53` | 같음 | 양쪽 모두 30일이지만 모두 고정값이며 설정 UI는 없다. |
| 활동 원천 1: 최근 생성 + 주문 성공 로그 포함: `{ timestamp: 'created_time', created_time: { on_or_after: thresholdIso } },` / `{ property: '로그', rich_text: { contains: '주문 성공' } }` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:74-75`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:89-95,227-230` | 다름 | 현행은 주문 성공 로그를 보지 않고 마지막 로그인, 없으면 비밀번호 변경 시각을 쓴다. |
| 활동 원천 2: 페이지 생성시각 또는 출고일이 기준일 이후: `created_time: { on_or_after: thresholdIso }` / `date: { on_or_after: thresholdIso }` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:120-125`) | **없음** | 다름 | 현행 장기미사용 판정에는 출고 데이터 조회가 없다. |
| 대상 상태: `승인` 또는 `장기미발주`만 조회 (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:169-174`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:104-113` | 다름 | 현행은 인증 상태 평가 시 잠김·접근제한·승인대기·비밀번호 설정 필요 상태를 만료 평가에서 제외한다. |
| 코드 제외: `if (!numBizNo) continue;` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:33`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:64-70` | 다름 | 레거시는 숫자 정규화 결과가 비면 건너뛴다. 현행은 저장된 거래처 인증 레코드 기준으로 평가한다. |
| 신규 거래처 제외 + 미활동 결합: `if (!isActive && client.createdTime < thresholdDate) {` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:39`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:227-230` | 다름 | 레거시는 승인 DB 페이지 생성 후 30일을 보호한다. 현행은 마지막 로그인 또는 비밀번호 변경 후 30일이며 기준 시각이 없으면 만료되지 않는다. |
| 월요일에만 승인→장기미발주 검사: `if (client.status === '승인' && isMonday) {` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:38`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:202-206` | 다름 | 현행은 월요일 배치가 아니라 인증 시점에 평가·저장한다. |
| 상태 변경 실행: `updateClientStatus_(client.pageId, '장기미발주');` 및 승인상태 PATCH payload (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:41,213-230`) | 자동: `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:202-206`; 수동: `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:53-75` | 다름 | 양쪽 모두 실제 접근 상태를 바꾼다. 현행은 인증 시 자동 마킹 외에 승인현황 화면의 수동 상태 변경도 있다. |
| 활동 재개 시 복구: `else if (client.status === '장기미발주') {`, `if (isActive) {`, `updateClientStatus_(client.pageId, '승인');` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:49-52`) | 주문/출고 기반 복구 **없음**; 로그인 성공 메서드 `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:172-179` | 확인불가 | 현행 로그인은 LONG_UNUSED를 성공 처리 전 차단한다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:202-218`). 화면의 승인 선택도 해당 상태에는 no-op이다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerApprovalService.java:57-66`). 자동 복구 도달 경로를 확인할 수 없다. |
| 원천 조회 실패 시 로그 후 루프 중단: `Logger.log(\`❌ 로그조회실패\`); break;` / `Logger.log(\`❌ 출고조회실패\`); break;` (`tools/legacy-gas/거래처 발송 주문서/장기미발주 거래처 선별/Code.js:93-96,144-147`) | **없음** | 다름 | 레거시는 불완전한 활동 집합으로 상태 변경을 계속할 수 있다. 현행은 그 두 원천을 조회하지 않는다. |
| 비밀번호 대상 조회: `// 전체 사용자 페이지 조회` 및 filter 없는 payload (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:15-22`) | 기간 일괄 대상 조회 **없음** | 다름 | 현행은 승인현황에서 거래처코드·이름으로 한 행씩 선택한다(`clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:121-124,187-204`). |
| 비밀번호 대상 제외: `if (!valCurrent && !val1 && !val2 && !val3 && !val4) { continue; }` (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:54-56`) | **없음** | 다름 | 레거시는 현재값과 과거 4칸이 모두 빈 페이지만 제외한다. 현행 단건 초기화에는 이 조건이 없다. |
| 기간 지정: `function rotatePasswordsMonthly() {` 및 `[월간작업]` 로그 (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:2,13`) | **없음** | 확인불가 | 레거시 내부에도 날짜/기간 입력은 없고 manifest에도 trigger가 없다. 실제 월간 실행 주기는 외부 GAS trigger라 저장 원본만으로 확인할 수 없다. 현행에도 기간 입력·batch·scheduler가 없다. |
| 값 변경 규칙: 현재값→과거1, 과거1→과거2 … 과거4→과거5, 현재값은 빈 문자열 (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:58-66`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:153-170` | 다름 | 현행 단건 초기화는 기존 hash를 최대 5건 FIFO 이력에 넣고 초기화 표식을 저장해 다음 접근에서 새 값을 설정하게 한다. |
| 페이지별 PATCH: `method: 'patch'`와 properties payload (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:68-75`) | `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/controller/PartnerApprovalsController.java:77-83` | 다름 | 양쪽 모두 실제 저장 상태를 변경하지만 레거시는 전체 조회 후 반복, 현행 승인 화면은 거래처 단건 endpoint다. |
| 새 값 생성·전달: 레거시 파일에는 생성/메일/SMS 호출 **없음**; 현재값 삭제만 있음 (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:58-75`) | 관리자 초기화 후 사용자 직접 설정: `clients/web/order-app/index.html:8328-8336,8437-8475`; 별도 임시값 경로: `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/service/PartnerAuthService.java:284-306` | 다름 | 관리자 초기화 버튼은 새 값을 전달하지 않고 다음 접근에서 거래처가 정한다. 별도 임시값 경로는 4자리 숫자 형식으로 만들지만 현재 SMS client는 실발송하지 않는다(`services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/client/SmsClient.java:25-28`). |
| 되돌리기: 과거4를 과거5로 밀고 현재값을 비우는 코드뿐이며 복원 함수 **없음** (`tools/legacy-gas/거래처 발송 주문서/기간별 비빌번호 재설정/Code.js:58-66,88-102`) | rollback 화면/API **없음**; 이력 read-only `services/partner-auth-service/src/main/java/com/samhanair/logis/partnerauth/domain/PartnerAuth.java:233-235` | 같음 | 둘 다 원래 상태로 일괄 복원하는 경로가 없다. 새 값을 다시 설정하는 것은 원상복구가 아니다. |

## 필수 질문별 결론

1. **장기 미발주 판정:** 실행 시각 기준 최근 30일 동안 `주문 성공` 로그도 없고 생성시각/출고일 기준 출고 활동도 없으며, 승인 DB 페이지 생성 후에도 30일이 지난 `승인` 거래처다. 거래처코드가 비정상이면 제외되고, 승인 전환 검사는 월요일에만 한다. 다른 승인상태는 대상 조회에서 제외된다.
2. **선별 결과:** 목록만 보여주는 것이 아니라 승인상태를 `장기미발주`로 PATCH해 주문서 앱 접근을 끊는다. 반대로 최근 주문/출고 활동이 잡힌 `장기미발주` 거래처는 `승인`으로 자동 복구한다.
3. **현행 승인현황 화면:** **있음.** 화면 `clients/desktop/src/renderer/routes/SalesOrderApprovalsPage.tsx:56-267`, route `clients/desktop/src/renderer/routes/index.tsx:503-512`, 좌측 메뉴 `clients/desktop/src/renderer/components/AppLayout.tsx:754-759`이다. 현재 이름은 `주문서 승인`이다.
4. **기간별 비밀번호 대상/기간:** 인증 DB 전체 페이지 중 현재값과 과거 1~4 이력이 모두 빈 페이지만 제외한다. 함수명·로그는 월간이지만 코드 내부 기간 입력/판정은 없고 저장된 manifest에도 trigger가 없어 실제 실행 주기는 확인불가다.
5. **재설정 값/전달:** 레거시는 새 값을 만들거나 보내지 않는다. 현재값을 과거1로 옮기고 이력을 한 칸씩 밀며 현재값을 비운다. 이메일·문자·화면 전달은 없다.
6. **되돌리기:** **불가.** 직전 값 조각은 과거1에 남지만 복원 함수가 없고, 반복 실행하면 오래된 이력은 덮어써진다. 현행 단건 초기화에도 원상복구 API/UI는 없다.
7. **현행 대응 여부:** **부분적으로 있음.** 거래처별 승인현황, 장기미사용 상태, 수동 상태 변경, 개별 비밀번호 초기화는 있다. 그러나 개발책임자 사양의 단일 메뉴명 `주문서 앱 접근권한 설정`, 사용자 설정 가능한 미발주 기간, 주문/출고 기반 선별·자동복구, 기간 대상 일괄 비밀번호 초기화는 **없음**이다.

## 계승 시 판정상 차단점

- 레거시 의미를 계승하려면 현행의 마지막 로그인/비밀번호 변경 기준을 그대로 재사용하면 안 된다. 주문 성공 로그와 출고 활동을 기준 데이터로 삼아야 한다.
- 활동 원천 하나가 실패한 상태에서 미활동으로 판정하면 정상 거래처 접근을 끊을 수 있다. 레거시의 부분 조회 후 계속 처리 동작은 fail-closed가 아니라 **판정 중단**으로 재설계할 필요가 있다.
- 기간값은 화면 입력뿐 아니라 판정 query와 상태 변경 대상 미리보기/확정에 동일하게 적용돼야 한다. 현재 30일 상수와 status-only 목록 API로는 개발책임자 사양을 충족하지 않는다.
- 실행 후 원상복구 경로가 양쪽 모두 없으므로, 일괄 초기화 계승 전 거래처 코드·이름·변경 전 상태를 기반으로 한 명시적 복구 계약이 선행되지 않으면 오선별 피해를 되돌릴 수 없다.
