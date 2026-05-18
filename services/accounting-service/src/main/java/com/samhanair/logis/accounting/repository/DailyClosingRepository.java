package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.DailyClosing;
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

    /**
     * 특정 날짜 + 특정 거래처 단건 조회.
     *
     * @param closingDate 마감 날짜
     * @param partnerId   거래처 UUID
     * @return 해당 날짜/거래처 마감 snapshot (없으면 empty)
     */
    Optional<DailyClosing> findByClosingDateAndPartnerId(LocalDate closingDate, UUID partnerId);

    /**
     * 기간 범위 조회 (내림차순) — 페이지네이션 지원.
     *
     * @param from     시작 날짜 (inclusive)
     * @param to       종료 날짜 (inclusive)
     * @param pageable 페이지 정보
     * @return 일마감 snapshot 페이지
     */
    @Query("""
            SELECT d FROM DailyClosing d
            WHERE d.closingDate >= :from
              AND d.closingDate <= :to
            ORDER BY d.closingDate DESC
            """)
    Page<DailyClosing> findByDateRange(@Param("from") LocalDate from,
                                       @Param("to") LocalDate to,
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
