package com.samhanair.logis.product.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /api/products/by-code/{code}} 의 happy / not-found / soft-deleted 가드 검증.
 *
 * <p>경로:
 * <ul>
 *   <li>happy — modelCode 존재 → 200 + ApiResponse.data.id (UUID) + modelCode + name</li>
 *   <li>not-found — 미존재 modelCode → 404 (BusinessException(NOT_FOUND))</li>
 *   <li>soft-deleted — markDeleted 후 동일 modelCode → 404 ({@code @SQLRestriction})</li>
 * </ul>
 *
 * <p>SecurityConfig 가 {@code anyRequest().authenticated()} 이므로 모든 case 에 X-User-Id +
 * X-User-Role 헤더 주입. SALES role 이 by-code 조회를 수행하는 시나리오 대표.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ProductByCodeControllerIT extends AbstractPostgresIT {

    private static final String CODE_PRESENT = "BY-CODE-IT-001";
    private static final String CODE_FOR_DELETE = "BY-CODE-IT-DEL-001";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    private Category category;

    @BeforeEach
    void setUp() {
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        category = categoryRepository.findAll().stream()
                .filter(c -> "INDOOR_WALL".equals(c.getCode()))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(
                        Category.create("INDOOR_WALL", "벽걸이형 실내기", null, 1)));

        // happy 시드 — modelCode 가 일치하는 단건 보장
        Product present = Product.seedFromSheet(
                "by-code happy",
                CODE_PRESENT,
                category,
                new BigDecimal("1500000"),
                new BigDecimal("1100000"),
                ProductType.SINGLE,
                ProductCategory.HOME_MULTI,
                UsageScope.BOTH,
                EstimateCategory.HOME_MULTI);
        productRepository.save(present);
    }

    @Test
    void byCode_happy_returns200WithIdAndModelCode() throws Exception {
        mockMvc.perform(get("/api/products/by-code/" + CODE_PRESENT)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                // ApiResponse 래핑 → $.data.* (PR #16 회고 동일 패턴)
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").exists())
                .andExpect(jsonPath("$.data.modelCode").value(CODE_PRESENT))
                .andExpect(jsonPath("$.data.name").value("by-code happy"));
    }

    @Test
    void byCode_missing_returns404() throws Exception {
        mockMvc.perform(get("/api/products/by-code/UNKNOWN-CODE-9999")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound());
    }

    @Test
    void byCode_customerRole_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.canView("CUSTOMER", "products.list"))
                .thenReturn(false);
        // Phase 7 종합 TM — @PreAuthorize 7-tier 화이트리스트 (MASTER/MANAGER/DEVELOPER/SALES/
        // ACCOUNTANT/WAREHOUSE/INVENTORY) 거부 검증. CUSTOMER role 은 by-code 조회 권한 X.
        // 인증은 통과 (X-User-Id + X-User-Role 헤더 → SecurityContext) 하나 권한 단계에서 거부 → 403.
        mockMvc.perform(get("/api/products/by-code/" + CODE_PRESENT)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "CUSTOMER"))
                .andExpect(status().isForbidden());
    }

    @Test
    void byCode_softDeleted_returns404() throws Exception {
        // soft-deleted 시드 — markDeleted 후 동일 code 조회 시 @SQLRestriction 으로 미노출.
        Product toDelete = Product.seedFromSheet(
                "by-code soft-deleted",
                CODE_FOR_DELETE,
                category,
                new BigDecimal("1500000"),
                new BigDecimal("1100000"),
                ProductType.SINGLE,
                ProductCategory.HOME_MULTI,
                UsageScope.BOTH,
                EstimateCategory.HOME_MULTI);
        productRepository.save(toDelete);
        toDelete.markDeleted("test-it");
        productRepository.saveAndFlush(toDelete);

        mockMvc.perform(get("/api/products/by-code/" + CODE_FOR_DELETE)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound());
    }
}
