package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.ArologisCashTxn;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** 아로로지스 간이 현금 거래 저장소. 기간 조회 + 월별 집계용. */
@Repository
public interface ArologisCashTxnRepository extends JpaRepository<ArologisCashTxn, UUID> {

    /**
     * 기간 + 선택적 유형 필터 활성 거래 목록 (일자 오름차순).
     *
     * <p>{@code @SQLRestriction} 으로 soft-delete 행은 자동 제외된다. 유형 파라미터는 enum 명 문자열로
     * 비교하며 null 이면 무시한다.
     */
    @Query("""
            select t
              from ArologisCashTxn t
             where t.txnDate >= :from
               and t.txnDate <= :to
               and (:type is null or t.type = :type)
             order by t.txnDate asc, t.createdAt asc
            """)
    List<ArologisCashTxn> searchPeriod(
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("type") com.samhanair.logis.arologis.domain.CashTxnType type);
}
