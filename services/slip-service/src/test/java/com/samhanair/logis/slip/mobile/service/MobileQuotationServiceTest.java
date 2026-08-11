package com.samhanair.logis.slip.mobile.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.service.EstimateNumberService;
import com.samhanair.logis.slip.mobile.dto.MobileQuotationRequest;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("모바일 견적 BUNDLE 전개")
class MobileQuotationServiceTest {

    private final EstimateRepository estimateRepository = mock(EstimateRepository.class);
    private final EstimateNumberService estimateNumberService = mock(EstimateNumberService.class);
    private final ProductClient productClient = mock(ProductClient.class);
    private final PartnerInternalClient partnerInternalClient = mock(PartnerInternalClient.class);
    private final PartnerProductPriceMemoryService priceMemoryService =
            mock(PartnerProductPriceMemoryService.class);
    private final MobileQuotationService service = new MobileQuotationService(
            estimateRepository, estimateNumberService, productClient,
            partnerInternalClient, priceMemoryService);

    @Test
    @DisplayName("모바일 BUNDLE 견적은 부모가 아닌 구성품 라인으로 저장한다")
    void expandsBundleBeforePersistingEstimateLines() {
        UUID parentId = UUID.randomUUID();
        UUID headId = UUID.randomUUID();
        UUID childId = UUID.randomUUID();
        ProductSummary bundle = product(parentId, "BUNDLE", "SET-MOBILE");
        when(partnerInternalClient.verifyPartnerCode("P-1"))
                .thenReturn(PartnerInternalClient.PartnerVerifyResult.found(Optional.of(UUID.randomUUID())));
        when(productClient.lookup(List.of(parentId))).thenReturn(List.of(bundle));
        when(productClient.expand("SET-MOBILE", BigDecimal.valueOf(2), null, new BigDecimal("1000")))
                .thenReturn(List.of(
                        new ExpandedLineDto(headId, "C-1", "구성품 1", "구성품 1",
                                BigDecimal.valueOf(2), new BigDecimal("600"), "COMPONENT", true),
                        new ExpandedLineDto(childId, "C-2", "구성품 2", "구성품 2",
                                BigDecimal.valueOf(2), new BigDecimal("400"), "COMPONENT", false)));
        when(estimateNumberService.next(any(LocalDate.class))).thenReturn("2026/08/06-1");
        when(estimateNumberService.extractSeqNo("2026/08/06-1")).thenReturn(1);
        when(estimateRepository.save(any(Estimate.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.createQuotation(request(parentId, 2, new BigDecimal("1000")), "actor");

        assertThat(response.lines()).hasSize(2).allSatisfy(line -> {
            assertThat(line.productId()).isNotEqualTo(parentId);
            assertThat(line.setOptions()).isNotNull();
            assertThat(line.setOptions().instanceKey()).isNotBlank();
        });
        assertThat(response.lines().stream().map(line -> line.setOptions().instanceKey()).distinct()).hasSize(1);
        verify(productClient).expand("SET-MOBILE", BigDecimal.valueOf(2), null, new BigDecimal("1000"));
    }

    @Test
    @DisplayName("모바일 SINGLE 견적은 기존처럼 한 라인으로 저장한다")
    void keepsSingleQuotationPath() {
        UUID productId = UUID.randomUUID();
        when(partnerInternalClient.verifyPartnerCode("P-1"))
                .thenReturn(PartnerInternalClient.PartnerVerifyResult.found(Optional.of(UUID.randomUUID())));
        when(productClient.lookup(List.of(productId))).thenReturn(List.of(product(productId, "SINGLE", "M-1")));
        when(estimateNumberService.next(any(LocalDate.class))).thenReturn("2026/08/06-2");
        when(estimateNumberService.extractSeqNo("2026/08/06-2")).thenReturn(2);
        when(estimateRepository.save(any(Estimate.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.createQuotation(request(productId, 1, new BigDecimal("1000")), "actor");

        assertThat(response.lines()).singleElement().satisfies(line -> {
            assertThat(line.productId()).isEqualTo(productId);
            assertThat(line.parentSetModel()).isNull();
            assertThat(line.setOptions()).isNull();
        });
    }

    @Test
    @DisplayName("전개 결과에 미등록 구성품이 있으면 사용자 안내와 함께 원자 거부한다")
    void rejectsIncompleteBundleExpansion() {
        UUID parentId = UUID.randomUUID();
        when(partnerInternalClient.verifyPartnerCode("P-1"))
                .thenReturn(PartnerInternalClient.PartnerVerifyResult.found(Optional.of(UUID.randomUUID())));
        when(productClient.lookup(List.of(parentId))).thenReturn(List.of(product(parentId, "BUNDLE", "SET-MOBILE")));
        when(productClient.expand(any(), any(), any(), any()))
                .thenReturn(List.of(new ExpandedLineDto(null, "C-1", "구성품", "구성품",
                        BigDecimal.ONE, BigDecimal.ONE, "COMPONENT", true)));

        assertThatThrownBy(() -> service.createQuotation(request(parentId, 1, BigDecimal.ONE), "actor"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("세트 구성품 일부를 찾을 수 없습니다");
        verifyNoInteractions(estimateRepository);
    }

    private MobileQuotationRequest request(UUID productId, int quantity, BigDecimal unitPrice) {
        return new MobileQuotationRequest("P-1", LocalDate.of(2026, 8, 6), null, null,
                List.of(new MobileQuotationRequest.MobileQuotationLineRequest(
                        productId, null, null, null, quantity, unitPrice, null)));
    }

    private ProductSummary product(UUID id, String type, String modelCode) {
        return new ProductSummary(id, "품목", "모델", "CODE", null,
                BigDecimal.TEN, "ACTIVE", false, modelCode, type);
    }
}
