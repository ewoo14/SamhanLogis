package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    /**
     * 특정 출고전표 line 에 이미 할당된 금액 합계.
     * 동시 매출전표 생성 시 동일 sourceLineId 할당 검증을 직렬화하기 위해 PESSIMISTIC_WRITE 로 호출.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT COALESCE(SUM(a.allocatedAmount), 0)
        FROM SalesAccountingSlipAllocation a
        WHERE a.sourceLineId = :sourceLineId
          AND a.isDeleted = false
        """)
    BigDecimal sumAllocatedAmountBySourceLineIdLocked(@Param("sourceLineId") UUID sourceLineId);

    @Query("""
        SELECT COALESCE(SUM(a.allocatedQty), 0)
        FROM SalesAccountingSlipAllocation a
        WHERE a.sourceLineId = :sourceLineId
          AND a.isDeleted = false
        """)
    BigDecimal sumAllocatedQtyBySourceLineId(@Param("sourceLineId") UUID sourceLineId);
}
