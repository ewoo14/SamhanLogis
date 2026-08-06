# #1013 R10 — 레거시 배차안내문자 발송 계약 확정

## 0. 조사 범위와 결론

- 조사 원문: `tools/legacy-gas/배차안내문자/Code.js`, `Index.html`, `appsscript.json` 전부.
- 보조 조사: 현행 notification-service의 발송 DTO·DB schema·Aligo adapter와 해당 줄의 git blame/도입 commit.
- 실제 SMS 발송, Docker 재빌드, 공유 DB write, 코드 수정, 브랜치 조작은 하지 않았다.

**결론: 현행 “같은 번호의 긴 그룹을 2,000자 이하 13 entry로 나누어 자동 SMS 발송”은 레거시 계승이 아니다.** 레거시 원문이 확정하는 계약은 같은 방/번호 그룹에 **하나의 병합 문구를 만들어 결과표에 한 셀로 표시하고 사용자가 복사할 수 있게 하는 것**까지다. 레거시 원문에는 SMS provider 호출, 자동 SMS 발송, 길이 기준 분할, 다통 발송이 없다.

원문만을 기준으로 계승하려면 긴 그룹도 하나의 병합 문구로 표시·복사하고, 레거시와 동일한 범위에서는 자동 SMS를 보내지 않아야 한다. 자동 SMS를 새 제품 기능으로 유지하려면 긴 본문의 발송 정책은 레거시 계승이 아니라 별도 제품 결정을 받아야 한다.

## 1. 질문 1 — 병합 문구는 어디에 쓰이는가

### 1.1 생성

`tools/legacy-gas/배차안내문자/Index.html:1154-1168`:

> `let roomKey = String(row['단톡방'] || '').trim();`
>
> `let phoneKey = String(row['인수자번호'] || '').trim();`
>
> `let key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + ai);`
>
> `...`
>
> `let group = list.slice(ai, aj);`

`tools/legacy-gas/배차안내문자/Index.html:1179-1189`:

> `let sections = dayOrder.map(dk => {`
>
> `  let sub = dk + '일 하차 건 배송기사님 연락처를 안내드립니다.';`
>
> `  let ls = dayLines[dk];`
>
> `  return sub + (ls.length ? '\n' + ls.join('\n') : '');`
>
> `});`
>
> `let mergedText = 'AI 삼성무풍 시스템에어컨 배차실입니다.\n\n' + sections.join('\n\n');`
>
> `if (!roomKey) mergedText += '\n\n※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.';`
>
> `group.forEach(g => { g['발송멘트'] = mergedText; });`

답: 같은 단톡방이 있으면 `R_<방>`, 없으면 같은 인수자번호의 `P_<번호>`를 그룹 키로 삼아, 그룹 전체에 **한 개의 `mergedText`**를 지정한다. 이 함수에는 길이 검사나 분할이 없다.

### 1.2 화면 표시

`tools/legacy-gas/배차안내문자/Index.html:1245-1248`:

> `let renderList = filteredList.map(obj => ({...obj}));`
>
> `assembleMents(renderList);`

`tools/legacy-gas/배차안내문자/Index.html:1254-1273`:

> `let curMsg = renderList[i]['발송멘트'];`
>
> `...`
>
> `if (renderList[j]['발송멘트'] === curMsg && renderList[j]['단톡방'] === curRoom) {`
>
> `  msgSpan++;`
>
> `...`
>
> `renderList[i].msgSpan = msgSpan;`
>
> `renderList[j].hideMsg = true;`

`tools/legacy-gas/배차안내문자/Index.html:1302-1308`:

> `let msgHtml = item.hideMsg ? '' : \``
>
> `  <td contenteditable="true" ${item.msgSpan > 1 ? \`rowspan="${item.msgSpan}"\` : ''}>${item['발송멘트']}</td>`
>
> `  <td contenteditable="true" ${item.msgSpan > 1 ? \`rowspan="${item.msgSpan}"\` : ''}>${item['단톡방']}</td>`
>
> `\`;`

답: 병합 문구는 `배차결과` 표의 `발송멘트` 셀에 표시된다. 같은 병합 문구/단톡방의 연속 행은 `rowspan`으로 한 셀처럼 표시된다. 셀은 `contenteditable="true"`다.

