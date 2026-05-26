package com.samhanair.logis.slip.editrequest.repository;

import com.samhanair.logis.slip.editrequest.domain.SlipEditRequest;
import com.samhanair.logis.slip.editrequest.domain.SlipEditRequestStatus;
import com.samhanair.logis.slip.editrequest.domain.SlipEditTargetRole;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 슬립 수정/삭제 요청 — slipId / targetRole 기반 조회. soft-delete 자동 제외 ({@code @SQLRestriction}).
 *
 * <p>핵심 사용처:
 * <ul>
 *   <li>{@link #findFirstActiveApproved} — slip mutation 가드 (APPROVED 1건 있어야 진행).</li>
 *   <li>{@link #findBySlipIdAndStatusOrderByRequestedAtDesc} — slip 화면의 "요청 이력".</li>
 *   <li>{@link #findByTargetRoleAndStatusOrderByRequestedAtDesc} — 창고/관리자 대시보드 PENDING 목록.</li>
 *   <li>{@link #findExpired} — 스케줄러 PENDING + expires_at &lt; now 자동 EXPIRED 전환.</li>
 * </ul>
 */
public interface SlipEditRequestRepository extends JpaRepository<SlipEditRequest, UUID> {

    /**
     * 슬립 mutation 가드용 — 해당 슬립의 활성 APPROVED 요청 1건 lookup. 0건 → mutation 차단,
     * 1건 → mutation 진행 후 즉시 {@code consumeApproval}.
     *
     * <p>{@code @SQLRestriction(is_deleted=false)} 가 자동 적용 — consumeApproval 은 soft-delete 라
     * 1회 소진 후에는 본 query 가 다시 0건 반환.
     */
    Optional<SlipEditRequest> findFirstBySlipIdAndStatus(UUID slipId, SlipEditRequestStatus status);

    /**
     * slip 화면의 "요청 이력" — status 필터 (PENDING / APPROVED / REJECTED / EXPIRED) 1종 또는 전체.
     *
     * @param slipId 대상 슬립
     * @param status 필터 (null 가능 — 별도 메서드로 처리)
     * @return 최신 요청순 리스트
     */
    List<SlipEditRequest> findBySlipIdAndStatusOrderByRequestedAtDesc(UUID slipId,
                                                                     SlipEditRequestStatus status);

    /** slip 화면의 "요청 이력 전체". */
    List<SlipEditRequest> findBySlipIdOrderByRequestedAtDesc(UUID slipId);

    /**
     * 창고 직원 / 관리자 대시보드 — 본인 권한 그룹의 PENDING 요청 전체. 응답 즉시 수락/거절 분기.
     *
     * @param targetRole WAREHOUSE / MANAGER
     * @param status 일반적으로 PENDING (대시보드 active 영역)
     * @return 최신 요청순 리스트
     */
    List<SlipEditRequest> findByTargetRoleAndStatusOrderByRequestedAtDesc(
            SlipEditTargetRole targetRole, SlipEditRequestStatus status);

    /** approve/reject/consumeApproval 직전 PESSIMISTIC_WRITE 잠금 조회. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from SlipEditRequest r where r.id = :id")
    Optional<SlipEditRequest> findByIdForDecision(@Param("id") UUID id);

    /**
     * 스케줄러 자동 만료 — PENDING + expires_at &lt; now 인 row 전체. soft-delete 자동 제외.
     *
     * <p>본 query 는 명시 JPQL — Spring Data 가 PENDING enum + LessThan 조합을 보장 (인덱스
     * {@code ix_slip_edit_requests_pending_expires} 활용).
     */
    @Query("""
            SELECT r FROM SlipEditRequest r
            WHERE r.status = com.samhanair.logis.slip.editrequest.domain.SlipEditRequestStatus.PENDING
              AND r.expiresAt IS NOT NULL
              AND r.expiresAt < :now
            ORDER BY r.requestedAt ASC
            """)
    List<SlipEditRequest> findExpired(@Param("now") LocalDateTime now);
}
