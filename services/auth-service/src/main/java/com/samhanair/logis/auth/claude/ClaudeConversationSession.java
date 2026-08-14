package com.samhanair.logis.auth.claude;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Claude 대화 세션. 내부 UUID는 저장 전용이며 sessionCode만 클라이언트 계약에 사용한다. */
@Entity
@Table(name = "claude_conversation_sessions")
public class ClaudeConversationSession extends BaseEntity {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "account_id", nullable = false) private UUID accountId;
    @Column(name = "session_code", nullable = false, unique = true, length = 40) private String sessionCode;
    @Column(name = "title", nullable = false, length = 120) private String title;

    protected ClaudeConversationSession() {}

    public static ClaudeConversationSession create(UUID accountId, String sessionCode) {
        ClaudeConversationSession session = new ClaudeConversationSession();
        session.accountId = accountId;
        session.sessionCode = sessionCode;
        session.title = "새 대화";
        return session;
    }

    public UUID getAccountId() { return accountId; }
    public String getSessionCode() { return sessionCode; }
    public String getTitle() { return title; }
}
