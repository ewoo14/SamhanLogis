package com.samhanair.logis.shared.realtime.lock;

import java.util.List;
import java.util.UUID;

/**
 * 필드 단위 soft-lock registry.
 *
 * <p>soft-lock 은 충돌 차단용 409 잠금이 아니라 "누가 이 필드를 편집 중인지" 보여주는
 * 실시간 협업 힌트다. 따라서 acquire 는 항상 등록 성공하며, 같은 필드에 여러 세션이
 * 동시에 존재할 수 있다.
 */
public interface FieldLockService {

    String EVENT_ACQUIRED = "presence:field-lock-acquired";
    String EVENT_RELEASED = "presence:field-lock-released";

    /**
     * 필드 편집 세션을 등록하거나 heartbeat 시각을 갱신한다.
     *
     * @return 등록된 필드 잠금 snapshot
     */
    FieldLockEntry acquireLock(
            UUID documentId,
            String fieldPath,
            String sessionId,
            String userId,
            String displayName);

    /**
     * 특정 필드의 특정 세션 잠금을 해제한다. **세션 등록자(userId)만 해제 가능**하며,
     * 존재하지 않거나 소유자 불일치면 no-op 이다(soft-lock — 타인 sessionId 임의 해제 차단).
     */
    void releaseLock(UUID documentId, String fieldPath, String sessionId, String userId);

    /** 특정 필드의 현재 soft-lock 목록을 반환한다. */
    List<FieldLockEntry> getLock(UUID documentId, String fieldPath);

    /** 문서 전체의 현재 soft-lock 목록을 반환한다. */
    List<FieldLockEntry> listLocks(UUID documentId);

    /** TTL 이 지난 soft-lock 을 제거하고 released 이벤트를 발행한다. */
    List<FieldLockEntry> pruneExpiredLocks();
}
