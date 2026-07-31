# 레거시 배차 기능 현행 대조 조사

## 조사 대상 확인

`tools/legacy-gas/`를 직접 나열해 실제 대상 폴더 3개를 확인했다.

- `tools/legacy-gas/배차안내문자/`
- `tools/legacy-gas/가배차분류리스트/`
- `tools/legacy-gas/지방가배차분류리스트/`

## 확인 즉시 기록 — 배차안내문자

### 문자 본문 조립 순서와 원문

레거시는 먼저 같은 `단톡방`을 묶고, 단톡방이 없으면 같은 `인수자번호`를 묶는다(`Index.html:1154-1168`). 그 묶음 안에서 `하차일`을 숫자 오름차순으로 정렬하고(`Index.html:1170-1177`), 각 하차일 아래에 `라인`을 입력 순서대로 붙인다. `라인`은 `배송기사 연락처 + " / " + 배송주소 앞 3개 공백 구획`이며, 기사 연락처가 없으면 오류 문구가 된다(`Code.js:376-379`).

문자 본문 템플릿 원문은 다음과 같다(`tools/legacy-gas/배차안내문자/Index.html:1179-1186`).

```javascript
let sections = dayOrder.map(dk => {
  let sub = dk + '일 하차 건 배송기사님 연락처를 안내드립니다.';
  let ls = dayLines[dk];
  return sub + (ls.length ? '\n' + ls.join('\n') : '');
});

let mergedText = 'AI 삼성무풍 시스템에어컨 배차실입니다.\n\n' + sections.join('\n\n');
if (!roomKey) mergedText += '\n\n※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.';
```

따라서 실제 본문 데이터 순서는 다음과 같다.

1. 고정 인사말 `AI 삼성무풍 시스템에어컨 배차실입니다.`
2. 하차일 숫자 오름차순으로 `N일 하차 건 배송기사님 연락처를 안내드립니다.`
3. 해당 하차일의 각 건을 입력 순서대로 `[배송기사 연락처 형식] / [배송주소 앞 3개 구획]`
4. 하차일 묶음이 여러 개면 빈 줄 하나를 사이에 두고 2~3을 반복
5. 단톡방 수신이 아닌 인수자 전화번호 수신이면 마지막에 `※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.` 추가

전화번호 값 자체는 보고서에 남기지 않고 `[배송기사 연락처 형식]`으로 마스킹했다.

### 수신 대상과 제외·오류 규칙

- 우선 수신 대상은 거래처명으로 매칭한 `카톡방`이다. 단, 카톡방 이름에 `회계`가 들어가면 인덱스에서 제외한다. 원문: `if (isAccountingRoom_(room)) return;` (`tools/legacy-gas/배차안내문자/Code.js:195-201`).
- 카톡방이 없으면 이카운트의 `인수자 번호`에서 `010`으로 시작하는 11자리 형식만 추출·정규화해 수신 대상으로 삼는다(`Code.js:299-305`). 즉, 문자 본문 조립의 수신 우선순위는 `단톡방` → `인수자번호`이다. 원문: `let key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + ai);` (`Index.html:1154-1156`).
- 별도 Notion 금지 목록의 `이카운트 사업자명`과 정규화 일치하는 거래처는 `발송금지 업체입니다.` 오류 행으로 바꾸고 본문을 조립하지 않는다(`Code.js:652-688`, `Code.js:269-292`, `Index.html:1147-1152`).
- `배차요청내역`이 비었거나 괄호가 없거나, 괄호 안에서 1~3자리 배차번호를 뽑지 못하면 결과에서 조용히 제외된다. `(높이 ... m)` 괄호는 배차번호 후보에서 제외된다(`Code.js:208-229`).
- 같은 전표번호가 여러 날짜에 걸려 모호하면 `전표번호 중복 날짜확인요망!`, 이카운트 행이 없으면 `이카운트 데이터 없음 최신화요망!`, 기사 연락처가 없으면 `기사번호 없음 확인요망!` 오류로 처리한다(`Code.js:231-267`, `Code.js:379`, `Code.js:431-456`). 이 오류 행들은 실제 안내문 템플릿으로 조립되지 않는다(`Index.html:1147-1152`).
- 레거시 폴더 전체에서 SMS·알리고·카카오 발송 API 호출은 찾지 못했다. 확인된 동작은 수신 대상 열과 발송멘트 열을 생성하는 것까지다. 따라서 여기서 말하는 “보냄”은 실제 전송이 아니라 사용자가 복사해 외부 채널로 전달할 대상을 고르는 동작이다.

