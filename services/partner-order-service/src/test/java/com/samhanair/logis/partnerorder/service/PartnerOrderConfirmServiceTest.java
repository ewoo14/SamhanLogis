package com.samhanair.logis.partnerorder.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
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
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext(?1))"))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.setParameter(1, "partner_order_seq_" + today))
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
        when(entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(hashtext(?1))"))
                .thenReturn(advisoryLockQuery);
        when(advisoryLockQuery.setParameter(1, "partner_order_seq_" + today))
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

    private static PartnerOrder order(String orderNo) {
        return PartnerOrder.create("P-TEST", "1234567890", orderNo,
                "IDEM-" + orderNo, BigDecimal.ZERO);
    }
}
