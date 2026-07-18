package com.samhanair.logis.slip.repository;

import com.samhanair.logis.slip.domain.SlipLine;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Slip 라인 — 라인 단건 mutation 보조 (조회는 보통 헤더 cascade 로 처리). */
public interface SlipLineRepository extends JpaRepository<SlipLine, UUID> {

    /** Internal 스냅샷 조회용 — 라인과 소속 전표를 같은 persistence context 에서 함께 읽는다. */
    @Query("SELECT l FROM SlipLine l JOIN FETCH l.slip WHERE l.id = :id")
    Optional<SlipLine> findByIdWithSlip(@Param("id") UUID id);

    /**
     * 소프트삭제된 라인 중 <b>헤더와 동일 시각에 삭제된 라인만</b> slip 단위로 일괄 복원한다
     * (헤더 복원의 라인 cascade 대칭 — #758 머지게이트 감사 HIGH fix).
     *
     * <p>{@code Slip#deleteForSales} 는 헤더 삭제 시 cascade 되는 모든 라인에
     * {@code markDeleted(deleter, now)} 로 <b>단일 시각</b>을 각인한다. 복원도 그 시각과 정확히
     * 일치하는 라인만 대상으로 삼아야 복원 전표가 품목·수량·금액 0 의 빈 껍데기가 되지 않으면서도, 편집
     * 플로우({@code removeLine}/{@code replaceSalesLines}/{@code restoreFromSnapshot} 등)에서 다른
     * 시각에 개별 soft-delete 된 라인까지 오복원(중복 부활)하지 않는다. 과거 {@code slipId} 만으로
     * 무차별 복원하던 {@code restoreDeletedLinesBySlipId} 는 이 시각 한정 버전으로 대체되었다.
     *
     * <p>{@code SlipLine} 의 {@code @SQLRestriction("is_deleted = false")} 때문에 JPA 로는 삭제 라인을
     * 로드할 수 없어 native bulk update 로 처리한다. 호출 후 헤더 엔티티는 {@code EntityManager.refresh}
     * 로 갱신해야 되살아난 라인이 컬렉션에 반영된다.
     *
     * @param slipId 복원 대상 slip UUID
     * @param deletedAt 헤더의 삭제 시각 ({@code Slip#getDeletedAt()}) — 이 값과 정확히 일치하는
     *                  라인만 복원 대상
     * @return 복원된 라인 수
     */
    @Modifying
    @Query(value = "UPDATE slip_lines SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL "
            + "WHERE slip_id = :slipId AND is_deleted = TRUE AND deleted_at = :deletedAt", nativeQuery = true)
    int restoreDeletedLinesBySlipIdAndDeletedAt(@Param("slipId") UUID slipId,
                                                @Param("deletedAt") LocalDateTime deletedAt);

    /**
     * slip 단위로 현재 soft-deleted 상태인 라인 수를 센다 (BE 적대검증 BLOCKING fix — 레거시 삭제
     * 전표 fail-loud 판정용).
     *
     * <p>단일시각 도입({@code Slip#deleteForSales}) <b>이전</b>에 삭제된 레거시 전표는 헤더와 라인이
     * 각자 다른 {@code deleted_at} 을 갖는다({@link #restoreDeletedLinesBySlipIdAndDeletedAt} 이
     * 0-match). 이 카운트를 복원 시도 <b>이전</b>에 캡처해 두면, 복원 쿼리의 리턴값(실제 복원된 라인
     * 수)과 대조해 "삭제 라인이 있었는데 하나도 복원되지 않음" 상황을 탐지할 수 있다 — 탐지 시
     * {@code SlipRestoreService#restore} 가 CONFLICT 로 fail-loud 처리해 무음 빈 껍데기 복원을 막는다.
     *
     * @param slipId 대상 slip UUID
     * @return 현재 soft-deleted 상태인 라인 수 (0 이면 삭제 라인 없음 — 원래 라인 0건 전표이거나
     *         이미 정상 복원된 상태)
     */
    @Query(value = "SELECT COUNT(*) FROM slip_lines WHERE slip_id = :slipId AND is_deleted = TRUE",
            nativeQuery = true)
    long countDeletedLinesBySlipId(@Param("slipId") UUID slipId);
}
