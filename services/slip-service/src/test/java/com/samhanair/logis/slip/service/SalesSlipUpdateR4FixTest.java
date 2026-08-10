package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
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
import com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.revision.service.SlipRevisionService;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import com.samhanair.logis.slip.web.dto.SlipUpdateRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** PR #1131 R4 RED-A-2 — 기존 BUNDLE canonical head 삭제는 저장되면 안 된다. */
class SalesSlipUpdateR4FixTest {

    private static final LocalDateTime UPDATED_AT = LocalDateTime.of(2026, 8, 11, 10, 0);
    private static final String PARENT_MODEL = "R4-BUNDLE";

    @Test
    @DisplayName("RED-A-2: 기존 BUNDLE head만 생략하면 0-head 계보 저장을 거부한다")
    void existingBundleHeadDeletionIsRejectedBeforePersistence() {
        Fixture fixture = fixture();
        BusinessException rejection = null;

        try {
            fixture.service().update(fixture.slipId(), request(fixture), UUID.randomUUID(), "R4 사용자");
        } catch (BusinessException ex) {
            rejection = ex;
        }

        if (rejection == null) {
            long heads = fixture.slip().getLines().stream().filter(SlipLine::isSetHead).count();
            String parent = fixture.slip().getLines().isEmpty()
                    ? ""
                    : fixture.slip().getLines().get(0).getParentSetModel();
            System.out.println("R4-EXISTING-HEAD-DELETE|HTTP-EQUIVALENT=SUCCESS|saved="
                    + fixture.slip().getLines().size() + "|parent=" + parent
                    + "|heads=" + heads + "|expand=0");
        }

        assertThat(rejection)
                .as("세트 head 구성품을 남은 비-head만으로 저장하면 안 된다")
                .isNotNull()
                .extracting(BusinessException::getErrorCode)
                .isEqualTo(ErrorCode.INVALID_INPUT);
        verify(fixture.repository(), never()).saveAndFlush(any(Slip.class));
        verify(fixture.productClient(), never()).expand(
                anyString(), any(BigDecimal.class), any(), any(BigDecimal.class));
    }

