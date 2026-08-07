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

    long countByBundleProductIdAndIsDeletedFalse(UUID bundleProductId);

    /**
     * 구성품 목록 조회 — display_order ASC NULLS LAST 정렬 + 결정적 타이브레이커 (#4).
     *
     * <p>V15 마이그레이션으로 {@code display_order} 컬럼이 추가되었다.
     * 기존 행(NULL)은 NULLS LAST 로 후순위 처리하고, replace-all 저장 행은 1-based 순서로 정렬된다.
     *
     * <p><b>타이브레이커 (#4)</b>: {@code display_order} 가 NULL 인 행(시트 sync 적재 군)이 여러 개면
     * NULLS LAST 만으로는 그 군의 내부 순서가 비결정적이다. {@code createdAt ASC, id ASC} 를
     * 추가해 NULL 군 내부 순서까지 결정화한다(V15 {@code ix_bundle_component_order} 와 호환 —
     * 인덱스는 prefix 가속만 담당, ORDER BY 결정성은 쿼리가 보장).
     *
     * @param bundleProductId 부모 BUNDLE Product.id
     * @return 표시 순서 기준 오름차순 구성품 목록
     */
    @Query("""
            SELECT bc FROM BundleComponent bc
            WHERE bc.bundleProductId = :bundleProductId
              AND bc.isDeleted = false
            ORDER BY bc.displayOrder ASC NULLS LAST, bc.createdAt ASC, bc.id ASC
            """)
    List<BundleComponent> findByBundleProductId(UUID bundleProductId);

    @Query("""
            SELECT bc FROM BundleComponent bc
            WHERE bc.componentProductCode = :componentProductCode
              AND bc.isDeleted = false
            ORDER BY bc.createdAt ASC, bc.id ASC
            """)
    List<BundleComponent> findByComponentProductCode(@Param("componentProductCode") String componentProductCode);

    /**
     * #30 — estimate 카탈로그 벌크: 부모(세트) 묶음 일괄 조회 + 결정적 ORDER BY (#12).
     *
     * <p>파생 쿼리(ORDER BY 부재)는 부모별 구성품 순서가 비결정적이라 소비처
     * {@link com.samhanair.logis.product.web.EstimateCatalogInternalController#components}
     * 의 응답 순서가 흔들린다. 단건 조회와 동일하게 {@code bundleProductId, displayOrder ASC NULLS LAST,
     * createdAt ASC, id ASC} 로 결정화한다(부모별 그룹 → display_order → 생성시각 → UUID 타이브레이커).
     *
     * @param ids 부모 Product.id 집합
     * @return 부모/표시순서 기준 정렬된 구성품 목록
     */
    @Query("""
            SELECT bc FROM BundleComponent bc
            WHERE bc.bundleProductId IN :ids
              AND bc.isDeleted = false
            ORDER BY bc.bundleProductId, bc.displayOrder ASC NULLS LAST, bc.createdAt ASC, bc.id ASC
            """)
    List<BundleComponent> findByBundleProductIdIn(@Param("ids") Collection<UUID> ids);

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
