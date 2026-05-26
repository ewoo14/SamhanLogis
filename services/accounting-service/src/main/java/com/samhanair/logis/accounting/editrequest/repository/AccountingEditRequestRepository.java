package com.samhanair.logis.accounting.editrequest.repository;

import com.samhanair.logis.accounting.editrequest.domain.AccountingEditRequest;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestStatus;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 회계 도메인 수정/삭제 요청 — entityId / targetRole 기반 조회 — PR-H4b (Phase 12 Step 4b).
 *
 * <p>soft-delete 자동 제외 ({@code @SQLRestriction}).
 *
 * <p>핵심 사용처:
 * <ul>
 *   <li>{@link #findFirstByEntityIdAndStatus} — entity mutation 가드 (APPROVED 1건 있어야 진행)</li>
 *   <li>{@link #findByTargetRoleAndStatusOrderByRequestedAtDesc} — 권한자 대시보드</li>
 *   <li>{@link #findByEntityIdOrderByRequestedAtDesc} — entity 별 요청 이력</li>
 *   <li>{@link #findByIdForDecision} — approve/reject 직전 PESSIMISTIC_WRITE 잠금 조회 (race 가드)</li>
 * </ul>
 */
public interface AccountingEditRequestRepository extends JpaRepository<AccountingEditRequest, UUID> {

    Optional<AccountingEditRequest> findFirstByEntityIdAndStatus(UUID entityId,
                                                                 EditRequestStatus status);

    List<AccountingEditRequest> findByEntityIdOrderByRequestedAtDesc(UUID entityId);

    List<AccountingEditRequest> findByTargetRoleAndStatusOrderByRequestedAtDesc(
            EditTargetRole targetRole, EditRequestStatus status);

    /**
     * approve/reject 직전 사용하는 PESSIMISTIC_WRITE 잠금 조회.
     *
     * <p>{@code SELECT ... FOR UPDATE} 발행 → 동시 결정 시 두 번째 트랜잭션이 첫 트랜잭션 commit
     * 까지 row 잠금 대기. commit 후 두 번째 트랜잭션은 최신 상태를 읽고
     * {@code EditRequestRecord.requirePending()} 가 {@code BusinessException(CONFLICT)} 던짐 →
     * 중복 APPROVAL 알림 발송 차단 (PR #301 Codex P2-BE-1 회고).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from AccountingEditRequest r where r.id = :id")
    Optional<AccountingEditRequest> findByIdForDecision(@Param("id") UUID id);
}
