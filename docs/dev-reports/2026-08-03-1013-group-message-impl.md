# 이슈 #1013 하차일별 그룹 문구 생성기 구현 보고서

## 작업 로그

- 2026-08-03: `git pull` 실행. 결과: Already up to date.
- 2026-08-03: 레거시 GAS 원본과 계획 문서에서 하차일별 그룹 문구 사양을 확인하는 중.

## ① 레거시 사양 원문

출처: `tools/legacy-gas/배차안내문자/Index.html:1154-1188`

```javascript
1154:        let roomKey = String(row['단톡방'] || '').trim();
1155:        let phoneKey = String(row['인수자번호'] || '').trim();
1156:        let key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + ai);
...
1168:        let group = list.slice(ai, aj);
...
1170:        let dayOrder = [];
1171:        let dayLines = {};
1172:        group.forEach(g => {
1173:          let dk = String(g['하차일']);
1174:          if (!dayLines[dk]) { dayLines[dk] = []; dayOrder.push(dk); }
1175:          if (g['라인']) dayLines[dk].push(g['라인']);
1176:        });
1177:        dayOrder.sort((a, b) => Number(a) - Number(b));
...
1179:        let sections = dayOrder.map(dk => {
1180:          let sub = dk + '일 하차 건 배송기사님 연락처를 안내드립니다.';
1181:          let ls = dayLines[dk];
1182:          return sub + (ls.length ? '\\n' + ls.join('\\n') : '');
1183:        });
1185:        let mergedText = 'AI 삼성무풍 시스템에어컨 배차실입니다.\\n\\n' + sections.join('\\n\\n');
1186:        if (!roomKey) mergedText += '\\n\\n※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.';
1188:        group.forEach(g => { g['발송멘트'] = mergedText; });
```

계획/기존 parity 기준도 `docs/dev-reports/2026-08-03-1013-r12-fix.md:19-27`에 동일하게 기록되어 있다. 따라서 구현 기준은 다음으로 고정한다: 단톡방 우선, 없으면 인수자번호, 둘 다 없으면 전표별 그룹; 그룹 안에서 하차일을 숫자 오름차순 section으로 만들고 각 section의 라인을 줄바꿈으로 연결; section 사이 빈 줄 1개; 단톡방 없는 그룹에는 끝에 지연 안내를 추가한다. 오류 행은 레거시 루프의 단독 처리(`Index.html:1149-1152`)를 보존한다.

## ② 설계 요약

- 입력 DTO: `DispatchMessageGroupInput(entryKey, chatRoomName, recipientPhone, unloadDay, displayLine, fallbackMessage)`.
- 그룹핑: 단톡방 `R_` → 인수자번호 `P_` → 전표별 `N_`; fallback 오류 행은 독립 문구로 보존한다.
- 문구: 하차일 `TreeMap` 숫자 정렬 → section 머리말과 배송기사 라인 조립 → 공통 header 및 미매핑 지연 안내 추가.
- 호환: 기존 전표별 `[배차안내]` `message`는 유지하고 `groupMessage`만 화면 표시·복사에 사용한다.

## ③ 구현한 파일

PM 선행 커밋 `d25ade812`에 구현이 이미 포함되어 있음을 확인했다.

- `services/notification-service/src/main/java/com/samhanair/logis/notification/dto/DispatchMessageGroupInput.java`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchMessageGroupComposer.java`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchPreviewService.java`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/client/OutboundSlipDto.java`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/client/RestClientSlipServiceClient.java`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/dto/DispatchBatchPreviewResponse.java`
- `clients/desktop/src/renderer/api/dispatchSmsApi.ts`
- `clients/desktop/src/renderer/routes/DispatchSmsPage.tsx`

현재 세션에서는 동일 생산 코드를 중복 변경하지 않고 사양 일치와 회귀를 검증했다.

## ④ 검증(테스트 원문)

실행 명령:

```powershell
.\gradlew.bat :services:notification-service:test --tests com.samhanair.logis.notification.service.DispatchMessageGroupComposerTest --tests com.samhanair.logis.notification.service.DispatchBatchPreviewServiceTest --tests com.samhanair.logis.notification.client.RestClientSlipServiceClientTest --no-parallel
```

결과 원문 요약: `BUILD SUCCESSFUL in 16s`.

```powershell
cd clients/desktop
npm test -- --run src/renderer/routes/DispatchSmsPage.test.ts src/renderer/routes/dispatchSmsClipboard.test.ts src/renderer/routes/scopeADisplayOnly.contract.test.ts
```

결과 원문: `Test Files 3 passed (3)`, `Tests 9 passed (9)`.

자동 SMS 부재도 scoped production source에서 `/admin/notifications/dispatch-batch/send` 참조가 없고, `scopeADisplayOnly.contract.test.ts:15`가 해당 부재를 계속 고정하는 것으로 확인했다.

## ⑤ 기존 화면 회귀 확인

- 라우트는 `clients/desktop/src/renderer/routes/index.tsx:1024-1027`의 `/arologis/dispatch-sms`와 기존 `PermissionGuard`를 유지한다.
- 화면은 `DispatchSmsPage.tsx:444`에서 mapped `groupMessage`, `:475`에서 unmapped `groupMessage`를 textarea에 표시하고, `:211-218`에서 복사 payload에도 편집값/그룹 문구를 사용한다.
- 위 데스크톱 3개 테스트가 모두 통과해 기존 배차안내 화면의 테스트 렌더·표시·복사 경로가 막히지 않았음을 확인했다. 라이브 QA와 Docker는 요청대로 실행하지 않았다.

## ⑥ 새로 만든 파일 목록

- `docs/dev-reports/2026-08-03-1013-group-message-impl.md` (본 보고서)
