package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

@ExtendWith(MockitoExtension.class)
class SlipQueryServiceTest {

    private static final UUID SOURCE_WAREHOUSE =
            UUID.fromString("11111111-1111-1111-1111-000000000001");
    private static final UUID PARTNER_ID =
            UUID.fromString("22222222-2222-2222-2222-000000000001");
    private static final UUID REQUESTER_A =
            UUID.fromString("30000000-0000-0000-0000-000000000001");
    private static final UUID REQUESTER_B =
            UUID.fromString("30000000-0000-0000-0000-000000000002");

    @Mock
    private SlipRepository slipRepository;

    @Mock
    private UserInternalClient userInternalClient;

    @InjectMocks
    private SlipQueryService service;

    @Test
    void listForQuery는_페이지의_distinct_UUID를_한번에_resolve하고_salesPersonName에_성명을_넣는다() {
        Slip first = slip("881-1", REQUESTER_A.toString());
        Slip second = slip("881-2", REQUESTER_A.toString());
        Slip third = slip("881-3", REQUESTER_B.toString());
        givenPage(first, second, third);
        when(userInternalClient.resolveFullNames(anyCollection()))
                .thenReturn(Map.of(REQUESTER_A, "담당자A", REQUESTER_B, "담당자B"));

        List<SlipResponse> rows = query().getContent();

        assertThat(rows).extracting(SlipResponse::salesPersonName)
                .containsExactly("담당자A", "담당자A", "담당자B");
        ArgumentCaptor<java.util.Collection<UUID>> ids = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(userInternalClient).resolveFullNames(ids.capture());
        assertThat(ids.getValue()).containsExactlyInAnyOrder(REQUESTER_A, REQUESTER_B);
    }

    @Test
    void listForQuery는_sentinel_loginId_miss를_원문대신_중립표시하고_목록을_유지한다() {
        UUID missing = UUID.fromString("30000000-0000-0000-0000-000000000099");
        Slip sentinel = slip("881-4", "00000000-0000-0000-0000-000000000000");
        Slip loginId = slip("881-5", "dev_sales");
        Slip miss = slip("881-6", missing.toString());
        givenPage(sentinel, loginId, miss);
        when(userInternalClient.resolveFullNames(anyCollection())).thenReturn(Map.of());

        List<SlipResponse> rows = query().getContent();

        assertThat(rows).hasSize(3);
        assertThat(rows).extracting(SlipResponse::salesPersonName)
                .containsOnly("—");
        verify(userInternalClient).resolveFullNames(anyCollection());
    }

    @Test
    void listForQuery는_user_service_장애에도_목록을_200_경로로_유지하고_담당자를_중립표시한다() {
        givenPage(slip("881-7", REQUESTER_A.toString()));
        when(userInternalClient.resolveFullNames(anyCollection()))
                .thenThrow(new IllegalStateException("user-service down"));

        List<SlipResponse> rows = query().getContent();

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).salesPersonName()).isEqualTo("—");
    }

    @Test
    void listForQuery는_requesterId가_없는_페이지에_벌크_RPC를_호출하지_않는다() {
        givenPage(slip("881-8", "dev_sales"));

        assertThat(query().getContent().get(0).salesPersonName()).isEqualTo("—");
        verifyNoInteractions(userInternalClient);
    }

    private Page<SlipResponse> query() {
        return service.listForQuery(
                        SlipType.OUTBOUND,
                        SlipStatus.DRAFT,
                        LocalDate.of(2026, 7, 1),
                        LocalDate.of(2026, 7, 31),
                        List.of(DeliveryTag.SALE),
                        null, null, null, null, null, null,
                        PageRequest.of(0, 50));
    }

    private void givenPage(Slip... slips) {
        when(slipRepository.searchIncludingDeleted(
                any(), any(), any(), any(), anyCollection(), anyBoolean(),
                any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(new PageImpl<>(List.of(slips)));
    }

    private static Slip slip(String slipNo, String requesterId) {
        return Slip.createOutbound(
                slipNo,
                LocalDate.of(2026, 7, 24),
                1,
                SOURCE_WAREHOUSE,
                null,
                PARTNER_ID,
                "테스트 거래처",
                DeliveryTag.SALE,
                null,
                requesterId);
    }
}
