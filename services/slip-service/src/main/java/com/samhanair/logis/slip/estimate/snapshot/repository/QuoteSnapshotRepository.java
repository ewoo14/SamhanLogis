package com.samhanair.logis.slip.estimate.snapshot.repository;

import com.samhanair.logis.slip.estimate.snapshot.domain.QuoteSnapshot;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * 종합견적서 저장 스냅샷 repository — legacy getQuoteHistory(노션 쿼리) 대체.
 *
 * <p>{@code @SQLRestriction("is_deleted = false")} 가 엔티티에 걸려 있어 모든 조회가
 * 활성 행만 대상으로 한다.
 */
public interface QuoteSnapshotRepository extends JpaRepository<QuoteSnapshot, UUID> {

    /**
     * 사용자별 + 저장일시 범위 목록 (최신순) — legacy getQuoteHistory(startDate, endDate) 정합.
     *
     * <p>from/to 는 항상 경계값으로 채워 전달한다(서비스 레이어가 미지정 시 FLOOR/CEIL 대입).
     * {@code (:param IS NULL OR ...)} 형태는 PostgreSQL 이 NULL 파라미터의 타입을 추론하지 못해
     * "could not determine data type of parameter" 로 실패하므로(IT 가 로컬 skip 시 미적발),
     * NULL 분기 없이 항상 BETWEEN 비교한다. legacy 의 담당자 eq + 저장일시 범위 + desc 정렬 동등.
     *
     * @param userEmail 저장 담당자 이메일 (정확 일치)
     * @param from 저장일시 하한 (non-null, 미지정 시 FLOOR)
     * @param to 저장일시 상한 (non-null, 미지정 시 CEIL)
     * @return 저장일시 내림차순 스냅샷 목록
     */
    @Query("""
            SELECT q FROM QuoteSnapshot q
            WHERE (:userEmail IS NULL OR q.authorEmail = :userEmail)
              AND q.savedAt >= :from
              AND q.savedAt <= :to
            ORDER BY q.savedAt DESC
            """)
    List<QuoteSnapshot> findHistory(@Param("userEmail") String userEmail,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /** 작성자 제한 없이 모든 활성 견적을 최신순으로 조회한다. */
    @Query("""
            SELECT q FROM QuoteSnapshot q
            WHERE q.savedAt >= :from AND q.savedAt <= :to
            ORDER BY q.savedAt DESC
            """)
    List<QuoteSnapshot> findAllHistory(@Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);

    /**
     * #31 — 거래처명 부분검색 이력 (legacy getQuoteHistoryByCustomer 정합).
     *
     * <p>legacy: 담당자 eq + 거래처명 contains + 저장일시 desc + 최근 30건(page_size).
     * 호출자(서비스)가 Pageable.ofSize(30) 으로 limit 을 전달한다.
     */
    @Query("""
            SELECT q FROM QuoteSnapshot q
            WHERE (:userEmail IS NULL OR q.authorEmail = :userEmail)
              AND LOWER(q.custName) LIKE LOWER(CONCAT('%', CAST(:custName AS string), '%')) ESCAPE '\\'
            ORDER BY q.savedAt DESC
            """)
    List<QuoteSnapshot> findByCustomer(@Param("userEmail") String userEmail,
            @Param("custName") String custName,
            org.springframework.data.domain.Pageable pageable);
}
