package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SalesAccountingSlipAllocationRepository extends JpaRepository<SalesAccountingSlipAllocation, UUID> {

    /**
     * 특정 출고전표 line 에 이미 할당된 금액 합계.
     * over-allocation 가드 트랜잭션에서 호출.
     */
    @Query("""
        SELECT COALESCE(SUM(a.allocatedAmount), 0)
        FROM SalesAccountingSlipAllocation a
        WHERE a.sourceLineId = :sourceLineId
          AND a.isDeleted = false
        """)
    BigDecimal sumAllocatedAmountBySourceLineId(@Param("sourceLineId") UUID sourceLineId);

    @Query("""
        SELECT COALESCE(SUM(a.allocatedQty), 0)
        FROM SalesAccountingSlipAllocation a
        WHERE a.sourceLineId = :sourceLineId
          AND a.isDeleted = false
        """)
    BigDecimal sumAllocatedQtyBySourceLineId(@Param("sourceLineId") UUID sourceLineId);
}
