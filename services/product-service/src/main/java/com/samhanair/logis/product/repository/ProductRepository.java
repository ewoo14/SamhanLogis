package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Soft-delete 는 {@link Product @SQLRestriction} 으로 엔티티 레벨에서 처리한다.
 * tag 검색은 PostgreSQL {@code jsonb @>} 연산자를 native query 로 사용한다.
 */
public interface ProductRepository extends JpaRepository<Product, UUID> {

    boolean existsByModelNameAndIsDeletedFalse(String modelName);

    /**
     * 모델명 정확 매칭 단건 조회 (대소문자 구분, 삭제되지 않은 제품만).
     * Slip 출력 슬라이스의 {@code POST /products/internal/lookup-by-model} 및
     * {@code GET /products/by-model/{modelName}} 에서 사용. modelName 컬럼은
     * partial unique index 가 걸려 있어 단건 보장.
     *
     * @param modelName 정확히 일치할 제품 모델명 (예: {@code AJ040RXH4BC1})
     * @return 일치 제품 Optional. 없으면 {@link Optional#empty()}
     */
    Optional<Product> findByModelNameAndIsDeletedFalse(String modelName);

    /**
     * 카탈로그 화면 노출 식별자 기준 단건 조회.
     *
     * <p>카탈로그 응답의 {@code modelCode} 는 사용자 화면 UUID 비공개 원칙상 비즈니스
     * 식별자만 노출한다. 이카운트 원천에서는 품목코드({@code model_code})와
     * 품목명/모델명({@code model_name})이 별도 신원이며, 기존 실데이터는
     * {@code model_code} 가 비어 있고 {@code model_name} 만 채워진 행이 존재한다.
     * 따라서 응답 fallback 규칙({@code model_code ?? model_name})과 mutation path
     * 조회가 왕복 정합을 갖도록 {@code model_code} 정확 매칭 실패 시
     * {@code model_name} 정확 매칭으로 fallback 한다.
     *
     * @param exposedModelCode 카탈로그 응답의 {@code modelCode} 값
     * @return 삭제되지 않은 제품. 없으면 {@link Optional#empty()}
     */
    default Optional<Product> findByCatalogExposedModelCodeAndIsDeletedFalse(String exposedModelCode) {
        if (exposedModelCode == null || exposedModelCode.isBlank()) {
            return Optional.empty();
        }
        String normalized = exposedModelCode.trim();
        return findByModelCodeAndIsDeletedFalse(normalized)
                .or(() -> findByModelNameAndIsDeletedFalse(normalized));
    }

    List<Product> findByNameAndIsDeletedFalse(String name);

    List<Product> findAllByIdIn(Collection<UUID> ids);

    /** 정합 점검 — 활성 BUNDLE 부모 총수 (전개 대상 세트 수). */
    long countByProductTypeAndIsDeletedFalse(ProductType productType);

    Page<Product> findAllByCategory_Id(UUID categoryId, Pageable pageable);

    Page<Product> findAllByStatus(ProductStatus status, Pageable pageable);

    Page<Product> findAllByCategory_IdAndStatus(UUID categoryId, ProductStatus status, Pageable pageable);

