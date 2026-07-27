package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** 매출 수정 경로의 VAT 포함 가격기억 소비 계약을 검증한다. */
class SalesSlipUpdateServiceTest {

    private final UUID partnerId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final SalesSlipUpdateService service = new SalesSlipUpdateService(
            mock(SlipRepository.class),
            mock(SlipAuditLogService.class),
            mock(SlipRevisionService.class),
            mock(PartnerProductPriceMemoryService.class));

    @Test
    @DisplayName("권위 금액 라인은 입력 단가를 VAT 포함 가격기억으로 그대로 저장한다")
    void authoritativeLine_keepsInputPriceForPriceMemory() {
        Slip slip = Slip.createOutbound("2026/07/25-1", LocalDate.of(2026, 7, 25), 1,
                UUID.randomUUID(), UUID.randomUUID(), partnerId, "테스트 거래처", null, null, "tester");
        SlipLine line = SlipLine.createFromAuthoritativeAmounts(
                slip, productId, "테스트 품목", "MODEL-1", null, 2,
                new BigDecimal("11000"), new BigDecimal("20000"), new BigDecimal("2000"),
                new BigDecimal("22000"), null, null);

        List<PartnerProductPriceMemoryCommand> commands = ReflectionTestUtils.invokeMethod(
                service, "collectPriceMemory", slip, List.of(line), "tester");

        assertThat(commands).hasSize(1);
        assertThat(commands.get(0).unitPrice()).isEqualByComparingTo("11000");
    }

    @Test
    @DisplayName("unitPriceWithVat가 없는 legacy 라인은 공급단가를 1.1배 해 기억한다")
    void legacyLine_normalizesSupplyPriceForPriceMemory() {
        Slip slip = Slip.createOutbound("2026/07/25-2", LocalDate.of(2026, 7, 25), 2,
                UUID.randomUUID(), UUID.randomUUID(), partnerId, "테스트 거래처", null, null, "tester");
        SlipLine line = SlipLine.create(slip, productId, "테스트 품목", "MODEL-1", null,
                2, new BigDecimal("10000"), null);
        ReflectionTestUtils.setField(line, "unitPriceWithVat", null);

        List<PartnerProductPriceMemoryCommand> commands = ReflectionTestUtils.invokeMethod(
                service, "collectPriceMemory", slip, List.of(line), "tester");

        assertThat(commands.get(0).unitPrice()).isEqualByComparingTo("11000");
    }

    @Test
    @DisplayName("부가세만 변경해도 매출 PUT은 revision과 금액 변경 이력을 캡처한다")
    void vatOnlyEdit_capturesRevisionAndAmountChange() {
        Slip slip = Slip.createOutbound("2026/07/25-3", LocalDate.of(2026, 7, 25), 3,
                UUID.randomUUID(), null, partnerId, "테스트 거래처", null, null, "tester");
        UUID slipId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        LocalDateTime updatedAt = LocalDateTime.of(2026, 7, 25, 10, 0);
        ReflectionTestUtils.setField(slip, "id", slipId);
        ReflectionTestUtils.setField(slip, "createdAt", updatedAt);
        slip.addLine(SlipLine.createFromAuthoritativeAmounts(
                slip, productId, "테스트 품목", "MODEL-1", null, 1,
                new BigDecimal("11000"), new BigDecimal("10000"), new BigDecimal("1000"),
                new BigDecimal("11000"), null, null));

        SlipRepository repository = (SlipRepository) ReflectionTestUtils.getField(
                service, "slipRepository");
        SlipRevisionService revisionService = (SlipRevisionService) ReflectionTestUtils.getField(
                service, "slipRevisionService");
        SlipAuditLogService auditLogService = (SlipAuditLogService) ReflectionTestUtils.getField(
                service, "auditLogService");
        when(repository.findById(slipId)).thenReturn(Optional.of(slip));
        when(repository.saveAndFlush(any(Slip.class))).thenAnswer(invocation -> invocation.getArgument(0));

        SlipUpdateRequest.LineRequest line = new SlipUpdateRequest.LineRequest(
                productId, "테스트 품목", "MODEL-1", null, 1,
                new BigDecimal("11000"), null, null,
                new BigDecimal("10000"), new BigDecimal("1200"), new BigDecimal("11200"));
        service.update(slipId, new SlipUpdateRequest(
                updatedAt, partnerId, "테스트 거래처", null, null, null, null, null,
                null, null, null, List.of(line), true), actorId, "테스터");

        verify(revisionService, times(1)).capture(
                any(Slip.class), eq(SlipRevisionType.EDIT), eq(null), eq(actorId), eq("테스터"), eq(null));
        ArgumentCaptor<List<SlipAuditLogService.ChangeEntry>> changes = ArgumentCaptor.forClass(List.class);
        verify(auditLogService).recordBatch(eq(slipId), eq(actorId), eq("테스터"), eq(null), changes.capture());
        assertThat(changes.getValue().get(0).oldValue()).contains("1000");
        assertThat(changes.getValue().get(0).newValue()).contains("1200");

        // 같은 금액으로 다시 저장하면 버전 이력은 누적하지 않는다.
        service.update(slipId, new SlipUpdateRequest(
                updatedAt, partnerId, "테스트 거래처", null, null, null, null, null,
                null, null, null, List.of(line), true), actorId, "테스터");
        verify(revisionService, times(1)).capture(
                any(Slip.class), eq(SlipRevisionType.EDIT), eq(null), eq(actorId), eq("테스터"), eq(null));
        verify(auditLogService, times(1)).recordBatch(
                eq(slipId), eq(actorId), eq("테스터"), eq(null), any());
    }
}
