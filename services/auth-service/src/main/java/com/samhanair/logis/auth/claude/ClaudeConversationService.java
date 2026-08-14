package com.samhanair.logis.auth.claude;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.UUID;
import java.util.List;
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
    private final ClaudeConversationSessionRepository sessionRepository;
    private final ClaudeConversationAuditRepository auditRepository;

    /** 권한을 확인한 뒤 감사 가능한 서버 세션을 만든다. */
    @Transactional
    public ClaudeConversationSession createSession(UUID accountId) {
        String code;
        do {
            code = "CLD-" + java.time.LocalDate.now().toString().replace("-", "") + "-" +
                    String.format("%06d", java.util.concurrent.ThreadLocalRandom.current().nextInt(1_000_000));
        } while (sessionRepository.findBySessionCodeAndAccountIdAndIsDeletedFalse(code, accountId).isPresent());
        ClaudeConversationSession session = ClaudeConversationSession.create(accountId, code);
        if (!properties.isConfigured() && !modelClient.isVirtual()) {
            session.markCredentialUnavailable();
        } else if (modelClient.isVirtual()) {
            session.recordQuestion("가상 Claude 세션", true);
        }
        return sessionRepository.save(session);
    }

    /** 호출자 소유의 세션만 반환하며 내부 UUID는 DTO 변환 전에 버린다. */
    @Transactional(readOnly = true)
    public List<com.samhanair.logis.auth.web.dto.ClaudeSessionResponse> listSessions(UUID accountId) {
        return sessionRepository.findAllByAccountIdAndIsDeletedFalseOrderByCreatedAtDesc(accountId).stream()
                .map(session -> new com.samhanair.logis.auth.web.dto.ClaudeSessionResponse(
                        session.getSessionCode(), session.getTitle(), auditRepository.countBySessionCode(session.getSessionCode()),
                        session.getLastMessage(), session.getLastMessageAt(), session.getSummaryMode()))
                .toList();
    }

    /** 질문을 감사 기록 후 자격 경계에서 처리한다. 도구 호출은 수행하지 않는다. */
    @Transactional
    public String ask(UUID accountId, String question) {
        return ask(accountId, null, question);
    }

    /** 세션 소유권을 확인한 Claude 질문 처리. */
    @Transactional
    public String ask(UUID accountId, String sessionCode, String question) {
        if (sessionCode != null && sessionRepository.findBySessionCodeAndAccountIdAndIsDeletedFalse(sessionCode, accountId).isEmpty()) {
            auditRecorder.record(accountId, sessionCode, redactInternalIdentifiers(question),
                    "question=" + redactInternalIdentifiers(question) + "; apiResponses=[]", "DENIED_SESSION_OWNER");
            throw new BusinessException(ErrorCode.NOT_FOUND, "Claude 세션을 찾을 수 없습니다.");
        }
        String safeQuestion = redactInternalIdentifiers(question);
        String outboundPayload = "question=" + safeQuestion + "; apiResponses=[]";
        if (!properties.isConfigured() && !modelClient.isVirtual()) {
            auditRecorder.record(accountId, sessionCode, safeQuestion, outboundPayload, "NOT_SENT");
            throw new BusinessException(
                    ErrorCode.CLAUDE_CREDENTIAL_NOT_CONFIGURED,
                    "Claude 자격이 설정되지 않았습니다. ANTHROPIC_API_KEY를 주입한 뒤 다시 시도해주세요.");
        }
        if (sessionCode != null) {
            ClaudeModelResult result = modelClient.askWithSummary(safeQuestion);
            sessionRepository.findBySessionCodeAndAccountIdAndIsDeletedFalse(sessionCode, accountId)
                    .ifPresent(session -> session.recordSummary(result.summary(), safeQuestion, modelClient.isVirtual()));
            auditRecorder.record(accountId, sessionCode, safeQuestion, outboundPayload,
                    modelClient.isVirtual() ? "VIRTUAL_SENT" : "SENT");
            return result.answer();
        }
        auditRecorder.record(accountId, sessionCode, safeQuestion, outboundPayload,
                modelClient.isVirtual() ? "VIRTUAL_SENT" : "SENT");
        return modelClient.ask(safeQuestion);
    }

    /** 권한·토큰·세션 검증으로 거부된 시도를 독립 감사 트랜잭션에 남긴다. */
    public void recordDenied(UUID accountId, String sessionCode, String reason) {
        auditRecorder.record(accountId, sessionCode, "[REDACTED]",
                "question=[REDACTED]; apiResponses=[]", "DENIED_" + reason);
    }

    private String redactInternalIdentifiers(String question) {
        return question.replaceAll(
                "(?i)\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b",
                "[내부식별자]");
    }
}
