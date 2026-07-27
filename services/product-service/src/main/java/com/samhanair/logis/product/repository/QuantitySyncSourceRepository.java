package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.QuantitySyncSource;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 수량 동기화 규칙 source 행 저장소. */
public interface QuantitySyncSourceRepository extends JpaRepository<QuantitySyncSource, UUID> {

    List<QuantitySyncSource> findAllByRuleIdAndIsDeletedFalseOrderById(UUID ruleId);

    /** 주어진 Product를 source로 참조하는 활성 행 — 품목 단종/삭제 차단 사유 조회용(R1 결함 3). */
    List<QuantitySyncSource> findAllBySourceProductIdAndIsDeletedFalse(UUID sourceProductId);
}