    @Test
    @DisplayName("RED-B-1/B-5: 기존 BUNDLE 비-head 명시 삭제는 head를 보존하고 저장한다")
    void nonHeadDeletionKeepsCanonicalHead() {
        Fixture fixture = fixture();

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), requestForLines(fixture, List.of(
                        line(fixture.headProductId(), fixture.headId(), 1, "1000"))),
                UUID.randomUUID(), "R4 사용자")).doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).singleElement().satisfies(line -> {
            assertThat(line.getProductId()).isEqualTo(fixture.headProductId());
            assertThat(line.getParentSetModel()).isEqualTo(PARENT_MODEL);
            assertThat(line.isSetHead()).isTrue();
        });
    }

    @Test
    @DisplayName("RED-B-5: BUNDLE 전체 명시 삭제는 남은 SINGLE과 함께 저장한다")
    void entireBundleDeletionWithRemainingSingleIsAccepted() {
        Fixture fixture = fixture();
        UUID singleProductId = UUID.randomUUID();
        UUID singleLineId = UUID.randomUUID();
        SlipLine single = SlipLine.create(fixture.slip(), singleProductId, "단품", "R4-S", null,
                1, new BigDecimal("700"), null);
        ReflectionTestUtils.setField(single, "id", singleLineId);
        fixture.slip().addLine(single);

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), requestForLines(fixture, List.of(
                        line(singleProductId, singleLineId, 1, "700"))),
                UUID.randomUUID(), "R4 사용자")).doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).singleElement().satisfies(line -> {
            assertThat(line.getProductId()).isEqualTo(singleProductId);
            assertThat(line.getParentSetModel()).isNullOrEmpty();
        });
    }

    @Test
    @DisplayName("RED-B-1: 기존 BUNDLE 양수 수량·단가 편집은 계보와 사용자값을 보존한다")
    void existingBundleValuesRemainEditableWithoutExpansion() {
        Fixture fixture = fixture();

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), requestForLines(fixture, List.of(
                        line(fixture.headProductId(), fixture.headId(), 3, "333"),
                        line(fixture.childProductId(), fixture.childId(), 4, "444"))),
                UUID.randomUUID(), "R4 사용자")).doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).extracting(SlipLine::getQuantity)
                .containsExactly(3, 4);
        assertThat(fixture.slip().getLines()).extracting(SlipLine::getUnitPrice)
                .containsExactly(new BigDecimal("333"), new BigDecimal("444"));
        assertThat(fixture.slip().getLines()).filteredOn(SlipLine::isSetHead).hasSize(1);
        verify(fixture.productClient(), never()).expand(
                anyString(), any(BigDecimal.class), any(), any(BigDecimal.class));
    }

    private Fixture fixture() {
        UUID slipId = UUID.randomUUID();
        UUID headId = UUID.randomUUID();
        UUID childId = UUID.randomUUID();
        UUID headProductId = UUID.randomUUID();
        UUID childProductId = UUID.randomUUID();
        UUID partnerId = UUID.randomUUID();
        Slip slip = Slip.createOutbound("2026/08/11-R4", LocalDate.of(2026, 8, 11), 1,
                UUID.randomUUID(), UUID.randomUUID(), partnerId, "R4 거래처", null, null, "r4-fix");
        ReflectionTestUtils.setField(slip, "id", slipId);
        ReflectionTestUtils.setField(slip, "createdAt", UPDATED_AT);

        SlipLine head = SlipLine.create(slip, headProductId, "세트 head", "R4-H", null,
                1, new BigDecimal("1000"), null);
        SlipLine child = SlipLine.create(slip, childProductId, "세트 child", "R4-C", null,
                1, new BigDecimal("500"), null);
        ReflectionTestUtils.setField(head, "id", headId);
        ReflectionTestUtils.setField(child, "id", childId);
        head.assignBundleComponent(PARENT_MODEL, true);
        child.assignBundleComponent(PARENT_MODEL, false);
        slip.addLine(head);
        slip.addLine(child);

        SlipRepository repository = mock(SlipRepository.class);
        ProductClient productClient = mock(ProductClient.class);
        SalesSlipUpdateService service = new SalesSlipUpdateService(
                repository, mock(SlipAuditLogService.class), mock(SlipRevisionService.class),
                mock(PartnerProductPriceMemoryService.class), productClient,
                mock(SlipClosedDateGuard.class));
        when(repository.findById(slipId)).thenReturn(Optional.of(slip));
        when(repository.saveAndFlush(any(Slip.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productClient.lookup(anyList())).thenAnswer(invocation -> {
            List<UUID> productIds = invocation.getArgument(0);
            return productIds.stream()
                    .map(productId -> new ProductSummary(productId, "R4 품목", "R4-MODEL", null,
                            UUID.randomUUID(), new BigDecimal("500"), "ACTIVE", false))
                    .toList();
        });
        return new Fixture(service, repository, productClient, slip, slipId,
                headProductId, headId, childProductId, childId);
    }

    private SlipUpdateRequest request(Fixture fixture) {
        return requestForLines(fixture, List.of(
                line(fixture.childProductId(), fixture.childId(), 1, "500")));
    }

    private SlipUpdateRequest requestForLines(Fixture fixture,
                                               List<SlipUpdateRequest.LineRequest> lines) {
        return new SlipUpdateRequest(UPDATED_AT, UUID.randomUUID(), "R4 거래처", null,
                null, null, null, null, null, null, null, lines, true);
    }

    private SlipUpdateRequest.LineRequest line(UUID productId, UUID lineId, int quantity,
                                                String unitPrice) {
        return new SlipUpdateRequest.LineRequest(productId, "R4 품목", "R4-MODEL", null,
                quantity, new BigDecimal(unitPrice), null, lineId);
    }

    private record Fixture(SalesSlipUpdateService service, SlipRepository repository,
                           ProductClient productClient, Slip slip, UUID slipId,
                           UUID headProductId, UUID headId, UUID childProductId, UUID childId) {
    }
}
