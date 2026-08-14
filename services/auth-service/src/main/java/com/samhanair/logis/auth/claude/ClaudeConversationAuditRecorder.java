package com.samhanair.logis.auth.claude;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 대화 처리 실패와 무관하게 감사 로그를 보존하는 독립 트랜잭션 기록기. */
@Service
@RequiredArgsConstructor
public class ClaudeConversationAuditRecorder {

    private final ClaudeConversationAuditRepository repository;

    /** 외부 전송 범위와 상태를 별도 트랜잭션으로 저장한다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID accountId, String question, String outboundPayload, String outboundStatus) {
        record(accountId, null, question, outboundPayload, outboundStatus);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID accountId, String sessionCode, String question, String outboundPayload, String outboundStatus) {
        repository.save(ClaudeConversationAudit.record(accountId, sessionCode, question, outboundPayload, outboundStatus));
    }
}
