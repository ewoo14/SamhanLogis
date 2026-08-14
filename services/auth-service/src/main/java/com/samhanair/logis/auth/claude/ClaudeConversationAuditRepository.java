package com.samhanair.logis.auth.claude;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** Claude 대화 감사 로그 저장소. */
public interface ClaudeConversationAuditRepository extends JpaRepository<ClaudeConversationAudit, UUID> {
    long countBySessionCode(String sessionCode);
}
