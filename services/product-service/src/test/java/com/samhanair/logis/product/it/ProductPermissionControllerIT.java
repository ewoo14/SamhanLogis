package com.samhanair.logis.product.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.product.config.HeaderAuthenticationFilter;
import com.samhanair.logis.product.domain.Category;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.domain.ProductType;
import com.samhanair.logis.product.domain.UsageScope;
import com.samhanair.logis.product.audit.service.ProductAuditLogService;
import com.samhanair.logis.product.audit.web.ProductAuditLogController;
import com.samhanair.logis.product.editrequest.domain.ProductEditRequest;
import com.samhanair.logis.product.editrequest.service.ProductEditRequestService;
import com.samhanair.logis.product.editrequest.web.ProductEditRequestController;
import com.samhanair.logis.product.realtime.ProductRealtimeBroker;
import com.samhanair.logis.product.realtime.ProductRealtimeController;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.CategoryService;
import com.samhanair.logis.product.service.EcountProductImporter;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.CategoryController;
import com.samhanair.logis.product.web.EcountProductImportController;
import com.samhanair.logis.product.web.ProductByCodeController;
import com.samhanair.logis.product.web.ProductController;
import com.samhanair.logis.product.web.dto.CategoryResponse;
import com.samhanair.logis.product.web.dto.EcountProductImportResult;
import com.samhanair.logis.product.web.dto.ProductResponse;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
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