### 1.3 복사

`tools/legacy-gas/배차안내문자/Index.html:880-914`:

> `document.addEventListener('copy', (e) => {`
>
> `...`
>
> `rowData.push(cell.innerText.replace(/\n$/, ''));`
>
> `...`
>
> `e.clipboardData.setData('text/plain', textLines.join('\n'));`
>
> `});`

`tools/legacy-gas/배차안내문자/Index.html:1515-1527`:

> `function copyTextToClipboard(text) {`
>
> `  if (!text) return;`
>
> `  let textArea = document.createElement('textarea');`
>
> `  textArea.value = text;`
>
> `...`
>
> `  try { document.execCommand('copy'); } catch (err) {}`
>
> `}`

`tools/legacy-gas/배차안내문자/Index.html:1553-1556`:

> `document.getElementById('ctxBtnCopy').addEventListener('click', () => {`
>
> `  let text = getSelectedText();`
>
> `  copyTextToClipboard(text);`
>
> `});`

답: 병합 문구가 들어간 표 셀은 일반 복사 이벤트 및 우클릭 복사 경로로 클립보드에 복사된다.

### 1.4 실제 발송 payload 여부

`tools/legacy-gas/배차안내문자/Code.js:444-460`:

> `var finalData = dedup.map(function(row){`
>
> `...`
>
> `  '라인': row['발송멘트'],`
>
> `...`
>
> `});`
>
> `return JSON.stringify({ status: 'success', data: finalData });`

`tools/legacy-gas/배차안내문자/Index.html:1364-1383`:

> `google.script.run`
>
> `  .withSuccessHandler(function(responseStr) {`
>
> `...`
>
> `    globalResultData = res.data.map(function(item, idx) { ... });`
>
> `    assembleMents(globalResultData);`
>
> `    renderResultTable();`
>
> `...`
>
> `  .processDispatchData(payload);`

답: 아니다. 서버가 반환한 `라인`을 브라우저가 병합하고 표에 렌더링한다. 병합 문구를 SMS provider에 전달하는 코드가 없다. 즉 병합 문구는 **화면 표시용이자 복사용**이며, 레거시 원문상 **실제 SMS 발송 payload가 아니다**.

## 2. 질문 2 — 실제 SMS 발송 지점과 길이 제한/분할

### 2.1 SMS 발송 지점

**레거시 원문에 SMS 발송 지점은 없다.**

화면에 존재하는 실행 버튼도 `tools/legacy-gas/배차안내문자/Index.html:309-313`에서 다음과 같다.

> `<h3 ...>배차결과 생성</h3>`
>
> `<button ... onclick="runProcess()">데이터 처리 실행</button>`

결과 표는 `tools/legacy-gas/배차안내문자/Index.html:323-330`에서 `인수자번호`, `발송멘트`, `단톡방`을 표시할 뿐 발송 버튼을 정의하지 않는다.

레거시 `Code.js`의 모든 `UrlFetchApp.fetch` 대상은 다음과 같이 Notion이다.

- 인증 조회: `tools/legacy-gas/배차안내문자/Code.js:25-43` — `https://api.notion.com/v1/databases/.../query`
- 저장: `tools/legacy-gas/배차안내문자/Code.js:487-509` — `https://api.notion.com/v1/pages`
- 저장내역 조회: `tools/legacy-gas/배차안내문자/Code.js:515-537`, `574-594` — Notion database query
- 단톡방/금지업체 조회: `tools/legacy-gas/배차안내문자/Code.js:610-629`, `652-671` — Notion database query

`Code.js`와 `Index.html`의 함수 및 외부 통신 호출을 전수 검색했으나 Aligo, SMS provider, 문자 앱 deep link, 전화 단말 API 호출은 없다.

### 2.2 길이 제한/분할

SMS에 적용되는 길이 제한 또는 분할은 **원문에 근거 없음**이다.

레거시에 존재하는 `2000` 분할은 SMS가 아니라 Notion 저장이다. `tools/legacy-gas/배차안내문자/Code.js:467-485`:

