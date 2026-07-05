# #26 ChatRoomMappingClient 404 fix — 단톡방 이름 URL 정정 (fix/26-chatroom-mapping-url)

> #720 BE sweep 적발(MED). accounting ChatRoomMappingClient가 존재하지 않는 URL 호출→상시 404→fail-soft(단톡방 이름 '-'). 기능 무력화(크래시 아님).

## 근본원인
- `services/accounting-service/.../client/ChatRoomMappingClient.java:64` — `GET /admin/notifications/chat-room-mappings/by-partner/{partnerCode}` 호출.
- notification-service 실 라우트: `ChatRoomMappingAdminController`=`/api/v1/notification/admin/chat-rooms`(admin·JWT/permission)·`NotificationChatRoomInternalController`=`/internal/notification/admin/chat-rooms?partnerCode=`(internal·X-Internal-Token). **어느 것과도 불일치** → 404 → `catch(404) return List.of()`(fail-soft) → `LedgerImageService`/`StatementBatchService` 단톡방 이름 상시 '-'.
- **은폐**: ChatRoomMappingClientTest 부재·소비 IT @MockBean.
- **올바른 선례**: `slip-service NotificationChatRoomClient` (동일 목적·서비스간)이 올바른 route 호출.

## 결정
- **D1 URL 정정**: ChatRoomMappingClient를 서비스간 internal route `/internal/notification/admin/chat-rooms?partnerCode=...`로 정정(X-Internal-Token 경유). ⚠️slip NotificationChatRoomClient의 **실제 `.uri()` 경로(internal vs /api/v1)·인증(X-Internal-Token)·응답 파싱(chat_room_name 추출)**을 정확 대조해 미러(Javadoc 아닌 실 코드 기준).

## 요구
1. `ChatRoomMappingClient` URL을 slip NotificationChatRoomClient 실 경로로 정정·X-Internal-Token 헤더(필요 시)·응답 shape 파싱 정합(chat_room_name/partnerBusinessName 등).
2. **MockRestServiceServer 계약 테스트** 신설: 올바른 URI·X-Internal-Token·partnerCode 쿼리·응답 파싱 단언(@MockBean 우회 금지·[[feedback_restclient_contract_test_false_green]]). RED(구 URL)→GREEN.
3. fail-soft 유지(404/오류 시 empty·크래시 금지)는 그대로.

## 함정
- internal(`/internal/`·X-Internal-Token·InternalTokenFilter) vs admin(`/api/v1/`·JWT) 라우트 구분 — 서비스간이므로 internal.
- slip NotificationChatRoomClient **실 코드**(Javadoc line 24는 `/api/v1/`라 적혔으나 실 .uri() 확인 필수) 대조.
- 응답 필드 스네이크(chat_room_name) vs DTO.
- [[feedback_it_mockbean_external_clients]].

## 검증
- BE: accounting+notification 모듈 test·계약 RED→GREEN.
- 라이브 QA(가능 시): 단톡방 매핑 존재 거래처의 원장/명세서에서 **단톡방 이름 실표시**('-' 아님) 실증. 스샷 2곳.
