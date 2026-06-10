package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.BundleComponent;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * BundleComponent CRUD + 부모 BUNDLE 기준 component 라인 조회.
 *
 * <p>벌크 count 메서드({@link #countByBundleProductIdIn}) 는 카탈로그 목록 N+1 방지 용도로
 * 부모 UUID 집합 1쿼리로 componentCount 를 집계한다 (§1b 2026-06-11).
 */
public interface BundleComponentRepository extends JpaRepository<BundleComponent, UUID> {

    List<BundleComponent> findByBundleProductId(UUID bundleProductId);

    List<BundleComponent> findByComponentProductCode(String componentProductCode);

    /** #30 — estimate 카탈로그 벌크: 부모(세트) 묶음 일괄 조회. */
    List<BundleComponent> findByBundleProductIdIn(Collection<UUID> bundleProductIds);

    /**
     * 카탈로그 목록 componentCount 벌크 집계 — N+1 방지 (§1b 2026-06-11).
     *
     * <p>부모 Product.id 집합을 IN 1쿼리로 bundleProductId별 활성 구성품 수를 반환한다.
     * BUNDLE 이 아닌 품목은 호출 전에 필터링하거나, 결과 Map 에 없으면 0 으로 처리한다.
     *
     * @param bundleProductIds 부모 Product.id 집합
     * @return bundleProductId → count 매핑
     */
    @Query("""
            SELECT bc.bundleProductId AS bid, COUNT(bc) AS cnt
              FROM BundleComponent bc
             WHERE bc.isDeleted = false
               AND bc.bundleProductId IN :bundleProductIds
             GROUP BY bc.bundleProductId
            """)
    List<BundleComponentCountRow> countByBundleProductIdIn(
            @Param("bundleProductIds") Collection<UUID> bundleProductIds);

    /**
     * 벌크 count 결과 투영 인터페이스.
     */
    interface BundleComponentCountRow {
        UUID getBid();
        long getCnt();
    }

    /**
     * 벌크 count 결과를 Map 으로 변환하는 default 메서드 — 호출부 편의 메서드.
     *
     * @param bundleProductIds 부모 Product.id 집합
     * @return bundleProductId → count Map (해당 없으면 Map 에 key 없음 — 호출부가 0 처리)
     */
    default Map<UUID, Long> countMapByBundleProductIds(Collection<UUID> bundleProductIds) {
        return countByBundleProductIdIn(bundleProductIds).stream()
                .collect(Collectors.toMap(BundleComponentCountRow::getBid, BundleComponentCountRow::getCnt));
    }

    /**
     * 정합 점검 — componentProductCode 가 활성 products.modelCode 에 해소되지 않는 구성품.
     *
     * <p>{@link com.samhanair.logis.product.service.BundleExpander#expand} 의 해소 경로
     * ({@code findByModelCodeAndIsDeletedFalse(componentProductCode)}) 와 동일 기준 —
     * 미해소 = 세트 전개 시 해당 구성품을 못 찾아 견적/전표 NOT_FOUND. 운영 전 0 이어야 함.
     *
     * <p>부모가 <b>활성 BUNDLE</b> 인 구성품만 대상 — soft-deleted/비-BUNDLE 부모의 잔여 구성품은
     * 전개 대상이 아니므로 제외(false positive 방지, expander 동작과 엄밀 일치).
     */
    @Query("""
            SELECT bc FROM BundleComponent bc
            WHERE bc.isDeleted = false
              AND EXISTS (
                SELECT 1 FROM Product par
                WHERE par.id = bc.bundleProductId
                  AND par.isDeleted = false
                  AND par.productType = com.samhanair.logis.product.domain.ProductType.BUNDLE)
              AND NOT EXISTS (
                SELECT 1 FROM Product cp
                WHERE cp.isDeleted = false AND cp.modelCode = bc.componentProductCode)
            ORDER BY bc.bundleProductId, bc.componentProductCode
            """)
    List<BundleComponent> findUnresolvedComponents();
}
