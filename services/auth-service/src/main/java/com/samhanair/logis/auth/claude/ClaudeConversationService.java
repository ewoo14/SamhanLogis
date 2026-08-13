package com.samhanair.logis.auth.claude;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Claude 대화의 권한 이후 흐름과 자격 주입 경계를 관리한다. */
@Service
@RequiredArgsConstructor
public class ClaudeConversationService {

    private final ClaudeCredentialProperties properties;
    private final ClaudeModelClient modelClient;
    private final ClaudeConversationAuditRecorder auditRecorder;

    /** 질문을 감사 기록 후 자격 경계에서 처리한다. 도구 호출은 수행하지 않는다. */
    @Transactional
    public String ask(UUID accountId, String question) {
        String safeQuestion = redactInternalIdentifiers(question);
        String outboundPayload = "question=" + safeQuestion + "; apiResponses=[]";
        if (!properties.isConfigured()) {
            auditRecorder.record(accountId, safeQuestion, outboundPayload, "NOT_SENT");
            throw new BusinessException(
                    ErrorCode.CLAUDE_CREDENTIAL_NOT_CONFIGURED,
                    "Claude 자격이 설정되지 않았습니다. ANTHROPIC_API_KEY를 주입한 뒤 다시 시도해주세요.");
        }
        auditRecorder.record(accountId, safeQuestion, outboundPayload, "SENT");
        return modelClient.ask(safeQuestion);
    }

    private String redactInternalIdentifiers(String question) {
        return question.replaceAll(
                "(?i)\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b",
                "[내부식별자]");
    }
}
