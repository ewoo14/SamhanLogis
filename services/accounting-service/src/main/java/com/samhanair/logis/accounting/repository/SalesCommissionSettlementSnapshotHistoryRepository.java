package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlementSnapshotHistory;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 영업수수료 정산 확정 snapshot 감사 이력 저장소. */
public interface SalesCommissionSettlementSnapshotHistoryRepository
        extends JpaRepository<SalesCommissionSettlementSnapshotHistory, UUID> {

    /** 정산서별 과거 확정 snapshot을 생성 시각순으로 조회한다. */
    List<SalesCommissionSettlementSnapshotHistory> findAllBySettlementIdAndIsDeletedFalseOrderByCreatedAtAsc(
            UUID settlementId);
}
