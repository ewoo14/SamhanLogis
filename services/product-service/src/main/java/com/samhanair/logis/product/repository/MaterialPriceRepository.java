package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.MaterialPrice;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** MaterialPrice CRUD + materialKey 기반 조회 (D4/D7/D8). */
public interface MaterialPriceRepository extends JpaRepository<MaterialPrice, UUID> {

    Optional<MaterialPrice> findByMaterialKey(String materialKey);

    /**
     * soft-delete 포함 materialKey 조회 — 시트 재등장 시 unique key 충돌 없이 복구하기 위한 native lookup.
     *
     * @param materialKey 싱글 자재가격 D열 row key
     * @return 활성/비활성 포함 기존 row
     */
    @Query(value = "SELECT * FROM material_price WHERE material_key = :materialKey LIMIT 1", nativeQuery = true)
    Optional<MaterialPrice> findAnyByMaterialKeyIncludingDeleted(@Param("materialKey") String materialKey);
}
