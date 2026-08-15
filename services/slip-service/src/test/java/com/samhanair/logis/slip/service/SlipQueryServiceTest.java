package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;

import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipResponse;
import com.samhanair.logis.slip.web.dto.DailyClosingRowResponse;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
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

    @Mock
    private DailyClosingSourceResolver dailyClosingSourceResolver;

    @InjectMocks
    private SlipQueryService service;

    @InjectMocks
    private DailyClosingQueryService dailyClosingQueryService;

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

    @Test
    void 일마감_날짜조회는_확정된_세_상태만_남기고_나머지_상태를_제외한다() {
        SlipStatus[] statuses = {
            SlipStatus.CONFIRMED,
            SlipStatus.DELIVERED,
            SlipStatus.COMPLETED,
            SlipStatus.DRAFT,
            SlipStatus.INSPECTING,
            SlipStatus.PROCESSING,
            SlipStatus.SENT,
            SlipStatus.CANCELED
        };
        Slip[] slips = new Slip[statuses.length];
        SlipLine line = mock(SlipLine.class);
        when(line.getProductName()).thenReturn("테스트 품목");
        for (int i = 0; i < statuses.length; i++) {
            slips[i] = slip("2026/08/14-" + (i + 1), "dev_sales");
            ReflectionTestUtils.setField(slips[i], "status", statuses[i]);
            ReflectionTestUtils.setField(slips[i], "lines", List.of(line));
        }
        when(slipRepository.findDailyClosingOutboundSlips(any(), anyCollection()))
                .thenReturn(List.of(slips));
        when(dailyClosingSourceResolver.resolve(any(), any()))
                .thenReturn(new DailyClosingRowResponse.SourceValues(null, null, null, "원천 미확보"));

        List<DailyClosingRowResponse> rows = dailyClosingQueryService.findRows(
                LocalDate.of(2026, 8, 14));

        assertThat(rows).hasSize(3);
        assertThat(rows).extracting(DailyClosingRowResponse::sourceStatus)
                .containsExactlyInAnyOrder(
                        SlipStatus.CONFIRMED,
                        SlipStatus.DELIVERED,
                        SlipStatus.COMPLETED);
        verify(slipRepository).findDailyClosingOutboundSlips(
                eq(LocalDate.of(2026, 8, 14)),
                eq(java.util.EnumSet.of(SlipStatus.CONFIRMED, SlipStatus.DELIVERED, SlipStatus.COMPLETED)));
    }

    @Test
    void 일마감_원본행은_VAT포함_단가와_공급가액_부가세로_합계를_계산하고_null은_0으로_낸다() {
        Slip slip = slip("2026/08/14-99", "dev_sales");
        ReflectionTestUtils.setField(slip, "status", SlipStatus.CONFIRMED);
        SlipLine line = mock(SlipLine.class);
        when(line.getProductName()).thenReturn("품목 A");
        UUID lineId = UUID.fromString("00000000-0000-0000-0000-000000000901");
        when(line.getId()).thenReturn(lineId);
        when(line.getQuantity()).thenReturn(2);
        when(line.getUnitPriceWithVat()).thenReturn(new java.math.BigDecimal("1100"));
        when(line.getSupplyAmount()).thenReturn(new java.math.BigDecimal("2000"));
        when(line.getVatAmount()).thenReturn(new java.math.BigDecimal("200"));
        ReflectionTestUtils.setField(slip, "lines", List.of(line));
        LocalDateTime modifiedAt = LocalDateTime.of(2026, 8, 14, 10, 0);
        ReflectionTestUtils.setField(slip, "modifiedAt", modifiedAt);
        when(slipRepository.findDailyClosingOutboundSlips(any(), anyCollection()))
                .thenReturn(List.of(slip));
        when(dailyClosingSourceResolver.resolve(any(), any()))
                .thenReturn(new DailyClosingRowResponse.SourceValues(null, null, null, "원천 미확보"));

        DailyClosingRowResponse row = dailyClosingQueryService
                .findRows(LocalDate.of(2026, 8, 14)).get(0);

        assertThat(row.productName()).isEqualTo("품목 A");
        assertThat(row.quantity()).isEqualTo(2);
        assertThat(row.unitPriceWithVat()).isEqualByComparingTo("1100");
        assertThat(row.total()).isEqualByComparingTo("2200");
        assertThat(row.grandTotal()).isEqualByComparingTo("2200");
        assertThat(row.slipId()).isEqualTo(slip.getId());
        assertThat(row.lineId()).isEqualTo(lineId);
        assertThat(row.updatedAt()).isEqualTo(modifiedAt);
        assertThat(row.confirmation()).isEqualTo(DailyClosingRowResponse.Confirmation.UNDETERMINED);
        assertThat(row.confirmationReason()).contains("원천");
    }

    @Test
    void 일마감_원본행은_정가_DC조건_할인율_총계_postedAt을_원천값으로_채운다() {
        Slip slip = slip("2026/08/14-100", "dev_sales");
        ReflectionTestUtils.setField(slip, "status", SlipStatus.CONFIRMED);
        SlipLine line = mock(SlipLine.class);
        when(line.getProductName()).thenReturn("품목 B");
        when(line.getQuantity()).thenReturn(2);
        when(line.getUnitPriceWithVat()).thenReturn(new java.math.BigDecimal("800"));
        when(line.getSupplyAmount()).thenReturn(new java.math.BigDecimal("1454.55"));
        when(line.getVatAmount()).thenReturn(new java.math.BigDecimal("145.45"));
        ReflectionTestUtils.setField(slip, "lines", List.of(line));

        DailyClosingRowResponse row = DailyClosingRowResponse.from(slip, line,
                new DailyClosingRowResponse.SourceValues(
                        new java.math.BigDecimal("1000"),
                        "홈45%&상업46% / 360 -3만",
                        java.time.LocalDateTime.of(2026, 8, 14, 11, 47),
                        null));

        assertThat(row.productPrice()).isEqualByComparingTo("1000");
        assertThat(row.discountRate()).isEqualByComparingTo("20");
        assertThat(row.grandTotal()).isEqualByComparingTo("1600");
        assertThat(row.dcAmount()).isEqualByComparingTo("200");
        assertThat(row.dcCondition()).isEqualTo("홈45%&상업46% / 360 -3만");
        assertThat(row.accountingPostedAt()).isEqualTo(java.time.LocalDateTime.of(2026, 8, 14, 11, 47));
        assertThat(row.confirmation()).isEqualTo(DailyClosingRowResponse.Confirmation.CONFIRMED);
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
