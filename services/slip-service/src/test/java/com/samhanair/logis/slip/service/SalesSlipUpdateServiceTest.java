package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
}