### 클립보드 출력

레거시에 클립보드 출력이 있다는 보고는 사실이다.

- 선택 셀을 행은 줄바꿈, 열은 탭으로 직렬화해 브라우저 `copy` 이벤트의 `text/plain`에 넣는다. 원문: `e.clipboardData.setData('text/plain', textLines.join('\n'));` (`tools/legacy-gas/배차안내문자/Index.html:880-914`).
- 우클릭 메뉴의 `복사`를 누르면 동일 방식으로 선택 셀을 추출하고 숨은 `textarea`를 만든 뒤 `document.execCommand('copy')`를 실행한다(`Index.html:1489-1528`, `Index.html:1530-1557`).

## 현행 대조 — 배차안내문자

### 자격증명 공백·placeholder의 거짓 성공 경로 (중요)

보고된 내용은 사실이다.

1. 현행 `AligoSmsAdapter.isPlaceholder`는 자격증명이 `null`이거나 blank이면 `true`를 반환한다. 원문: `if (value == null || value.isBlank()) { return true; }` (`services/notification-service/src/main/java/com/samhanair/logis/notification/adapter/sms/AligoSmsAdapter.java:122-125`).
2. key/userid/sender 중 하나라도 placeholder이면 외부 Aligo 호출 전에 즉시 성공 결과를 반환한다. 원문: `return NotificationGatewayResult.success(stubId, "{\"note\":\"Aligo stub (credentials placeholder)\"}");` (`AligoSmsAdapter.java:53-60`).
3. 그 success 팩토리는 `success=true`, `gatewayStatus="SUCCESS"`를 만든다(`services/notification-service/src/main/java/com/samhanair/logis/notification/adapter/NotificationGatewayResult.java:22-24`).
4. 서비스는 이 값을 받아 요청 상태를 `SENT`로 바꾼다. 원문: `if (result.success()) { req.markSent(); ... }` (`services/notification-service/src/main/java/com/samhanair/logis/notification/service/NotificationService.java:252-277`).
5. 배차 발송 서비스는 `SENT` 상태를 성공 건수로 집계한다(`services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchSendService.java:102-126`). 화면도 이를 `성공: N건`으로 표시한다(`clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:639-648`).

즉 자격증명이 비었거나 지정 placeholder이면 실제 문자 전달은 0건이어도 API·DB 상태·화면 집계가 모두 성공/SENT로 보일 수 있다. 기본 설정도 key/userid/sender를 `CHANGE_ME_LOCAL_ONLY`로 둔다(`services/notification-service/src/main/resources/application.yml:55-60`).

### 현행 클립보드 여부

현행 배차문자 실행 화면과 전용 API·관련 저장/복원 컴포넌트를 `clipboard`, `copy`, `복사`로 검색했다. 실행 화면 `DispatchSmsPage.tsx`와 발송 API `dispatchSmsApi.ts`에는 클립보드 쓰기나 복사 버튼이 없다. 실행 화면은 미리보기 후 `sendDispatchBatch`를 호출하는 SMS 발송 흐름이다(`DispatchSmsPage.tsx:280-292`, `DispatchSmsPage.tsx:617-628`). 관련 이력 표도 명시적으로 `enableCopy={false}`다(`clients/desktop/src/renderer/components/DispatchSmsHistoryTab.tsx:131`).

따라서 “레거시에는 선택 셀/본문 클립보드 출력이 있고, 현행 배차문자 화면에는 없으며 SMS 발송만 있다”는 보고는 사실이다. 저장·복원 기능은 있으나 클립보드 전달 기능을 대신하지 않는다.

### 현행 본문·수신자·제외 규칙 비교