    /**
     * 자유 텍스트 검색 (name / model_name LIKE) + 선택적 카테고리/상태/태그/usageScope/productCategory 필터를
     * 단일 native 쿼리로 합쳐 처리. {@code :tagFilter} 는 jsonb 형태의 문자열
     * (예: '{"hp":"1.5"}') 또는 NULL.
     *
     * <p>usageScope/productCategory 는 order-app ({@code GET /products?usageScope=PARTNER_ORDER&category=HOME_MULTI})
     * 및 desktop sales.ts ({@code usageScope=BOTH&category=...}) 호출이 실효화되도록 추가됨 (PR-B 2026-06-11).
     */
    // [RC4] null→bytea 방지: CAST(:q AS text) (nativeQuery 이므로 PostgreSQL text 캐스트)
    @Query(value = """
            SELECT * FROM products p
            WHERE p.is_deleted = false
              AND (:categoryId IS NULL OR p.category_id = :categoryId)
              AND (:status      IS NULL OR p.status     = :status)
              AND (CAST(:q AS text) IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%'))
                                        OR LOWER(p.model_name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')))
              AND (CAST(:tagFilter AS text) IS NULL OR p.tags @> CAST(:tagFilter AS jsonb))
              AND (CAST(:usageScope AS text) IS NULL OR p.usage_scope = CAST(:usageScope AS text))
              AND (CAST(:productCategory AS text) IS NULL OR p.product_category = CAST(:productCategory AS text))
            """,
           countQuery = """
            SELECT COUNT(*) FROM products p
            WHERE p.is_deleted = false
              AND (:categoryId IS NULL OR p.category_id = :categoryId)
              AND (:status      IS NULL OR p.status     = :status)
              AND (CAST(:q AS text) IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%'))
                                        OR LOWER(p.model_name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')))
              AND (CAST(:tagFilter AS text) IS NULL OR p.tags @> CAST(:tagFilter AS jsonb))
              AND (CAST(:usageScope AS text) IS NULL OR p.usage_scope = CAST(:usageScope AS text))
              AND (CAST(:productCategory AS text) IS NULL OR p.product_category = CAST(:productCategory AS text))
            """,
           nativeQuery = true)
    Page<Product> search(@Param("categoryId") UUID categoryId,
                         @Param("status") String status,
                         @Param("q") String q,
                         @Param("tagFilter") String tagFilter,
                         @Param("usageScope") String usageScope,
                         @Param("productCategory") String productCategory,
                         Pageable pageable);

    /**
     * usageScope 단일 필터 전용 페이징 조회 (기존 호출자 backward-compat 보조).
     * @deprecated 신규 코드는 {@link #search(UUID, String, String, String, String, String, Pageable)} 사용.
     */
    @Deprecated
    default Page<Product> search(UUID categoryId, String status, String q, String tagFilter, Pageable pageable) {
        return search(categoryId, status, q, tagFilter, null, null, pageable);
    }

    // ============================================================
    // V3 마이그 신규 — modelCode + usageScope/estimateCategory 필터
    // ============================================================

    Optional<Product> findByModelCodeAndIsDeletedFalse(String modelCode);

    /** #30 — estimate 카탈로그 벌크: 구성품 modelCode 묶음 조회. */
    List<Product> findByModelCodeInAndIsDeletedFalse(java.util.Collection<String> modelCodes);

    boolean existsByModelCodeAndIsDeletedFalse(String modelCode);

    Optional<Product> findByProductCodeAndIsDeletedFalse(String productCode);

    boolean existsByProductCodeAndIsDeletedFalse(String productCode);

    /**
     * 카탈로그 endpoint 필터 — usageScope/estimateCategory 조합 검색.
     * GET /api/v1/products?usageScope={enum}&category={enum}.
     */
    @Query("SELECT p FROM Product p WHERE p.isDeleted = false "
            + "AND (:usageScope IS NULL OR p.usageScope = :usageScope) "
            + "AND (:estimateCategory IS NULL OR p.estimateCategory = :estimateCategory)")
    Page<Product> searchByUsageScope(@Param("usageScope") UsageScope usageScope,
                                     @Param("estimateCategory") EstimateCategory estimateCategory,
                                     Pageable pageable);

    List<Product> findByUsageScopeAndIsDeletedFalse(UsageScope usageScope);

    List<Product> findByProductCategoryAndIsDeletedFalse(ProductCategory productCategory);

    /**
     * 견적/주문 카탈로그 — 카테고리 + 노출범위(usageScope) 필터 + 시트 노출순서 정렬.
     * 개발책임자 결정(2026-06-10): 견적/주문엔 designated 품목만, 구글 시트 순서 유지.
     * usageScope 는 ESTIMATE/PARTNER_ORDER/BOTH 중 호출자가 IN 목록으로 전달.
     * display_order NULL(미sync)은 후순위(NULLS LAST), 동순위는 modelCode.
     */
    @Query("""
            SELECT p FROM Product p
              WHERE p.productCategory = :productCategory
                AND p.isDeleted = false
                AND p.usageScope IN :scopes
              ORDER BY p.displayOrder ASC NULLS LAST, p.modelCode ASC
            """)
    List<Product> findExposedCatalog(@Param("productCategory") ProductCategory productCategory,
            @Param("scopes") java.util.Collection<UsageScope> scopes);

    List<Product> findByParentBundleSetModelAndIsDeletedFalse(String parentBundleSetModel);
}
