package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.web.dto.LookupRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * /products/internal/lookup 엔드포인트 통합 테스트 — Phase INV-S S1 사이클 1 리뷰 fix.
 *
 * <p>검증 목표:
 * <ol>
 *   <li><b>QA M-3 / BE P1-5</b>: 에어컨 카테고리 품목의 {@code serialManaged=true} 가
 *       {@code ProductSummaryResponse.from(Product)} 실제 변환 경로를 통해 JSON 응답에
 *       올바르게 직렬화되는지 end-to-end 검증. (backward-compat 생성자가 아닌 실 from() 경로)</li>
 *   <li><b>BE P1-5 LAZY 로딩</b>: {@code from(p)} 내 {@code p.getCategory().isSerialManaged()} 가
 *       {@code @Transactional(readOnly=true)} 경계 안에서 호출되므로
 *       {@link org.hibernate.LazyInitializationException} 이 발생하지 않음을 확인.</li>
 *   <li>batch 카테고리(PIPING) 품목은 {@code serialManaged=false} 를 반환함을 확인.</li>
 * </ol>
 *
 * <p>X-Internal-Token 헤더 인증이 통과한 상태에서 실제 DB 조회 후 ProductSummaryResponse
 * 직렬화 결과를 검증한다. Spring Context 공유 (AbstractPostgresIT 싱글턴 컨테이너 패턴).
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ProductInternalControllerIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private BundleComponentRepository bundleComponentRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 에어컨 계열 카테고리(serial_managed=true)에 속하는 테스트 품목 UUID */
    private UUID serialProductId;

    /** batch 카테고리(serial_managed=false, PIPING)에 속하는 테스트 품목 UUID */
    private UUID batchProductId;

    /** BUNDLE productType 계약 검증용 세트 품목 UUID */
    private UUID bundleProductId;

    private String bundleProductCode;
    private String bundleProductName;

    /**
     * 픽스처 구성:
     * <ul>
     *   <li>V9 SQL UPDATE 로 에어컨 계열 카테고리(INDOOR_WALL)의 serial_managed=true 적용됨</li>
     *   <li>PIPING 카테고리는 serial_managed=false (DEFAULT 유지)</li>
     * </ul>
     */
    @BeforeEach
    void setUp() {
        // V2 시드 INDOOR_WALL 카테고리 — V9 UPDATE 로 serial_managed=true
        Category serialCategory = categoryRepository.findAll().stream()
                .filter(c -> "INDOOR_WALL".equals(c.getCode()))
                .findFirst()
                .orElseGet(() -> {
                    Category c = Category.create("INDOOR_WALL", "벽걸이형", null, 1);
                    c.markSerialManaged(true);
                    return categoryRepository.save(c);
                });
        // N-3 (방어 단언): V9 마이그레이션이 실제로 serial_managed=true 를 적용했는지 검증
        assertThat(serialCategory.isSerialManaged())
                .as("INDOOR_WALL 카테고리는 V9 마이그레이션에 의해 serial_managed=true 이어야 합니다")
                .isTrue();

        // V2 시드 PIPING 카테고리 — serial_managed=false (DEFAULT)
        Category batchCategory = categoryRepository.findAll().stream()
                .filter(c -> "PIPING".equals(c.getCode()))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(
                        Category.create("PIPING", "배관/부속", null, 3)));

        // 에어컨 계열 품목 생성
        Product serialProduct = productRepository.save(Product.create(
                "테스트 벽걸이 에어컨",
                "IT-SERIAL-MANAGED-" + UUID.randomUUID().toString().substring(0, 8),
                serialCategory,
                new BigDecimal("1500000"),
                new BigDecimal("1200000"),
                "KRW",
                null,
                "serialManaged IT 검증용 에어컨"));
        serialProduct.changeProductCategory(ProductCategory.HOME_MULTI);
        serialProduct.updateEcountMeta("AC-SERIAL-IT", null, null, null, true, null);
        serialProductId = serialProduct.getId();

        // batch 품목 생성 (배관/부속)
        Product batchProduct = productRepository.save(Product.create(
                "테스트 배관 부속",
                "IT-BATCH-MANAGED-" + UUID.randomUUID().toString().substring(0, 8),
                batchCategory,
                new BigDecimal("50000"),
                new BigDecimal("30000"),
                "KRW",
                null,
                "serialManaged=false IT 검증용 batch 품목"));
        batchProduct.changeProductCategory(ProductCategory.COMMERCIAL_MULTI);
        batchProduct.updateEcountMeta("PIPE-BATCH-IT", null, null, null, true, null);
        batchProductId = batchProduct.getId();

        bundleProductCode = "BUNDLE-SUMMARY-IT-" + UUID.randomUUID().toString().substring(0, 8);
        bundleProductName = "테스트 세트 요약 " + UUID.randomUUID().toString().substring(0, 8);
        Product bundleProduct = productRepository.save(Product.seedFromSheet(
                bundleProductName,
                bundleProductCode,
                batchCategory,
                new BigDecimal("900000"),
                new BigDecimal("700000"),
                ProductType.BUNDLE,
                null,
                null,
                null));
        bundleProduct.changeProductCategory(ProductCategory.SINGLE_SET);
        bundleProduct.updateEcountMeta(bundleProductCode, null, null, null, true, null);
        bundleProductId = bundleProduct.getId();
    }

    /**
     * QA M-3 / BE P1-5: 에어컨 카테고리 품목 lookup 시 {@code serialManaged=true} 검증.
     *
     * <p>실제 {@code ProductSummaryResponse.from(Product)} 경로 (LAZY category 로딩 포함)를
     * 통해 JSON 직렬화되므로 LazyInitializationException 미발생 및 직렬화 정확성을 함께 검증한다.
     * backward-compat 생성자({@code serialManaged=false} 고정)를 사용한 mock 경로가 아닌
     * 실 from() 경로 검증임.
     */
    @Test
    void lookup_serialManagedCategory_returns_serialManagedTrue() throws Exception {
        var body = new LookupRequest(List.of(serialProductId));

        mockMvc.perform(post("/products/internal/lookup")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].serialManaged", is(true)))
                .andExpect(jsonPath("$.data[0].productCode", is("AC-SERIAL-IT")))
                .andExpect(jsonPath("$.data[0].categoryKey", is("homemulti")))
                .andExpect(jsonPath("$.data[0].id").exists());
    }

    /**
     * batch 카테고리(PIPING) 품목 lookup 시 {@code serialManaged=false} 검증.
     */
    @Test
    void lookup_batchCategory_returns_serialManagedFalse() throws Exception {
        var body = new LookupRequest(List.of(batchProductId));

        mockMvc.perform(post("/products/internal/lookup")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].serialManaged", is(false)))
                .andExpect(jsonPath("$.data[0].categoryKey", is("commercialMulti")))
                .andExpect(jsonPath("$.data[0].id").exists());
    }

    @Test
    void lookupByCode_returnsProductSummaryWithSerialManaged() throws Exception {
        var body = java.util.Map.of("productCode", "AC-SERIAL-IT");

        mockMvc.perform(post("/products/internal/lookup-by-code")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.productCode", is("AC-SERIAL-IT")))
                .andExpect(jsonPath("$.data.serialManaged", is(true)))
                .andExpect(jsonPath("$.data.id").exists());
    }

    @Test
    void lookup_bundleProduct_returnsProductTypeBundle() throws Exception {
        var body = new LookupRequest(List.of(bundleProductId));

        mockMvc.perform(post("/products/internal/lookup")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id", is(bundleProductId.toString())))
                .andExpect(jsonPath("$.data[0].productCode", is(bundleProductCode)))
                .andExpect(jsonPath("$.data[0].productType", is("BUNDLE")))
                .andExpect(jsonPath("$.data[0].categoryKey", is("singleSets")));
    }

    @Test
    void lookupByCode_bundleProduct_returnsProductTypeBundle() throws Exception {
        var body = java.util.Map.of("productCode", bundleProductCode);

        mockMvc.perform(post("/products/internal/lookup-by-code")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.productCode", is(bundleProductCode)))
                .andExpect(jsonPath("$.data.productType", is("BUNDLE")));
    }

    @Test
    void lookupByName_bundleProduct_returnsProductTypeBundle() throws Exception {
        mockMvc.perform(get("/products/internal/by-name")
                        .queryParam("name", bundleProductName)
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.name", is(bundleProductName)))
                .andExpect(jsonPath("$.data.productCode", is(bundleProductCode)))
                .andExpect(jsonPath("$.data.productType", is("BUNDLE")));
    }

    /**
     * 에어컨 / batch 품목 혼합 lookup — 각각 serialManaged 값이 올바르게 반환되는지 검증.
     *
     * <p>{@code findAllByIdIn} 은 IN 쿼리로 구현되어 응답 순서가 보장되지 않는다.
     * 따라서 {@code $.data[0].serialManaged} 위치 기반 단언 대신
     * jsonPath filter expression (UUID 기준) 으로 각 품목의 serialManaged 값을 독립적으로 단언한다.
     *
     * <p>N-1 fix (사이클 2 QA MAJOR 결함): size 단언만 존재해 false-green 가능성 제거.
     * UUID 별 serialManaged 단언을 추가하여 실제 변환 정확성을 보장한다.
     */
    /**
     * 정합 점검 — 구성품이 활성 품목으로 해소되는 BUNDLE 은 issues 에 포함되지 않는다(미해소 0 → healthy).
     */
    @Test
    void resolveEcountAliases_returnsMatchedOnly() throws Exception {
        String aliasCode = "ALIAS-IT-" + UUID.randomUUID().toString().substring(0, 8);
        jdbcTemplate.update("""
                INSERT INTO staging.ecount_item_alias (
                  alias_code, main_item_code, main_product_uuid, source_file_hash, source_row_no
                ) VALUES (?, ?, ?, ?, ?)
                """, aliasCode, "MAIN-IT", serialProductId, "HASH-ALIAS-IT", 1);
        // resolver가 products와 JOIN하므로 JPA fixture를 native JDBC 조회 전에 확정한다.
        productRepository.flush();
        var body = java.util.Map.of("aliasCodes", List.of(aliasCode, "ALIAS-NOT-FOUND"));

        mockMvc.perform(post("/products/internal/resolve-ecount-aliases")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.resolved['" + aliasCode + "']", is(serialProductId.toString())))
                .andExpect(jsonPath("$.data.resolved['ALIAS-NOT-FOUND']").doesNotExist());
    }

    @Test
    void bundleIntegrity_resolvedComponent_notFlagged() throws Exception {
        Category cat = categoryRepository.findAll().get(0);
        String childCode = "IT-CHILD-OK-" + UUID.randomUUID().toString().substring(0, 8);
        String parentCode = "IT-SET-OK-" + UUID.randomUUID().toString().substring(0, 8);
        // 자식(활성 품목) + 부모 BUNDLE + 자식 코드로 해소되는 구성품
        productRepository.save(Product.seedFromSheet(
                "정합 자식 OK", childCode, cat, new BigDecimal("100000"), new BigDecimal("80000"),
                ProductType.SINGLE, null, null, null));
        Product parent = productRepository.save(Product.seedFromSheet(
                "정합 세트 OK", parentCode, cat, new BigDecimal("100000"), new BigDecimal("80000"),
                ProductType.BUNDLE, null, null, null));
        bundleComponentRepository.save(BundleComponent.seed(
                parent.getId(), childCode, BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.INDOOR, null, true, null));

        mockMvc.perform(get("/products/internal/bundle-integrity")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                // 이 부모는 미해소 구성품이 없으므로 issues 의 bundleModelCode 목록에 등장하지 않아야 함
                .andExpect(jsonPath("$.data.issues[?(@.bundleModelCode=='" + parentCode + "')]").isEmpty())
                .andExpect(jsonPath("$.data.totalBundles", greaterThanOrEqualTo(1)));
    }

    /**
     * 정합 점검 — 구성품 코드가 활성 품목에 없으면(미등록/단종) 해당 세트가 issues 로 노출되고 healthy=false.
     * 이 세트는 실제 전개 시 "세트 구성품 일부를 찾을 수 없습니다" 로 거부되는 상태를 사전 적발.
     */
    @Test
    void bundleIntegrity_unresolvedComponent_flagged() throws Exception {
        Category cat = categoryRepository.findAll().get(0);
        String badCode = "IT-NONEXISTENT-" + UUID.randomUUID().toString().substring(0, 8);
        String parentCode = "IT-SET-BAD-" + UUID.randomUUID().toString().substring(0, 8);
        Product parent = productRepository.save(Product.seedFromSheet(
                "정합 세트 BAD", parentCode, cat, new BigDecimal("100000"), new BigDecimal("80000"),
                ProductType.BUNDLE, null, null, null));
        // 활성 products.modelCode 에 없는 코드로 구성품 등록 → 미해소
        bundleComponentRepository.save(BundleComponent.seed(
                parent.getId(), badCode, BigDecimal.ONE,
                BundleComponent.QtyMode.FOLLOW_SET, BundleComponent.ComponentKind.REMOTE, null, true, null));

        mockMvc.perform(get("/products/internal/bundle-integrity")
                        .header("X-Internal-Token", INTERNAL_TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.healthy", is(false)))
                .andExpect(jsonPath("$.data.unresolvedComponentCount", greaterThanOrEqualTo(1)))
                // 해당 세트가 issues 에 등장 + 미해소 구성품 코드가 목록에 포함
                .andExpect(jsonPath("$.data.issues[?(@.bundleModelCode=='" + parentCode + "')]"
                        + ".unresolvedComponents[*].componentProductCode", hasItem(badCode)));
    }

    @Test
    void lookup_mixed_returnsCorrectSerialManagedPerProduct() throws Exception {
        var body = new LookupRequest(List.of(serialProductId, batchProductId));
        String serialIdStr = serialProductId.toString();
        String batchIdStr = batchProductId.toString();

        mockMvc.perform(post("/products/internal/lookup")
                        .header("X-Internal-Token", INTERNAL_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                // 총 2건 반환
                .andExpect(jsonPath("$.data.length()", is(2)))
                // serial 품목(INDOOR_WALL) — UUID 기준 filter expression, 결과는 List → hasItem
                .andExpect(jsonPath("$.data[?(@.id=='" + serialIdStr + "')].serialManaged", hasItem(true)))
                // batch 품목(PIPING) — UUID 기준 filter expression, 결과는 List → hasItem
                .andExpect(jsonPath("$.data[?(@.id=='" + batchIdStr + "')].serialManaged", hasItem(false)));
    }
}
