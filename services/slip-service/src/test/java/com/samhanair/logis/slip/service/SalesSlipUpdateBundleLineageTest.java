package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** PR #1131 R2 RED-A — 수정 화면 신규 BUNDLE 계보의 wire-to-persistence 회귀. */
class SalesSlipUpdateBundleLineageTest {

    private static final LocalDateTime UPDATED_AT = LocalDateTime.of(2026, 8, 10, 10, 0);
    private static final String PARENT_MODEL = "AC023CS1DBC1SY";

    @Test
    @DisplayName("RED-A: 신규 BUNDLE 구성품 7행은 PUT 후 재조회해도 parent_set_model/set_head를 보존한다")
    void redA_newBundleComponents_roundTripPreservesLineage() throws Exception {
        Fixture fixture = fixture();
        SlipUpdateRequest request = request(fixture, false);

        fixture.service().update(fixture.slipId(), request, UUID.randomUUID(), "테스터");

        // RED-A 원문 핵심: 저장 후 GET/DB 왕복에서 7행 모두 계보, 정확히 1행 head.
        assertThat(fixture.slip().getLines()).hasSize(7);
        assertThat(fixture.slip().getLines()).allSatisfy(line ->
                assertThat(line.getParentSetModel()).isEqualTo(PARENT_MODEL));
        assertThat(fixture.slip().getLines()).filteredOn(SlipLine::isSetHead).hasSize(1);
    }

    @Test
    @DisplayName("RED-A-2 mutation: 검증할 수 없는 setHead 계보는 조용히 저장하지 않는다")
    void redA2_mutatedBundleLineage_isRejected() throws Exception {
        Fixture fixture = fixture();

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> fixture.service().update(
                        fixture.slipId(), request(fixture, true), UUID.randomUUID(), "변조자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));

        org.mockito.Mockito.verify(fixture.repository(), never()).saveAndFlush(any(Slip.class));
    }

    private Fixture fixture() {
        UUID slipId = UUID.randomUUID();
        UUID existingLineId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        UUID bundleParentProductId = UUID.randomUUID();
        List<UUID> componentIds = List.of(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        Slip slip = Slip.createOutbound("2026/08/10-1131", LocalDate.of(2026, 8, 10), 1,
                UUID.randomUUID(), UUID.randomUUID(), partnerId, "테스트 거래처", null, null, "tester");
        ReflectionTestUtils.setField(slip, "id", slipId);
        ReflectionTestUtils.setField(slip, "createdAt", UPDATED_AT);
        SlipLine original = SlipLine.create(slip, UUID.randomUUID(), "기존 단품", "SINGLE-OLD",
                null, 1, new BigDecimal("10000"), null);
        ReflectionTestUtils.setField(original, "id", existingLineId);
        slip.addLine(original);

        SlipRepository repository = mock(SlipRepository.class);
        ProductClient productClient = mock(ProductClient.class);
        SalesSlipUpdateService service = new SalesSlipUpdateService(
                repository, mock(SlipAuditLogService.class), mock(SlipRevisionService.class),
                mock(PartnerProductPriceMemoryService.class), productClient,
                mock(SlipClosedDateGuard.class));
        when(repository.findById(slipId)).thenReturn(Optional.of(slip));
        when(repository.saveAndFlush(any(Slip.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productClient.lookup(any())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            return ids.stream()
                    .map(id -> id.equals(bundleParentProductId)
                            ? new ProductSummary(id, "BUNDLE", PARENT_MODEL, null,
                            UUID.randomUUID(), new BigDecimal("7000"), "ACTIVE", false,
                            PARENT_MODEL, "BUNDLE")
                            : new ProductSummary(id, "구성품", "COMPONENT", null,
                            UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE"))
                    .toList();
        });
        when(productClient.expand(any(), any(), any(), any())).thenReturn(
                componentIds.stream()
                        .map(id -> new ExpandedLineDto(id, "COMPONENT", "COMPONENT", "구성품",
                                BigDecimal.ONE, new BigDecimal("1000"), "COMPONENT",
                                id.equals(componentIds.get(0))))
                        .toList());
        return new Fixture(service, repository, slip, slipId, existingLineId, componentIds,
                bundleParentProductId);
    }

    private SlipUpdateRequest request(Fixture fixture, boolean duplicateHead) throws Exception {
        ObjectMapper objectMapper = new ObjectMapper()
                .findAndRegisterModules()
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        return objectMapper.readValue(
                objectMapper.writeValueAsString(bundleUpdatePayload(
                        fixture.existingLineId(), fixture.componentIds(), fixture.bundleParentProductId(),
                        duplicateHead)),
                SlipUpdateRequest.class);
    }

    private Map<String, Object> bundleUpdatePayload(UUID existingLineId, List<UUID> componentIds,
                                                    UUID bundleParentProductId, boolean duplicateHead) {
        List<Map<String, Object>> lines = new ArrayList<>();
        for (int i = 0; i < componentIds.size(); i++) {
            Map<String, Object> line = new LinkedHashMap<>();
            line.put("productId", componentIds.get(i));
            line.put("productName", "구성품 " + (i + 1));
            line.put("modelName", "COMPONENT-" + (i + 1));
            line.put("quantity", 1);
            line.put("unitPrice", "1000");
            line.put("lineId", i == 0 ? existingLineId : null);
            line.put("parentSetModel", PARENT_MODEL);
            line.put("setHead", i == 0 || (duplicateHead && i == 1));
            line.put("bundleParentProductId", bundleParentProductId);
            line.put("bundleParentUnitPrice", "7000");
            line.put("setOptions", Map.of(
                    "remoteOption", "기본",
                    "remoteExcluded", false,
                    "panelOption", "기본",
                    "panelShape360", "기본",
                    "materialIncluded", false));
            lines.add(line);
        }
        return Map.of(
                "updatedAt", UPDATED_AT.toString(),
                "partnerId", UUID.randomUUID(),
                "partnerName", "테스트 거래처",
                "lines", lines,
                "lineIdContract", true);
    }

    private record Fixture(SalesSlipUpdateService service, SlipRepository repository, Slip slip,
                           UUID slipId, UUID existingLineId, List<UUID> componentIds,
                           UUID bundleParentProductId) {
    }
}
