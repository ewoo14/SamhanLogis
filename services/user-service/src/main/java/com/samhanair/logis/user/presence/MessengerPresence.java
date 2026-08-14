package com.samhanair.logis.user.presence;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 직원별 메신저 상태의 영속 snapshot. employeeId는 외부 응답에 노출하지 않는다. */
@Entity
@Table(name = "messenger_presences")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MessengerPresence extends BaseEntity {
    @Id @GeneratedValue private UUID id;
    @Column(name = "employee_id", nullable = false, unique = true) private UUID employeeId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private PresenceStatus status;
    @Column(name = "last_activity_at", nullable = false) private Instant lastActivityAt;

    public static MessengerPresence create(UUID employeeId) {
        var value = new MessengerPresence();
        value.employeeId = employeeId;
        value.status = PresenceStatus.OFFLINE;
        value.lastActivityAt = Instant.now();
        return value;
    }

    public void setManualStatus(PresenceStatus next) {
        this.status = next;
        this.lastActivityAt = Instant.now();
    }

    public void setAutomaticStatus(PresenceStatus next, Instant activityAt) {
        this.status = next;
        this.lastActivityAt = activityAt;
    }
}
