# 2026-07-05 — #26 ChatRoomMappingClient 404 fix (PR #735)

> #720 월마감 fix의 BE 동종 sweep가 적발(MED). accounting ChatRoomMappingClient가 존재하지 않는 URL 호출→상시 404→fail-soft(단톡방 이름 '-').

## 근본원인
- `ChatRoomMappingClient.java:64`가 `GET /admin/notifications/chat-room-mappings/by-partner/{partnerCode}`(notification 어디에도 미매핑·grep 0) 호출 → 상시 404 → `catch(404) return List.of()`(fail-soft) → `LedgerImageService`/`StatementBatchService` 단톡방 이름 상시 '-'.
- 은폐: ChatRoomMappingClientTest 부재·소비 IT @MockBean.
- 올바른 선례: slip NotificationChatRoomClient가 올바른 internal route 호출.

## fix
- URL → `/internal/notification/admin/chat-rooms?partnerCode=`(NotificationChatRoomInternalController·X-Internal-Token→InternalTokenFilter→hasRole MASTER·slip 선례 실 .uri() 미러). fail-soft 유지.
- ChatRoomMappingClientTest 신설(MockRestServiceServer·URI+X-Internal-Token+partnerCode+chatRoomName 파싱+404 fallback). 리뷰 fix로 blank-token zero-expectation server.verify()+5xx/연결예외 fail-soft 케이스 강화.

## 리뷰 (실행=게시 1:1·표·Codex 라운드도 라이브 QA)
Opus 5-agent R1(BE 0·FE 0·DevOps 0·Design 0·QA 0·비차단 LOW 3)+fix(테스트 강화) ↔ Codex 순차 라운드(코드 0·라이브 QA disposition) → 0수렴.

## 검증
- BE: accounting 1127·notification 213 **0 fail**. 계약 RED→GREEN(URL 되돌림 2 fail 실증)·가드 삭제→blank FAIL(genuine).
- **라이브 QA = 정직 disposition**: 컨테이너 stale(notification 이미지가 route 도입 전) + **데이터 갭**(partner_chat_room_mappings 112건 전량 LEGACY-NAME placeholder·partner_db 실 partner 0/112 매칭·code-only lookup) → 실 단톡방 이름 표시가 어떤 거래처로도 불가 → 가짜 캡처 금지·계약테스트+코드레벨 라우트 존재로 갈음. Codex 라운드 라이브 QA도 동일 disposition(sandbox·데이터 갭).

## 후속/별건
- **단톡방 매핑 데이터 갭(#28)**: partner_chat_room_mappings가 실 partner code와 미연결(NOTION_IMPORT LEGACY placeholder) → URL fix 후에도 실 표시 위해선 매핑↔partner 재연결 필요(별도 데이터/import 슬라이스).
- print view(PartnerLedgerView/StatementBatchView) mock 미연결(PR-E2 FE 후속)·다건 구분자 불일치(' / ' vs ', ')=별건.

## 교훈
- **서비스간 client URL은 실 수신 컨트롤러와 계약 테스트로 고정**([[feedback_restclient_contract_test_false_green]]) — Test 부재+@MockBean이 404를 은폐. slip 선례는 Javadoc(낡음)이 아닌 실 .uri() 기준 미러.
