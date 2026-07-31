package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.ProductSummary;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.repository.PartnerOrderDraftRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.service.PartnerOrderRevisionService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 주문 확정 공개 주문번호 계약 검증.
 *
 * <p>UUID 는 hidden PK 이고 사용자 표시 주문번호는 날짜별 {@code yyyy/MM/dd-N} 순번이다.
 */
@ExtendWith(MockitoExtension.class)
class PartnerOrderConfirmServiceTest {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    @Mock
    private PartnerOrderRepository orderRepository;
    @Mock
    private PartnerOrderDraftRepository draftRepository;
    @Mock
    private PartnerOrderHistoryRepository historyRepository;
    @Mock
    private DcConfigClient dcConfigClient;
    @Mock
    private ProductClient productClient;
    @Mock
    private PartnerOrderPartnerIdentityResolver partnerIdentityResolver;
    @Mock
    private PartnerOrderBoardChangePublisher boardChangePublisher;
    @Mock
    private PartnerOrderRevisionService revisionService;
    @Mock
    private EntityManager entityManager;
    @Mock
    private Query advisoryLockQuery;

    @InjectMocks
    private PartnerOrderConfirmService service;

    @Test
    void nextOrderNo_usesDatePrefixAndLastVisibleSequence() {
        String today = LocalDate.now().format(DATE_FMT);
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))"))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.setParameter(1, "partner_order_no_seq_" + today))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.getSingleResult()).thenReturn(null);
        when(orderRepository.findAllByOrderNoStartingWith(today)).thenReturn(List.of(
                order(today + "-1"),
                order(today + "-0007"),
                order(today + " - V12"),
                order(today + "-bad"),
                order("2026/01/01-99")));

        String orderNo = ReflectionTestUtils.invokeMethod(service, "nextOrderNo");

        assertThat(orderNo).isEqualTo(today + "-13");
        assertThat(orderNo).doesNotStartWith("PO-");
    }

    @Test
    void nextOrderNo_startsAtOneWhenNoSameDayOrderExists() {
        String today = LocalDate.now().format(DATE_FMT);
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))"))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.setParameter(1, "partner_order_no_seq_" + today))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.getSingleResult()).thenReturn(null);
        when(orderRepository.findAllByOrderNoStartingWith(today)).thenReturn(List.of());

        String orderNo = ReflectionTestUtils.invokeMethod(service, "nextOrderNo");

        assertThat(orderNo).isEqualTo(today + "-1");
    }

    /**
     * P1-3: mapCategory — homemulti / commercialMulti / 기타 매핑 검증.
     *
     * <p>private 메서드를 {@link ReflectionTestUtils#invokeMethod} 로 간접 검증.
     */
    @Test
    void mapCategory_homemulti_to_HOMEMULTI() {
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", "homemulti"))
                .isEqualTo("HOMEMULTI");
    }

    @Test
    void mapCategory_homeDefaults_to_HOMEMULTI() {
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", "homeDefaults"))
                .isEqualTo("HOMEMULTI");
    }

    @Test
    void mapCategory_commercialMulti_to_COMMERCIAL_MULTI() {
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", "commercialMulti"))
                .isEqualTo("COMMERCIAL_MULTI");
    }

    @Test
    void mapCategory_other_values_to_OTHER() {
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", "singleSets"))
                .isEqualTo("OTHER");
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", "commercialParts"))
                .isEqualTo("OTHER");
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", "oldProducts"))
                .isEqualTo("OTHER");
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", (Object) null))
                .isEqualTo("OTHER");
        assertThat(ReflectionTestUtils.<String>invokeMethod(service, "mapCategory", "unknown"))
                .isEqualTo("OTHER");
    }

    /**
     * ubuntu-latest에서도 동작하는 순수 Mockito 단위 테스트다.
     * 화면은 UUID 대신 사용자 노출 modelCode를 보내고, 서버가 내부 UUID로 해석해야 한다.
     */
    @Test
    void confirm_resolves_modelCode_without_exposing_productUuid_to_client() {
        UUID productId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        UUID partnerId = UUID.fromString("33333333-3333-3333-3333-333333333333");
        ProductSummary product = new ProductSummary(
                productId, "홈 상품", "HM-1", null, new BigDecimal("100"), "ACTIVE",
                "HM-1", "BUNDLE", "homemulti", null, null,
                new BigDecimal("100"), new BigDecimal("90"), true);
        when(draftRepository.findMaxDraftSeqByPartnerCode("P1")).thenReturn(0L);
        when(orderRepository.findByIdempotencyKey("PO-CONF-P1-1")).thenReturn(Optional.empty());
        when(partnerIdentityResolver.requirePartnerId("P1", "B1")).thenReturn(partnerId);
        when(productClient.lookupByModelCodes(List.of("HM-1"))).thenReturn(List.of(product));
        when(productClient.lookupFixedDiscountRates(List.of(productId))).thenReturn(Map.of());
        when(dcConfigClient.calculatePrices(eq("P1"), anyList()))
                .thenReturn(Map.of("0", new BigDecimal("70")));
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))"))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.setParameter(anyInt(), anyString()))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.getSingleResult()).thenReturn(null);
        when(orderRepository.findAllByOrderNoStartingWith(any(String.class))).thenReturn(List.of());
        when(orderRepository.save(any(PartnerOrder.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.confirm(
                "P1", "B1", "user", "사용자", null,
                new com.samhanair.logis.partnerorder.web.dto.ConfirmRequest(List.of(
                        new com.samhanair.logis.partnerorder.web.dto.ConfirmLineRequest(
                                null, "HM-1", "homemulti", 2, null)),
                        "서울시 금천구 주문로 1"));

        ArgumentCaptor<PartnerOrder> saved = ArgumentCaptor.forClass(PartnerOrder.class);
        verify(orderRepository).save(saved.capture());
        assertThat(response.orderNo()).isNotBlank();
        assertThat(saved.getValue().getLines()).singleElement()
                .satisfies(line -> {
                    assertThat(line.getProductId()).isEqualTo(productId);
                    assertThat(line.getPriceVat()).isEqualByComparingTo("70");
                });
        assertThat(saved.getValue().getDeliveryAddress()).isEqualTo("서울시 금천구 주문로 1");
    }

    private static PartnerOrder order(String orderNo) {
        return PartnerOrder.create("P-TEST", "1234567890", orderNo,
                "IDEM-" + orderNo, BigDecimal.ZERO);
    }
}