@WebMvcTest(
        controllers = {
                ProductController.class,
                ProductByCodeController.class,
                CategoryController.class,
                EcountProductImportController.class,
                ProductEditRequestController.class,
                ProductAuditLogController.class,
                ProductRealtimeController.class
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
    @MockBean private CategoryService categoryService;
    @MockBean private EcountProductImporter ecountProductImporter;
    @MockBean private ProductEditRequestService editRequestService;
    @MockBean private ProductAuditLogService auditLogService;
    @MockBean private ProductRealtimeBroker realtimeBroker;
    @MockBean private JpaMetamodelMappingContext jpaMetamodelMappingContext;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);

        ProductSummaryResponse summary = new ProductSummaryResponse(
                PRODUCT_ID, "Product", "MODEL-1", "MODEL-1", CATEGORY_ID,
                BigDecimal.valueOf(1000), ProductStatus.ACTIVE);
        ProductResponse response = new ProductResponse(
                PRODUCT_ID, "Product", "MODEL-1", CATEGORY_ID, "Category",
                BigDecimal.valueOf(1000), BigDecimal.valueOf(800), "KRW",
                ProductStatus.ACTIVE, Map.of(), "memo",
                LocalDateTime.of(2026, 5, 26, 9, 0), "system",
                LocalDateTime.of(2026, 5, 26, 9, 0), "system");
        CategoryResponse category = new CategoryResponse(CATEGORY_ID, "CAT", "Category", null, 1, List.of());
        ProductEditRequest editRequest = ProductEditRequest.create(
                PRODUCT_ID, UUID.randomUUID(), "tester", EditRequestType.EDIT,
                "reason", EditTargetRole.MANAGER, LocalDateTime.of(2026, 5, 27, 9, 0));
        Product byCodeProduct = Product.seedFromSheet(
                "Product", "MODEL-1", Category.create("CAT", "Category", null, 1),
                BigDecimal.valueOf(1000), BigDecimal.valueOf(800), ProductType.SINGLE,
                ProductCategory.HOME_MULTI, UsageScope.BOTH, EstimateCategory.HOME_MULTI);

        lenient().when(productService.search(any(), any(), any(), any(), any(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(summary), PageRequest.of(0, 20), 1));
        lenient().when(productService.getOne(any())).thenReturn(response);
        lenient().when(productService.getByModelName(anyString())).thenReturn(response);
        lenient().when(productService.lookup(any())).thenReturn(List.of(summary));
        lenient().when(productService.create(any())).thenReturn(response);
        lenient().when(productService.update(any(), any())).thenReturn(response);
        lenient().when(productService.updatePrice(any(), any())).thenReturn(response);
        lenient().when(productService.replaceTags(any(), any())).thenReturn(response);
        lenient().when(productRepository.findByModelCodeAndIsDeletedFalse(anyString()))
                .thenReturn(Optional.of(byCodeProduct));
        lenient().when(categoryService.create(any())).thenReturn(category);
        lenient().when(categoryService.update(any(), any())).thenReturn(category);
        lenient().when(ecountProductImporter.importCsv(any(), any(), any(), anyString()))
                .thenReturn(new EcountProductImportResult(1, 1, 0, 0, 0, 0, 1, "HASH", List.of()));
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
        if ("VIEW".equals(endpoint.action())) {
            when(dynamicPermissionClient.canView(endpoint.role(), endpoint.page())).thenReturn(false);
        } else {
            when(dynamicPermissionClient.canEdit(endpoint.role(), endpoint.page())).thenReturn(false);
        }
        double before = deniedCount(endpoint.page(), endpoint.role(), endpoint.action());

        mockMvc.perform(withActor(endpoint.request().get(), endpoint.role()))
                .andExpect(status().isForbidden());

        assertThat(deniedCount(endpoint.page(), endpoint.role(), endpoint.action())).isEqualTo(before + 1.0);
    }

    @ParameterizedTest(name = "price update role={0} status={1}")
    @CsvSource({
            "ACCOUNTANT, 200",
            "SALES, 403"
    })
    void priceUpdate_usesProductsPricePermission(String role, int expectedStatus) throws Exception {
        when(dynamicPermissionClient.canEdit("ACCOUNTANT", "products.price")).thenReturn(true);
        when(dynamicPermissionClient.canEdit("SALES", "products.price")).thenReturn(false);

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
        when(dynamicPermissionClient.canEdit("MANAGER", "products.edit-requests.decide")).thenReturn(true);
        when(dynamicPermissionClient.canEdit("MASTER", "products.edit-requests.decide")).thenReturn(true);
        when(dynamicPermissionClient.canEdit("SALES", "products.edit-requests.decide")).thenReturn(false);
        when(dynamicPermissionClient.canEdit("ACCOUNTANT", "products.edit-requests.decide")).thenReturn(false);
        String body = "approve".equals(decision) ? "{\"note\":\"ok\"}" : "{\"reason\":\"no\"}";

        mockMvc.perform(withActor(post("/products/{id}/edit-request/{requestId}/{decision}",
                        PRODUCT_ID, REQUEST_ID, decision)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body), role))
                .andExpect(status().is(expectedStatus));
    }

    static Stream<EndpointCase> endpoints() {
        return Stream.of(
                new EndpointCase("product search", "products.list", "VIEW", "SALES", 200,
                        () -> get("/products")),
                new EndpointCase("product detail", "products.list", "VIEW", "SALES", 200,
                        () -> get("/products/{id}", PRODUCT_ID)),
                new EndpointCase("product by model", "products.list", "VIEW", "SALES", 200,
                        () -> get("/products/by-model/MODEL-1")),
                new EndpointCase("product lookup", "products.list", "VIEW", "SALES", 200,
                        () -> post("/products/lookup")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"ids\":[\"" + PRODUCT_ID + "\"]}")),
                new EndpointCase("product by code", "products.list", "VIEW", "SALES", 200,
                        () -> get("/api/products/by-code/MODEL-1")),
                new EndpointCase("product create", "products.admin", "EDIT", "MANAGER", 201,
                        () -> post("/products").contentType(MediaType.APPLICATION_JSON).content(productCreateBody())),
                new EndpointCase("product update", "products.admin", "EDIT", "MANAGER", 200,
                        () -> patch("/products/{id}", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"name\":\"Updated\"}")),
                new EndpointCase("product price update", "products.price", "EDIT", "ACCOUNTANT", 200,
                        () -> patch("/products/{id}/price", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"sellingPrice\":1200,\"purchasePrice\":900,\"currency\":\"KRW\"}")),
                new EndpointCase("product tag replace", "products.admin", "EDIT", "MANAGER", 200,
                        () -> put("/products/{id}/tags", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"hp\":\"1.5\"}")),
                new EndpointCase("product discontinue", "products.admin", "EDIT", "MANAGER", 204,
                        () -> post("/products/{id}/discontinue", PRODUCT_ID)),
                new EndpointCase("product reactivate", "products.admin", "EDIT", "MANAGER", 204,
                        () -> post("/products/{id}/reactivate", PRODUCT_ID)),
                new EndpointCase("product delete", "products.admin", "EDIT", "MANAGER", 204,
                        () -> delete("/products/{id}", PRODUCT_ID)),
                new EndpointCase("category create", "products.admin", "EDIT", "MANAGER", 201,
                        () -> post("/products/categories")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"code\":\"CAT\",\"name\":\"Category\",\"displayOrder\":1}")),
                new EndpointCase("category update", "products.admin", "EDIT", "MANAGER", 200,
                        () -> patch("/products/categories/{id}", CATEGORY_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"name\":\"Category 2\",\"displayOrder\":2}")),
                new EndpointCase("category delete", "products.admin", "EDIT", "MANAGER", 204,
                        () -> delete("/products/categories/{id}", CATEGORY_ID)),
                new EndpointCase("ecount import", "products.ecount-import", "EDIT", "MANAGER", 200,
                        () -> multipart("/admin/products/imports/ecount")
                                .file(csv("itemFile"))
                                .file(csv("relationFile"))
                                .file(csv("groupFile"))),
                new EndpointCase("edit request create", "products.edit-requests", "EDIT", "SALES", 201,
                        () -> post("/products/{id}/edit-request", PRODUCT_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"type\":\"EDIT\",\"reason\":\"reason\"}")),
                new EndpointCase("edit request approve", "products.edit-requests.decide", "EDIT", "MANAGER", 200,
                        () -> post("/products/{id}/edit-request/{requestId}/approve", PRODUCT_ID, REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"note\":\"ok\"}")),
                new EndpointCase("edit request reject", "products.edit-requests.decide", "EDIT", "MANAGER", 200,
                        () -> post("/products/{id}/edit-request/{requestId}/reject", PRODUCT_ID, REQUEST_ID)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"reason\":\"no\"}")),
                new EndpointCase("edit request list", "products.edit-requests.decide", "VIEW", "MANAGER", 200,
                        () -> get("/products/edit-requests").param("targetRole", "MANAGER")),
                new EndpointCase("audit logs", "products.list.view", "VIEW", "STAFF", 200,
                        () -> get("/products/{id}/audit-logs", PRODUCT_ID)),
                new EndpointCase("edit requests by product", "products.edit-requests", "VIEW", "STAFF", 200,
                        () -> get("/products/{id}/edit-requests", PRODUCT_ID)),
                new EndpointCase("product realtime", "products.list.view", "VIEW", "STAFF", 200,
                        () -> get("/products/{id}/realtime", PRODUCT_ID))
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
            String action,
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
