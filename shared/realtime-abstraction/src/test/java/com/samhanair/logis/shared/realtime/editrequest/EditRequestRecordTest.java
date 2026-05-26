package com.samhanair.logis.shared.realtime.editrequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * PR-H4a — EditRequestRecord base 단위 (5 case).
 *
 * <ol>
 *   <li>create — PENDING + 모든 필수 필드 세팅</li>
 *   <li>approve — PENDING → APPROVED + decided* 채움</li>
 *   <li>reject — decisionReason null → INVALID_INPUT</li>
 *   <li>expire — PENDING → EXPIRED + decidedBy* null (자동 만료 표지)</li>
 *   <li>consumeApproval — APPROVED 만 가능, soft-delete 마킹</li>
 * </ol>
 */
class EditRequestRecordTest {

    /** 본 테스트 한정 hidden subclass — abstract @MappedSuperclass 인스턴스화. */
    static class TestableEditRequest extends EditRequestRecord {
        private final UUID id = UUID.randomUUID();

        @Override
        public UUID getId() {
            return id;
        }

        public static TestableEditRequest create(UUID entityId, UUID requesterId,
                                                 String requesterName, EditRequestType type,
                                                 String reason, EditTargetRole targetRole,
                                                 LocalDateTime expiresAt) {
            TestableEditRequest r = new TestableEditRequest();
            r.init(entityId, requesterId, requesterName, type, reason, targetRole, expiresAt);
            return r;
        }
    }

    private TestableEditRequest request;
    private UUID entityId;
    private UUID requesterId;

    @BeforeEach
    void setUp() {
        entityId = UUID.randomUUID();
        requesterId = UUID.randomUUID();
        request = TestableEditRequest.create(entityId, requesterId, "홍길동",
                EditRequestType.EDIT, "오타 수정", EditTargetRole.WAREHOUSE,
                LocalDateTime.now().plusHours(24));
    }

    @Test
    void create_setsPendingAndAllRequiredFields() {
        assertThat(request.getEntityId()).isEqualTo(entityId);
        assertThat(request.getRequesterId()).isEqualTo(requesterId);
        assertThat(request.getRequesterName()).isEqualTo("홍길동");
        assertThat(request.getStatus()).isEqualTo(EditRequestStatus.PENDING);
        assertThat(request.getRequestType()).isEqualTo(EditRequestType.EDIT);
        assertThat(request.getTargetRole()).isEqualTo(EditTargetRole.WAREHOUSE);
        assertThat(request.getRequestedAt()).isNotNull();
    }

    @Test
    void approve_transitionsToApprovedWithDecidedFields() {
        UUID approverId = UUID.randomUUID();
        request.approve(approverId, "창고관리자", "긴급 수정 동의");

        assertThat(request.getStatus()).isEqualTo(EditRequestStatus.APPROVED);
        assertThat(request.getDecidedById()).isEqualTo(approverId);
        assertThat(request.getDecidedByName()).isEqualTo("창고관리자");
        assertThat(request.getDecidedAt()).isNotNull();
        assertThat(request.getDecisionReason()).isEqualTo("긴급 수정 동의");
    }

    @Test
    void reject_blankReason_throwsInvalidInput() {
        UUID approverId = UUID.randomUUID();
        assertThatThrownBy(() -> request.reject(approverId, "관리자", "  "))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT));
    }

    @Test
    void expire_transitionsToExpiredWithoutDecider() {
        request.expire();

        assertThat(request.getStatus()).isEqualTo(EditRequestStatus.EXPIRED);
        assertThat(request.getDecidedAt()).isNotNull();
        assertThat(request.getDecidedById()).isNull();
        assertThat(request.getDecidedByName()).isNull();
    }

    @Test
    void consumeApproval_onlyAfterApproved_marksDeleted() {
        // PENDING 상태에서 호출 시 CONFLICT
        assertThatThrownBy(() -> request.consumeApproval("user-1"))
                .isInstanceOf(BusinessException.class);

        request.approve(UUID.randomUUID(), "관리자", null);
        request.consumeApproval("user-1");

        assertThat(request.getIsDeleted()).isTrue();
        assertThat(request.getDeletedBy()).isEqualTo("user-1");
    }

    @Test
    void consumeApproval_alreadyConsumed_throwsConflict() {
        request.approve(UUID.randomUUID(), "관리자", null);
        request.consumeApproval("user-1");

        assertThatThrownBy(() -> request.consumeApproval("user-2"))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> assertThat(((BusinessException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("이미 소진된 요청입니다");
    }
}
