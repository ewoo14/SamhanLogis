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
        return sessionRepository.save(ClaudeConversationSession.create(accountId, code));
    }

    /** 호출자 소유의 세션만 반환하며 내부 UUID는 DTO 변환 전에 버린다. */
    @Transactional(readOnly = true)
    public List<com.samhanair.logis.auth.web.dto.ClaudeSessionResponse> listSessions(UUID accountId) {
        return sessionRepository.findAllByAccountIdAndIsDeletedFalseOrderByCreatedAtDesc(accountId).stream()
                .map(session -> new com.samhanair.logis.auth.web.dto.ClaudeSessionResponse(
                        session.getSessionCode(), session.getTitle(), auditRepository.countBySessionCode(session.getSessionCode())))
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
            throw new BusinessException(ErrorCode.NOT_FOUND, "Claude 세션을 찾을 수 없습니다.");
        }
        String safeQuestion = redactInternalIdentifiers(question);
        String outboundPayload = "question=" + safeQuestion + "; apiResponses=[]";
        if (!properties.isConfigured()) {
            auditRecorder.record(accountId, sessionCode, safeQuestion, outboundPayload, "NOT_SENT");
            throw new BusinessException(
                    ErrorCode.CLAUDE_CREDENTIAL_NOT_CONFIGURED,
                    "Claude 자격이 설정되지 않았습니다. ANTHROPIC_API_KEY를 주입한 뒤 다시 시도해주세요.");
        }
        auditRecorder.record(accountId, sessionCode, safeQuestion, outboundPayload, "SENT");
        return modelClient.ask(safeQuestion);
    }

    private String redactInternalIdentifiers(String question) {
        return question.replaceAll(
                "(?i)\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b",
                "[내부식별자]");
    }
}
