package com.samhanair.logis.slip.estimate.revision.repository;

import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 견적 버전이력 repository (권한 재편 Phase 2.2).
 *
 * <p>entity 의 {@code @SQLRestriction("is_deleted = false")} 로 soft-deleted row 는 기본
 * 조회에서 제외된다.
 *
 * <p>{@link com.samhanair.logis.slip.revision.repository.SlipRevisionRepository} 미러.
 */
public interface EstimateRevisionRepository extends JpaRepository<EstimateRevision, UUID> {

    interface EstimateRevisionSnapshotRow {
        Integer getRevisionNo();
        String getRevisionType();
        Integer getSourceRevisionNo();
        String getEstimateNo();
        LocalDate getEstimateDate();
        String getActorName();
        LocalDateTime getCreatedAt();
        String getSnapshotJson();
    }

    /**
     * 견적의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param estimateId 대상 견적 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    List<EstimateRevision> findByEstimateIdOrderByRevisionNoDesc(UUID estimateId);

    @Query(value = """
            SELECT revision_no AS "revisionNo",
                   revision_type AS "revisionType",
                   source_revision_no AS "sourceRevisionNo",
                   estimate_no AS "estimateNo",
                   estimate_date AS "estimateDate",
                   actor_name AS "actorName",
                   created_at AS "createdAt",
                   snapshot::text AS "snapshotJson"
            FROM estimate_revisions
            WHERE estimate_id = :estimateId
              AND is_deleted = FALSE
            ORDER BY revision_no DESC
            """, nativeQuery = true)
    List<EstimateRevisionSnapshotRow> findSnapshotRowsByEstimateIdOrderByRevisionNoDesc(
            @Param("estimateId") UUID estimateId);

    /**
     * 견적의 특정 revision 스냅샷 1건을 조회한다 (복원 대상 로드용).
     *
     * @param estimateId 대상 견적 UUID
     * @param revisionNo 조회할 버전 번호
     * @return 해당 버전 (없으면 {@link Optional#empty()})
     */
    Optional<EstimateRevision> findByEstimateIdAndRevisionNo(UUID estimateId, Integer revisionNo);

    @Query(value = """
            SELECT revision_no AS "revisionNo",
                   revision_type AS "revisionType",
                   source_revision_no AS "sourceRevisionNo",
                   estimate_no AS "estimateNo",
                   estimate_date AS "estimateDate",
                   actor_name AS "actorName",
                   created_at AS "createdAt",
                   snapshot::text AS "snapshotJson"
            FROM estimate_revisions
            WHERE estimate_id = :estimateId
              AND revision_no = :revisionNo
              AND is_deleted = FALSE
            """, nativeQuery = true)
    Optional<EstimateRevisionSnapshotRow> findSnapshotRowByEstimateIdAndRevisionNo(
            @Param("estimateId") UUID estimateId,
            @Param("revisionNo") Integer revisionNo);

    /**
     * 견적의 현재 최대 revisionNo 를 조회한다 (다음 채번 = +1).
     *
     * @param estimateId 대상 견적 UUID
     * @return 최대 revisionNo (스냅샷 없으면 null)
     */
    @Query("SELECT MAX(r.revisionNo) FROM EstimateRevision r WHERE r.estimateId = :estimateId")
    Integer maxRevisionNo(@Param("estimateId") UUID estimateId);
}
