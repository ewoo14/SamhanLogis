package com.samhanair.logis.slip.estimate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.repository.EstimateLineRepository;
import com.samhanair.logis.slip.estimate.repository.EstimateRepository;
import com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
import com.samhanair.logis.slip.estimate.web.dto.CreateEstimateRequest;
import com.samhanair.logis.slip.estimate.web.dto.EstimateLineResponse;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
@DisplayName("견적 BUNDLE 인스턴스 키")
class EstimateBundleInstanceKeyTest {

    private static final String PARENT_MODEL = "AC060CS6PBH1SY";

    @Mock private EstimateRepository estimateRepository;
    @Mock private EstimateLineRepository estimateLineRepository;
    @Mock private EstimateNumberService estimateNumberService;
    @Mock private ProductClient productClient;
    @Mock private EstimateToSlipConverter slipConverter;
    @Mock private EstimateRevisionService estimateRevisionService;
    @Mock private CollectionRealtimePublisher collectionRealtimePublisher;
    @Mock private PartnerProductPriceMemoryService priceMemoryService;

    @InjectMocks private EstimateService service;

    private UUID parentId;

    @BeforeEach
    void setUp() {
        parentId = UUID.randomUUID();
        when(estimateNumberService.next(any(LocalDate.class))).thenReturn("2026/08/11-1");
        when(estimateNumberService.extractSeqNo("2026/08/11-1")).thenReturn(1);
        when(estimateRepository.save(any(Estimate.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productClient.lookup(List.of(parentId))).thenReturn(List.of(bundleSummary()));
        when(productClient.expand(eq(PARENT_MODEL), any(BigDecimal.class), any(), any(BigDecimal.class)))
                .thenReturn(expandedComponents());
    }

    @Test
    @DisplayName("동일한 keyless BUNDLE 부모 두 행은 8개 구성품을 서로 다른 두 instanceKey로 저장한다")
    void assignsDistinctInstanceKeysToTwoIdenticalKeylessBundles() {
        BundleSetOptions desktopOptions = new BundleSetOptions(null, false, null, null, false);

        var response = service.create(request(List.of(
                bundleLine(desktopOptions),
                bundleLine(desktopOptions))), "actor", "사용자");

        assertThat(response.lines()).hasSize(8);
        assertThat(response.lines()).filteredOn(EstimateLineResponse::setHead).hasSize(2);
        assertThat(response.lines()).allSatisfy(line -> assertThat(line.quantity()).isEqualTo(1));
        assertThat(response.lines().stream().map(EstimateLineResponse::productId).distinct()).hasSize(4);
        assertThat(response.totalSupply()).isEqualByComparingTo("2000");

        Map<String, List<EstimateLineResponse>> byInstanceKey = response.lines().stream()
                .collect(Collectors.groupingBy(line -> line.setOptions() == null
                        ? "" : String.valueOf(line.setOptions().instanceKey())));
        assertThat(byInstanceKey).hasSize(2);
        assertThat(byInstanceKey.keySet()).allMatch(key -> !key.isBlank() && !"null".equals(key));
        assertThat(byInstanceKey.values()).allSatisfy(lines -> {
            assertThat(lines).hasSize(4);
            assertThat(lines).filteredOn(EstimateLineResponse::setHead).hasSize(1);
        });
    }

    @Test
    @DisplayName("명시 instanceKey와 기존 5개 옵션은 BUNDLE 전개와 저장에서 그대로 보존한다")
    void preservesExplicitInstanceKeyAndExpansionOptions() {
        BundleSetOptions options = new BundleSetOptions(
                "REMOTE-X", true, "PANEL-Y", "원형", true, "client-key-1");

        var response = service.create(request(List.of(bundleLine(options))), "actor", "사용자");

        assertThat(response.lines()).hasSize(4).allSatisfy(line -> assertThat(line.setOptions()).isEqualTo(options));
        verify(productClient).expand(PARENT_MODEL, BigDecimal.ONE,
                new ExpandedLineDto.Options("REMOTE-X", true, "PANEL-Y", "원형", true),
                new BigDecimal("1000"));
    }

    @Test
    @DisplayName("공백 instanceKey만 새 키로 바꾸고 기존 5개 옵션은 보존한다")
    void replacesBlankInstanceKeyWithoutChangingOptions() {
        BundleSetOptions options = new BundleSetOptions(
                "REMOTE-X", true, "PANEL-Y", "원형", true, "   ");

        var response = service.create(request(List.of(bundleLine(options))), "actor", "사용자");

        assertThat(response.lines()).hasSize(4).allSatisfy(line -> {
            assertThat(line.setOptions()).isNotNull();
            assertThat(line.setOptions().instanceKey()).isNotBlank().isNotEqualTo("   ");
            assertThat(line.setOptions().remoteOption()).isEqualTo("REMOTE-X");
            assertThat(line.setOptions().remoteExcluded()).isTrue();
            assertThat(line.setOptions().panelOption()).isEqualTo("PANEL-Y");
            assertThat(line.setOptions().panelShape360()).isEqualTo("원형");
            assertThat(line.setOptions().materialIncluded()).isTrue();
        });
        assertThat(response.lines().stream().map(line -> line.setOptions().instanceKey()).distinct()).hasSize(1);
        verify(productClient).expand(PARENT_MODEL, BigDecimal.ONE,
                new ExpandedLineDto.Options("REMOTE-X", true, "PANEL-Y", "원형", true),
                new BigDecimal("1000"));
    }

    private CreateEstimateRequest request(List<CreateEstimateRequest.EstimateLineRequest> lines) {
        return new CreateEstimateRequest(LocalDate.of(2026, 8, 11), UUID.randomUUID(), "거래처",
                null, null, null, null, lines);
    }

    private CreateEstimateRequest.EstimateLineRequest bundleLine(BundleSetOptions options) {
        return new CreateEstimateRequest.EstimateLineRequest(
                parentId, "세트", PARENT_MODEL, null, 1, new BigDecimal("1000"), null, options);
    }

    private ProductSummary bundleSummary() {
        return new ProductSummary(parentId, "세트", PARENT_MODEL, PARENT_MODEL, null,
                new BigDecimal("1000"), "ACTIVE", false, PARENT_MODEL, "BUNDLE");
    }

    private List<ExpandedLineDto> expandedComponents() {
        return List.of(
                component("AC060CN6PBH1", true, "600"),
                component("AC060CXAPBH1", false, "300"),
                component("PC6NUNK1NW", false, "50"),
                component("AR-EH05", false, "50"));
    }

    private ExpandedLineDto component(String modelCode, boolean setHead, String unitPrice) {
        return new ExpandedLineDto(UUID.randomUUID(), modelCode, modelCode, modelCode,
                BigDecimal.ONE, new BigDecimal(unitPrice), "COMPONENT", setHead);
    }
}
