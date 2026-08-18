package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.client.GoogleSheetsClient;
import com.samhanair.logis.product.config.HeaderAuthenticationFilter;
import com.samhanair.logis.product.domain.BranchPipeLookup;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.MaterialPrice;
import com.samhanair.logis.product.domain.OduRecommendationLookup;
import com.samhanair.logis.product.domain.OduRecommendationLookup.RecommendationType;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductSpec;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.SpecKeyTemplate;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.audit.service.ProductAuditLogService;
import com.samhanair.logis.product.audit.web.ProductAuditLogController;
import com.samhanair.logis.product.editrequest.domain.ProductEditRequest;
import com.samhanair.logis.product.editrequest.service.ProductEditRequestService;
import com.samhanair.logis.product.editrequest.web.ProductEditRequestController;
import com.samhanair.logis.product.realtime.ProductCatalogChangePublisher;
import com.samhanair.logis.product.realtime.ProductCatalogRealtimeController;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.realtime.ProductRealtimeController;
import com.samhanair.logis.product.repository.BranchPipeLookupRepository;
import com.samhanair.logis.product.repository.BundleComponentRepository;
import com.samhanair.logis.product.repository.MaterialPriceRepository;
import com.samhanair.logis.product.repository.OduRecommendationLookupRepository;
import com.samhanair.logis.product.repository.ProductEstimateExposureRepository;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.repository.SpecKeyTemplateRepository;
import com.samhanair.logis.product.service.BundleComponentService;
import com.samhanair.logis.product.service.BundleComponentEstimateSettingService;
import com.samhanair.logis.product.service.CategoryService;
import com.samhanair.logis.product.service.EcountProductImporter;
import com.samhanair.logis.product.service.ProductLookupSheetSyncService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.service.ProductSheetSyncService;
import com.samhanair.logis.product.service.ProductSpecService;
import com.samhanair.logis.product.web.CategoryController;
import com.samhanair.logis.product.web.EcountProductImportController;
import com.samhanair.logis.product.web.ProductAdminController;
import com.samhanair.logis.product.web.ProductByCodeController;
import com.samhanair.logis.product.web.ProductCatalogController;
import com.samhanair.logis.product.web.ProductController;
import com.samhanair.logis.product.web.ProductLookupController;
import com.samhanair.logis.product.web.dto.CategoryResponse;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import com.samhanair.logis.shared.realtime.editrequest.EditRequestType;
import com.samhanair.logis.shared.realtime.editrequest.EditTargetRole;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.mapping.JpaMetamodelMappingContext;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * product-service controller 권한 가드 WebMvc 격리 IT.
 *
 * <p>신규 lookup 3 endpoint 는 기존 products.list page-code 재사용 — 권한 구조 미변경이므로
 * DynamicPermissionClient mock 격리 허용.
 */
@WebMvcTest(
        controllers = {
                ProductController.class,
                ProductByCodeController.class,
                ProductCatalogController.class,
                CategoryController.class,
                EcountProductImportController.class,
                ProductAdminController.class,
                ProductLookupController.class,
                ProductEditRequestController.class,
                ProductAuditLogController.class,
                ProductRealtimeController.class,
                ProductCatalogRealtimeController.class
        },
        properties = "spring.application.name=product-service")
@Import({
        PermissionSecurityAutoConfiguration.class,
        ProductPermissionControllerIT.TestSecurityConfig.class,
        ProductPermissionControllerIT.TestMeterConfig.class
})
class ProductPermissionControllerIT {

    private static final String SERVICE_NAME = "product-service";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";
    private static final UUID PRODUCT_ID = UUID.fromString("00000000-0000-0000-0000-000000000101");
    private static final UUID CATEGORY_ID = UUID.fromString("00000000-0000-0000-0000-000000000102");
    private static final UUID REQUEST_ID = UUID.fromString("00000000-0000-0000-0000-000000000103");

