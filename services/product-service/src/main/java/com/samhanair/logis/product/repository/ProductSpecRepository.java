package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.ProductSpec;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** ProductSpec CRUD + productId/displayOrder 정렬 + specKey 중복 검출. */
public interface ProductSpecRepository extends JpaRepository<ProductSpec, UUID> {

    List<ProductSpec> findByProductIdOrderByDisplayOrderAsc(UUID productId);

    Optional<ProductSpec> findByProductIdAndSpecKey(UUID productId, String specKey);

    boolean existsByProductIdAndSpecKey(UUID productId, String specKey);

    /** #30 — estimate 카탈로그 벌크: 용량/최대연결실내기대수 일괄 조회. */
    List<ProductSpec> findByProductIdInAndSpecKeyIn(java.util.Collection<UUID> productIds,
            java.util.Collection<String> specKeys);

    /** #3 — estimate 세트 구성품 사양 벌크: 구성품 productId 집합의 전체 사양 displayOrder 정렬 일괄 조회. */
    List<ProductSpec> findByProductIdInOrderByDisplayOrderAsc(java.util.Collection<UUID> productIds);
}
