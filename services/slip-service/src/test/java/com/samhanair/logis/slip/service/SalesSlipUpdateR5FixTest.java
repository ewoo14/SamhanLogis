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
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** PR #1131 R5 RED-A — 기존 0-head와 동일 모델 다중 인스턴스의 정상 편집. */
class SalesSlipUpdateR5FixTest {

    private static final LocalDateTime UPDATED_AT = LocalDateTime.of(2026, 8, 11, 10, 0);
    private static final String PARENT_MODEL = "R5-SET";

    @Test
    @DisplayName("RED-B-1: 기존 0-head BUNDLE의 양수 수량·단가 편집은 저장된다")
    void existingZeroHeadBundleRemainsEditable() {
        Fixture fixture = fixture(List.of(
                persistedLine(false, false), persistedLine(false, false)));

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, 3, 333), UUID.randomUUID(), "R5 사용자"))
                .doesNotThrowAnyException();

        verify(fixture.repository()).saveAndFlush(any(Slip.class));
        assertThat(fixture.slip().getLines()).extracting(SlipLine::getQuantity)
                .containsExactly(3, 1);
        assertThat(fixture.slip().getLines()).extracting(SlipLine::getUnitPrice)
                .containsExactly(new BigDecimal("333"), new BigDecimal("200"));
        assertThat(fixture.slip().getLines()).noneMatch(SlipLine::isSetHead);
        assertThat(fixture.slip().getLines()).allMatch(line -> line.getBundleSetOptions() != null
                && line.getBundleSetOptions().instanceKey() != null
                && !line.getBundleSetOptions().instanceKey().isBlank());
    }

    @Test
    @DisplayName("RED-A-2: 동일 parentSetModel의 두 BUNDLE 인스턴스는 head 2개로 저장된다")
    void sameModelTwoBundleInstancesRemainEditable() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, true), persistedLine(false, true),
                persistedLine(true, true), persistedLine(false, true));
        Fixture fixture = fixture(persisted);

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, 2, 222), UUID.randomUUID(), "R5 사용자"))
                .doesNotThrowAnyException();

        verify(fixture.repository()).saveAndFlush(any(Slip.class));
        assertThat(fixture.slip().getLines()).hasSize(4);
        assertThat(fixture.slip().getLines()).filteredOn(SlipLine::isSetHead).hasSize(2);
        assertThat(fixture.slip().getLines()).first().satisfies(line -> {
            assertThat(line.getQuantity()).isEqualTo(2);
                assertThat(line.getUnitPrice()).isEqualByComparingTo("222");
        });
    }

    @Test
    @DisplayName("RED-A R9: keyless 동일 모델 두 인스턴스의 양수 편집은 저장된다")
    void keylessSameModelTwoBundleInstancesRemainEditable() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, false), persistedLine(false, false),
                persistedLine(false, false), persistedLine(false, false),
                persistedLine(true, false), persistedLine(false, false),
                persistedLine(false, false), persistedLine(false, false));
        Fixture fixture = fixture(persisted, true);
        materializeExplicitR9Mapping(fixture.slip());

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, 2, 222), UUID.randomUUID(), "R9 사용자"))
                .doesNotThrowAnyException();

        verify(fixture.repository()).saveAndFlush(any(Slip.class));
        assertThat(fixture.slip().getLines()).hasSize(8)
                .filteredOn(SlipLine::isSetHead).hasSize(2);
        assertThat(fixture.slip().getLines()).allMatch(line ->
                line.getBundleSetOptions() != null
                && line.getBundleSetOptions().instanceKey() != null);
    }

    @Test
    @DisplayName("R14: 미이관 keyless 다중 인스턴스의 정상 왕복 편집은 차단하지 않는다")
    void unmigratedKeylessMultiInstanceBoundaryRemainsKeylessButEditable() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, false), persistedLine(false, false),
                persistedLine(false, false), persistedLine(false, false),
                persistedLine(true, false), persistedLine(false, false),
                persistedLine(false, false), persistedLine(false, false));
        Fixture fixture = fixture(persisted, false, true);

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, 2, 222), UUID.randomUUID(), "R14 사용자"))
                .doesNotThrowAnyException();
        verify(fixture.repository()).saveAndFlush(any(Slip.class));
        assertThat(fixture.slip().getLines()).hasSize(8)
                .allMatch(line -> line.getBundleSetOptions() == null);
    }

    @Test
    @DisplayName("RED-A R16: keyless 다중 인스턴스에서 head 삭제 뒤 재편집은 평면 라인으로 저장된다")
    void keylessMultiInstanceHeadDeletionDropsAmbiguousLineageBeforeFollowUpEdit() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, false), persistedLine(false, false),
                persistedLine(true, false), persistedLine(false, false));
        Fixture fixture = fixture(persisted, false, true);
        List<PersistedLine> afterHeadDeletion = List.of(
                persisted.get(1), persisted.get(2), persisted.get(3));

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, afterHeadDeletion, 1, 200),
                UUID.randomUUID(), "R16 사용자"))
                .doesNotThrowAnyException();

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), requestForCurrentLines(fixture.slip().getLines(), 3, 333),
                UUID.randomUUID(), "R16 사용자"))
                .doesNotThrowAnyException();

        verify(fixture.repository(), org.mockito.Mockito.times(2)).saveAndFlush(any(Slip.class));
        ArgumentCaptor<List<com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand>>
                priceMemoryCaptor = ArgumentCaptor.forClass(List.class);
        verify(fixture.priceMemory(), org.mockito.Mockito.times(2))
                .rememberBatchAfterCommit(priceMemoryCaptor.capture(), anyString());
        assertThat(priceMemoryCaptor.getAllValues().get(0))
                .extracting(com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand::productId,
                        com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryCommand::unitPrice)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(persisted.get(1).productId(), new BigDecimal("220.00")),
                        org.assertj.core.groups.Tuple.tuple(persisted.get(2).productId(), new BigDecimal("110.00")),
                        org.assertj.core.groups.Tuple.tuple(persisted.get(3).productId(), new BigDecimal("220.00")));
        assertThat(fixture.slip().getLines()).hasSize(3)
                .allMatch(line -> line.getParentSetModel() == null
                        && !line.isSetHead()
                        && line.getBundleSetOptions() == null);
        assertThat(fixture.slip().getLines().get(0).getQuantity()).isEqualTo(3);
        assertThat(fixture.slip().getLines().get(0).getUnitPrice())
                .isEqualByComparingTo("333");
    }

    @Test
    @DisplayName("RED-B R16: keyless 세 인스턴스 중 한 head 삭제도 잔존 모호 계보를 평면화한다")
    void keylessThreeInstancesHeadDeletionDropsAllRemainingAmbiguousLineage() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, false), persistedLine(false, false),
                persistedLine(true, false), persistedLine(false, false),
                persistedLine(true, false), persistedLine(false, false));
        Fixture fixture = fixture(persisted, false, true);

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, persisted.subList(1, persisted.size()), 1, 200),
                UUID.randomUUID(), "R16 사용자"))
                .doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).hasSize(5)
                .allMatch(line -> line.getParentSetModel() == null
                        && !line.isSetHead()
                        && line.getBundleSetOptions() == null);
    }

    @Test
    @DisplayName("RED-A-1: head 품목 교체는 교체 행만 평면화하고 잔존 구성품 계보는 보존한다")
    void headProductSwapFlattensOnlyTheReplacedLine() {
        Fixture fixture = fixture(List.of(
                persistedLine(true, false), persistedLine(false, false), persistedLine(false, false)));
        UUID replacementProductId = UUID.randomUUID();
        List<SlipUpdateRequest.LineRequest> lines = List.of(
                new SlipUpdateRequest.LineRequest(replacementProductId, "R5 단품", "R5-SINGLE", null,
                        1, new BigDecimal("333"), null, fixture.persisted().get(0).lineId()),
                new SlipUpdateRequest.LineRequest(fixture.persisted().get(1).productId(), "R5 품목", "R5-MODEL", null,
                        1, new BigDecimal("200"), null, fixture.persisted().get(1).lineId()),
                new SlipUpdateRequest.LineRequest(fixture.persisted().get(2).productId(), "R5 품목", "R5-MODEL", null,
                        1, new BigDecimal("200"), null, fixture.persisted().get(2).lineId()));

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), requestForLines(lines), UUID.randomUUID(), "R7 사용자"))
                .doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).first().satisfies(line -> {
            assertThat(line.getParentSetModel()).isNull();
            assertThat(line.isSetHead()).isFalse();
        });
        assertThat(fixture.slip().getLines().subList(1, 3))
                .allMatch(line -> PARENT_MODEL.equals(line.getParentSetModel())
                        && !line.isSetHead());
    }

    @Test
    @DisplayName("RED-A-1: 명시적 instanceKey가 있는 동일 세트 3개 중 교체 행만 평면화한다")
    void headProductSwapFlattensOnlyTheReplacedLineInTargetInstance() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, true), persistedLine(false, true),
                persistedLine(true, true), persistedLine(false, true),
                persistedLine(true, true), persistedLine(false, true));
        Fixture fixture = fixture(persisted);
        UUID replacementProductId = UUID.randomUUID();
        List<SlipUpdateRequest.LineRequest> lines = new ArrayList<>();
        for (int i = 0; i < persisted.size(); i++) {
            PersistedLine line = persisted.get(i);
            lines.add(new SlipUpdateRequest.LineRequest(
                    i == 0 ? replacementProductId : line.productId(), "R5 품목", line.modelName(), null,
                    1, line.setHead() ? new BigDecimal("100") : new BigDecimal("200"),
                    null, line.lineId()));
        }

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), requestForLines(lines), UUID.randomUUID(), "R7 사용자"))
                .doesNotThrowAnyException();

        assertThat(fixture.slip().getLines()).hasSize(6);
        assertThat(fixture.slip().getLines()).first().satisfies(line -> {
            assertThat(line.getParentSetModel()).isNull();
            assertThat(line.isSetHead()).isFalse();
        });
        assertThat(fixture.slip().getLines().get(1))
                .satisfies(line -> {
                    assertThat(line.getParentSetModel()).isEqualTo(PARENT_MODEL);
                    assertThat(line.isSetHead()).isFalse();
                });
        assertThat(fixture.slip().getLines().subList(2, 6))
                .filteredOn(SlipLine::isSetHead).hasSize(2)
                .allMatch(line -> line.getBundleSetOptions() != null
                        && line.getBundleSetOptions().instanceKey() != null);
    }

    @Test
    @DisplayName("RED-B-1: 기존 head만 삭제하고 자식을 남기면 저장을 거부한다")
    void existingHeadDeletionIsStillRejected() {
        Fixture fixture = fixture(List.of(
                persistedLine(true, false), persistedLine(false, false)));

        assertThatThrownBy(() -> fixture.service().update(
                fixture.slipId(), request(fixture, List.of(fixture.persisted().get(1)), 1, 200),
                UUID.randomUUID(), "R5 공격자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
        verify(fixture.repository(), never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("RED-B-2: 수량 0은 명시적인 INVALID_LINE으로 거부한다")
    void zeroQuantityIsRejectedBeforeBundleGuard() {
        Fixture fixture = fixture(List.of(
                persistedLine(true, false), persistedLine(false, false)));

        assertThatThrownBy(() -> fixture.service().update(
                fixture.slipId(), request(fixture, 0, 333), UUID.randomUUID(), "R5 사용자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.SLIP_UPDATE_INVALID_LINE));
        verify(fixture.repository(), never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("RED-B-3: head를 유지한 비-head 삭제와 양수 편집은 저장한다")
    void nonHeadDeletionAndPositiveEditRemainAllowed() {
        Fixture fixture = fixture(List.of(
                persistedLine(true, false), persistedLine(false, false)));

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture, List.of(fixture.persisted().get(0)), 3, 333),
                UUID.randomUUID(), "R5 사용자"))
                .doesNotThrowAnyException();
        assertThat(fixture.slip().getLines()).singleElement().satisfies(line -> {
            assertThat(line.isSetHead()).isTrue();
            assertThat(line.getQuantity()).isEqualTo(3);
            assertThat(line.getUnitPrice()).isEqualByComparingTo("333");
        });
    }

    @Test
    @DisplayName("RED-B-2a: 동일 모델 첫 인스턴스 head만 삭제하면 해당 인스턴스를 거부한다")
    void deletingFirstInstanceHeadOnlyIsRejected() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, true), persistedLine(false, true),
                persistedLine(true, true), persistedLine(false, true));
        Fixture fixture = fixture(persisted);

        assertThatThrownBy(() -> fixture.service().update(
                fixture.slipId(), request(fixture,
                        List.of(persisted.get(1), persisted.get(2), persisted.get(3)), 1, 200),
                UUID.randomUUID(), "R5 공격자"))
                .isInstanceOfSatisfying(BusinessException.class, ex ->
                        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.INVALID_INPUT));
        verify(fixture.repository(), never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("RED-B-2b: 동일 모델 첫 인스턴스 전체 삭제는 둘째 인스턴스를 저장한다")
    void deletingFirstInstanceEntirelyIsAllowed() {
        List<PersistedLine> persisted = List.of(
                persistedLine(true, true), persistedLine(false, true),
                persistedLine(true, true), persistedLine(false, true));
        Fixture fixture = fixture(persisted);

        assertThatCode(() -> fixture.service().update(
                fixture.slipId(), request(fixture,
                        List.of(persisted.get(2), persisted.get(3)), 2, 222),
                UUID.randomUUID(), "R5 사용자"))
                .doesNotThrowAnyException();
        assertThat(fixture.slip().getLines()).hasSize(2)
                .filteredOn(SlipLine::isSetHead).hasSize(1);
    }

    private Fixture fixture(List<PersistedLine> persisted) {
        return fixture(persisted, false, false);
    }

    private Fixture fixture(List<PersistedLine> persisted, boolean keylessOptions) {
        return fixture(persisted, keylessOptions, false);
    }

    private Fixture fixture(List<PersistedLine> persisted, boolean keylessOptions,
                            boolean nullOptions) {
        UUID slipId = UUID.randomUUID();
        Slip slip = Slip.createOutbound("2026/08/11-R5", LocalDate.of(2026, 8, 11), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "R5 거래처", null, null,
                "r5-fix");
        ReflectionTestUtils.setField(slip, "id", slipId);
        ReflectionTestUtils.setField(slip, "createdAt", UPDATED_AT);
        String instanceKey = null;
        int instanceNo = 0;
        for (PersistedLine line : persisted) {
            if (line.setHead()) {
                instanceKey = "R5-instance-" + (++instanceNo);
            }
            SlipLine slipLine = SlipLine.create(slip, line.productId(), "R5 품목", line.modelName(),
                    null, 1, line.setHead() ? new BigDecimal("100") : new BigDecimal("200"), null);
            ReflectionTestUtils.setField(slipLine, "id", line.lineId());
            BundleSetOptions options = nullOptions ? null
                    : keylessOptions ? new BundleSetOptions(null, null, null, null, null)
                    : instanceKey == null ? null
                    : new BundleSetOptions(null, null, null, null, null, instanceKey);
            slipLine.assignBundleComponent(PARENT_MODEL, line.setHead(), options);
            slip.addLine(slipLine);
        }

        SlipRepository repository = mock(SlipRepository.class);
        ProductClient productClient = mock(ProductClient.class);
        PartnerProductPriceMemoryService priceMemoryService = mock(PartnerProductPriceMemoryService.class);
        SalesSlipUpdateService service = new SalesSlipUpdateService(
                repository, mock(SlipAuditLogService.class), mock(SlipRevisionService.class),
                priceMemoryService, productClient,
                mock(SlipClosedDateGuard.class));
        when(repository.findById(slipId)).thenReturn(Optional.of(slip));
        when(repository.saveAndFlush(any(Slip.class))).thenAnswer(invocation -> {
            Slip saved = invocation.getArgument(0);
            for (SlipLine savedLine : saved.getLines()) {
                if (savedLine.getId() == null) {
                    ReflectionTestUtils.setField(savedLine, "id", UUID.randomUUID());
                }
            }
            return saved;
        });
        when(productClient.lookup(anyList())).thenAnswer(invocation -> {
            List<UUID> productIds = invocation.getArgument(0);
            return productIds.stream()
                    .map(productId -> new ProductSummary(productId, "R5 품목", "R5-MODEL",
                            null, UUID.randomUUID(), new BigDecimal("100"), "ACTIVE", false))
                    .toList();
        });
        return new Fixture(service, repository, priceMemoryService, slip, slipId, persisted);
    }

    private void materializeExplicitR9Mapping(Slip slip) {
        for (int i = 0; i < slip.getLines().size(); i++) {
            String instanceKey = i < 4 ? "r9-20260807-20-instance-a"
                    : "r9-20260807-20-instance-b";
            SlipLine line = slip.getLines().get(i);
            line.assignBundleComponent(PARENT_MODEL, line.isSetHead(),
                    new BundleSetOptions(null, null, null, null, null, instanceKey));
        }
    }

    private SlipUpdateRequest request(Fixture fixture, int quantity, int unitPrice) {
        return request(fixture, fixture.persisted(), quantity, unitPrice);
    }

    private SlipUpdateRequest requestForLines(List<SlipUpdateRequest.LineRequest> lines) {
        return new SlipUpdateRequest(UPDATED_AT, UUID.randomUUID(), "R5 거래처", null,
                null, null, null, null, null, null, null, lines, true);
    }

    private SlipUpdateRequest request(Fixture fixture, List<PersistedLine> selected,
                                      int quantity, int unitPrice) {
        List<SlipUpdateRequest.LineRequest> lines = new ArrayList<>();
        for (int i = 0; i < selected.size(); i++) {
            PersistedLine persisted = selected.get(i);
            lines.add(new SlipUpdateRequest.LineRequest(
                    persisted.productId(), "R5 품목", persisted.modelName(), null,
                    i == 0 ? quantity : 1,
                    BigDecimal.valueOf(i == 0 ? unitPrice : persisted.setHead() ? 100 : 200),
                    null, persisted.lineId()));
        }
        return new SlipUpdateRequest(UPDATED_AT, UUID.randomUUID(), "R5 거래처", null,
                null, null, null, null, null, null, null, lines, true);
    }

    private SlipUpdateRequest requestForCurrentLines(List<SlipLine> currentLines,
                                                     int quantity, int unitPrice) {
        List<SlipUpdateRequest.LineRequest> lines = new ArrayList<>();
        for (int i = 0; i < currentLines.size(); i++) {
            SlipLine line = currentLines.get(i);
            lines.add(new SlipUpdateRequest.LineRequest(
                    line.getProductId(), line.getProductName(), line.getModelName(),
                    line.getSpecification(), i == 0 ? quantity : line.getQuantity(),
                    i == 0 ? BigDecimal.valueOf(unitPrice) : line.getUnitPrice(),
                    null, line.getId()));
        }
        return requestForLines(lines);
    }

    private PersistedLine persistedLine(boolean setHead, boolean uniqueProduct) {
        return new PersistedLine(UUID.randomUUID(), UUID.randomUUID(),
                uniqueProduct ? "R5-MODEL-" + UUID.randomUUID() : "R5-MODEL", setHead);
    }

    private record PersistedLine(UUID lineId, UUID productId, String modelName, boolean setHead) {
    }

    private record Fixture(SalesSlipUpdateService service, SlipRepository repository,
                           PartnerProductPriceMemoryService priceMemory, Slip slip,
                           UUID slipId, List<PersistedLine> persisted) {
    }
}