- 현행 본문은 레거시 템플릿을 계승하지 않았다. 현행 원문은 `[배차안내]` → `거래처` → `시간` → `주소` → `품목` 순서다(`services/notification-service/src/main/java/com/samhanair/logis/notification/service/MessageTemplateService.java:47-58`). 레거시의 고정 인사말, 하차일별 구획, 배송기사 연락처, 주소 앞 3개 구획, 단톡방이 없을 때의 지연 양해 문구가 모두 없다. 반대로 현행에는 레거시에 없던 거래처명, 예정 시각, 전체 주소(80자 제한), 품목명·수량(100건 제한)이 들어간다(`MessageTemplateService.java:61-95`).
- 레거시는 같은 단톡방 또는 인수자번호의 여러 건을 하차일별로 합쳐 본문 하나를 만들지만, 현행은 출고전표 1건마다 본문 1건을 만들고 각 단톡방 아래에 넣을 뿐 본문을 병합하지 않는다(`services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchPreviewService.java:73-107`).
- 현행은 지정 날짜의 출고전표를 자동 조회하고, 거래처코드 우선·거래처명 snapshot fallback으로 단톡방을 찾는다. 거래처코드 누락 또는 매핑 없음은 `unmapped`로 빼고 발송 후보가 되지 않는다(`DispatchBatchPreviewService.java:64-90`).
- 발송금지 거래처는 preview에서 표시되고 FE 발송 entry 생성 때 제외되며(`DispatchSmsPage.tsx:69-85`), 서버 send 직전에도 다시 조회해 제외한다(`DispatchBatchSendService.java:82-100`). 이 이중 차단은 레거시보다 강하다.
- 레거시의 `회계` 단톡방 제외에 대응하는 현행 규칙은 배차 preview·send 코드와 `PartnerChatRoomMapping` 도메인에서 찾아봤지만 없다. 현행은 매핑된 모든 `chatRoomName`을 그룹에 넣는다(`DispatchBatchPreviewService.java:94-107`). 이는 “찾아봤더니 없음”이다.
- 현행 FE는 실제 전화번호를 얻지 않고 `recipientPhone`에 ``room:${room.chatRoomName}``을 만든다(`clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:69-85`). 서버는 이를 그대로 외부 전화 수신 주소로 취급한다(`DispatchBatchSendService.java:82-114`). Aligo 어댑터도 하이픈만 제거해 `receiver`에 넣는다(`services/notification-service/src/main/java/com/samhanair/logis/notification/adapter/sms/AligoSmsAdapter.java:63-72`, `AligoSmsAdapter.java:100-106`). 즉 현재 코드상 단톡방 이름이 실제 전화번호로 해석되는 계약이며, `PartnerChatRoomMapping.chatRoomName`은 설명과 컬럼 모두 카톡방 이름이다(`services/notification-service/src/main/java/com/samhanair/logis/notification/domain/PartnerChatRoomMapping.java:55-57`). 실제 자격증명을 넣어도 정상 전화번호 수신자로 전달될 근거가 없다.

## 확인 즉시 기록 — 가배차분류리스트

### 실행 모드 8개

UI 원문은 `tools/legacy-gas/가배차분류리스트/Index.html:166-174`, 실제 switch 연결은 `tools/legacy-gas/가배차분류리스트/Code.js:598-607`이다.

1. `1. 상일+초월(지방제외)` — 상일·초월 창고만 취합하고 지방 표식은 제외한다. 야적 표식은 별도 `<기존 야적>` 묶음으로 포함한다(`Code.js:399-409`).
2. `2. 초월(지방제외)` — 초월 창고만, 지방 제외, 야적 별도 포함(`Code.js:412-422`).
3. `3. 상일(지방제외)` — 상일 창고만, 지방 제외, 야적 별도 포함(`Code.js:425-435`).
4. `4. 야적 only` — 야적 표식 건만 추출하고 상일·초월 외 창고는 제외한다(`Code.js:438-448`).
5. `5. 지방 only` — 주소가 `야적`으로 시작하면 제외하고, 주소가 `지방`으로 시작하는 건만 추출하며 상일·초월 외 창고는 제외한다(`Code.js:451-464`).
6. `6. 상일+초월(지방포함)` — 상일·초월 창고, 지방 포함, 야적 별도 포함(`Code.js:467-478`).
7. `7. 초월(지방포함)` — 초월 창고, 지방 포함, 야적 별도 포함(`Code.js:481-491`).
8. `8. 상일(지방포함)` — 상일 창고, 지방 포함, 야적 별도 포함(`Code.js:494-504`).

모든 모드는 전표 전체 또는 판매번호 끝자리 숫자 범위를 먼저 선택할 수 있다. 범위 모드 필터 원문은 `targetData = ecountData.filter(function(e) { ... if (minV !== null && n < minV) return false; if (maxV !== null && n > maxV) return false; return true; });`이다(`Index.html:599-637`).

### 제외 규칙 원문

지방 제외 모드의 공통 원문(`Code.js:314-324`):

