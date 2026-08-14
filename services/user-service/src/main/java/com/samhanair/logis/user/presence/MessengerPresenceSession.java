package com.samhanair.logis.user.presence;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 메신저 앱 인스턴스별 접속 lease. 여러 user-service 인스턴스가 공유한다. */
@Entity
@Table(name = "messenger_presence_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MessengerPresenceSession extends BaseEntity {
    @Id @GeneratedValue private UUID id;
    @Column(name = "employee_id", nullable = false) private UUID employeeId;
    @Column(name = "session_id", nullable = false, length = 120) private String sessionId;

    private MessengerPresenceSession(UUID employeeId, String sessionId) {
        this.employeeId = employeeId;
        this.sessionId = sessionId;
    }

    public static MessengerPresenceSession create(UUID employeeId, String sessionId) {
        return new MessengerPresenceSession(employeeId, sessionId);
    }

    public void deactivate() {
        markDeleted("messenger-presence", LocalDateTime.now());
    }
}
