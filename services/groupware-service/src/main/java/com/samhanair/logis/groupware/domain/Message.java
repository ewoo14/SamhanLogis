package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 메신저 단건 (1:1). 송신자 → 수신자 본문 + 읽음 여부.
 *
 * <p>발송 시점 status=UNREAD. 수신자가 열람 호출 시 READ + readAt 적재.
 * 그룹/단체 메신저는 본 entity 다중 row 발행으로 표현 (수신자 1명 = row 1건).
 */
@Entity
@Getter
@Table(name = "messages")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Message extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "sender_id", nullable = false, updatable = false)
    private UUID senderId;

    @Column(name = "recipient_id", nullable = false, updatable = false)
    private UUID recipientId;

    /** room 승계 이후의 내부 방 FK. 기존 메신저 행은 migration 후 채워진다. */
    @Column(name = "room_id")
    private UUID roomId;

    /** 방 안에서 단조 증가하는 표시 순서. */
    @Column(name = "sequence_no")
    private Long sequence;

    /** 복수 수신 발송 묶음 식별자. 기존 단건 발송은 null이다. */
    @Column(name = "batch_id", updatable = false)
    private UUID batchId;

    @Column(name = "body", nullable = false, length = 2000)
    private String body;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private MessageStatus status;

    @Column(name = "sent_at", nullable = false, updatable = false)
    private LocalDateTime sentAt;

    @Column(name = "read_at")
    private LocalDateTime readAt;

    private Message(UUID senderId, UUID recipientId, String body, UUID batchId) {
        if (senderId == null || recipientId == null) {
            throw new IllegalArgumentException("senderId / recipientId 필수");
        }
        if (senderId.equals(recipientId)) {
            throw new IllegalArgumentException("자기 자신에게 메신저를 보낼 수 없습니다");
        }
        if (body == null || body.isBlank()) {
            throw new IllegalArgumentException("body 필수");
        }
        this.senderId = senderId;
        this.recipientId = recipientId;
        this.batchId = batchId;
        this.body = body;
        this.status = MessageStatus.UNREAD;
        this.sentAt = LocalDateTime.now();
    }

    /**
     * 신규 메신저 발송. status=UNREAD, sentAt=now.
     */
    public static Message send(UUID senderId, UUID recipientId, String body) {
        return new Message(senderId, recipientId, body, null);
    }

    /** 복수 수신 메신저 발송. 수신자별 1행이며 같은 batchId를 공유한다. */
    public static Message send(UUID senderId, UUID recipientId, String body, UUID batchId) {
        return new Message(senderId, recipientId, body, batchId);
    }

    public static Message sendInRoom(UUID roomId, long sequence, UUID senderId, UUID recipientId, String body) {
        Message message = new Message(senderId, recipientId, body, null);
        message.roomId = roomId;
        message.sequence = sequence;
        return message;
    }

    /** 수신자가 열람 호출. UNREAD → READ + readAt 적재. 이미 READ 상태면 idempotent (no-op). */
    public void markRead(UUID actorUserId) {
        if (!this.recipientId.equals(actorUserId)) {
            throw new IllegalStateException("수신자 본인만 읽음 처리할 수 있습니다");
        }
        if (this.status == MessageStatus.READ) {
            return;
        }
        this.status = MessageStatus.READ;
        this.readAt = LocalDateTime.now();
    }
}
