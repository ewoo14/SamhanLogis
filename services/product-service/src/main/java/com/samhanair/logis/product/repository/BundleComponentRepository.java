package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.BundleComponent;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** BundleComponent CRUD + 부모 BUNDLE 기준 component 라인 조회. */
public interface BundleComponentRepository extends JpaRepository<BundleComponent, UUID> {

    List<BundleComponent> findByBundleProductId(UUID bundleProductId);

    List<BundleComponent> findByComponentProductCode(String componentProductCode);

    /**
     * 정합 점검 — componentProductCode 가 활성 products.modelCode 에 해소되지 않는 구성품.
     *
     * <p>{@link com.samhanair.logis.product.service.BundleExpander#expand} 의 해소 경로
     * ({@code findByModelCodeAndIsDeletedFalse(componentProductCode)}) 와 동일 기준 —
     * 미해소 = 세트 전개 시 해당 구성품을 못 찾아 견적/전표 NOT_FOUND. 운영 전 0 이어야 함.
     */
    @Query("""
            SELECT bc FROM BundleComponent bc
            WHERE bc.isDeleted = false
              AND NOT EXISTS (
                SELECT 1 FROM Product cp
                WHERE cp.isDeleted = false AND cp.modelCode = bc.componentProductCode)
            ORDER BY bc.bundleProductId, bc.componentProductCode
            """)
    List<BundleComponent> findUnresolvedComponents();
}
