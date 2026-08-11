package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 영업수수료 정산서 repository. */
public interface SalesCommissionSettlementRepository
        extends JpaRepository<SalesCommissionSettlement, UUID> {

    /** 활성 정산서를 문서번호로 되찾는다. */
    @EntityGraph(attributePaths = "rateContract")
    Optional<SalesCommissionSettlement> findByDocumentNoAndIsDeletedFalse(String documentNo);

    /** 그룹웨어 결재 첨부에서 선택할 확정 정산서 후보를 문서번호로 검색한다. */
    @Query("""
            SELECT settlement
            FROM SalesCommissionSettlement settlement
            WHERE settlement.status = :status
              AND settlement.documentNo IS NOT NULL
              AND settlement.documentNo LIKE CONCAT('%', :keyword, '%') ESCAPE '\\'
            ORDER BY settlement.settlementDate DESC, settlement.documentNo DESC
            """)
    List<SalesCommissionSettlement> searchApprovalReferences(
            @Param("keyword") String keyword,
            @Param("status") SalesCommissionSettlementStatus status,
            org.springframework.data.domain.Pageable pageable);

    /** 결재 claim 예약·취소가 공유하는 정산 행 비관적 쓰기 잠금. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from SalesCommissionSettlement s where s.documentNo = :documentNo")
    Optional<SalesCommissionSettlement> findByDocumentNoAndIsDeletedFalseForUpdate(
            @Param("documentNo") String documentNo);

    /** 정산 claim 해제·취소가 공유하는 정산 행 비관적 쓰기 잠금. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from SalesCommissionSettlement s where s.id = :id")
    Optional<SalesCommissionSettlement> findByIdAndIsDeletedFalseForUpdate(@Param("id") UUID id);
}