> `// 저장`
>
> `function saveHistoryToNotion(dataStr, email, name) {`
>
> `  try {`
>
> `    var max = 2000;`
>
> `...`
>
> `    arr1.push({ text: { content: p1.substring(i, i + max) } });`
>
> `...`
>
> `    arr2.push({ text: { content: p2.substring(j, j + max) } });`

이어지는 `tools/legacy-gas/배차안내문자/Code.js:487-509`는 이 조각들을 `저장내역1`, `저장내역2` Notion rich_text에 넣고 `https://api.notion.com/v1/pages`로 저장한다. 따라서 이 `2000`을 SMS 2,000자 분할 근거로 사용할 수 없다.

## 3. 질문 3 — 긴 그룹일 때 사용자는 몇 통을 받는가

**원문에서 판단 불가능하다.**

원문으로 확정 가능한 사실은 다음뿐이다.

1. 긴 그룹도 `assembleMents`가 하나의 `mergedText`를 만든다 (`Index.html:1179-1189`).
2. 그 문구는 결과표에서 하나의 병합 셀로 표시된다 (`Index.html:1254-1273`, `1302-1308`).
3. 사용자는 해당 셀을 복사할 수 있다 (`Index.html:880-914`, `1515-1527`, `1553-1556`).
4. 원문 내부에는 SMS 발송이 없다.

복사 이후 사용자가 어떤 외부 도구에 붙여 넣는지, 그 도구가 SMS/LMS를 어떻게 처리하는지, 최종 수신자가 몇 통을 받는지는 레거시 디렉터리 원문에 없다. 따라서 “1통”, “13통”, “자동 분할” 어느 것도 수신 통수 계약으로 확정할 수 없다.

## 4. 질문 4 — 우리 BE `@Size(max=2000)`의 기원

### 4.1 직접 기원

현행 배차 batch 제한은 `services/notification-service/src/main/java/com/samhanair/logis/notification/dto/DispatchBatchSendRequest.java:34-38`에 있다.

> `public record SendEntry(`
>
> `        @NotBlank String partnerCode,`
>
> `        @NotBlank @Size(max = 20) String recipientPhone,`
>
> `        @NotBlank @Size(max = 2000) String message,`
>
> `        @Size(max = 200) String chatRoomName) {`

git blame 결과 이 줄은 commit `0c512d5c85`(2026-05-10, `feat(notification-service): PR-E1 BE-4 배차안내 SMS batch 발송 — preview + send 2-step`)에서 추가됐다.

그러나 그보다 먼저 notification-service 초기 commit `bf19ca4cb7`(2026-05-07)에서 공용 DTO와 DB가 이미 2,000 **문자** 저장 계약을 만들었다.

`services/notification-service/src/main/java/com/samhanair/logis/notification/dto/NotificationSendRequest.java:37-41`:

> `@Size(max = 50) String templateCode,`
>
> `@Size(max = 200) String subject,`
>
> `@Size(max = 2000) String body,`

`services/notification-service/src/main/resources/db/migration/V1__init_notification.sql:27-30`:

> `template_code       VARCHAR(50),`
>
> `subject             VARCHAR(200),`
>
> `body                VARCHAR(2000),`
>
> `payload             JSONB,`

`services/notification-service/src/main/java/com/samhanair/logis/notification/domain/NotificationRequest.java:71-75`도 같은 저장 길이를 선언한다.

> `@Column(name = "subject", length = 200)`
>
> `private String subject;`
>
> `@Column(name = "body", length = 2000)`
>
> `private String body;`

따라서 배차 DTO의 2,000자 제한은 레거시 원문에서 온 것이 아니라, **우리 notification-service가 먼저 정한 공용 body DTO/DB의 `VARCHAR(2000)` 계약을 배차 batch에 적용한 것**이다.

### 4.2 알리고 API 제약 근거 여부

저장소에서 알리고 공식 제약을 입증하는 근거는 찾지 못했다.

`services/notification-service/src/main/java/com/samhanair/logis/notification/service/MessageTemplateService.java:23-25`에는 다음 자체 설명이 있다.

> `SMS 본문 길이 가드 — 한글 SMS 90byte / LMS 2000byte. 본 템플릿은 LMS 발송 전제로 truncate`
>
> `정책 운용 ... 호출 측 (DispatchBatchSendService) 이 SMS/LMS 분기를 결정.`

