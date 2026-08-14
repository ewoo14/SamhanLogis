package com.samhanair.logis.slip.it;

import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.client.ExpectedCount.manyTimes;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withResourceNotFound;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

/**
 * 전표 상세 결재 서명자 이름 resolve 통합 테스트.
 *
 * <p>{@code UserInternalClient} 는 {@code @MockBean} 으로 우회하지 않고 실제 RestClient 빈을 사용한다.
 * user-service HTTP 계약은 {@link MockRestServiceServer} 로 스텁하여
 * {@code GET /internal/users/{userId}} 경로와 내부 토큰 헤더를 함께 검증한다.
 */
@SpringBootTest(classes = {
        SlipServiceApplication.class,
        SlipDetailNameResolveIT.UserInternalClientRestClientConfig.class,
})
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "spring.main.allow-bean-definition-overriding=true",
        "app.security.internal.token=test-internal-token",
})
class SlipDetailNameResolveIT extends AbstractPostgresIT {

    private static final String INTERNAL_TOKEN = "test-internal-token";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String USER_ROLE_HEADER = "X-User-Role";
    private static final String CLEANUP_USER = "SlipDetailNameResolveIT";
    private static final String SLIP_NO_PREFIX = "S4D-NAME-";
    private static final AtomicInteger SEQ = new AtomicInteger(4100);
    private static final Map<UUID, String> NAME_BY_ID = new ConcurrentHashMap<>();

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SlipRepository slipRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private PartnerInternalClient partnerInternalClient;

    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    @BeforeEach
    void setUp() {
        cleanupTestSlips();
        UserInternalClientRestClientConfig.server.reset();
        NAME_BY_ID.clear();
        lenient().when(partnerInternalClient.resolveBusinessNumber(any())).thenReturn(Optional.empty());
        lenient().when(warehouseInternalClient.findWarehouseName(any())).thenReturn(Optional.empty());
        lenient().when(productClient.lookup(anyList())).thenReturn(java.util.List.of());
    }

    @AfterEach
    void tearDown() {
        UserInternalClientRestClientConfig.server.verify();
        cleanupTestSlips();
    }

    @Test
    @DisplayName("INBOUND 상세는 입고자/검수자 이름을 resolve 하고 출고자 이름은 null 이다")
    void getInboundDetail_resolvesAcceptedByAndInspectorFullName() throws Exception {
        UUID acceptedBy = UUID.randomUUID();
        UUID inspector = UUID.randomUUID();
        Slip slip = saveInboundCompleted(acceptedBy.toString(), inspector.toString());

        registerUserName(acceptedBy, "입고담당");
        registerUserName(inspector, "검수담당");
        expectUserNameRequests();

        mockMvc.perform(get("/slips/{id}", slip.getId())
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.acceptedByFullName", is("입고담당")))
                .andExpect(jsonPath("$.data.inspectorFullName", is("검수담당")))
                // getOne 이 INBOUND 에서는 dispatcherFullName 을 resolve 하지 않는다(출고자=OUTBOUND 만).
                // accept() 가 acceptedBy==dispatcherUserId 동일 설정해도 INBOUND 응답엔 노출 안 함.
                .andExpect(jsonPath("$.data.dispatcherFullName", nullValue()));
    }

    @Test
    @DisplayName("user-service 404(미존재 서명자)는 graceful 하게 이름 null + GET 200 정상 반환")
    void getInboundDetail_gracefulNullWhenUserServiceMissing() throws Exception {
        UUID acceptedBy = UUID.randomUUID();
        UUID inspector = UUID.randomUUID();
        Slip slip = saveInboundCompleted(acceptedBy.toString(), inspector.toString());

        // 입고자만 등록 → 검수자(inspector) 는 미등록 → user-service 404 → graceful null.
        registerUserName(acceptedBy, "입고담당");
        expectUserNameRequests();

        mockMvc.perform(get("/slips/{id}", slip.getId())
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, "WAREHOUSE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.acceptedByFullName", is("입고담당")))
                .andExpect(jsonPath("$.data.inspectorFullName", nullValue()));
    }

