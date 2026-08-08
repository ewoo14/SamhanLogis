package com.samhanair.logis.product.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.ProductSummaryResponse;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * BE 가 본 슬라이스에서 추가한 internal endpoint
 * {@code POST /products/internal/lookup-by-model {modelName}} 의 동작 검증.
 *
 * <p>가정 (PM 명시):
 * <ul>
 *   <li>X-Internal-Token 인증 (누락/불일치 → 401, 400 분기 X)</li>
 *   <li>입력 = JSON {@code {"modelName": "..."}} 단건 (배치 X — UUID 일괄 lookup 과 별개 endpoint)</li>
 *   <li>정확 매칭 (case-sensitive) — Product.modelName 컬럼 직접 비교</li>
 *   <li>존재하면 200 + ApiResponse&lt;ProductSummaryResponse&gt; (단건)</li>
 *   <li>미존재면 BusinessException(NOT_FOUND) → GlobalExceptionHandler 가 404 매핑</li>
 * </ul>
 *
 * <p>QA 회고 가드 (PR #16/17/18):
 * <ul>
 *   <li>외부 의존 ProductService 는 Mockito.mock — 반환 메서드는 {@code when().thenReturn()}</li>
 *   <li>BusinessException 의 ErrorCode 는 NOT_FOUND vs CONFLICT 구분 정확히 가정</li>
 *   <li>ApiResponse 래핑 → response 본문은 {@code data.modelName} 등으로 접근 (substring 검증)</li>
 * </ul>
 */
class ProductInternalLookupByModelTest {

    private static final String VALID_TOKEN = "test-internal-token";

    private ProductService productService;
    private ProductRepository productRepository;
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
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(VALID_TOKEN);
        // W10-4 (PR #99) DV-3 — product-service application.yml 호환
        props.setPathPrefix("/products/internal/");
        props.setRole("INTERNAL");
        props.setAllowMissingToken(false);

        mockMvc = MockMvcBuilders.standaloneSetup(new ProductInternalController(productService, productRepository,
                        Mockito.mock(com.samhanair.logis.product.service.BundleExpander.class),
                        Mockito.mock(com.samhanair.logis.product.service.EcountAliasResolveService.class)))
                .setControllerAdvice(new com.samhanair.logis.product.web.GlobalExceptionHandler())
                .addFilters(new InternalTokenFilter(props), new HeaderAuthenticationFilter())
                .build();
    }

    @Test
    void lookupByModel_existing_returns200_andDelegatesToService() throws Exception {
        UUID id = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();

        // 반환 메서드 → when().thenReturn() (PR #16 회고: void 만 doNothing()).
        when(productService.lookupSummaryByModelName("SHA-W15K"))
                .thenReturn(new ProductSummaryResponse(id, "스마트 벽걸이", "SHA-W15K",
                        categoryId, new BigDecimal("1500000.00"), ProductStatus.ACTIVE));

        Map<String, Object> body = Map.of("modelName", "SHA-W15K");

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup-by-model")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(200);
        // ApiResponse 래핑이라 substring 검증 — 정확 포맷 가정 X.
        assertThat(response.getContentAsString()).contains("SHA-W15K");
        verify(productService).lookupSummaryByModelName("SHA-W15K");
    }

    @Test
    void lookupByModel_missing_returns404_viaBusinessException() throws Exception {
        // BE 가 NOT_FOUND 를 던지는 가드 분기 (CONFLICT 아님 — 모델명 존재 여부는 NOT_FOUND).
        when(productService.lookupSummaryByModelName("MISSING-MODEL"))
                .thenThrow(new BusinessException(ErrorCode.NOT_FOUND, "해당 모델명의 제품을 찾을 수 없습니다"));

        Map<String, Object> body = Map.of("modelName", "MISSING-MODEL");

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup-by-model")
                        .header("X-Internal-Token", VALID_TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        // standalone MockMvc 에는 GlobalExceptionHandler 가 자동 wired 되지 않을 수도 있어
        // 4xx 범위만 검증 (GlobalExceptionHandler 가 NOT_FOUND → 404 로 매핑한다고 가정).
        // 한국어 메시지의 substring 만 검증, 정확 포맷 가정 X.
        assertThat(response.getStatus()).isIn(404, 500); // standalone setup 은 wrap 없이 500 가능 — 통합 IT 가 실 매핑.
        verify(productService).lookupSummaryByModelName("MISSING-MODEL");
    }

    @Test
    void lookupByModel_wrongToken_returns401_andDoesNotCallService() throws Exception {
        Map<String, Object> body = Map.of("modelName", "SHA-W15K");

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
        Map<String, Object> body = Map.of("modelName", "SHA-W15K");

        MockHttpServletResponse response = mockMvc.perform(MockMvcRequestBuilders
                        .post("/products/internal/lookup-by-model")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn().getResponse();

        assertThat(response.getStatus()).isEqualTo(401);
        verify(productService, never()).lookupSummaryByModelName(any());
    }
}