하지만 이 주석은 공식 문서 URL·알리고 오류코드·API schema를 인용하지 않는다. 실제 adapter인 `services/notification-service/src/main/java/com/samhanair/logis/notification/adapter/sms/AligoSmsAdapter.java:63-81`은 본문을 그대로 `msg`에 넣을 뿐 길이 검사나 분할을 하지 않는다.

> `String message = request.getBody() == null ? "" : request.getBody();`
>
> `...`
>
> `form.add("msg", message);`
>
> `...`
>
> `client.post().uri(SEND_PATH)...body(form)...`

또한 `@Size(max=2000)`은 Java 문자열 **문자 수** 제한이고, 위 주석은 `2000byte`라고 적어 단위도 일치하지 않는다.

판정: 저장소 증거만으로는 `@Size(max=2000)`을 알리고 API의 강제 제약이라고 볼 수 없다. 확인 가능한 기원은 우리 DTO/DB 설계다. “LMS 2000byte”가 외부 공급자 사양이라는 공식 근거는 **원문 및 저장소에 근거 없음**이다.

## 5. 현행 13 entry 분할의 계승 여부

현행 `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:79-115`는 같은 번호별 entry 배열을 만들고, 합친 문자열이 2,000자를 넘으면 새 entry를 추가한다.

> `const entriesByRecipient = new Map<string, DispatchSmsSendEntry[]>()`
>
> `const maxMessageLength = 2000`
>
> `...`
>
> `const candidate = \`${existing.message}\n\n${message}\``
>
> `if (candidate.length <= maxMessageLength) {`
>
> `  existing.message = candidate`
>
> `} else {`
>
> `  recipientEntries.push({ ... message })`

그리고 `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx:318-324`에서 이 entry 전체를 실제 send endpoint로 보낸다.

> `const entries = buildSendEntries(preview, edited)`
>
> `return await sendDispatchBatch(date, entries)`

이는 레거시의 다음 두 불변식과 다르다.

- 레거시: 그룹당 하나의 `mergedText`; 현행: 2,000자를 넘으면 그룹 하나를 여러 entry로 분할.
- 레거시: 화면 표시·복사; 현행: entry마다 실제 SMS endpoint 호출.

따라서 **현행 13 entry 분할은 계승이 아니다.** 13이라는 수 자체와 2,000자 기준 자동 다통 발송 모두 레거시 원문에 근거가 없다.

## 6. 계승 기준으로 맞는 방향

레거시 원문으로 확정 가능한 범위에서 맞는 방향은 다음이다.

1. 동일 단톡방 또는 동일 인수자번호 그룹을 하나로 묶는다.
2. 하차일별 section을 합쳐 그룹당 하나의 병합 문구를 만든다.
3. 그 문구를 결과 화면의 한 병합 셀로 표시하고 편집·복사 가능하게 한다.
4. 레거시 계승 범위에서는 자동 SMS를 발송하지 않는다.

자동 SMS 기능을 유지할지는 별도 제품 결정이다. 유지한다면 다음 정책은 레거시에서 답을 얻을 수 없으므로 PM이 명시해야 한다.

- 긴 문구를 거부할지, 자를지, 여러 SMS/LMS로 보낼지.
- 문자 수와 UTF-8 byte 중 어느 기준을 적용할지.
- 여러 통이면 수신 순서·통수 안내·과금·실패 원자성을 어떻게 정의할지.
- Aligo 실제 API의 채널별 공식 제한을 어떤 문서/계약으로 채택할지.

## 7. 원문에 근거가 없는 항목

- 레거시의 실제 SMS provider 또는 SMS 발송 endpoint.
- 레거시가 병합 문구를 자동 SMS payload로 사용한다는 주장.
- 레거시의 SMS/LMS 길이 제한.
- 레거시의 긴 메시지 자동 분할 또는 다통 발송.
- 긴 그룹의 최종 수신 통수.
- 2,000자마다 나누는 정책 및 13통이라는 결과.
- `@Size(max=2000)`이 알리고 공식 API 제약이라는 주장.
- 복사 이후 사용자가 사용한 외부 발송 도구와 그 도구의 분할 동작.

## 8. 새 파일 경로

- `docs/dev-reports/2026-08-02-1013-r10-legacy-send-contract.md`
