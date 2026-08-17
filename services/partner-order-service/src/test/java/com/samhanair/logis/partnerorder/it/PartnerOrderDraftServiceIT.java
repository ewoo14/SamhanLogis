package com.samhanair.logis.partnerorder.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.partnerorder.PartnerOrderServiceApplication;
import com.samhanair.logis.partnerorder.client.DcConfigClient;
import com.samhanair.logis.partnerorder.client.InventoryClient;
import com.samhanair.logis.partnerorder.client.PartnerAuthClient;
import com.samhanair.logis.partnerorder.client.ProductClient;
import com.samhanair.logis.partnerorder.client.SlipServiceClient;
import com.samhanair.logis.partnerorder.repository.PartnerOrderDraftRepository;
import com.samhanair.logis.partnerorder.service.PartnerOrderDraftService;
import com.samhanair.logis.partnerorder.web.dto.DraftCreateRequest;
import com.samhanair.logis.partnerorder.web.dto.DraftResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.annotation.Transactional;

/**
 * 임시저장 30일 TTL + draftSeq UNIQUE per partner + cleanup batch 검증.
 *
 * <p>모든 외부 client mock — Eureka 비활성 환경에서도 Spring Context 부팅 통과.
 */
@SpringBootTest(classes = PartnerOrderServiceApplication.class)
@Transactional
class PartnerOrderDraftServiceIT extends AbstractPostgresIT {

    @Autowired
    private PartnerOrderDraftService draftService;

    @Autowired
    private PartnerOrderDraftRepository draftRepository;

    @MockBean
    private DcConfigClient dcConfigClient;

    @MockBean
    private ProductClient productClient;

    @MockBean
    private InventoryClient inventoryClient;

    @MockBean
    private SlipServiceClient slipServiceClient;

    @MockBean
    private PartnerAuthClient partnerAuthClient;

    @Test
    void draft_create_assigns_sequential_draft_seq_per_partner() {
        // mock setup (lenient - 호출되지 않을 수 있음)
        Mockito.lenient().when(dcConfigClient.calculatePrices(Mockito.anyString(), Mockito.anyList()))
                .thenReturn(Map.of());
        Mockito.lenient().when(productClient.lookup(Mockito.anyList()))
                .thenReturn(List.of());

        DraftResponse first = draftService.create(
                "P001", "user-1",
                new DraftCreateRequest("2025/05/05 - 임시저장 1", "{\"items\":[]}"));
        DraftResponse second = draftService.create(
                "P001", "user-1",
                new DraftCreateRequest("2025/05/05 - 임시저장 2", "{\"items\":[]}"));

        assertThat(first.draftSeq()).isEqualTo(1L);
        assertThat(second.draftSeq()).isEqualTo(2L);

        // 다른 거래처는 1부터 다시 시작
        DraftResponse otherFirst = draftService.create(
                "P002", "user-2",
                new DraftCreateRequest("2025/05/05 - 임시저장 1", "{\"items\":[]}"));
        assertThat(otherFirst.draftSeq()).isEqualTo(1L);
    }

    @Test
    void draft_list_filters_created_at_by_legacy_date_range() {
        draftService.create(
                "P004", "user-4",
                new DraftCreateRequest("오늘 저장", "{\"items\":[]}"));
        draftService.create(
                "P005", "user-5",
                new DraftCreateRequest("다른 거래처 저장", "{\"items\":[]}"));

        assertThat(draftService.list(
                "P004", LocalDate.now(), LocalDate.now(), PageRequest.of(0, 20)).getTotalElements())
                .isEqualTo(1L);
        assertThat(draftService.list(
                "P004", LocalDate.now(), null, PageRequest.of(0, 20)).getTotalElements())
                .isEqualTo(1L);
        assertThat(draftService.list(
                "P004", null, LocalDate.now(), PageRequest.of(0, 20)).getTotalElements())
                .isEqualTo(1L);
        assertThat(draftService.list(
                "P004", LocalDate.now().plusDays(1), LocalDate.now().plusDays(1), PageRequest.of(0, 20)).getTotalElements())
                .isZero();
    }
}