```javascript
if (pre.indexOf('회수')>-1 || pre.indexOf('회차')>-1) { counters.skip++; counters.returns++; return ['', true]; }
if (pre.indexOf('차용')>-1 || pre.indexOf('대여')>-1 || pre.indexOf('반납')>-1) { counters.skip++; counters.borrow++; return ['', true]; }
if (pre.indexOf('자가')>-1) { counters.skip++; counters.self++; return ['', true]; }
if (/경동.*[\/:]/.test(o)) { counters.skip++; counters.kyungdong++; return ['', true]; }
if (/로젠.*[\/:]/.test(o)) { counters.skip++; counters.logen++; return ['', true]; }
if (/지방.*[\/:]/.test(o)) { counters.skip++; counters.jibang++; return ['', true]; }
return [o.replace(/^(야적|야상)\s*\/\s*/,'').trim(), false];
```

지방 포함 모드는 위 규칙 중 지방을 제외하지 않고 표식만 지운다. 원문: `if (/지방.*[\/:]/.test(o)) { counters.jibang++; } return [o.replace(/^(야적|야상|지방)\s*[/\:]\s*/,'').trim(), false];` (`Code.js:327-338`). 각 창고 모드는 추가로 `출고창고`에 상일/초월이 없으면 제외한다(예: `Code.js:406`).

### 정렬 규칙 원문

분류 기준 지역 순서는 Notion에서 읽은 `분류 그룹`의 생성시간 오름차순 순서이며(`Code.js:203-223`, `Code.js:586-594`), 각 창고 목록은 그 우선순위 뒤 `시도` 문자열 오름차순으로 정렬한다. 원문(`Code.js:507-515`):

```javascript
list.forEach(function(o){ o['순서'] = get_region_index(o['시도']); });
list.sort(function(a,b){
  if (a['순서'] !== b['순서']) return a['순서'] - b['순서'];
  return String(a['시도']).localeCompare(String(b['시도']));
});
```

출력은 `상일상차` → `초월상차` → `<미분류>` → `<기존 야적>` 순서다(`Code.js:558-575`). 시도 안에서는 Notion `검색어` 배열 순서로 시군을 순회한다(`Code.js:529-555`).

## 확인 즉시 기록 — 지방가배차분류리스트

### `지방` 표식 필터와 8개 필드

보고된 내용은 사실이다. 원문 필터는 `if (raw.indexOf('지방') === 0 || raw.indexOf('지방/') > -1)`이며, 통과한 주소에서 선두 `지방 /` 또는 `지방:`을 제거한다(`tools/legacy-gas/지방가배차분류리스트/Code.js:276-281`). 주의할 점은 두 번째 조건이 문자열 어디에 있든 `지방/`을 허용하지만 제거 정규식은 선두 표식만 지운다는 것이다.

출력 데이터 8필드는 `주소`, `업체명`, `전표번호`, `특이사항`, `창고`, `품목`, `날짜`, `금액`이다(`Code.js:307-316`, `Code.js:330-341`). 화면 표시는 같은 의미로 `날짜`, `배송주소`, `업체명`, `전표번호`, `특이사항`, `창고`, `품목`, `금액`의 8개 필드이며 맨 앞 `이동`은 데이터가 아닌 드래그 핸들이다(`tools/legacy-gas/지방가배차분류리스트/Index.html:451-468`).

### 제외·정렬 규칙 원문

- 제외 규칙은 위 `지방` 표식 조건을 통과하지 못한 모든 행이다(`Code.js:276-318`). 별도의 회수·차용·자가·택배·창고 제외는 이 프로그램에는 없다.
- 기본 정렬은 날짜 내림차순, 날짜가 같으면 전표번호 내림차순이다. 서버 원문: `if (dateA !== dateB) return dateB.localeCompare(dateA); ... return vidB.localeCompare(vidA);` (`Code.js:320-328`). 화면은 다시 날짜 내림차순 뒤 전표번호의 숫자만 추출해 숫자 내림차순으로 정렬한다(`Index.html:586-594`). 따라서 서버의 문자열 전표 정렬과 화면의 숫자 전표 정렬은 값에 따라 결과가 달라질 수 있다.

## 현행 대조 — 가배차·지방가배차

