package com.samhanair.logis.collab;

import java.util.UUID;
import java.util.Set;

/**
 * 소비 서비스의 도메인 문서를 협업 core 에 연결하는 포트.
 *
 * <p>collab-core 는 문서 저장 구조를 알지 않는다. 각 서비스가 현재 스냅샷 로딩, 변경 제안 적용,
 * 권한 판정을 이 포트로 제공한다.
 */
public interface DocumentCollaborationPort {

    /** 이 포트가 담당하는 협업 문서 유형. */
    CollabDocumentType documentType();

    /** 현재 문서 full snapshot JSON 을 로드한다. */
    String loadSnapshot(UUID documentId);

    /** 제안 수락 시 도메인 문서에 changeSet JSON 을 적용한다. */
    void applyChangeSet(UUID documentId, String changeSetJson);

    /** 특정 revision 의 full snapshot JSON 으로 도메인 문서를 복원한다. */
    void restoreSnapshot(UUID documentId, String snapshotJson);

    /** 사용자가 해당 문서에 변경 제안을 등록할 수 있는지 판정한다. */
    boolean canPropose(UUID userId, UUID documentId);

    /** 사용자가 해당 문서의 변경 제안을 수락/거절할 수 있는지 판정한다. */
    boolean canDecide(UUID userId, UUID documentId);

    /**
     * 문서 수정완료 알림 수신자 식별자를 해석한다.
     *
     * <p>collab-core 는 notification-service 를 호출하지 않는다. 각 도메인 service 가 문서별 기여자,
     * 다음 결재자, 업무 담당자를 모아 반환하고, 발송 service 가 UUID/loginId 등 혼재 식별자를 최종
     * 수신자 UUID 로 정규화한다. 구현체는 가능하면 {@code excludeUserId} 현재 수정자를 제외해야 한다.
     *
     * @param documentId 알림 대상 문서 UUID
     * @param excludeUserId 제외할 현재 수정자 UUID. 없으면 null.
     * @return distinct 수신자 식별자 문자열 set
     */
    default Set<String> resolveNotificationRecipients(UUID documentId, UUID excludeUserId) {
        return Set.of();
    }
}
