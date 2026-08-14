package com.samhanair.logis.auth.claude;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Claude 대화의 질문과 외부 전송 범위를 보존하는 감사 로그. UUID는 내부 저장 전용이다. */
@Entity
@Table(name = "claude_conversation_audits")
public class ClaudeConversationAudit extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "account_id")
    private UUID accountId;

    @Column(name = "question", nullable = false, columnDefinition = "TEXT")
    private String question;

    @Column(name = "outbound_payload", nullable = false, columnDefinition = "TEXT")
    private String outboundPayload;

    @Column(name = "outbound_status", nullable = false, length = 40)
    private String outboundStatus;

    @Column(name = "session_code", length = 40)
    private String sessionCode;

    protected ClaudeConversationAudit() {}

    /** 외부로 실제 나간 payload의 범위를 기록한다. 미설정 상태는 예정 payload를 기록한다. */
    public static ClaudeConversationAudit record(
            UUID accountId, String question, String outboundPayload, String outboundStatus) {
        return record(accountId, null, question, outboundPayload, outboundStatus);
    }

    public static ClaudeConversationAudit record(
            UUID accountId, String sessionCode, String question, String outboundPayload, String outboundStatus) {
        ClaudeConversationAudit audit = new ClaudeConversationAudit();
        audit.accountId = accountId;
        audit.sessionCode = sessionCode;
        audit.question = question;
        audit.outboundPayload = outboundPayload;
        audit.outboundStatus = outboundStatus;
        return audit;
    }
}
