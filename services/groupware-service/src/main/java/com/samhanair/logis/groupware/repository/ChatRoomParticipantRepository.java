package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ChatRoomParticipant;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRoomParticipantRepository extends JpaRepository<ChatRoomParticipant, UUID> {
    boolean existsByRoomIdAndUserIdAndLeftAtIsNull(UUID roomId, UUID userId);
    List<ChatRoomParticipant> findAllByRoomIdAndLeftAtIsNull(UUID roomId);
}
