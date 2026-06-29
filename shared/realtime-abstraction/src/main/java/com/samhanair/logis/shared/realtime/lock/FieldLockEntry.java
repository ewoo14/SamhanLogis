package com.samhanair.logis.shared.realtime.lock;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.samhanair.logis.shared.realtime.presence.PresenceColor;
import java.time.Instant;
import java.util.UUID;

/**
 * 문서의 특정 필드를 현재 편집 중인 클라이언트 세션 snapshot.
 *
 * @param documentId 협업 대상 문서 UUID. 화면 노출용 식별자가 아니다.
 * @param fieldPath 도메인 무관 필드 경로. 예: {@code memo}, {@code items.0.quantity}.
 * @param sessionId 클라이언트 mount 단위 opaque 식별자. account UUID 가 아니다.
 * @param displayName 화면에 표시할 사용자명.
 * @param color userId hash 로 결정된 필드 잠금 표시 색상.
 * @param lockedAt TTL 정제 기준 시각.
 */
public record FieldLockEntry(
        @JsonIgnore
        UUID documentId,
        String fieldPath,
        String sessionId,
        String displayName,
        PresenceColor color,
        @JsonIgnore
        Instant lockedAt) {

    public FieldLockEntry withLockedAt(Instant nextLockedAt) {
        return new FieldLockEntry(documentId, fieldPath, sessionId, displayName, color, nextLockedAt);
    }
}
