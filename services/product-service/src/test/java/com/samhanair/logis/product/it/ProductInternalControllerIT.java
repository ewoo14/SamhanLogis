package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.Product;
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

    /** 에어컨 계열 카테고리(serial_managed=true)에 속하는 테스트 품목 UUID */
    private UUID serialProductId;

    /** batch 카테고리(serial_managed=false, PIPING)에 속하는 테스트 품목 UUID */
    private UUID batchProductId;

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
        batchProduct.updateEcountMeta("PIPE-BATCH-IT", null, null, null, true, null);
        batchProductId = batchProduct.getId();
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
