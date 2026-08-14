package com.samhanair.logis.auth.claude;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClaudeConversationSessionRepository extends JpaRepository<ClaudeConversationSession, UUID> {
    List<ClaudeConversationSession> findAllByAccountIdAndIsDeletedFalseOrderByCreatedAtDesc(UUID accountId);
    Optional<ClaudeConversationSession> findBySessionCodeAndAccountIdAndIsDeletedFalse(String sessionCode, UUID accountId);
}
