package com.samhanair.logis.user.presence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessengerPresenceSessionRepository extends JpaRepository<MessengerPresenceSession, UUID> {
    Optional<MessengerPresenceSession> findByEmployeeIdAndSessionIdAndIsDeletedFalse(UUID employeeId, String sessionId);
    long countByEmployeeIdAndIsDeletedFalse(UUID employeeId);
}
