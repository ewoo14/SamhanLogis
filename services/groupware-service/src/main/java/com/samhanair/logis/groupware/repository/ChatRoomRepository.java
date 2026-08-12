package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.ChatRoom;
import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatRoomRepository extends JpaRepository<ChatRoom, UUID> {
    Optional<ChatRoom> findByRoomCode(String roomCode);
    Optional<ChatRoom> findByDirectPairKey(String directPairKey);
    @org.springframework.data.jpa.repository.Query("select distinct r from ChatRoom r join ChatRoomParticipant p on p.roomId = r.id where p.userId = :userId and p.leftAt is null order by r.roomCode")
    List<ChatRoom> findActiveRoomsForUser(@org.springframework.data.repository.query.Param("userId") UUID userId);
}