- 현행 화면의 실행 분기는 `가배차 (권역)`과 `지방가배차 (시도)` 두 탭뿐이다(`clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:285-307`). 레거시 가배차의 8개 모드, 상일/초월 선택, 지방 포함/제외, 야적 only, 지방 only, 전표번호 범위 실행을 현행 화면·API·서비스에서 찾아봤지만 없다.
- 현행 가배차는 기간 내 모든 OUTBOUND 전표를 주소 권역으로 분류한다(`services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/PreClassifyService.java:60-89`). 레거시의 회수·회차, 차용·대여·반납, 자가, 경동, 로젠, 지방, 창고 필터와 야적 별도 묶음은 현행 서비스에 없다. 대신 현행에는 이미 배차된 거래처를 `dispatchPlanned`로 표시하는 새 동작이 있다(`PreClassifyService.java:65-87`).
- 현행 권역 판정은 DB `sort_order` 오름차순·그룹명 보조 정렬을 사용하지만(`services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/RegionClassifier.java:53-54`, `RegionClassifier.java:82-100`), 최종 그룹 map과 각 그룹 행은 별도 정렬하지 않고 slip-service 입력 순서를 보존한다(`PreClassifyService.java:70-89`). 레거시의 `상일상차 → 초월상차 → 미분류 → 기존 야적` 출력 및 시도/시군 순회와 다르다.
- 현행 지방가배차는 `지방` 표식을 요구하지 않고 지정일의 모든 OUTBOUND 전표 주소에서 17개 시도 prefix를 찾는다(`services/arologis-service/src/main/java/com/samhanair/logis/arologis/service/RegionalService.java:57-60`, `RegionalService.java:68-93`). 따라서 레거시에서 제외되던 비-`지방` 행도 현행에서는 주소가 매칭되면 포함된다.
- 현행 지방가배차 entry는 `slipNo`, `partnerCode`, `partnerName`, `address`, `sido` 5필드뿐이다(`services/arologis-service/src/main/java/com/samhanair/logis/arologis/dto/RegionalDispatchResponse.java:39-45`). 화면/CSV도 시도, 전표번호, 거래처코드, 거래처명, 주소만 낸다(`clients/arologis-desktop/src/renderer/routes/dispatches/PreClassifyPage.tsx:252-266`, `PreClassifyPage.tsx:698-715`). 레거시 8필드 중 전표번호·업체명·주소만 의미상 겹치며 날짜·특이사항·창고·품목·금액은 없다. 거래처코드·시도는 현행 신규다.
- 현행 지방가배차는 그룹·행을 별도로 정렬하지 않고 출고전표 입력 순서로 `LinkedHashMap`에 누적한다(`RegionalService.java:73-93`). 레거시 날짜/전표 내림차순 정렬은 없다.

## 최종 대조표

