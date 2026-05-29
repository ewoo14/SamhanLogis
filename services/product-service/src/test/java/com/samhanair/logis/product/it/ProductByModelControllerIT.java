package com.samhanair.logis.product.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * BE 가 본 슬라이스에서 추가한 public endpoint
 * {@code GET /products/by-model/{modelName}} 의 권한 매트릭스 + NOT_FOUND 가드 검증.
 *
 * <p>가정 (PM 명시):
 * <ul>
 *   <li>SecurityConfig 가 anyRequest().authenticated() 를 유지하므로 모든 인증된 role 이 200 (조회 권한 차별 없음)</li>
 *   <li>미인증 = 403 (HeaderAuthenticationFilter 가 X-User-Id 누락 시 SecurityContext 미설정 → ExceptionTranslationFilter)</li>
 *   <li>모델명 미존재 = 404 (BusinessException(NOT_FOUND) → GlobalExceptionHandler)</li>
 *   <li>응답 본문 = ApiResponse&lt;ProductResponse&gt; — jsonPath {@code $.data.*}</li>
 * </ul>
 *
 * <p>7-tier 권한 (MASTER / MANAGER / DEVELOPER / SALES / WAREHOUSE / INVENTORY / ACCOUNTANT)
 * 모두 200 검증. PR #16 회고: 기존 product CRUD 권한 매트릭스 기준 그대로 유지.
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ProductByModelControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CategoryRepository categoryRepository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    private UUID categoryId;
    private static final String MODEL = "BY-MODEL-TEST-001";

    @BeforeEach
    void setUp() throws Exception {
        Mockito.lenient().when(dynamicPermissionClient.canView(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.canEdit(Mockito.anyString(), Mockito.anyString()))
                .thenReturn(true);
        Mockito.lenient().when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
                .thenReturn(true);
        Category cat = categoryRepository.findAll().stream()
                .filter(c -> "INDOOR_WALL".equals(c.getCode()))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(
                        Category.create("INDOOR_WALL", "벽걸이형 실내기", null, 1)));
        categoryId = cat.getId();

        // MANAGER 가 시드 — by-model 조회 대상 1건 보장.
        Map<String, Object> body = Map.of(
                "name", "by-model 조회 대상",
                "modelName", MODEL,
                "categoryId", categoryId.toString(),
                "sellingPrice", "1500000",
                "purchasePrice", "1100000",
                "currency", "KRW",
                "tags", Map.of(),
                "description", "by-model lookup IT 시드");
        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }

    @Test
    void byModel_unauthenticated_returns403() throws Exception {
        // 헤더 미주입 → SecurityContext 미설정 → 403.
        mockMvc.perform(get("/products/by-model/" + MODEL))
                .andExpect(status().isForbidden());
    }

    @Test
    void byModel_salesRole_returns200() throws Exception {
        // 모든 인증 role 이 조회 가능 — SALES.
        mockMvc.perform(get("/products/by-model/" + MODEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                // ApiResponse 래핑 → $.data.* (PR #16 회고).
                .andExpect(jsonPath("$.data.modelName").value(MODEL));
    }

    @Test
    void byModel_managerRole_returns200() throws Exception {
        mockMvc.perform(get("/products/by-model/" + MODEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.modelName").value(MODEL));
    }

    @Test
    void byModel_warehouseRole_returns200() throws Exception {
        // WAREHOUSE 도 조회 가능 — slip 라인 작성 시 모델명 lookup 시나리오.
        mockMvc.perform(get("/products/by-model/" + MODEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.modelName").value(MODEL));
    }

    @Test
    void byModel_inventoryRole_returns200() throws Exception {
        mockMvc.perform(get("/products/by-model/" + MODEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY"))
                .andExpect(status().isOk());
    }

    @Test
    void byModel_accountantRole_returns200() throws Exception {
        mockMvc.perform(get("/products/by-model/" + MODEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
    }

    @Test
    void byModel_developerRole_returns200() throws Exception {
        mockMvc.perform(get("/products/by-model/" + MODEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "DEVELOPER"))
                .andExpect(status().isOk());
    }

    @Test
    void byModel_masterRole_returns200() throws Exception {
        mockMvc.perform(get("/products/by-model/" + MODEL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk());
    }

    @Test
    void byModel_missing_returns404() throws Exception {
        // 가드 분기: NOT_FOUND (CONFLICT 아님 — 모델명 미존재는 자원 부재).
        mockMvc.perform(get("/products/by-model/UNKNOWN-MODEL-9999")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound());
    }
}
