package com.samhanair.logis.product.repository;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductEstimateExposure;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
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

    List<Product> findByNameAndStatusAndIsDeletedFalse(String name, ProductStatus status);

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
     * <p>소비처: {@code /products} (GET) 엔드포인트 — 어드민/데스크톱 검색 및
     * 전표 라인 자동완성. {@code usageScope} 가 오면 카탈로그 경로와 동일하게
     * ESTIMATE/PARTNER_ORDER 요청에 BOTH 를 포함한다.
     */
    // [RC4] null→bytea 방지: CAST(:q AS text) (nativeQuery 이므로 PostgreSQL text 캐스트)
    @Query(value = """
            SELECT * FROM products p
            WHERE p.is_deleted = false
              AND (:categoryId IS NULL OR p.category_id = :categoryId)
              AND (:status      IS NULL OR p.status     = :status)
            AND (CAST(:q AS text) IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\'
                         OR LOWER(p.model_name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\')
              AND (CAST(:tagFilter AS text) IS NULL OR p.tags @> CAST(:tagFilter AS jsonb))
              AND (CAST(:usageScope AS text) IS NULL
                   OR (CAST(:usageScope AS text) = 'ESTIMATE' AND p.usage_scope IN ('ESTIMATE', 'BOTH'))
                   OR (CAST(:usageScope AS text) = 'PARTNER_ORDER' AND p.usage_scope IN ('PARTNER_ORDER', 'BOTH'))
                   OR (CAST(:usageScope AS text) NOT IN ('ESTIMATE', 'PARTNER_ORDER') AND p.usage_scope = CAST(:usageScope AS text)))
              AND (CAST(:productCategory AS text) IS NULL OR p.product_category = CAST(:productCategory AS text))
            """,
           countQuery = """
            SELECT COUNT(*) FROM products p
            WHERE p.is_deleted = false
              AND (:categoryId IS NULL OR p.category_id = :categoryId)
              AND (:status      IS NULL OR p.status     = :status)
            AND (CAST(:q AS text) IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\'
                         OR LOWER(p.model_name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\')
              AND (CAST(:tagFilter AS text) IS NULL OR p.tags @> CAST(:tagFilter AS jsonb))
              AND (CAST(:usageScope AS text) IS NULL
                   OR (CAST(:usageScope AS text) = 'ESTIMATE' AND p.usage_scope IN ('ESTIMATE', 'BOTH'))
                   OR (CAST(:usageScope AS text) = 'PARTNER_ORDER' AND p.usage_scope IN ('PARTNER_ORDER', 'BOTH'))
                   OR (CAST(:usageScope AS text) NOT IN ('ESTIMATE', 'PARTNER_ORDER') AND p.usage_scope = CAST(:usageScope AS text)))
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

    /**
     * 시트에서 soft-delete된 품목이 같은 모델 코드로 재등장할 때 기존 행을 복원하기 위한 조회다.
     *
     * <p>엔티티의 {@code @SQLRestriction}은 삭제행을 감추므로 native query로 가장 최근 삭제행을
     * 명시적으로 조회한다. 새 행을 만들면 수동으로 정한 제품구분이 초기화되므로 이 경로를 우선한다.
     */
    @Query(value = """
            SELECT *
              FROM products
             WHERE model_code = CAST(:modelCode AS text)
               AND is_deleted = TRUE
             ORDER BY deleted_at DESC NULLS LAST, created_at DESC
             LIMIT 1
            """, nativeQuery = true)
    Optional<Product> findLatestDeletedByModelCode(@Param("modelCode") String modelCode);

    /**
     * 구성품 replace-all 직렬화용 PESSIMISTIC_WRITE 잠금 단건 조회 (#2 동시성 가드).
     *
     * <p>{@code BundleComponentService.replaceComponents} 시작부에서 부모 BUNDLE 을
     * {@code id} 로 재조회하여 동일 세트에 대한 동시 PUT 을 행 잠금으로 직렬화한다.
     * 동시 PUT 이 같은 부모의 구성품 집합을 동시에 replace-all 하면 부분 유니크 인덱스
     * (bundle_product_id, component_product_code, is_deleted=false) 경합으로 유니크 500 또는
     * 집합 병합 오염이 발생하므로, 한 트랜잭션이 먼저 부모 행을 잠가 순서화한다.
     * {@link com.samhanair.logis.product.editrequest.repository.ProductEditRequestRepository#findByIdForDecision}
     * 선례와 동일 패턴.
     *
     * @param id 부모 Product.id
     * @return 잠금 획득한 Product Optional (soft-delete 행은 {@code @SQLRestriction} 으로 제외)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Product p WHERE p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") UUID id);

    /** #30 — estimate 카탈로그 벌크: 구성품 modelCode 묶음 조회. */
    List<Product> findByModelCodeInAndIsDeletedFalse(java.util.Collection<String> modelCodes);

    /**
     * modelName 묶음 조회 (#5 display-orders 벌크 해소 2차).
     *
     * <p>{@code model_code} 1차 IN 조회에서 미해소된 식별자를 {@code model_name} 으로
     * 일괄 재조회한다 — {@link #findByCatalogExposedModelCodeAndIsDeletedFalse} 의
     * model_name fallback 을 벌크화하여 N+1 을 제거하기 위함.
     */
    List<Product> findByModelNameInAndIsDeletedFalse(java.util.Collection<String> modelNames);

    boolean existsByModelCodeAndIsDeletedFalse(String modelCode);

    Optional<Product> findByProductCodeAndIsDeletedFalse(String productCode);

    boolean existsByProductCodeAndIsDeletedFalse(String productCode);

    /**
     * 카탈로그 endpoint 필터 — usageScope(IN 확장 시멘틱)/M:N estimateCategory/q 조합 검색.
     *
     * <p>GET /api/v1/products?usageScope={enum}&amp;category={enum}&amp;q={keyword}.
     *
     * <p><b>usageScope IN 확장 시멘틱 (PR-B 2026-06-11, 지적 [10][3])</b>:
     * <ul>
     *   <li>ESTIMATE 요청 → IN (ESTIMATE, BOTH) — BOTH 품목이 견적 카탈로그에 포함</li>
     *   <li>PARTNER_ORDER 요청 → IN (PARTNER_ORDER, BOTH) — BOTH 품목이 주문 카탈로그에 포함</li>
     *   <li>BOTH/NONE 요청 → exact match (기존 동작 유지)</li>
     *   <li>null → 전체 (필터 없음)</li>
     * </ul>
     *
     * <p><b>q 파라미터 (PR-B 2026-06-11, 지적 [1][9][15])</b>:
     * model_code / model_name / name LIKE 검색. null/blank → 전체.
     * {@code model_code} 가 비어 있고 {@code model_name} 만 있는 레거시 행도 검색 가능하도록
     * model_name 컬럼도 검색 대상에 포함한다 (사이클2 지적 P2-1, 2026-06-11).
     * q 바인딩 전에 호출자(서비스 계층)가 LIKE 와일드카드({@code \}, {@code %}, {@code _}) 이스케이프 적용.
     *
     * <p><b>정렬</b>:
     * {@code product_estimate_exposure.display_order ASC NULLS LAST, model_code ASC}.
     * category 가 없으면 노출 행 join 이 비어 있으므로 model_code 기준 결정 순서만 보장한다.
     * count 쿼리는 ORDER BY 제외.
     */
    @Query(value = """
            SELECT p.* FROM products p
              LEFT JOIN product_estimate_exposure e
                ON e.product_id = p.id
               AND e.is_deleted = false
               AND e.estimate_category = CAST(:estimateCategory AS text)
             WHERE p.is_deleted = false
               AND (
                     CAST(:usageScope AS text) IS NULL
                     OR (CAST(:usageScope AS text) = 'ESTIMATE'
                         AND p.usage_scope IN ('ESTIMATE', 'BOTH'))
                     OR (CAST(:usageScope AS text) = 'PARTNER_ORDER'
                         AND p.usage_scope IN ('PARTNER_ORDER', 'BOTH'))
                     OR (CAST(:usageScope AS text) NOT IN ('ESTIMATE', 'PARTNER_ORDER')
                         AND p.usage_scope = CAST(:usageScope AS text))
                   )
               AND (CAST(:physicalCategoryId AS text) IS NULL
                    OR p.category_id = CAST(:physicalCategoryId AS uuid))
               AND (CAST(:estimateCategory AS text) IS NULL OR e.id IS NOT NULL)
               AND (CAST(:q AS text) IS NULL
                    OR LOWER(p.model_code) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\'
                    OR LOWER(p.name)       LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\'
                    OR LOWER(p.model_name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\')
             ORDER BY e.display_order ASC NULLS LAST, p.model_code ASC
            """,
           countQuery = """
            SELECT COUNT(*) FROM products p
              LEFT JOIN product_estimate_exposure e
                ON e.product_id = p.id
               AND e.is_deleted = false
               AND e.estimate_category = CAST(:estimateCategory AS text)
             WHERE p.is_deleted = false
               AND (
                     CAST(:usageScope AS text) IS NULL
                     OR (CAST(:usageScope AS text) = 'ESTIMATE'
                         AND p.usage_scope IN ('ESTIMATE', 'BOTH'))
                     OR (CAST(:usageScope AS text) = 'PARTNER_ORDER'
                         AND p.usage_scope IN ('PARTNER_ORDER', 'BOTH'))
                     OR (CAST(:usageScope AS text) NOT IN ('ESTIMATE', 'PARTNER_ORDER')
                         AND p.usage_scope = CAST(:usageScope AS text))
                   )
               AND (CAST(:physicalCategoryId AS text) IS NULL
                    OR p.category_id = CAST(:physicalCategoryId AS uuid))
               AND (CAST(:estimateCategory AS text) IS NULL OR e.id IS NOT NULL)
               AND (CAST(:q AS text) IS NULL
                    OR LOWER(p.model_code) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\'
                    OR LOWER(p.name)       LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\'
                    OR LOWER(p.model_name) LIKE LOWER(CONCAT('%', CAST(:q AS text), '%')) ESCAPE '\\')
            """,
           nativeQuery = true)
    Page<Product> searchByUsageScope(@Param("usageScope") String usageScope,
                                     @Param("estimateCategory") String estimateCategory,
                                     @Param("physicalCategoryId") String physicalCategoryId,
                                     @Param("q") String q,
                                     Pageable pageable);

    /** 기존 호출자 호환용 물리 제품구분 미선택 조회. */
    default Page<Product> searchByUsageScope(String usageScope, String estimateCategory,
                                             String q, Pageable pageable) {
        return searchByUsageScope(usageScope, estimateCategory, null, q, pageable);
    }

    /** 카탈로그 응답 변환용 catL/catM/catS 선로딩 — native Page 조회 후 순서 보존 재매핑에 사용. */
    @EntityGraph(attributePaths = {"category", "catL", "catM", "catS"})
    @Query("SELECT p FROM Product p WHERE p.id IN :ids")
    List<Product> findAllWithClassificationsByIdIn(@Param("ids") Collection<UUID> ids);

    List<Product> findByUsageScopeAndIsDeletedFalse(UsageScope usageScope);

    List<Product> findByProductCategoryAndIsDeletedFalse(ProductCategory productCategory);

    /** L분류명 변경 시 해당 분류를 직접 사용하는 품목의 수량 동기화 역할을 재검증한다. */
    List<Product> findByCatL_IdAndIsDeletedFalse(UUID classificationId);

    /** Classification 삭제 차단용 — catL/catM/catS 중 하나라도 참조하는 활성 품목 수. */
    @Query("""
            SELECT COUNT(p)
              FROM Product p
             WHERE p.isDeleted = false
               AND ((p.catL IS NOT NULL AND p.catL.id = :classificationId)
                    OR (p.catM IS NOT NULL AND p.catM.id = :classificationId)
                    OR (p.catS IS NOT NULL AND p.catS.id = :classificationId))
            """)
    long countUsingClassification(@Param("classificationId") UUID classificationId);

    /**
     * 견적/주문 카탈로그 — M:N 견적 카테고리 + 노출범위(usageScope) 필터 + 카테고리별 순서 정렬.
     * 개발책임자 결정(2026-06-10): 견적/주문엔 designated 품목만, 구글 시트 순서 유지.
     * usageScope 는 ESTIMATE/PARTNER_ORDER/BOTH 중 호출자가 IN 목록으로 전달.
     * M:N displayOrder NULL(미sync)은 후순위(NULLS LAST), 동순위는 modelCode.
     */
    @EntityGraph(attributePaths = {"catL", "catM", "catS"})
    @Query("""
            SELECT p FROM Product p
              , ProductEstimateExposure e
              WHERE e.productId = p.id
                AND e.isDeleted = false
                AND e.estimateCategory = :estimateCategory
                AND p.isDeleted = false
                AND p.status NOT IN (com.samhanair.logis.product.domain.ProductStatus.DISCONTINUED,
                                     com.samhanair.logis.product.domain.ProductStatus.NOT_FOR_SALE)
                AND p.usageScope IN :scopes
              ORDER BY e.displayOrder ASC NULLS LAST, p.modelCode ASC
            """)
    List<Product> findExposedCatalog(@Param("estimateCategory") EstimateCategory estimateCategory,
            @Param("scopes") java.util.Collection<UsageScope> scopes);

    List<Product> findByParentBundleSetModelAndIsDeletedFalse(String parentBundleSetModel);
}
