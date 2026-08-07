package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** 매입 수정 경로의 VAT 포함 가격기억 소비 계약을 검증한다. */
class SlipUpdateServiceTest {

    private final UUID partnerId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final SlipUpdateService service = new SlipUpdateService(
            mock(SlipRepository.class),
            mock(SlipAuditLogService.class),
            mock(SlipRevisionService.class),
            mock(PartnerProductPriceMemoryService.class),
            mock(ProductClient.class));

    @Test
    @DisplayName("매입 전체수정은 BUNDLE 부모를 저장하지 않고 사용자 안내 오류로 거부한다")
    void purchaseUpdate_rejectsBundleParentBeforePersistence() {
        UUID slipId = UUID.randomUUID();
        UUID bundleId = UUID.randomUUID();
        Slip slip = Slip.createInbound("2026/07/25-0", LocalDate.of(2026, 7, 25), 0,
                UUID.randomUUID(), partnerId, "테스트 거래처", null, null, "tester");
        ReflectionTestUtils.setField(slip, "id", slipId);
        java.time.LocalDateTime updatedAt = java.time.LocalDateTime.of(2026, 7, 25, 10, 0);
        ReflectionTestUtils.setField(slip, "createdAt", updatedAt);
        SlipRepository repository = (SlipRepository) ReflectionTestUtils.getField(service, "slipRepository");
        ProductClient productClient = (ProductClient) ReflectionTestUtils.getField(service, "productClient");
        when(repository.findById(slipId)).thenReturn(java.util.Optional.of(slip));
        when(productClient.lookup(List.of(bundleId))).thenReturn(List.of(
                new ProductSummary(bundleId, "세트", "SET", null, UUID.randomUUID(),
                        new BigDecimal("10000"), "ACTIVE", false, "SET-1", "BUNDLE", null)));
        SlipUpdateRequest.LineRequest line = new SlipUpdateRequest.LineRequest(
                bundleId, "세트", "SET", null, 1, new BigDecimal("10000"), null, null);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.update(slipId,
                new SlipUpdateRequest(updatedAt, partnerId, "테스트 거래처", null, null, null,
                        null, null, null, null, null, List.of(line), true), UUID.randomUUID(), "테스터"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT);
                    assertThat(ex.getMessage()).contains("세트 품목", "구성품");
                });
        verify(repository, never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("매입 전체수정은 정상 SINGLE 라인을 저장한다")
    void purchaseUpdate_acceptsSingleLine() {
        UUID slipId = UUID.randomUUID();
        Slip slip = Slip.createInbound("2026/07/25-1", LocalDate.of(2026, 7, 25), 1,
                UUID.randomUUID(), partnerId, "테스트 거래처", null, null, "tester");
        ReflectionTestUtils.setField(slip, "id", slipId);
        java.time.LocalDateTime updatedAt = java.time.LocalDateTime.of(2026, 7, 25, 10, 0);
        ReflectionTestUtils.setField(slip, "createdAt", updatedAt);
        SlipRepository repository = (SlipRepository) ReflectionTestUtils.getField(service, "slipRepository");
        ProductClient productClient = (ProductClient) ReflectionTestUtils.getField(service, "productClient");
        when(repository.findById(slipId)).thenReturn(java.util.Optional.of(slip));
        when(repository.saveAndFlush(any(Slip.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productClient.lookup(List.of(productId))).thenReturn(List.of(
                new ProductSummary(productId, "단품", "SINGLE", null, UUID.randomUUID(),
                        new BigDecimal("10000"), "ACTIVE", false, "SINGLE-1", "SINGLE", null)));

        SlipUpdateRequest.LineRequest line = new SlipUpdateRequest.LineRequest(
                productId, "단품", "SINGLE", null, 1, new BigDecimal("10000"), null, null);

        assertThat(service.update(slipId, new SlipUpdateRequest(updatedAt, partnerId,
                "테스트 거래처", null, null, null, null, null, null, null, null,
                List.of(line), true), UUID.randomUUID(), "테스터")).isNotNull();
        verify(repository).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("권위 금액 라인은 입력 단가를 VAT 포함 가격기억으로 그대로 저장한다")
    void authoritativeLine_keepsInputPriceForPriceMemory() {
        Slip slip = Slip.createInbound("2026/07/25-1", LocalDate.of(2026, 7, 25), 1,
                UUID.randomUUID(), partnerId, "테스트 거래처", null, null, "tester");
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
        Slip slip = Slip.createInbound("2026/07/25-2", LocalDate.of(2026, 7, 25), 2,
                UUID.randomUUID(), partnerId, "테스트 거래처", null, null, "tester");
        SlipLine line = SlipLine.create(slip, productId, "테스트 품목", "MODEL-1", null,
                2, new BigDecimal("10000"), null);
        ReflectionTestUtils.setField(line, "unitPriceWithVat", null);

        List<PartnerProductPriceMemoryCommand> commands = ReflectionTestUtils.invokeMethod(
                service, "collectPriceMemory", slip, List.of(line), "tester");

        assertThat(commands.get(0).unitPrice()).isEqualByComparingTo("11000");
    }
}
