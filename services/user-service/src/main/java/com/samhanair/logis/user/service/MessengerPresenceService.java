package com.samhanair.logis.user.service;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/** 메신저 연결 세션과 사용자의 수동 상태를 합성한다. 세션 키는 사용자 경계에 노출하지 않는다. */
@Service
public class MessengerPresenceService {
    public enum PresenceStatus { AVAILABLE, AWAY, ABSENT, OFFLINE }
    private final Map<UUID, Set<String>> sessions = new ConcurrentHashMap<>();
    private final Map<UUID, PresenceStatus> manualStatuses = new ConcurrentHashMap<>();

    public void join(UUID userId, String sessionId) {
        if (userId == null || sessionId == null || sessionId.isBlank()) return;
        sessions.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(sessionId.trim());
    }
    public void leave(UUID userId, String sessionId) {
        var userSessions = sessions.get(userId);
        if (userSessions == null) return;
        userSessions.remove(sessionId);
        if (userSessions.isEmpty()) sessions.remove(userId, userSessions);
    }
    public void setManualStatus(UUID userId, PresenceStatus status) {
        if (status == null || status == PresenceStatus.OFFLINE) manualStatuses.remove(userId);
        else manualStatuses.put(userId, status);
    }
    public PresenceStatus status(UUID userId) {
        if (!sessions.getOrDefault(userId, Set.of()).isEmpty()) return PresenceStatus.AVAILABLE;
        var manual = manualStatuses.get(userId);
        if (manual != null) return manual;
        return PresenceStatus.OFFLINE;
    }
}
