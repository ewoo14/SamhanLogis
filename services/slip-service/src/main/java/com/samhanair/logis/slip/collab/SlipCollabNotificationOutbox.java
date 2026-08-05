package com.samhanair.logis.slip.collab;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 커밋된 협업 수정 알림의 durable outbox row. */
@Entity
@Table(name = "slip_collab_notification_outbox")
@SQLRestriction("is_deleted = false")
public class SlipCollabNotificationOutbox extends BaseEntity {
    public enum Status { PENDING, SENDING, SENT }

    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;
    @Column(name = "slip_id", nullable = false) private UUID slipId;
    @Column(name = "editor_id", nullable = false) private UUID editorId;
    @Column(name = "raw_recipient", nullable = false, length = 255) private String rawRecipient;
    @Column(name = "subject", nullable = false, length = 200) private String subject;
    @Column(name = "body", nullable = false, length = 2000) private String body;
    @Column(name = "fingerprint", nullable = false, unique = true, length = 64) private String fingerprint;
    @Enumerated(EnumType.STRING) @Column(name = "status", nullable = false, length = 20)
    private Status status = Status.PENDING;
    @Column(name = "attempts", nullable = false) private int attempts;
    @Column(name = "next_attempt_at", nullable = false) private LocalDateTime nextAttemptAt = LocalDateTime.now();

    protected SlipCollabNotificationOutbox() { }

    private SlipCollabNotificationOutbox(UUID slipId, UUID editorId, String rawRecipient,
                                         String subject, String body) {
        this.slipId = slipId; this.editorId = editorId; this.rawRecipient = rawRecipient;
        this.subject = subject; this.body = body;
        this.fingerprint = fingerprint(slipId, editorId, rawRecipient, subject, body);
    }

    public static SlipCollabNotificationOutbox create(UUID slipId, UUID editorId,
                                                       String rawRecipient, String subject, String body) {
        return new SlipCollabNotificationOutbox(slipId, editorId, rawRecipient, subject, body);
    }

    public static String fingerprint(UUID slipId, UUID editorId, String rawRecipient,
                                     String subject, String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String value = String.join("\u0000", slipId.toString(), editorId.toString(), rawRecipient, subject, body);
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("알림 fingerprint 생성 실패", ex);
        }
    }

    public UUID getId() { return id; }
    public UUID getEditorId() { return editorId; }
    public String getRawRecipient() { return rawRecipient; }
    public String getSubject() { return subject; }
    public String getBody() { return body; }
    public void markSending() { status = Status.SENDING; nextAttemptAt = LocalDateTime.now().plusSeconds(30); }
    public void markSent() { status = Status.SENT; }
    public void markRetry() { status = Status.PENDING; attempts++; nextAttemptAt = LocalDateTime.now().plusSeconds(Math.min(60L, 1L << Math.min(attempts, 6))); }
}
