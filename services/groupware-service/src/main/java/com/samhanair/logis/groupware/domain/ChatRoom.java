package com.samhanair.logis.groupware.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.util.*;
import lombok.*;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "chat_rooms", uniqueConstraints = {
        @UniqueConstraint(columnNames = "room_code"), @UniqueConstraint(columnNames = "direct_pair_key")})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class ChatRoom extends BaseEntity {
    @Id @GeneratedValue @UuidGenerator @Column(nullable = false, updatable = false)
    private UUID id;
    @Column(name = "room_code", nullable = false, updatable = false, length = 32) private String roomCode;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private ChatRoomType type;
    @Column(name = "room_name", length = 120) private String roomName;
    @Column(name = "created_by_user_id", nullable = false, updatable = false) private UUID createdByUserId;
    @Column(name = "direct_pair_key", unique = true, length = 80) private String directPairKey;
    @OneToMany(fetch = FetchType.LAZY, cascade = CascadeType.ALL, orphanRemoval = true)
    @JoinColumn(name = "room_id", insertable = false, updatable = false)
    private List<ChatRoomParticipant> participants = new ArrayList<>();

    private ChatRoom(String code, ChatRoomType type, UUID creator, String pairKey) {
        this.id = UUID.randomUUID();
        this.roomCode = code; this.type = type; this.createdByUserId = creator; this.directPairKey = pairKey;
    }
    public static ChatRoom direct(String code, UUID creator, UUID other) {
        ChatRoom room = new ChatRoom(code, ChatRoomType.DIRECT, creator, pairKey(creator, other));
        room.addParticipant(creator, true); room.addParticipant(other, false); return room;
    }
    /** 방 행을 먼저 저장한 뒤 참여자 FK를 저장해야 하는 신규 DIRECT 생성용 shell. */
    public static ChatRoom directShell(String code, UUID creator, UUID other) {
        return new ChatRoom(code, ChatRoomType.DIRECT, creator, pairKey(creator, other));
    }
    public static ChatRoom restore(UUID id, String code) {
        ChatRoom room = new ChatRoom(code, ChatRoomType.DIRECT, UUID.randomUUID(), null);
        room.id = id; return room;
    }
    public static String pairKey(UUID a, UUID b) {
        return List.of(a.toString(), b.toString()).stream().sorted().reduce((x, y) -> x + ":" + y).orElseThrow();
    }
    public void addParticipant(UUID userId, boolean owner) {
        if (participants.stream().noneMatch(p -> p.getUserId().equals(userId) && p.isActive()))
            participants.add(ChatRoomParticipant.create(id, userId, owner));
    }
}
