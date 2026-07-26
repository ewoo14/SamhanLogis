package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.DailyClosingKind;
import com.samhanair.logis.accounting.domain.DailyClosingSourceKind;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * DailyClosing — 일마감 snapshot 리포지토리 (SP-08-6-5).
 *
 * <p>closing_date + partner_id(nullable) 조합 단건 조회와 기간 페이징을 제공한다.
 * {@link org.hibernate.annotations.SQLRestriction} 으로 is_deleted=false 자동 필터링.
 */
public interface DailyClosingRepository extends JpaRepository<DailyClosing, UUID> {

    /**
     * 특정 날짜 + 전체 거래처(partnerId=null) 단건 조회.
     *
     * @param closingDate 마감 날짜
     * @return 해당 날짜 전체 마감 snapshot (없으면 empty)
     */
    Optional<DailyClosing> findByClosingDateAndPartnerIdIsNull(LocalDate closingDate);

    Optional<DailyClosing> findByClosingDateAndPartnerIdIsNullAndClosingKindAndSourceKind(
            LocalDate closingDate,
            DailyClosingKind closingKind,
            DailyClosingSourceKind sourceKind);

    /**
     * 특정 날짜 + 특정 거래처 단건 조회.
     *
     * @param closingDate 마감 날짜
     * @param partnerId   거래처 UUID
     * @return 해당 날짜/거래처 마감 snapshot (없으면 empty)
     */
    Optional<DailyClosing> findByClosingDateAndPartnerId(LocalDate closingDate, UUID partnerId);

    Optional<DailyClosing> findByClosingDateAndPartnerIdAndClosingKindAndSourceKind(
            LocalDate closingDate,
            UUID partnerId,
            DailyClosingKind closingKind,
            DailyClosingSourceKind sourceKind);

    /**
     * 기간 범위 조회 (내림차순) — 페이지네이션 지원.
     *
     * @param from     시작 날짜 (inclusive)
     * @param to       종료 날짜 (inclusive)
     * @param pageable 페이지 정보
     * @return 일마감 snapshot 페이지
     */
    @Query(value = """
            SELECT d FROM DailyClosing d
            WHERE d.closingDate >= :from
              AND d.closingDate <= :to
            ORDER BY d.closingDate DESC
            """,
            countQuery = """
            SELECT count(d) FROM DailyClosing d
            WHERE d.closingDate >= :from
              AND d.closingDate <= :to
            """)
    Page<DailyClosing> findByDateRange(@Param("from") LocalDate from,
                                       @Param("to") LocalDate to,
                                       Pageable pageable);

    /**
     * [#929 재수렴 T6] partnerId 필터 — 이전에는 이 쿼리가 partnerCode/partnerId 를 전혀
     * 받지 않아 FE 가 보낸 필터가 조용히 버려졌다(#929 D). null 이면 미지정(전체)과
     * 동일하게 전 파트너 대상, 지정되면 정확히 그 partnerId(전체 마감 행은
     * partnerId IS NULL 이므로 특정 거래처를 지정하면 자동으로 제외된다)만 남는다.
     */
    @Query(value = """
            SELECT d FROM DailyClosing d
            WHERE d.closingDate >= :from
              AND d.closingDate <= :to
              AND (:closingKind IS NULL OR d.closingKind = :closingKind)
              AND (:sourceKind IS NULL OR d.sourceKind = :sourceKind)
              AND (:partnerId IS NULL OR d.partnerId = :partnerId)
            ORDER BY d.closingDate DESC
            """,
            countQuery = """
            SELECT count(d) FROM DailyClosing d
            WHERE d.closingDate >= :from
              AND d.closingDate <= :to
              AND (:closingKind IS NULL OR d.closingKind = :closingKind)
              AND (:sourceKind IS NULL OR d.sourceKind = :sourceKind)
              AND (:partnerId IS NULL OR d.partnerId = :partnerId)
            """)
    Page<DailyClosing> findByDateRangeAndKinds(@Param("from") LocalDate from,
                                               @Param("to") LocalDate to,
                                               @Param("closingKind") DailyClosingKind closingKind,
                                               @Param("sourceKind") DailyClosingSourceKind sourceKind,
                                               @Param("partnerId") UUID partnerId,
                                               Pageable pageable);

    /**
     * 기간 범위 전체 조회 (페이지 없음) — 리스트 반환.
     *
     * @param from 시작 날짜 (inclusive)
     * @param to   종료 날짜 (inclusive)
     * @return 일마감 snapshot 목록 (날짜 내림차순)
     */
    @Query("""
            SELECT d FROM DailyClosing d
            WHERE d.closingDate >= :from
              AND d.closingDate <= :to
            ORDER BY d.closingDate DESC
            """)
    List<DailyClosing> findAllByDateRange(@Param("from") LocalDate from,
                                          @Param("to") LocalDate to);
}
