package com.samhanair.logis.auth.claude;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import java.time.LocalDateTime;

/** Claude 대화 세션. 내부 UUID는 저장 전용이며 sessionCode만 클라이언트 계약에 사용한다. */
@Entity
@Table(name = "claude_conversation_sessions")
public class ClaudeConversationSession extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "account_id", nullable = false) private UUID accountId;
    @Column(name = "session_code", nullable = false, unique = true, length = 40) private String sessionCode;
    @Column(name = "title", nullable = false, length = 120) private String title;
    @Column(name = "last_message", columnDefinition = "TEXT") private String lastMessage;
    @Column(name = "last_message_at") private LocalDateTime lastMessageAt;
    @Column(name = "summary_mode", nullable = false, length = 32) private String summaryMode;

    protected ClaudeConversationSession() {}

    public static ClaudeConversationSession create(UUID accountId, String sessionCode) {
        ClaudeConversationSession session = new ClaudeConversationSession();
        session.accountId = accountId;
        session.sessionCode = sessionCode;
        session.title = "Claude 세션";
        session.summaryMode = "REAL";
        return session;
    }

    /** 질문 시 한 번만 저장하는 목록용 요약과 마지막 메시지. 목록 조회에서는 모델을 호출하지 않는다. */
    public void recordQuestion(String question, boolean virtual) {
        String normalized = question == null ? "" : question.trim().replaceAll("\\s+", " ");
        this.title = normalized.length() <= 120 ? normalized : normalized.substring(0, 117) + "...";
        this.lastMessage = normalized;
        this.lastMessageAt = LocalDateTime.now();
        this.summaryMode = virtual ? "VIRTUAL" : "REAL";
    }

    public void markCredentialUnavailable() {
        this.summaryMode = "CREDENTIAL_UNAVAILABLE";
    }

    public UUID getAccountId() { return accountId; }
    public String getSessionCode() { return sessionCode; }
    public String getTitle() { return title; }
    public String getLastMessage() { return lastMessage; }
    public LocalDateTime getLastMessageAt() { return lastMessageAt; }
    public String getSummaryMode() { return summaryMode; }
}
