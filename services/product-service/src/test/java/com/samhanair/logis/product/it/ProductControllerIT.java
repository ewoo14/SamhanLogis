package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.CategoryRepository;
import com.samhanair.logis.product.web.dto.OpaqueUuidDeserializer;
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

    @Autowired
    private BundleComponentRepository bundleComponentRepository;

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
        Mockito.lenient()
                .when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.anyString(), Mockito.any(PermissionAction.class)))
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
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("products.admin"), Mockito.eq(PermissionAction.CREATE)))
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
    void setComponentCreate_withoutParentSetModelCode_returns400() throws Exception {
        var body = Map.of(
                "name", "구성품 부모 누락",
                "modelName", "COMP-NO-PARENT-001",
                "categoryId", categoryId.toString(),
                "sellingPrice", "100000",
                "purchasePrice", "80000",
                "currency", "KRW",
                "itemKind", "SET_COMPONENT",
                "componentKind", "INDOOR",
                "goodsType", "GOODS");

        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void setComponentCreate_withValidBundleParent_createsBundleComponentLink() throws Exception {
        String parentModelCode = "SET-PARENT-001";
        var parentBody = Map.of(
                "name", "테스트 세트",
                "modelName", parentModelCode,
                "categoryId", categoryId.toString(),
                "sellingPrice", "1000000",
                "purchasePrice", "800000",
                "currency", "KRW",
                "itemKind", "SET",
                "bundleMode", "EXPAND",
                "goodsType", "GOODS");

        MvcResult parentCreated = mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(parentBody)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID parentId = OpaqueUuidDeserializer.decode(objectMapper.readTree(parentCreated.getResponse().getContentAsString())
                .get("data").get("id").asText());

        String componentModelCode = "SET-COMP-001";
        var componentBody = Map.of(
                "name", "테스트 세트 구성품",
                "modelName", componentModelCode,
                "categoryId", categoryId.toString(),
                "sellingPrice", "300000",
                "purchasePrice", "250000",
                "currency", "KRW",
                "itemKind", "SET_COMPONENT",
                "parentSetModelCode", parentModelCode,
                "componentKind", "INDOOR",
                "goodsType", "GOODS");

        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(componentBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.modelCode").value(componentModelCode))
                .andExpect(jsonPath("$.data.usageScope").value("NONE"));

        assertThat(bundleComponentRepository.findByBundleProductId(parentId))
                .extracting(BundleComponent::getComponentProductCode)
                .contains(componentModelCode);
    }

    @Test
    void componentProductPatchAsGeneral_preservesParentBundleComponentLink() throws Exception {
        String parentModelCode = "SET-PARENT-PATCH-001";
        var parentBody = Map.of(
                "name", "회귀 세트",
                "modelName", parentModelCode,
                "categoryId", categoryId.toString(),
                "sellingPrice", "1000000",
                "purchasePrice", "800000",
                "currency", "KRW",
                "itemKind", "SET",
                "bundleMode", "EXPAND",
                "goodsType", "GOODS");

        MvcResult parentCreated = mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(parentBody)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID parentId = OpaqueUuidDeserializer.decode(objectMapper.readTree(parentCreated.getResponse().getContentAsString())
                .get("data").get("id").asText());

        String componentModelCode = "SET-COMP-PATCH-001";
        var componentBody = Map.of(
                "name", "회귀 구성품",
                "modelName", componentModelCode,
                "categoryId", categoryId.toString(),
                "sellingPrice", "300000",
                "purchasePrice", "250000",
                "currency", "KRW",
                "itemKind", "SET_COMPONENT",
                "parentSetModelCode", parentModelCode,
                "componentKind", "INDOOR",
                "goodsType", "GOODS");

        MvcResult componentCreated = mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(componentBody)))
                .andExpect(status().isCreated())
                .andReturn();
        String componentId = objectMapper.readTree(componentCreated.getResponse().getContentAsString())
                .get("data").get("id").asText();

        assertThat(bundleComponentRepository.findByBundleProductId(parentId))
                .extracting(BundleComponent::getComponentProductCode)
                .containsExactly(componentModelCode);

        var patchBody = Map.ofEntries(
                Map.entry("itemKind", "GENERAL"),
                Map.entry("unit", "EA"),
                Map.entry("releasePrice", "310000"),
                Map.entry("deliveryPrice", "260000"),
                Map.entry("goodsType", "GOODS"));

        // 구성품 링크는 세트측 BundleComponent CRUD에서만 관리한다. 단일 품목 편집은 부모 링크를 보존해야 한다.
        mockMvc.perform(patch("/products/" + componentId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.itemKind").value("SET_COMPONENT"))
                .andExpect(jsonPath("$.data.parentSetModelCode").value(parentModelCode));

        assertThat(bundleComponentRepository.findByBundleProductId(parentId))
                .extracting(BundleComponent::getComponentProductCode)
                .containsExactly(componentModelCode);
        assertThat(bundleComponentRepository.findByComponentProductCode(componentModelCode))
                .hasSize(1)
                .extracting(BundleComponent::getBundleProductId)
                .containsExactly(parentId);
    }

    @Test
    void managerRole_post_materialNonGoods_returns201_andUsageScopeNone() throws Exception {
        // Map.of 는 최대 10쌍 → 12쌍은 Map.ofEntries (arity 제한 없음) 사용.
        var body = Map.ofEntries(
                Map.entry("name", "자재 등록 IT"),
                Map.entry("modelName", "MAT-REG-IT-001"),
                Map.entry("categoryId", categoryId.toString()),
                Map.entry("sellingPrice", "40000"),
                Map.entry("purchasePrice", "40000"),
                Map.entry("currency", "KRW"),
                Map.entry("itemKind", "GENERAL"),
                Map.entry("productCategory", "MATERIAL"),
                Map.entry("unit", "EA"),
                Map.entry("releasePrice", "40000"),
                Map.entry("deliveryPrice", "40000"),
                Map.entry("goodsType", "NON_GOODS"));

        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.productCategory").value("MATERIAL"))
                .andExpect(jsonPath("$.data.goodsType").value("NON_GOODS"))
                .andExpect(jsonPath("$.data.usageScope").value("NONE"))
                .andExpect(jsonPath("$.data.unit").value("EA"));
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
        Mockito.when(dynamicPermissionClient.check(
                        Mockito.any(UUID.class), Mockito.eq("products.admin"), Mockito.eq(PermissionAction.UPDATE)))
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

    /**
     * 슬9 회귀 가드 — 전표 라인 검색(usageScope=PARTNER_ORDER)이 BOTH 판매품목을 포함하고
     * MATERIAL(usageScope NONE) 자재를 제외하는지 실 HTTP 로 단언한다. mock IN-expand 와 실 BE
     * exact-match 가 어긋나 전표 라인 검색이 0건 되던 production 파손 회귀 방지.
     */
    @Test
    void search_usageScopePartnerOrder_includesBothScope_excludesMaterial() throws Exception {
        var bothBody = Map.of(
                "name", "BOTH 검색 IT",
                "modelName", "USAGE-BOTH-IT-001",
                "categoryId", categoryId.toString(),
                "sellingPrice", "100000",
                "purchasePrice", "80000",
                "currency", "KRW",
                "usageScope", "BOTH");
        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(bothBody)))
                .andExpect(status().isCreated());

        var materialBody = Map.ofEntries(
                Map.entry("name", "MATERIAL 검색 IT"),
                Map.entry("modelName", "USAGE-MAT-IT-001"),
                Map.entry("categoryId", categoryId.toString()),
                Map.entry("sellingPrice", "30000"),
                Map.entry("purchasePrice", "30000"),
                Map.entry("currency", "KRW"),
                Map.entry("productCategory", "MATERIAL"),
                Map.entry("goodsType", "NON_GOODS"));
        mockMvc.perform(post("/products")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(materialBody)))
                .andExpect(status().isCreated());

        // usageScope=PARTNER_ORDER 검색 → IN-expand 로 BOTH 포함, MATERIAL(NONE) 제외.
        mockMvc.perform(get("/products?usageScope=PARTNER_ORDER&q=USAGE-")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.modelName=='USAGE-BOTH-IT-001')]").exists())
                .andExpect(jsonPath("$.data.content[?(@.modelName=='USAGE-MAT-IT-001')]").doesNotExist());
    }
}
