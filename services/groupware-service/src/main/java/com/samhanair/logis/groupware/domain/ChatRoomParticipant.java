package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "chat_room_participants", uniqueConstraints = @UniqueConstraint(columnNames = {"room_id", "user_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ChatRoomParticipant extends BaseEntity {
    @Id @GeneratedValue @UuidGenerator @Column(nullable = false, updatable = false)
    private UUID id;
    @Column(name = "room_id", nullable = false, updatable = false) private UUID roomId;
    @Column(name = "user_id", nullable = false, updatable = false) private UUID userId;
    @Column(nullable = false) private boolean owner;
    @Column(name = "joined_at", nullable = false, updatable = false) private LocalDateTime joinedAt;
    @Column(name = "left_at") private LocalDateTime leftAt;

    private ChatRoomParticipant(UUID roomId, UUID userId, boolean owner) {
        this.id = UUID.randomUUID();
        this.roomId = roomId; this.userId = userId; this.owner = owner; this.joinedAt = LocalDateTime.now();
    }
    public static ChatRoomParticipant create(UUID roomId, UUID userId, boolean owner) {
        return new ChatRoomParticipant(roomId, userId, owner);
    }
    public boolean isActive() { return leftAt == null; }
    public void leave() { if (owner) throw new IllegalStateException("방 소유자는 먼저 소유권을 이전해야 합니다"); leftAt = LocalDateTime.now(); }
}
