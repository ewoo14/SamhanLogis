package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SlipLine;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Slip 라인 — 라인 단건 mutation 보조 (조회는 보통 헤더 cascade 로 처리). */
public interface SlipLineRepository extends JpaRepository<SlipLine, UUID> {

    /**
     * 소프트삭제된 라인을 slip 단위로 일괄 복원한다 (헤더 복원의 라인 cascade 대칭).
     *
     * <p>{@code deleteForSales} 가 삭제 시 모든 라인을 {@code markDeleted} 하므로, 복원도 동일 라인들을
     * 되살려야 복원 전표가 품목·수량·금액 0 의 빈 껍데기가 되지 않는다. {@code SlipLine} 의
     * {@code @SQLRestriction("is_deleted = false")} 때문에 JPA 로는 삭제 라인을 로드할 수 없어
     * native bulk update 로 처리한다. 호출 후 헤더 엔티티는 {@code EntityManager.refresh} 로 갱신해야
     * 되살아난 라인이 컬렉션에 반영된다.
     *
     * @param slipId 복원 대상 slip UUID
     * @return 복원된 라인 수
     */
    @Modifying
    @Query(value = "UPDATE slip_lines SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL "
            + "WHERE slip_id = :slipId AND is_deleted = TRUE", nativeQuery = true)
    int restoreDeletedLinesBySlipId(@Param("slipId") UUID slipId);
}
