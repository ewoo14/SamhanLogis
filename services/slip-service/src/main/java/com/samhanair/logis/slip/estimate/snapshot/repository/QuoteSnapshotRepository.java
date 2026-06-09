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
     * <p>from/to 는 nullable — null 이면 해당 경계 무제한. legacy 가 담당자 이메일 eq +
     * 저장일시 on_or_after/on_or_before 필터 후 저장일시 desc 정렬했던 동작과 동일.
     *
     * @param userEmail 저장 담당자 이메일 (정확 일치)
     * @param from 저장일시 하한 (nullable)
     * @param to 저장일시 상한 (nullable)
     * @return 저장일시 내림차순 스냅샷 목록
     */
    @Query("""
            SELECT q FROM QuoteSnapshot q
            WHERE q.userEmail = :userEmail
              AND (:from IS NULL OR q.savedAt >= :from)
              AND (:to   IS NULL OR q.savedAt <= :to)
            ORDER BY q.savedAt DESC
            """)
    List<QuoteSnapshot> findHistory(@Param("userEmail") String userEmail,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to);
}
