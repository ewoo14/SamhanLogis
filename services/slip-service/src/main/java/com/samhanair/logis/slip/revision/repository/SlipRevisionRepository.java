package com.samhanair.logis.slip.revision.repository;

import com.samhanair.logis.slip.revision.domain.SlipRevision;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 전표 버전이력 repository (권한 재편 Phase 2.1).
 *
 * <p>entity 의 {@code @SQLRestriction("is_deleted = false")} 로 soft-deleted row 는 기본
 * 조회에서 제외된다.
 */
public interface SlipRevisionRepository extends JpaRepository<SlipRevision, UUID> {

    interface SlipRevisionSnapshotRow {
        Integer getRevisionNo();
        String getRevisionType();
        Integer getSourceRevisionNo();
        String getSlipNo();
        LocalDate getSlipDate();
        UUID getActorId();
        String getActorName();
        String getActorColor();
        LocalDateTime getCreatedAt();
        String getSnapshotJson();
    }

    /**
     * 전표의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param slipId 대상 전표 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    List<SlipRevision> findBySlipIdOrderByRevisionNoDesc(UUID slipId);

    @Query(value = """
            SELECT revision_no AS "revisionNo",
                   revision_type AS "revisionType",
                   source_revision_no AS "sourceRevisionNo",
                   slip_no AS "slipNo",
                   slip_date AS "slipDate",
                   actor_id AS "actorId",
                   actor_name AS "actorName",
                   actor_color AS "actorColor",
                   created_at AS "createdAt",
                   snapshot::text AS "snapshotJson"
            FROM slip_revisions
            WHERE slip_id = :slipId
              AND is_deleted = FALSE
            ORDER BY revision_no DESC
            """, nativeQuery = true)
    List<SlipRevisionSnapshotRow> findSnapshotRowsBySlipIdOrderByRevisionNoDesc(
            @Param("slipId") UUID slipId);

    /**
     * 전표의 특정 revision 스냅샷 1건을 조회한다 (복원 대상 로드용).
     *
     * @param slipId 대상 전표 UUID
     * @param revisionNo 조회할 버전 번호
     * @return 해당 버전 (없으면 {@link Optional#empty()})
     */
    Optional<SlipRevision> findBySlipIdAndRevisionNo(UUID slipId, Integer revisionNo);

    @Query(value = """
            SELECT revision_no AS "revisionNo",
                   revision_type AS "revisionType",
                   source_revision_no AS "sourceRevisionNo",
                   slip_no AS "slipNo",
                   slip_date AS "slipDate",
                   actor_id AS "actorId",
                   actor_name AS "actorName",
                   actor_color AS "actorColor",
                   created_at AS "createdAt",
                   snapshot::text AS "snapshotJson"
            FROM slip_revisions
            WHERE slip_id = :slipId
              AND revision_no = :revisionNo
              AND is_deleted = FALSE
            """, nativeQuery = true)
    Optional<SlipRevisionSnapshotRow> findSnapshotRowBySlipIdAndRevisionNo(
            @Param("slipId") UUID slipId,
            @Param("revisionNo") Integer revisionNo);

    /**
     * 전표의 현재 최대 revisionNo 를 조회한다 (다음 채번 = +1).
     *
     * @param slipId 대상 전표 UUID
     * @return 최대 revisionNo (스냅샷 없으면 null)
     */
    @Query("SELECT MAX(r.revisionNo) FROM SlipRevision r WHERE r.slipId = :slipId")
    Integer maxRevisionNo(@Param("slipId") UUID slipId);
}
