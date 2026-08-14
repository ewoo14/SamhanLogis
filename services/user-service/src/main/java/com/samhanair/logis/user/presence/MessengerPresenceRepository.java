package com.samhanair.logis.user.presence;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MessengerPresenceRepository extends JpaRepository<MessengerPresence, UUID> {
    Optional<MessengerPresence> findByEmployeeId(UUID employeeId);
    List<MessengerPresence> findAllByEmployeeIdIn(Collection<UUID> employeeIds);
}
