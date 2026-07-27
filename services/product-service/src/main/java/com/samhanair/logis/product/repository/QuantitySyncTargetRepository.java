package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.QuantitySyncTarget;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 수량 동기화 규칙 target 행 저장소. */
public interface QuantitySyncTargetRepository extends JpaRepository<QuantitySyncTarget, UUID> {

    List<QuantitySyncTarget> findAllByRuleIdAndIsDeletedFalseOrderByDisplayOrderAsc(UUID ruleId);

    /** 주어진 Product를 target으로 참조하는 활성 행 — 품목 단종/삭제 차단 사유 조회용(R1 결함 3). */
    List<QuantitySyncTarget> findAllByTargetProductIdAndIsDeletedFalse(UUID targetProductId);
}