| 레거시 동작 (원문 인용 + `파일:행번호`) | 현행 위치 또는 **없음** | 같음 / 다름 / 확인불가 | 다르면 무엇이 다른가 |
|---|---|---|---|
| 배차 문자 고정 인사말·하차일 구획: `let mergedText = 'AI 삼성무풍 시스템에어컨 배차실입니다.\n\n' + sections.join('\n\n');` (`배차안내문자/Index.html:1179-1186`) | `MessageTemplateService.java:47-58` | 다름 | 현행은 `[배차안내] → 거래처 → 시간 → 주소 → 품목`; 레거시 기사 연락처·하차일·지연 양해 문구 없음. |
| 기사 연락처와 주소 앞 3구획: `driver_phone + ' / ' + truncated_display` (`배차안내문자/Code.js:376-379`) | **없음** — 현행 템플릿 전체 확인 | 다름 | 현행은 배송기사 연락처를 입력/출력하지 않고 전체 주소를 80자로 제한한다. |
| 수신 그룹: `roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : ...)` (`배차안내문자/Index.html:1154-1165`) | `DispatchSmsPage.tsx:69-85`; `DispatchBatchSendService.java:82-114` | 다름 | 레거시는 단톡방 우선, 없으면 인수자 전화번호. 현행은 단톡방명에 `room:`을 붙여 전화 수신 주소로 보낸다. |
| `if (isAccountingRoom_(room)) return;` (`배차안내문자/Code.js:195-201`) | **없음** — preview/send/mapping 도메인 확인 | 다름 | 현행에는 `회계` 단톡방 제외 규칙이 없다. |
| `발송금지 업체입니다.` (`배차안내문자/Code.js:269-292`) | `DispatchBatchPreviewService.java:91-101`; `DispatchBatchSendService.java:86-100` | 같음(강화) | 현행은 preview 표시 + send 직전 재확인으로 두 번 차단한다. |
| 빈 원본·괄호 없음·배차번호 미추출 조용한 제외 (`배차안내문자/Code.js:208-229`) | **없음** — 현행은 OUTBOUND 전표 자동 조회 (`DispatchBatchPreviewService.java:60-65`) | 다름 | 현행에는 카톡 원문/괄호 배차번호 파싱 단계가 없다. |
| 선택 셀 TSV 복사: `e.clipboardData.setData('text/plain', textLines.join('\n'));` (`배차안내문자/Index.html:880-914`), 우클릭 `execCommand('copy')` (`Index.html:1489-1557`) | **없음** — `DispatchSmsPage.tsx`·전용 API·관련 컴포넌트 검색; 이력 표는 `enableCopy={false}` (`DispatchSmsHistoryTab.tsx:131`) | 다름 | 현행은 편집·저장·SMS 발송만 있고 클립보드 전달이 없다. |
| 자격증명 공백 동작은 레거시에 해당 없음 | `AligoSmsAdapter.java:53-60`, `AligoSmsAdapter.java:122-125`; `NotificationGatewayResult.java:22-24`; `NotificationService.java:252-277` | 다름(중요 결함) | 빈/placeholder key·userid·sender면 외부 호출 없이 `SUCCESS`, 이후 상태 `SENT` 및 화면 성공 건수로 집계된다. |
| 가배차 8모드 UI 원문 (`가배차분류리스트/Index.html:166-174`) 및 switch (`Code.js:598-607`) | **없음** — 현행은 권역/시도 2탭 (`PreClassifyPage.tsx:285-307`) | 다름 | 상일+초월/초월/상일 × 지방 제외·포함, 야적 only, 지방 only가 계승되지 않았다. |
| 전표번호 전체/범위 필터 (`가배차분류리스트/Index.html:599-637`) | **없음** | 다름 | 현행 가배차는 날짜 범위만 받는다. |
| 공통 제외 원문: `회수/회차`, `차용/대여/반납`, `자가`, `경동`, `로젠`, 지방 제외 모드의 `지방` (`가배차분류리스트/Code.js:314-338`) | **없음** — `PreClassifyService.java:60-89` 전체 확인 | 다름 | 현행은 모든 OUTBOUND를 권역 분류하며 해당 업무 표식 필터가 없다. |
| 지역 우선순위 → 시도 오름차순, `상일상차 → 초월상차 → 미분류 → 기존 야적` (`가배차분류리스트/Code.js:507-575`) | `RegionClassifier.java:53-100`; `PreClassifyService.java:70-89` | 다름 | 현행 sort_order는 매칭 선택에만 쓰고 최종 출력은 출고전표 입력 순서다. 창고/야적 섹션 없음. |
| 지방 표식: `if (raw.indexOf('지방') === 0 || raw.indexOf('지방/') > -1)` (`지방가배차분류리스트/Code.js:276-281`) | **없음** — `RegionalService.java:68-93` | 다름 | 현행은 모든 OUTBOUND 주소를 17개 시도 prefix로 분류한다. |
| 지방 8필드: `주소, 업체명, 전표번호, 특이사항, 창고, 품목, 날짜, 금액` (`지방가배차분류리스트/Code.js:307-316`) | `RegionalDispatchResponse.java:39-45`; `PreClassifyPage.tsx:252-266` | 다름 | 현행 5필드: 전표번호, 거래처코드, 거래처명, 주소, 시도. 날짜·특이사항·창고·품목·금액 없음. |
| 날짜 내림차순 → 전표번호 내림차순 (`지방가배차분류리스트/Code.js:320-328`, `Index.html:586-594`) | **없음** — `RegionalService.java:73-93` | 다름 | 현행은 출고전표 입력 순서. |

## “찾지 못함”과 “찾아봤더니 없음” 구분

- 이 보고서에서 **없음**으로 쓴 항목은 관련 현행 화면, API 클라이언트, controller, service, DTO/domain을 실제로 검색·열람한 뒤 대응 동작이 없음을 확인한 것이다. 단순히 검색어가 안 잡힌 “찾지 못함”이 아니다.
- **확인불가**로 남긴 항목은 없다. 단, 실제 운영 자격증명·실제 외부 전달은 읽기 조사 범위상 실행하지 않았다. “전달 성공 여부”가 아니라 코드 경로상 외부 호출 skip과 성공 상태 전이를 확인했다.
