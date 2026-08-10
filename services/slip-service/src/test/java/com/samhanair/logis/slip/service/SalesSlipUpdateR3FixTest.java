package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import com.samhanair.logis.slip.client.ExpandedLineDto;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.estimate.web.dto.BundleSetOptions;
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

/** PR #1131 R3 RED-A — 화면이 허용한 BUNDLE 편집을 저장 경계가 막지 않는지 고정한다. */
class SalesSlipUpdateR3FixTest {

    private static final LocalDateTime UPDATED_AT = LocalDateTime.of(2026, 8, 11, 1, 0);
    private static final String PARENT_MODEL = "AC023CS1DBC1SY";

    @Test
    @DisplayName("RED-A-1: product-service 1행 BUNDLE 전개도 PUT 후 계보와 head를 저장한다")
    void oneRowBundleIsAcceptedAndHeadIsNormalized() {
        Fixture fixture = fixture(1);

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, List.of(line(fixture, fixture.firstId(), 1,
                        "5808000", false))), UUID.randomUUID(), "테스터"))
                .doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).singleElement().satisfies(line -> {
            assertThat(line.getParentSetModel()).isEqualTo(PARENT_MODEL);
            assertThat(line.isSetHead()).isTrue();
        });
    }

    @Test
    @DisplayName("RED-A-2: 전개된 구성품 수량을 바꿔도 PUT 후 사용자 수량과 계보를 저장한다")
    void editedComponentQuantityIsAccepted() {
        Fixture fixture = fixture(2);
        List<SlipUpdateRequest.LineRequest> lines = List.of(
                line(fixture, fixture.firstId(), 3, "600", true),
                line(fixture, fixture.secondId(), 1, "400", false));

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, lines), UUID.randomUUID(), "수량 수정자"))
                .doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).extracting(SlipLine::getQuantity)
                .containsExactly(3, 1);
        assertLineage(fixture.slip().getLines(), 2);
    }

    @Test
    @DisplayName("RED-A-3: 전개된 구성품 단가를 바꿔도 PUT 후 사용자 단가와 계보를 저장한다")
    void editedComponentUnitPriceIsAccepted() {
        Fixture fixture = fixture(2);
        List<SlipUpdateRequest.LineRequest> lines = List.of(
                line(fixture, fixture.firstId(), 2, "601", true),
                line(fixture, fixture.secondId(), 1, "400", false));

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, lines), UUID.randomUUID(), "단가 수정자"))
                .doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).extracting(SlipLine::getUnitPrice)
                .containsExactly(new BigDecimal("601"), new BigDecimal("400"));
        assertLineage(fixture.slip().getLines(), 2);
    }

    @Test
    @DisplayName("RED-A-4: 비-head 구성품을 명시 삭제해도 남은 계보를 저장한다")
    void nonHeadComponentCanBeDeleted() {
        Fixture fixture = fixture(2);
        List<SlipUpdateRequest.LineRequest> lines = List.of(
                line(fixture, fixture.firstId(), 2, "600", true));

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, lines), UUID.randomUUID(), "구성품 삭제자"))
                .doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).singleElement().satisfies(line -> {
            assertThat(line.getProductId()).isEqualTo(fixture.firstId());
            assertThat(line.getParentSetModel()).isEqualTo(PARENT_MODEL);
            assertThat(line.isSetHead()).isTrue();
        });
    }

    @Test
    @DisplayName("mutation RED: 요청이 두 구성품을 head로 위조하면 저장하지 않는다")
    void duplicateHeadMutationIsRejected() {
        Fixture fixture = fixture(2);
        List<SlipUpdateRequest.LineRequest> lines = List.of(
                line(fixture, fixture.firstId(), 2, "600", true),
                line(fixture, fixture.secondId(), 1, "400", true));

        assertRejected(fixture, lines);
    }

    @Test
    @DisplayName("mutation RED: 부모 전개 membership 밖의 SINGLE을 세트 구성품으로 위조하면 저장하지 않는다")
    void outsideMembershipMutationIsRejected() {
        Fixture fixture = fixture(2);
        UUID forgedId = UUID.randomUUID();
        List<SlipUpdateRequest.LineRequest> lines = List.of(
                line(fixture, forgedId, 1, "600", true),
                line(fixture, fixture.secondId(), 1, "400", false));

        assertRejected(fixture, lines);
    }

    private Fixture fixture(int componentCount) {
        UUID slipId = UUID.randomUUID();
        UUID parentId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        Slip slip = Slip.createOutbound("2026/08/11-R3-FIX", LocalDate.of(2026, 8, 11), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "R3 거래처",
                null, null, "r3-fix");
        ReflectionTestUtils.setField(slip, "id", slipId);
        ReflectionTestUtils.setField(slip, "createdAt", UPDATED_AT);

        SlipRepository repository = mock(SlipRepository.class);
        ProductClient productClient = mock(ProductClient.class);
        SalesSlipUpdateService service = new SalesSlipUpdateService(
                repository, mock(SlipAuditLogService.class), mock(SlipRevisionService.class),
                mock(PartnerProductPriceMemoryService.class), productClient,
                mock(SlipClosedDateGuard.class));
        when(repository.findById(slipId)).thenReturn(Optional.of(slip));
        when(repository.saveAndFlush(any(Slip.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(productClient.lookup(anyList())).thenAnswer(invocation -> {
            List<UUID> ids = invocation.getArgument(0);
            if (ids.contains(parentId)) {
                return List.of(new ProductSummary(parentId, "부모 BUNDLE", PARENT_MODEL, null,
                        UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE", false,
                        PARENT_MODEL, "BUNDLE"));
            }
            return ids.stream().map(id -> new ProductSummary(id, "구성품", "COMPONENT", null,
                    UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE")).toList();
        });
        when(productClient.expand(anyString(), any(BigDecimal.class), any(), any(BigDecimal.class)))
                .thenReturn(componentCount == 1
                        ? List.of(new ExpandedLineDto(firstId, "COMP-1", "구성품 1", "구성품 1",
                                BigDecimal.ONE, new BigDecimal("5808000"), "INDOOR", false))
                        : List.of(
                                new ExpandedLineDto(firstId, "COMP-1", "구성품 1", "구성품 1",
                                        new BigDecimal("2"), new BigDecimal("600"), "INDOOR", true),
                                new ExpandedLineDto(secondId, "COMP-2", "구성품 2", "구성품 2",
                                        BigDecimal.ONE, new BigDecimal("400"), "OUTDOOR", false)));
        return new Fixture(service, repository, productClient, slip, slipId, parentId, firstId, secondId);
    }

    private SlipUpdateRequest.LineRequest line(Fixture fixture, UUID productId, int quantity,
                                               String unitPrice, boolean setHead) {
        return new SlipUpdateRequest.LineRequest(
                productId, "구성품", "COMPONENT", null, quantity, new BigDecimal(unitPrice),
                null, null, null, null, null,
                new BundleSetOptions("", false, "", "", false), PARENT_MODEL, setHead,
                fixture.parentId(), new BigDecimal("1000000"));
    }

    private SlipUpdateRequest request(Fixture fixture, List<SlipUpdateRequest.LineRequest> lines) {
        return new SlipUpdateRequest(UPDATED_AT, UUID.randomUUID(), "R3 거래처", null,
                null, null, null, null, null, null, null, lines, true);
    }

    private void assertRejected(Fixture fixture, List<SlipUpdateRequest.LineRequest> lines) {
        assertThatThrownBy(() -> fixture.service().update(
                fixture.slipId(), request(fixture, lines), UUID.randomUUID(), "변조자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
        verify(fixture.repository(), never()).saveAndFlush(any(Slip.class));
    }

    private void assertLineage(List<SlipLine> lines, int expectedSize) {
        assertThat(lines).hasSize(expectedSize);
        assertThat(lines).allSatisfy(line ->
                assertThat(line.getParentSetModel()).isEqualTo(PARENT_MODEL));
        assertThat(lines).filteredOn(SlipLine::isSetHead).hasSize(1);
    }

    private record Fixture(SalesSlipUpdateService service, SlipRepository repository,
                           ProductClient productClient, Slip slip, UUID slipId, UUID parentId,
                           UUID firstId, UUID secondId) {
    }
}
