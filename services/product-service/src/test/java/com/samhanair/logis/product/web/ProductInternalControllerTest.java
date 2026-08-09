package com.samhanair.logis.product.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.product.config.HeaderAuthenticationFilter;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.security.InternalTokenFilter;
import com.samhanair.logis.product.domain.ProductStatus;
import com.samhanair.logis.product.repository.ProductRepository;
import com.samhanair.logis.product.service.EcountAliasResolveService;
import com.samhanair.logis.product.service.BundleExpander;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.ExpandRequest;
import com.samhanair.logis.product.web.dto.LookupByModelRequest;
import com.samhanair.logis.product.web.dto.LookupRequest;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Verifies internal-token enforcement on /products/internal/lookup. inventory-service 가
 * X-Internal-Token 으로만 호출 가능해야 함을 보장한다.
 */
class ProductInternalControllerTest {

    private static final String VALID_TOKEN = "test-internal-token";

    private ProductService productService;
    private ProductRepository productRepository;
    private EcountAliasResolveService ecountAliasResolveService;
    private BundleExpander bundleExpander;
    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @BeforeEach
    void setUp() {
        productService = Mockito.mock(ProductService.class);
        productRepository = Mockito.mock(ProductRepository.class);
        ecountAliasResolveService = Mockito.mock(EcountAliasResolveService.class);
        bundleExpander = Mockito.mock(BundleExpander.class);
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(VALID_TOKEN);
        // W10-4 (PR #99) DV-3 — product-service application.yml 호환
        props.setPathPrefix("/products/internal/");
        props.setRole("INTERNAL");
        props.setAllowMissingToken(false);

                mockMvc = MockMvcBuilders.standaloneSetup(new ProductInternalController(productService, productRepository,
                        bundleExpander,
                        ecountAliasResolveService))
                .addFilters(new InternalTokenFilter(props), new HeaderAuthenticationFilter())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void expand_withoutOptions_preservesSetUnitOverride() throws Exception {
        when(bundleExpander.expand(eq("AC060CS6PBH1SY"), eq(BigDecimal.ONE), any(BundleExpander.ExpandOptions.class)))
                .thenReturn(List.of(new BundleExpander.ExpandedLine(
                        "AC060CS6PBH1SY", UUID.randomUUID(), "세트", "세트",
                        BigDecimal.ONE, new BigDecimal("1590000"), null, null)));

        var body = new ExpandRequest("AC060CS6PBH1SY", BigDecimal.ONE,
                new BigDecimal("1590000"), null);

        mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/expand")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());

        ArgumentCaptor<BundleExpander.ExpandOptions> options = ArgumentCaptor.forClass(BundleExpander.ExpandOptions.class);
        verify(bundleExpander).expand(eq("AC060CS6PBH1SY"), eq(BigDecimal.ONE), options.capture());
        assertThat(options.getValue().setUnitOverride()).isEqualByComparingTo("1590000");
        assertThat(options.getValue().remoteOption()).isEqualTo("");
        assertThat(options.getValue().remoteExcluded()).isFalse();
        assertThat(options.getValue().panelOption()).isEqualTo("");
        assertThat(options.getValue().panelShape360()).isEqualTo("원형");
        assertThat(options.getValue().materialIncluded()).isFalse();
    }

    @Test
    void expand_withoutSetUnitOverride_keepsNullOverride() throws Exception {
        when(bundleExpander.expand(eq("AC060CS6PBH1SY"), eq(BigDecimal.ONE), any(BundleExpander.ExpandOptions.class)))
                .thenReturn(List.of(new BundleExpander.ExpandedLine(
                        "AC060CS6PBH1SY", UUID.randomUUID(), "세트", "세트",
                        BigDecimal.ONE, new BigDecimal("1660000"), null, null)));

        var body = new ExpandRequest("AC060CS6PBH1SY", BigDecimal.ONE, null, null);

        mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/expand")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());

        ArgumentCaptor<BundleExpander.ExpandOptions> options = ArgumentCaptor.forClass(BundleExpander.ExpandOptions.class);
        verify(bundleExpander).expand(eq("AC060CS6PBH1SY"), eq(BigDecimal.ONE), options.capture());
        assertThat(options.getValue().setUnitOverride()).isNull();
    }

    @Test
    void lookup_withMissingToken_returns401AndDoesNotCallService() throws Exception {
        UUID id = UUID.randomUUID();
        var body = new LookupRequest(List.of(id));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(productService, never()).lookup(any());
    }

    @Test
    void lookup_withWrongToken_returns401() throws Exception {
        UUID id = UUID.randomUUID();
        var body = new LookupRequest(List.of(id));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup")
                        .header("X-Internal-Token", "wrong-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(productService, never()).lookup(any());
    }

    @Test
    void lookup_withValidToken_returns200AndDelegatesToService() throws Exception {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        var body = new LookupRequest(List.of(id));

        when(productService.lookup(List.of(id))).thenReturn(List.of(
                new ProductSummaryResponse(id, "스마트 벽걸이", "SHA-W15K", "AC-W15K", categoryId,
                        new BigDecimal("1500000.00"), ProductStatus.ACTIVE)));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("SHA-W15K");
        assertThat(response.getContentAsString()).contains("AC-W15K");
        verify(productService).lookup(List.of(id));
    }

    @Test
    void lookupByModel_existing_returns200() throws Exception {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        var body = new LookupByModelRequest("AJ040RXH4BC1");

        when(productService.lookupSummaryByModelName("AJ040RXH4BC1")).thenReturn(
                new ProductSummaryResponse(id, "벽걸이 무풍에어컨", "AJ040RXH4BC1", categoryId,
                        new BigDecimal("1500000.00"), ProductStatus.ACTIVE));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup-by-model")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString()).contains("AJ040RXH4BC1");
        verify(productService).lookupSummaryByModelName("AJ040RXH4BC1");
    }

    @Test
    void lookupByModel_missing_returns404() throws Exception {
        var body = new LookupByModelRequest("UNKNOWN-MODEL");

        when(productService.lookupSummaryByModelName("UNKNOWN-MODEL"))
                .thenThrow(new BusinessException(ErrorCode.NOT_FOUND, "모델명에 해당하는 제품이 없습니다"));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup-by-model")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(404);
        verify(productService).lookupSummaryByModelName("UNKNOWN-MODEL");
    }

    @Test
    void lookupByModel_wrongToken_returns401() throws Exception {
        var body = new LookupByModelRequest("AJ040RXH4BC1");

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup-by-model")
                        .header("X-Internal-Token", "wrong-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(productService, never()).lookupSummaryByModelName(any());
    }

    @Test
    void lookupByModel_missingToken_returns401() throws Exception {
        var body = new LookupByModelRequest("AJ040RXH4BC1");

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup-by-model")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(productService, never()).lookupSummaryByModelName(any());
    }

    @Test
    void lookupByName_existing_returns200() throws Exception {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();

        when(productService.lookupSummaryByName("품목A")).thenReturn(
                new ProductSummaryResponse(id, "품목A", "MODEL-A", categoryId,
                        new BigDecimal("1000.00"), ProductStatus.ACTIVE));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .get("/products/internal/by-name")
                        .queryParam("name", "품목A")
                        .header("X-Internal-Token", VALID_TOKEN))
                .andReturn().getResponse();
        response.setCharacterEncoding("UTF-8");

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).contains("품목A");
        verify(productService).lookupSummaryByName("품목A");
    }

    @Test
    void lookupByName_missing_returns404() throws Exception {
        when(productService.lookupSummaryByName("미등록품목"))
                .thenThrow(new BusinessException(ErrorCode.NOT_FOUND, "제품명에 해당하는 제품이 없습니다"));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .get("/products/internal/by-name")
                        .queryParam("name", "미등록품목")
                        .header("X-Internal-Token", VALID_TOKEN))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(404);
        verify(productService).lookupSummaryByName("미등록품목");
    }

    @Test
    void lookupByName_wrongToken_returns401() throws Exception {
        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .get("/products/internal/by-name")
                        .queryParam("name", "품목A")
                        .header("X-Internal-Token", "wrong-token"))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(productService, never()).lookupSummaryByName(any());
    }

    @Test
    void resolveEcountAliases_blankAlias_returns400AndDoesNotCallService() throws Exception {
        var body = java.util.Map.of("aliasCodes", List.of("정상품목", " "));

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/resolve-ecount-aliases")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        verify(ecountAliasResolveService, never()).resolve(any());
    }

    @Test
    void resolveEcountAliases_over500_returns400AndDoesNotCallService() throws Exception {
        List<String> aliases = java.util.stream.IntStream.rangeClosed(1, 501)
                .mapToObj(i -> "품목-" + i)
                .toList();
        var body = java.util.Map.of("aliasCodes", aliases);

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/resolve-ecount-aliases")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(400);
        verify(ecountAliasResolveService, never()).resolve(any());
    }
}
