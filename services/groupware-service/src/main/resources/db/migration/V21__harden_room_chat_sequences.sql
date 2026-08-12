-- #894 fix1: 재기동·동시 요청에도 방 코드와 메시지 순서를 저장소가 보장한다.
CREATE SEQUENCE chat_room_code_seq;
WITH current_max AS (
    SELECT MAX(CAST(split_part(room_code, '-', 3) AS BIGINT)) AS value FROM chat_rooms
    WHERE room_code LIKE 'CHAT-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%'
)
SELECT setval('chat_room_code_seq', COALESCE(value, 1), value IS NOT NULL) FROM current_max;

ALTER TABLE messages ADD CONSTRAINT ux_messages_room_sequence UNIQUE (room_id, sequence_no);