    @Test
    @DisplayName("OUTBOUND 상세는 출고자/검수자 이름을 resolve 한다")
    void getOutboundDetail_resolvesDispatcherAndInspectorFullName() throws Exception {
        UUID dispatcher = UUID.randomUUID();
        UUID inspector = UUID.randomUUID();
        Slip slip = saveOutboundCompleted(dispatcher.toString(), inspector.toString());

        registerUserName(dispatcher, "출고담당");
        registerUserName(inspector, "검수담당");
        expectUserNameRequests();

        mockMvc.perform(get("/slips/{id}", slip.getId())
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dispatcherFullName", is("출고담당")))
                .andExpect(jsonPath("$.data.inspectorFullName", is("검수담당")))
                // getOne 이 OUTBOUND 에서는 acceptedByFullName 을 resolve 하지 않는다(입고자=INBOUND 만).
                .andExpect(jsonPath("$.data.acceptedByFullName", nullValue()));
    }

    @Test
    @DisplayName("mutation 응답은 결재 서명자 이름을 resolve 하지 않고 null 로 반환한다")
    void mutationResponse_keepsResolvedFullNamesNull() throws Exception {
        Slip slip = saveOutboundDraft();

        mockMvc.perform(post("/slips/{id}/save", slip.getId())
                        .header(USER_ID_HEADER, UUID.randomUUID().toString())
                        .header(USER_ROLE_HEADER, "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dispatcherFullName", nullValue()))
                .andExpect(jsonPath("$.data.inspectorFullName", nullValue()))
                .andExpect(jsonPath("$.data.acceptedByFullName", nullValue()));
    }

    private Slip saveInboundCompleted(String acceptedBy, String inspectorUserId) {
        Slip slip = newInboundSlip();
        slip.addLine(defaultLine(slip));
        slip.save();
        slip.send();
        slip.accept(acceptedBy);
        slip.process();
        slip.complete();
        slip.inspect(inspectorUserId);
        return slipRepository.saveAndFlush(slip);
    }

    private Slip saveOutboundCompleted(String dispatcherUserId, String inspectorUserId) {
        Slip slip = newOutboundSlip();
        slip.addLine(defaultLine(slip));
        slip.save();
        slip.send();
        slip.accept(dispatcherUserId);
        slip.process();
        slip.complete();
        slip.inspect(inspectorUserId);
        return slipRepository.saveAndFlush(slip);
    }

    private Slip saveOutboundDraft() {
        Slip slip = newOutboundSlip();
        slip.addLine(defaultLine(slip));
        return slipRepository.saveAndFlush(slip);
    }

    private Slip newInboundSlip() {
        int seqNo = SEQ.incrementAndGet();
        return Slip.createInbound(SLIP_NO_PREFIX + seqNo, LocalDate.of(2026, 6, 22), seqNo,
                UUID.randomUUID(), UUID.randomUUID(), "S4D 입고거래처",
                DeliveryTag.RETURN_TRIP, "입고 결재란 테스트", UUID.randomUUID().toString());
    }

    private Slip newOutboundSlip() {
        int seqNo = SEQ.incrementAndGet();
        return Slip.createOutbound(SLIP_NO_PREFIX + seqNo, LocalDate.of(2026, 6, 22), seqNo,
                UUID.randomUUID(), null, UUID.randomUUID(), "S4D 출고거래처",
                DeliveryTag.SALE, "출고 결재란 테스트", UUID.randomUUID().toString());
    }

    private SlipLine defaultLine(Slip slip) {
        return SlipLine.create(slip, UUID.randomUUID(), "테스트 품목", "MODEL-S4D",
                null, 1, new BigDecimal("1000.00"), null);
    }

    private void registerUserName(UUID userId, String fullName) {
        NAME_BY_ID.put(userId, fullName);
    }

    private void expectUserNameRequests() {
        UserInternalClientRestClientConfig.server.expect(manyTimes(),
                        requestTo(startsWith("http://user-service/internal/users/")))
                .andExpect(header("X-Internal-Token", INTERNAL_TOKEN))
                .andRespond(request -> {
                    String uri = request.getURI().toString();
                    String id = uri.substring(uri.lastIndexOf('/') + 1);
                    String name = NAME_BY_ID.get(UUID.fromString(id));
                    // 미등록 id(예: createdBy 또는 미존재 서명자) → 404 → client graceful null.
                    if (name == null) {
                        return withResourceNotFound().createResponse(request);
                    }
                    return withSuccess("""
                            {"success":true,"data":{"id":"%s","fullName":"%s"}}
                            """.formatted(id, name), MediaType.APPLICATION_JSON)
                            .createResponse(request);
                });
    }

    private void cleanupTestSlips() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(status -> {
            jdbcTemplate.update("""
                    UPDATE slip_lines
                       SET is_deleted = true,
                           deleted_at = CURRENT_TIMESTAMP,
                           deleted_by = ?
                     WHERE is_deleted = false
                       AND slip_id IN (
                           SELECT id FROM slips WHERE slip_no LIKE ?
                       )
                    """, CLEANUP_USER, SLIP_NO_PREFIX + "%");
            jdbcTemplate.update("""
                    UPDATE slips
                       SET is_deleted = true,
                           deleted_at = CURRENT_TIMESTAMP,
                           deleted_by = ?
                     WHERE is_deleted = false
                       AND slip_no LIKE ?
                    """, CLEANUP_USER, SLIP_NO_PREFIX + "%");
        });
    }

    @TestConfiguration
    static class UserInternalClientRestClientConfig {
        static MockRestServiceServer server;

        /**
         * UserInternalClient 생성 시점의 RestClient.Builder 에 mock server 를 바인딩한다.
         * UserInternalClient 가 timeout 설정용 requestFactory 를 다시 지정하므로,
         * 테스트 builder 에서는 해당 호출만 no-op 처리해 mock server requestFactory 를 보존한다.
         *
         * @return MockRestServiceServer 가 바인딩된 RestClient.Builder
         */
        @Bean("loadBalancedRestClientBuilder")
        RestClient.Builder loadBalancedRestClientBuilder() {
            RestClient.Builder builder = Mockito.spy(RestClient.builder());
            server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
            Mockito.doReturn(builder).when(builder).requestFactory(Mockito.any(ClientHttpRequestFactory.class));
            return builder;
        }
    }
}
