package com.samhanair.logis.partnerorder.revision.repository;

import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 거래처 주문 버전이력 repository (Phase 2.4 버전이력 + 복원).
 *
 * <p>엔티티의 {@code @SQLRestriction("is_deleted = false")} 로 soft-deleted row 는 기본
 * 조회에서 제외된다.
 *
 * <p>revision_no 채번은 {@link #findMaxRevisionNo(UUID)} 로 MAX 를 조회한 뒤
 * 서비스 계층에서 +1 채번하여 {@code saveAndFlush} 호출.
 * {@code DataIntegrityViolationException} 발생 시 1회 재시도 → 409.
 *
 * <p>{@link com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository} 미러.
 */
public interface PartnerOrderRevisionRepository extends JpaRepository<PartnerOrderRevision, UUID> {

    /**
     * 거래처 주문의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param partnerOrderId 대상 거래처 주문 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    List<PartnerOrderRevision> findByPartnerOrderIdOrderByRevisionNoDesc(UUID partnerOrderId);

    /**
     * 거래처 주문의 특정 revision 스냅샷 1건을 조회한다 (복원 대상 로드용).
     *
     * @param partnerOrderId 대상 거래처 주문 UUID
     * @param revisionNo     조회할 버전 번호
     * @return 해당 버전 (없으면 {@link Optional#empty()})
     */
    Optional<PartnerOrderRevision> findByPartnerOrderIdAndRevisionNo(UUID partnerOrderId,
                                                                     Integer revisionNo);

    /**
     * 거래처 주문의 최신 revision 1건을 조회한다 (채번 보조용).
     *
     * <p>revision_no 최대값 조회를 위한 쿼리 메서드. 스냅샷이 없으면 empty 반환.
     * 서비스 계층에서는 {@link #findMaxRevisionNo(UUID)} 쿼리 메서드와 함께 사용한다.
     *
     * @param partnerOrderId 대상 거래처 주문 UUID
     * @return revisionNo 내림차순 상위 1건 (없으면 {@link Optional#empty()})
     */
    Optional<PartnerOrderRevision> findTopByPartnerOrderIdOrderByRevisionNoDesc(
            UUID partnerOrderId);

    /**
     * 거래처 주문의 현재 최대 revisionNo 를 조회한다 (다음 채번 = +1).
     *
     * <p>스냅샷이 전혀 없으면 null 반환 → 서비스에서 null → 0+1=1 처리.
     *
     * @param partnerOrderId 대상 거래처 주문 UUID
     * @return 최대 revisionNo (스냅샷 없으면 null)
     */
    @Query("SELECT MAX(r.revisionNo) FROM PartnerOrderRevision r WHERE r.partnerOrderId = :partnerOrderId")
    Integer findMaxRevisionNo(@Param("partnerOrderId") UUID partnerOrderId);
}
