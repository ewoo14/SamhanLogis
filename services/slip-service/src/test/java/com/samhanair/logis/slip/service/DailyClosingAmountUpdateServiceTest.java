package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.client.AccountingPostedAtClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.web.dto.DailyClosingAmountUpdateRequest;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 일마감 금액 전용 수정의 핵심 회계 방어를 먼저 고정한다. */
class DailyClosingAmountUpdateServiceTest {

    private static final UUID SLIP_ID = UUID.randomUUID();
    private static final LocalDateTime VERSION = LocalDateTime.of(2026, 8, 14, 10, 0);

    @Test
    void 회계전표가_있는_전표는_금액_수정을_거부한다() {
        SlipRepository slips = mock(SlipRepository.class);
        AccountingPostedAtClient accounting = mock(AccountingPostedAtClient.class);
        SlipClosedDateGuard closedDateGuard = mock(SlipClosedDateGuard.class);
        Slip slip = mock(Slip.class);
        when(slips.findById(SLIP_ID)).thenReturn(Optional.of(slip));
        when(slip.getSlipNo()).thenReturn("2026/08/14-1");
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(slip.getStatus()).thenReturn(SlipStatus.CONFIRMED);
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 8, 14));
        when(accounting.hasAccountingSlip("2026/08/14-1")).thenReturn(true);

        DailyClosingAmountUpdateService service = new DailyClosingAmountUpdateService(
                slips, accounting, closedDateGuard, null, null);

        assertThatThrownBy(() -> service.update(SLIP_ID, request(), UUID.randomUUID(), "마스터"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("회계전표");
    }

    @Test
    void 회계전표가_없는_CONFIRMED_전표는_금액_수정을_허용한다() {
        SlipRepository slips = mock(SlipRepository.class);
        AccountingPostedAtClient accounting = mock(AccountingPostedAtClient.class);
        SlipClosedDateGuard closedDateGuard = mock(SlipClosedDateGuard.class);
        Slip slip = mock(Slip.class);
        when(slips.findById(SLIP_ID)).thenReturn(Optional.of(slip));
        when(slip.getSlipNo()).thenReturn("2026/08/14-2");
        when(accounting.hasAccountingSlip("2026/08/14-2")).thenReturn(false);
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(slip.getStatus()).thenReturn(SlipStatus.CONFIRMED);
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 8, 14));
        when(slip.getCreatedAt()).thenReturn(VERSION);
        DailyClosingAmountUpdateRequest request = request();
        SlipLine line = mock(SlipLine.class);
        UUID lineId = request.lines().get(0).lineId();
        when(line.getId()).thenReturn(lineId);
        when(line.getQuantity()).thenReturn(1);
        when(line.getUnitPriceWithVat()).thenReturn(new BigDecimal("10000"));
        when(slip.getLines()).thenReturn(java.util.List.of(line));
        when(slips.saveAndFlush(slip)).thenReturn(slip);

        DailyClosingAmountUpdateService service = new DailyClosingAmountUpdateService(
                slips, accounting, closedDateGuard, mock(SlipAuditLogService.class),
                mock(SlipRevisionService.class));

        service.update(SLIP_ID, request, UUID.randomUUID(), "마스터");
    }

    @Test
    void DELIVERED와_COMPLETED도_회계전표가_없으면_금액_수정을_허용한다() {
        SlipRepository slips = mock(SlipRepository.class);
        AccountingPostedAtClient accounting = mock(AccountingPostedAtClient.class);
        SlipClosedDateGuard closedDateGuard = mock(SlipClosedDateGuard.class);
        SlipAuditLogService audit = mock(SlipAuditLogService.class);
        SlipRevisionService revision = mock(SlipRevisionService.class);
        Slip slip = mock(Slip.class);
        SlipLine line = mock(SlipLine.class);
        DailyClosingAmountUpdateRequest request = request();

        when(slips.findById(SLIP_ID)).thenReturn(Optional.of(slip));
        when(slip.getSlipNo()).thenReturn("2026/08/14-status");
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 8, 14));
        when(slip.getCreatedAt()).thenReturn(VERSION);
        when(slip.getLines()).thenReturn(java.util.List.of(line));
        when(line.getId()).thenReturn(request.lines().get(0).lineId());
        when(line.getQuantity()).thenReturn(1);
        when(line.getUnitPriceWithVat()).thenReturn(new BigDecimal("10000"));
        when(accounting.hasAccountingSlip("2026/08/14-status")).thenReturn(false);
        when(slips.saveAndFlush(slip)).thenReturn(slip);

        DailyClosingAmountUpdateService service = new DailyClosingAmountUpdateService(
                slips, accounting, closedDateGuard, audit, revision);
        for (SlipStatus status : new SlipStatus[] { SlipStatus.DELIVERED, SlipStatus.COMPLETED }) {
            when(slip.getStatus()).thenReturn(status);
            service.update(SLIP_ID, request, UUID.randomUUID(), "마스터");
        }

        verify(line, org.mockito.Mockito.times(2)).changeUnitPriceWithVat(new BigDecimal("11000"));
        verify(line, org.mockito.Mockito.times(2)).changeDailyClosingReferenceAmounts(
                new BigDecimal("12000"), new BigDecimal("0.083333"));
    }

    @Test
    void 화면이_반올림한_50퍼센트_정상조합은_허용하고_실제_불일치는_거부한다() {
        SlipRepository slips = mock(SlipRepository.class);
        AccountingPostedAtClient accounting = mock(AccountingPostedAtClient.class);
        SlipClosedDateGuard closedDateGuard = mock(SlipClosedDateGuard.class);
        Slip slip = mock(Slip.class);
        SlipLine line = mock(SlipLine.class);
        when(slips.findById(SLIP_ID)).thenReturn(Optional.of(slip));
        when(slip.getSlipNo()).thenReturn("2026/08/14-rate");
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(slip.getStatus()).thenReturn(SlipStatus.CONFIRMED);
        when(slip.getSlipDate()).thenReturn(LocalDate.of(2026, 8, 14));
        when(slip.getCreatedAt()).thenReturn(VERSION);
        when(slip.getLines()).thenReturn(java.util.List.of(line));
        when(line.getId()).thenReturn(UUID.randomUUID());
        when(line.getQuantity()).thenReturn(1);
        when(line.getUnitPriceWithVat()).thenReturn(new BigDecimal("51"));
        when(accounting.hasAccountingSlip("2026/08/14-rate")).thenReturn(false);
        when(slips.saveAndFlush(slip)).thenReturn(slip);
        DailyClosingAmountUpdateService service = new DailyClosingAmountUpdateService(
                slips, accounting, closedDateGuard, mock(SlipAuditLogService.class),
                mock(SlipRevisionService.class));

        UUID lineId = line.getId();
        DailyClosingAmountUpdateRequest roundedScreenValue = new DailyClosingAmountUpdateRequest(
                VERSION, java.util.List.of(new DailyClosingAmountUpdateRequest.Line(
                        lineId, new BigDecimal("51"), new BigDecimal("101"), new BigDecimal("0.5"))));
        service.update(SLIP_ID, roundedScreenValue, UUID.randomUUID(), "마스터");

        DailyClosingAmountUpdateRequest contradictory = new DailyClosingAmountUpdateRequest(
                VERSION, java.util.List.of(new DailyClosingAmountUpdateRequest.Line(
                        lineId, new BigDecimal("51"), new BigDecimal("101"), new BigDecimal("0.6"))));
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> service.update(SLIP_ID, contradictory, UUID.randomUUID(), "마스터"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("계산 근거");
    }

    private DailyClosingAmountUpdateRequest request() {
        return new DailyClosingAmountUpdateRequest(VERSION, java.util.List.of(
                new DailyClosingAmountUpdateRequest.Line(
                        UUID.randomUUID(), new BigDecimal("11000"),
                        new BigDecimal("12000"), new BigDecimal("0.083333"))));
    }
}