    @Autowired private MockMvc mockMvc;
    @Autowired private MeterRegistry meterRegistry;

    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private ProductService productService;
    @MockBean private ProductRepository productRepository;
    @MockBean private ProductSpecService productSpecService;
    @MockBean private SpecKeyTemplateRepository specKeyTemplateRepository;
    @MockBean private MaterialPriceRepository materialPriceRepository;
    @MockBean private OduRecommendationLookupRepository oduRecommendationLookupRepository;
    @MockBean private BranchPipeLookupRepository branchPipeLookupRepository;
    @MockBean private CategoryService categoryService;
    @MockBean private ProductSheetSyncService productSheetSyncService;
    @MockBean private ProductLookupSheetSyncService productLookupSheetSyncService;
    @MockBean private GoogleSheetsClient googleSheetsClient;
    @MockBean private EcountProductImporter ecountProductImporter;
    @MockBean private ProductEditRequestService editRequestService;
    @MockBean private ProductAuditLogService auditLogService;
    @MockBean private ProductRealtimeBroker realtimeBroker;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;
    // §1c/§1d 신규 빈 (ProductCatalogController 신규 의존성 — feedback_it_mockbean_external_clients.md)
    @MockBean private BundleComponentService bundleComponentService;
    @MockBean private BundleComponentEstimateSettingService bundleComponentEstimateSettingService;
    @MockBean private BundleComponentRepository bundleComponentRepository;
    @MockBean private ProductEstimateExposureRepository productEstimateExposureRepository;
    // P3-1: SSE publish 시점 통일 게이트웨이 (ProductCatalogController 신규 의존성)
    @MockBean private ProductCatalogChangePublisher catalogChangePublisher;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);

        ProductSummaryResponse summary = new ProductSummaryResponse(
                PRODUCT_ID, "Product", "MODEL-1", "MODEL-1", CATEGORY_ID,
                BigDecimal.valueOf(1000), ProductStatus.ACTIVE);
        ProductResponse response = new ProductResponse(
                PRODUCT_ID, "Product", "MODEL-1", "MODEL-1", CATEGORY_ID, "Category",
                BigDecimal.valueOf(1000), BigDecimal.valueOf(800), "KRW",
                ProductStatus.ACTIVE, Map.of(), "memo",
                ProductCategory.HOME_MULTI,
                null, null, null,
                com.samhanair.logis.product.web.dto.ProductItemKind.GENERAL,
                null, null, null, "EA",
                BigDecimal.valueOf(1000), BigDecimal.valueOf(800), null,
                com.samhanair.logis.product.domain.ProductGoodsType.GOODS,
                com.samhanair.logis.product.domain.UsageScope.BOTH,
                com.samhanair.logis.product.domain.EstimateCategory.HOME_MULTI,
                false, null,
                LocalDateTime.of(2026, 5, 26, 9, 0), "system",
                LocalDateTime.of(2026, 5, 26, 9, 0), "system", List.of());
        CategoryResponse category = new CategoryResponse(CATEGORY_ID, "CAT", "Category", null, 1, List.of());
        ProductEditRequest editRequest = ProductEditRequest.create(
                PRODUCT_ID, UUID.randomUUID(), "tester", EditRequestType.EDIT,
                "reason", EditTargetRole.MANAGER, LocalDateTime.of(2026, 5, 27, 9, 0));
        Product byCodeProduct = Product.seedFromSheet(
                "Product", "MODEL-1", Category.create("CAT", "Category", null, 1),
                BigDecimal.valueOf(1000), BigDecimal.valueOf(800), ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);
        ProductSpec productSpec = ProductSpec.create(PRODUCT_ID, "냉방능력, kW", "5.6", "kW", 1);
        SpecKeyTemplate specKeyTemplate = SpecKeyTemplate.create(
                EstimateCategory.HOME_MULTI, "냉방능력, kW", "kW", 1, true);
        MaterialPrice materialPrice = MaterialPrice.seed("D2", "자재", BigDecimal.valueOf(2000),
                "옵션", null);
        OduRecommendationLookup oduRecommendation = OduRecommendationLookup.seed(
                RecommendationType.HOME_MULTI, BigDecimal.valueOf(6), 2, "5HP");
        BranchPipeLookup branchPipe = BranchPipeLookup.seed("1509", "15/09", 1);

        lenient().when(productService.search(any(), any(), any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(summary), PageRequest.of(0, 20), 1));
        lenient().when(productService.search(any(), any(), any(), any(), any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(summary), PageRequest.of(0, 20), 1));
        lenient().when(productService.updateUsageAndReturn(anyString(), any()))
                .thenReturn(byCodeProduct);
        lenient().doNothing().when(productService).clearUsageOverride(anyString());
        lenient().when(productService.updateVariableDiscountAndReturn(anyString(), any()))
                .thenReturn(byCodeProduct);
        lenient().doNothing().when(productService).clearVariableDiscountOverride(anyString());
        lenient().when(productService.updateClassificationAndFixedDiscount(anyString(), any()))
                .thenReturn(byCodeProduct);
        lenient().when(productService.updateFixedDiscountAndReturn(anyString(), any()))
                .thenReturn(byCodeProduct);
        lenient().when(productService.getOne(any())).thenReturn(response);
        lenient().when(productService.getByModelName(anyString())).thenReturn(response);
        lenient().when(productService.lookup(any())).thenReturn(List.of(summary));
        lenient().when(productService.create(any())).thenReturn(response);
        lenient().when(productService.update(any(), any())).thenReturn(response);
        lenient().when(productService.updatePrice(any(), any())).thenReturn(response);
        lenient().when(productService.replaceTags(any(), any())).thenReturn(response);
        lenient().when(productRepository.findByModelCodeAndIsDeletedFalse(anyString()))
                .thenReturn(Optional.of(byCodeProduct));
        lenient().when(productRepository.findByCatalogExposedModelCodeAndIsDeletedFalse(anyString()))
                .thenReturn(Optional.of(byCodeProduct));
        lenient().when(productRepository.searchByUsageScope(any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(byCodeProduct), PageRequest.of(0, 20), 1));
        lenient().when(productSpecService.listByModelCode(anyString())).thenReturn(List.of(productSpec));
        lenient().when(productSpecService.addSpec(anyString(), anyString(), anyString(), any(), any()))
                .thenReturn(productSpec);
        lenient().when(productSpecService.editSpec(anyString(), any(), any(), any())).thenReturn(productSpec);
        lenient().when(productSpecService.applyTemplateToExisting(any(), anyBoolean()))
                .thenReturn(new ProductSpecService.ApplyToExistingResult(
                        "냉방능력, kW", EstimateCategory.HOME_MULTI, List.of("MODEL-1"), 0, true));
        lenient().when(specKeyTemplateRepository.findAll()).thenReturn(List.of(specKeyTemplate));
        lenient().when(specKeyTemplateRepository.findByEstimateCategoryOrderByDisplayOrderAsc(any()))
                .thenReturn(List.of(specKeyTemplate));
        lenient().when(materialPriceRepository.findAll()).thenReturn(List.of(materialPrice));
        lenient().when(oduRecommendationLookupRepository.findAllByOrderByRecommendationTypeAscIndoorCapacityAsc())
                .thenReturn(List.of(oduRecommendation));
        lenient().when(oduRecommendationLookupRepository.findByRecommendationTypeOrderByIndoorCapacityAsc(any()))
                .thenReturn(List.of(oduRecommendation));
        lenient().when(branchPipeLookupRepository.findAllByOrderByBranchCodeAsc())
                .thenReturn(List.of(branchPipe));
        lenient().when(branchPipeLookupRepository.findAllByBranchCodeOrderByBranchCodeAsc(anyString()))
                .thenReturn(List.of(branchPipe));
        lenient().when(branchPipeLookupRepository.findByBranchCode(anyString()))
                .thenReturn(Optional.of(branchPipe));
        lenient().when(categoryService.getTree()).thenReturn(List.of(category));
        lenient().when(categoryService.create(any())).thenReturn(category);
        lenient().when(categoryService.update(any(), any())).thenReturn(category);
        // §1b/§1c lenient stub (ProductCatalogController 신규 경로 — N+1 방지 벌크 count)
        lenient().when(bundleComponentRepository.countMapByBundleProductIds(any()))
                .thenReturn(Map.of());
        lenient().when(bundleComponentService.listComponents(anyString())).thenReturn(List.of());
        lenient().when(bundleComponentService.replaceComponents(anyString(), any(), any())).thenReturn(List.of());
        lenient().doNothing().when(googleSheetsClient).invalidateCache();
        lenient().when(productSheetSyncService.syncAll()).thenReturn(new ProductSheetSyncService.SyncSummary());
        lenient().when(ecountProductImporter.importCsv(any(), any(), any(), anyString()))
                .thenReturn(new EcountProductImportResult(1, 1, 0, 0, 0, 0, 1, "HASH", List.of(), 0, List.of()));
        lenient().when(editRequestService.request(any(), any(), anyString(), any(), anyString()))
                .thenReturn(editRequest);
        lenient().when(editRequestService.approve(any(), any(), anyString(), any()))
                .thenReturn(editRequest);
        lenient().when(editRequestService.reject(any(), any(), anyString(), anyString()))
                .thenReturn(editRequest);
        lenient().when(editRequestService.listPendingForRole(any()))
                .thenReturn(List.of(editRequest));
        lenient().when(editRequestService.listByProduct(any(), any())).thenReturn(List.of(editRequest));
        lenient().when(auditLogService.listByProduct(any())).thenReturn(List.of());
        lenient().when(realtimeBroker.subscribe(any())).thenReturn(new SseEmitter(100L));
    }

    @ParameterizedTest(name = "{0} grant")
    @MethodSource("endpoints")
    void migratedEndpoint_withGrant_returnsSuccess(EndpointCase endpoint) throws Exception {
        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().is(endpoint.successStatus()));
    }

    @ParameterizedTest(name = "{0} deny")
    @MethodSource("endpoints")
    void migratedEndpoint_withoutGrant_returns403AndIncrementsCounter(EndpointCase endpoint) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq(endpoint.page()), eq(endpoint.action())))
                .thenReturn(false);
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action().name())).isEqualTo(before + 1.0);
    }

    @ParameterizedTest(name = "price update role={0} status={1}")
    @CsvSource({
            "ACCOUNTANT, 200",
            "SALES, 403"
    })
    void priceUpdate_usesProductsPricePermission(String role, int expectedStatus) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq("products.price"), eq(PermissionAction.UPDATE)))
                .thenReturn(expectedStatus < 400);

        mockMvc.perform(withActor(patch("/products/{id}/price", PRODUCT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sellingPrice\":1200,\"purchasePrice\":900,\"currency\":\"KRW\"}"), role))
                .andExpect(status().is(expectedStatus));
    }

    @ParameterizedTest(name = "product edit decision {0} role={1} status={2}")
    @CsvSource({
            "approve, MANAGER, 200",
            "approve, MASTER, 200",
            "approve, SALES, 403",
            "approve, ACCOUNTANT, 403",
            "reject, MANAGER, 200",
            "reject, MASTER, 200",
            "reject, SALES, 403",
            "reject, ACCOUNTANT, 403"
    })
    void editRequestDecision_usesDecidePermission(String decision, String role, int expectedStatus) throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq("products.edit-requests.decide"), eq(PermissionAction.UPDATE)))
                .thenReturn(expectedStatus < 400);
        String body = "approve".equals(decision) ? "{\"note\":\"ok\"}" : "{\"reason\":\"no\"}";

        mockMvc.perform(withActor(post("/products/{id}/edit-request/{requestId}/{decision}",
                        PRODUCT_ID, REQUEST_ID, decision)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body), role))
                .andExpect(status().is(expectedStatus));
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                new EndpointCase("product search", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/products")),
                new EndpointCase("product detail", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/products/{id}", PRODUCT_ID)),
                new EndpointCase("product by model", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/products/by-model/MODEL-1")),
                new EndpointCase("product lookup", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> post("/products/lookup")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"ids\":[\"" + PRODUCT_ID + "\"]}")),
                new EndpointCase("product catalog list", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/products")),
                new EndpointCase("product catalog usage patch", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/api/v1/products/MODEL-1/usage")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"usageScope\":\"ESTIMATE\",\"estimateCategories\":[\"OTHER\"]}")),
                new EndpointCase("product catalog usage delete", "products.admin", PermissionAction.UPDATE, "MANAGER", 204,
                        () -> delete("/api/v1/products/MODEL-1/usage")),
                new EndpointCase("product catalog variable discount patch", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/api/v1/products/MODEL-1/variable-discount")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"hasVariableDiscount\":true}")),
                new EndpointCase("product catalog variable discount delete", "products.admin", PermissionAction.UPDATE, "MANAGER", 204,
                        () -> delete("/api/v1/products/MODEL-1/variable-discount")),
                new EndpointCase("product catalog classification patch", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/api/v1/products/MODEL-1/classification")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"catLId\":null,\"catMId\":null,\"catSId\":null}")),
                new EndpointCase("product catalog fixed discount patch", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/api/v1/products/MODEL-1/fixed-discount")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"fixedDiscountRate\":null}")),
                new EndpointCase("product catalog specs list", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/products/MODEL-1/specs")),
                new EndpointCase("product catalog spec add", "products.admin", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/api/v1/products/MODEL-1/specs")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"specKey\":\"냉방능력, kW\",\"specValue\":\"5.6\",\"unit\":\"kW\",\"displayOrder\":1}")),
                new EndpointCase("product catalog spec edit", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/api/v1/products/MODEL-1/specs/{id}", REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"specValue\":\"6.0\",\"unit\":\"kW\"}")),
                new EndpointCase("product catalog spec delete", "products.admin", PermissionAction.DELETE, "MANAGER", 204,
                        () -> delete("/api/v1/products/MODEL-1/specs/{id}", REQUEST_ID)),
                new EndpointCase("product catalog specs reorder", "products.admin", PermissionAction.UPDATE, "MANAGER", 204,
                        () -> patch("/api/v1/products/MODEL-1/specs/reorder")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"orderMap\":{\"" + REQUEST_ID + "\":1}}")),
                new EndpointCase("product catalog templates list", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/spec-key-templates")),
                new EndpointCase("product catalog template apply", "products.admin", PermissionAction.CREATE, "MANAGER", 200,
                        () -> post("/api/v1/spec-key-templates/{id}/apply-to-existing", REQUEST_ID)),
                new EndpointCase("product by code", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/products/by-code/MODEL-1")),
                new EndpointCase("product create", "products.admin", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/products").contentType(MediaType.APPLICATION_JSON).content(productCreateBody())),
                new EndpointCase("product update", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/products/{id}", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"name\":\"Updated\"}")),
                new EndpointCase("product price update", "products.price", PermissionAction.UPDATE, "ACCOUNTANT", 200,
                        () -> patch("/products/{id}/price", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"sellingPrice\":1200,\"purchasePrice\":900,\"currency\":\"KRW\"}")),
                new EndpointCase("product tag replace", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> put("/products/{id}/tags", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"hp\":\"1.5\"}")),
                new EndpointCase("product discontinue", "products.admin", PermissionAction.UPDATE, "MANAGER", 204,
                        () -> post("/products/{id}/discontinue", PRODUCT_ID)),
                new EndpointCase("product reactivate", "products.admin", PermissionAction.UPDATE, "MANAGER", 204,
                        () -> post("/products/{id}/reactivate", PRODUCT_ID)),
                new EndpointCase("product delete", "products.admin", PermissionAction.DELETE, "MANAGER", 204,
                        () -> delete("/products/{id}", PRODUCT_ID)),
                new EndpointCase("category create", "products.admin", PermissionAction.CREATE, "MANAGER", 201,
                        () -> post("/products/categories")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"code\":\"CAT\",\"name\":\"Category\",\"displayOrder\":1}")),
                new EndpointCase("category update", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> patch("/products/categories/{id}", CATEGORY_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"name\":\"Category 2\",\"displayOrder\":2}")),
                new EndpointCase("category delete", "products.admin", PermissionAction.DELETE, "MANAGER", 204,
                        () -> delete("/products/categories/{id}", CATEGORY_ID)),
                new EndpointCase("category tree", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/products/categories")),
                new EndpointCase("ecount import", "products.ecount-import", PermissionAction.CREATE, "MANAGER", 200,
                        () -> multipart("/admin/products/imports/ecount")
                                .file(csv("itemFile"))
                                .file(csv("relationFile"))
                                .file(csv("groupFile"))),
                new EndpointCase("product sheet sync trigger (retired)", "products.sync", PermissionAction.CREATE, "MANAGER", 410,
                        () -> post("/api/v1/products/admin/sync")),
                new EndpointCase("product sheet sync last", "products.sync", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/api/v1/products/admin/sync/last")),
                new EndpointCase("material prices lookup", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/material-prices")),
                new EndpointCase("odu recommendations lookup", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/odu-recommendations")),
                new EndpointCase("branch pipes lookup", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/branch-pipes")),
                new EndpointCase("edit request create", "products.edit-requests", PermissionAction.CREATE, "SALES", 201,
                        () -> post("/products/{id}/edit-request", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"type\":\"EDIT\",\"reason\":\"reason\"}")),
                new EndpointCase("edit request approve", "products.edit-requests.decide", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> post("/products/{id}/edit-request/{requestId}/approve", PRODUCT_ID, REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"note\":\"ok\"}")),
                new EndpointCase("edit request reject", "products.edit-requests.decide", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> post("/products/{id}/edit-request/{requestId}/reject", PRODUCT_ID, REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"no\"}")),
                new EndpointCase("edit request list", "products.edit-requests.decide", PermissionAction.VIEW, "MANAGER", 200,
                        () -> get("/products/edit-requests").param("targetRole", "MANAGER")),
                new EndpointCase("audit logs", "products.list.view", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/products/{id}/audit-logs", PRODUCT_ID)),
                new EndpointCase("edit requests by product", "products.edit-requests", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/products/{id}/edit-requests", PRODUCT_ID)),
                new EndpointCase("product realtime", "products.list.view", PermissionAction.VIEW, "STAFF", 200,
                        () -> get("/products/{id}/realtime", PRODUCT_ID)),
                // §1c/§1d (P2-5 2026-06-11) — components GET/PUT + display-orders PUT 권한 가드
                new EndpointCase("bundle components list", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/products/MODEL-1/components")),
                new EndpointCase("bundle components replace", "products.admin", PermissionAction.UPDATE, "MANAGER", 200,
                        () -> put("/api/v1/products/MODEL-1/components")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("[{\"componentProductCode\":\"IDU-001\",\"defaultQty\":1,\"qtyMode\":\"FOLLOW_SET\","
                                        + "\"componentKind\":\"INDOOR\",\"isDefault\":true}]")),
                new EndpointCase("display orders update", "products.admin", PermissionAction.UPDATE, "MANAGER", 204,
                        () -> put("/api/v1/products/display-orders")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("[{\"modelCode\":\"MODEL-1\",\"estimateCategory\":\"OTHER\",\"displayOrder\":1}]")),
                // §2-2 (D fix 2026-06-11) — catalog-realtime SSE 구독 권한 가드 (products.list VIEW)
                new EndpointCase("catalog realtime sse", "products.list", PermissionAction.VIEW, "SALES", 200,
                        () -> get("/api/v1/products/catalog-realtime")
                                .accept(MediaType.TEXT_EVENT_STREAM))
        );
    }

    private static String productCreateBody() {
        return """
                {"name":"Product","modelName":"MODEL-1","categoryId":"00000000-0000-0000-0000-000000000102","sellingPrice":1000,"purchasePrice":800,"currency":"KRW","tags":{},"description":"memo"}
                """;
    }

    private static MockMultipartFile csv(String name) {
        return new MockMultipartFile(name, "sample.csv", "text/csv", "x".getBytes());
    }

    private static MockHttpServletRequestBuilder withActor(MockHttpServletRequestBuilder request, String role) {
        return request
                .header(USER_ID_HEADER, UUID.randomUUID().toString())
                .header(ROLE_HEADER, role);
    }

    private double deniedCount(String page, String role, String action) {
        return meterRegistry.counter(
                PermissionGuardMetrics.COUNTER_NAME,
                "service", SERVICE_NAME,
                "page", page,
                "role", role,
                "action", action
        ).count();
    }

    record EndpointCase(
            String name,
            String page,
            PermissionAction action,
            String role,
            int successStatus,
            Supplier<MockHttpServletRequestBuilder> request) {

        @Override
        public String toString() {
            return name;
        }
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class TestSecurityConfig {

        @Bean
        SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            http
                    .csrf(AbstractHttpConfigurer::disable)
                    .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .addFilterBefore(new HeaderAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
            return http.build();
        }
    }

    @TestConfiguration
    static class TestMeterConfig {

        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }
    }
}
