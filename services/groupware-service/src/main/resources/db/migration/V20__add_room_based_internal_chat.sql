-- #894 S2: 기존 messages를 1:1 room으로 승계한다. 기존 메신저 API/컬럼은 호환을 위해 유지한다.
CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY,
    room_code VARCHAR(32) NOT NULL UNIQUE,
    type VARCHAR(16) NOT NULL,
    room_name VARCHAR(120),
    created_by_user_id UUID NOT NULL,
    direct_pair_key VARCHAR(80) UNIQUE,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE chat_room_participants (
    id UUID PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES chat_rooms(id),
    user_id UUID NOT NULL,
    owner BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMP NOT NULL,
    left_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    modified_at TIMESTAMP,
    modified_by VARCHAR(50),
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(50),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ux_chat_room_participant UNIQUE (room_id, user_id)
);

ALTER TABLE messages ADD COLUMN room_id UUID;
ALTER TABLE messages ADD COLUMN sequence_no BIGINT;
ALTER TABLE messages ADD CONSTRAINT fk_messages_chat_room FOREIGN KEY (room_id) REFERENCES chat_rooms(id);

-- 같은 송수신자 pair는 하나의 DIRECT room으로 승계한다.
WITH pairs AS (
    SELECT DISTINCT LEAST(sender_id, recipient_id)::text || ':' || GREATEST(sender_id, recipient_id)::text AS pair_key,
           MIN(sent_at) AS first_sent_at
    FROM messages WHERE is_deleted = FALSE GROUP BY 1
), numbered AS (
    SELECT pair_key, ROW_NUMBER() OVER (ORDER BY first_sent_at, pair_key) AS n FROM pairs
)
INSERT INTO chat_rooms (id, room_code, type, created_by_user_id, direct_pair_key,
                        created_at, created_by, is_deleted)
SELECT gen_random_uuid(), 'CHAT-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(n::text, 6, '0'),
       'DIRECT', split_part(pair_key, ':', 1)::uuid, pair_key,
       CURRENT_TIMESTAMP, 'migration', FALSE
FROM numbered;

INSERT INTO chat_room_participants (id, room_id, user_id, owner, joined_at, created_at, created_by, is_deleted)
SELECT gen_random_uuid(), r.id, u.user_id, u.user_id = r.created_by_user_id, r.created_at, r.created_at, 'migration', FALSE
FROM chat_rooms r
JOIN LATERAL (VALUES (split_part(r.direct_pair_key, ':', 1)::uuid), (split_part(r.direct_pair_key, ':', 2)::uuid)) u(user_id) ON TRUE;

UPDATE messages m SET room_id = r.id
FROM chat_rooms r
WHERE r.direct_pair_key = LEAST(m.sender_id, m.recipient_id)::text || ':' || GREATEST(m.sender_id, m.recipient_id)::text;

WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY sent_at, id) AS n
    FROM messages WHERE room_id IS NOT NULL
)
UPDATE messages m SET sequence_no = ordered.n FROM ordered WHERE ordered.id = m.id;

CREATE INDEX ix_chat_room_participants_user_active ON chat_room_participants(user_id) WHERE is_deleted = FALSE AND left_at IS NULL;
CREATE INDEX ix_messages_room_sequence_active ON messages(room_id, sequence_no DESC) WHERE is_deleted = FALSE;

CREATE TABLE chat_message_reads (
    message_id UUID NOT NULL REFERENCES messages(id),
    participant_user_id UUID NOT NULL,
    read_at TIMESTAMP NOT NULL,
    PRIMARY KEY (message_id, participant_user_id)
);
