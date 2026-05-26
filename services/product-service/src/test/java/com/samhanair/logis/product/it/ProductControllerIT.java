package com.samhanair.logis.product.it;

import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.product.ProductServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.repository.CategoryRepository;
import java.math.BigDecimal;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * Plan §6.3 권한 매트릭스 검증. ApiGateway 가 X-User-Id / X-User-Role 헤더를 주입하므로
 * IT 에서도 동일 헤더로 호출한다. SecurityConfig 가 헤더 → SecurityContext 로 변환할 것을 가정.
 *
 * <p>본 IT 는 BE 의 다음 산출물을 가정한다:
 * <ul>
 *   <li>{@code POST   /products}                      — MANAGER 이상</li>
 *   <li>{@code GET    /products/{id}}                 — SALES 이상</li>
 *   <li>{@code GET    /products?status=ACTIVE}        — SALES 이상</li>
 *   <li>{@code PATCH  /products/{id}/price}           — ACCOUNTANT, MANAGER, MASTER</li>
 *   <li>{@code PATCH  /products/{id}}                 — MANAGER, MASTER</li>
 *   <li>{@code PATCH  /products/{id}/discontinue}     — MANAGER, MASTER</li>
 * </ul>
 */
@SpringBootTest(classes = ProductServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class ProductControllerIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CategoryRepository categoryRepository;

    @MockBean
    private DynamicPermissionClient dynamicPermissionClient;

    private UUID categoryId;

    @BeforeEach
    void setUp() {
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
        Category cat = categoryRepository.findAll().stream()
                .filter(c -> "INDOOR_WALL".equals(c.getCode()))
                .findFirst()
                .orElseGet(() -> categoryRepository.save(
                        Category.create("INDOOR_WALL", "벽걸이형 실내기", null, 1)));
        categoryId = cat.getId();
    }

    @Test
    void unauthenticated_get_returns403() throws Exception {
        // SecurityConfig 가 anonymous 요청을 deny → ExceptionTranslationFilter 의 default
        // entry point 가 403 으로 처리 (HeaderAuthenticationFilter 가 헤더 없을 시 인증 미설정).
        mockMvc.perform(get("/products"))
                .andExpect(status().isForbidden());
    }

    @Test
    void salesRole_post_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.canEdit("SALES", "products.admin"))
                .thenReturn(false);
        var body = Map.of(
                "name", "테스트 제품",
                "modelName", "TEST-SALES-001",
                "categoryId", categoryId.toString(),
                "sellingPrice", "1000000",
                "purchasePrice", "800000",
                "currency", "KRW",
                "tags", Map.of(),
                "description", "SALES 가 만들면 안 됨");

        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerRole_post_returns201_thenGet_returnsCreated() throws Exception {
        var body = Map.of(
                "name", "무풍 18평",
                "modelName", "MANAGER-CREATE-001",
                "categoryId", categoryId.toString(),
                "sellingPrice", "1500000",
                "purchasePrice", "1100000",
                "currency", "KRW",
                "tags", Map.of("전압", "220V"),
                "description", "MANAGER 정상 등록");

        // 모든 응답은 ApiResponse<T> 래핑이므로 jsonPath 는 $.data.* 로 접근.
        MvcResult result = mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(notNullValue()))
                .andReturn();

        String createdId = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(get("/products/" + createdId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.modelName").value("MANAGER-CREATE-001"))
                .andExpect(jsonPath("$.data.sellingPrice").value(1500000));
    }

    @Test
    void accountantRole_priceUpdate_succeeds_butFullUpdate_returns403() throws Exception {
        // setup: MANAGER 가 먼저 제품 생성
        var createBody = Map.of(
                "name", "회계 갱신 대상",
                "modelName", "ACC-UPDATE-001",
                "categoryId", categoryId.toString(),
                "sellingPrice", "2000000",
                "purchasePrice", "1500000",
                "currency", "KRW",
                "tags", Map.of(),
                "description", "회계가 가격만 갱신");

        MvcResult created = mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated())
                .andReturn();
        // ApiResponse<ProductResponse> 래핑이라 data.id 로 접근.
        String pid = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // ACCOUNTANT 의 가격 PATCH → 200
        var pricePatch = Map.of("sellingPrice", "2200000", "purchasePrice", "1600000");
        mockMvc.perform(patch("/products/" + pid + "/price")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(pricePatch)))
                .andExpect(status().isOk());

        // ACCOUNTANT 의 전체 PATCH → 403 (이름/태그 등 비-가격 필드는 MANAGER 권한 필요)
        Mockito.when(dynamicPermissionClient.canEdit("ACCOUNTANT", "products.admin"))
                .thenReturn(false);
        var fullPatch = Map.of("name", "이름 바꿔줘", "tags", Map.of("전압", "380V"));
        mockMvc.perform(patch("/products/" + pid)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(fullPatch)))
                .andExpect(status().isForbidden());
    }

    @Test
    void byModel_salesRole_returns200() throws Exception {
        // SALES role 도 by-model 조회 가능 (Q3=B 결정 — 모든 사용자 입력 가능 시나리오)
        var createBody = Map.of(
                "name", "by-model 시나리오",
                "modelName", "BY-MODEL-OK-001",
                "categoryId", categoryId.toString(),
                "sellingPrice", "1500000",
                "purchasePrice", "1100000",
                "currency", "KRW",
                "tags", Map.of("hp", "1.5"),
                "description", "modelName onBlur lookup 대상");

        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/products/by-model/BY-MODEL-OK-001")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.modelName").value("BY-MODEL-OK-001"))
                .andExpect(jsonPath("$.data.sellingPrice").value(1500000));
    }

    @Test
    void byModel_unauthenticated_returns403() throws Exception {
        mockMvc.perform(get("/products/by-model/SOMETHING"))
                .andExpect(status().isForbidden());
    }

    @Test
    void byModel_missing_returns404() throws Exception {
        mockMvc.perform(get("/products/by-model/THIS-MODEL-DOES-NOT-EXIST")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isNotFound());
    }

    @Test
    void discontinuedFilter_excludedFromActiveQuery() throws Exception {
        // 1) 활성 제품 등록
        var createBody = Map.of(
                "name", "단종 시나리오",
                "modelName", "DISC-001",
                "categoryId", categoryId.toString(),
                "sellingPrice", new BigDecimal("800000"),
                "purchasePrice", new BigDecimal("600000"),
                "currency", "KRW",
                "tags", Map.of(),
                "description", "단종 후 ACTIVE 필터에서 제외돼야 함");

        MvcResult created = mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated())
                .andReturn();
        String pid = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 2) 단종 처리 — POST + @ResponseStatus(NO_CONTENT) 이므로 204.
        mockMvc.perform(post("/products/" + pid + "/discontinue")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER"))
                .andExpect(status().isNoContent());

        // 3) ACTIVE 필터로 전체 조회 — Page<ProductSummaryResponse> + ApiResponse 래핑.
        // 방금 단종된 항목이 data.content 에 빠져 있어야 한다.
        mockMvc.perform(get("/products?status=ACTIVE")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.modelName=='DISC-001')]").isEmpty());
    }
}
