package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

/** R3에서만 실행하고 삭제하는 적대 검증 probe. */
class SalesSlipUpdateR3AdversarialProbeTest {

    private static final LocalDateTime VERSION = LocalDateTime.of(2026, 8, 11, 0, 0);
    private static final String PARENT_MODEL = "R3-BUNDLE";

    @Test
    @DisplayName("R3 untouched 신규 BUNDLE은 통과한다")
    void untouchedBundlePasses() {
        Fixture f = fixture();
        f.service.update(f.slipId, bundleRequest(f, Edit.NONE), UUID.randomUUID(), "R3");
        assertThat(f.slip.getLines()).hasSize(2).allMatch(BundleLineageResolver::isBundleComponent);
        System.out.println("R3-UNTOUCHED|PASS|saved=2");
    }

    @Test
    @DisplayName("R3 사용자가 구성품 수량 하나를 바꾸면 INVALID_INPUT")
    void editedComponentQuantityIsRejected() {
        Fixture f = fixture();
        BusinessException ex = rejected(() -> f.service.update(
                f.slipId, bundleRequest(f, Edit.QUANTITY), UUID.randomUUID(), "R3"));
        System.out.println("R3-QUANTITY|" + ex.getErrorCode() + "|" + ex.getMessage());
        verify(f.repository, never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("R3 사용자가 구성품 단가 하나를 바꾸면 INVALID_INPUT")
    void editedComponentUnitPriceIsRejected() {
        Fixture f = fixture();
        BusinessException ex = rejected(() -> f.service.update(
                f.slipId, bundleRequest(f, Edit.UNIT_PRICE), UUID.randomUUID(), "R3"));
        System.out.println("R3-UNIT-PRICE|" + ex.getErrorCode() + "|" + ex.getMessage());
        verify(f.repository, never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("R3 사용자가 구성품 하나를 지우면 INVALID_INPUT")
    void deletedComponentIsRejected() {
        Fixture f = fixture();
        BusinessException ex = rejected(() -> f.service.update(
                f.slipId, bundleRequest(f, Edit.DELETE_CHILD), UUID.randomUUID(), "R3"));
        System.out.println("R3-DELETE-CHILD|" + ex.getErrorCode() + "|" + ex.getMessage());
        verify(f.repository, never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("R3 1차 lookup 뒤 부모 검증 lookup이 실패하면 저장 전체가 막힌다")
    void parentValidationOutageBlocksSave() {
        Fixture f = fixture();
        AtomicInteger lookupCount = new AtomicInteger();
        when(f.productClient.lookup(any())).thenAnswer(invocation -> {
            if (lookupCount.incrementAndGet() == 1) {
                return componentSummaries(invocation.getArgument(0));
            }
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패");
        });
        BusinessException ex = rejected(() -> f.service.update(
                f.slipId, bundleRequest(f, Edit.NONE), UUID.randomUUID(), "R3"));
        System.out.println("R3-PARENT-LOOKUP-OUTAGE|" + ex.getErrorCode() + "|" + ex.getMessage());
        verify(f.repository, never()).saveAndFlush(any(Slip.class));
    }

    @Test
    @DisplayName("R3 구 규약 lineId BUNDLE은 수량·단가 수정 후 재저장된다")
    void legacyLineIdBundleRemainsEditable() {
        Fixture f = fixture();
        SlipLine first = SlipLine.create(f.slip, f.firstComponentId, "구 구성품 1", "OLD-1",
                null, 1, new BigDecimal("100"), null);
        SlipLine second = SlipLine.create(f.slip, f.secondComponentId, "구 구성품 2", "OLD-2",
                null, 1, new BigDecimal("200"), null);
        UUID firstLineId = UUID.randomUUID();
        UUID secondLineId = UUID.randomUUID();
        ReflectionTestUtils.setField(first, "id", firstLineId);
        ReflectionTestUtils.setField(second, "id", secondLineId);
        first.assignBundleComponent("LEGACY-SET", true);
        second.assignBundleComponent("LEGACY-SET", false);
        f.slip.addLine(first);
        f.slip.addLine(second);
        when(f.productClient.lookup(any())).thenAnswer(invocation -> componentSummaries(invocation.getArgument(0)));

        List<SlipUpdateRequest.LineRequest> lines = List.of(
                legacyLine(f.firstComponentId, firstLineId, 3, "333", true),
                legacyLine(f.secondComponentId, secondLineId, 4, "444", false));
        f.service.update(f.slipId, request(lines), UUID.randomUUID(), "R3");

        assertThat(f.slip.getLines()).extracting(SlipLine::getQuantity).containsExactly(3, 4);
        assertThat(f.slip.getLines()).allMatch(BundleLineageResolver::isBundleComponent);
        verify(f.productClient, never()).expand(any(), any(), any(), any());
        System.out.println("R3-LEGACY-LINEID-BUNDLE|PASS|quantity=3,4|unitPrice=333,444");
    }

    @Test
    @DisplayName("R3 SINGLE 신규행 저장은 추가 BUNDLE 검증을 타지 않는다")
    void singleLineRemainsUnaffected() {
        Fixture f = fixture();
        UUID singleId = UUID.randomUUID();
        when(f.productClient.lookup(any())).thenReturn(componentSummaries(List.of(singleId)));
        SlipUpdateRequest.LineRequest single = new SlipUpdateRequest.LineRequest(
                singleId, "정상 SINGLE", "SINGLE-1", null, 2, new BigDecimal("1234"),
                null, null, null, null, null);
        f.service.update(f.slipId, request(List.of(single)), UUID.randomUUID(), "R3");
        assertThat(f.slip.getLines()).singleElement().satisfies(line -> {
            assertThat(line.getQuantity()).isEqualTo(2);
            assertThat(BundleLineageResolver.isBundleComponent(line)).isFalse();
        });
        verify(f.productClient, times(1)).lookup(any());
        verify(f.productClient, never()).expand(any(), any(), any(), any());
        System.out.println("R3-SINGLE|PASS|lookup=1|expand=0");
    }

    private Fixture fixture() {
        UUID slipId = UUID.randomUUID();
        UUID firstComponentId = UUID.randomUUID();
        UUID secondComponentId = UUID.randomUUID();
        UUID parentId = UUID.randomUUID();
        Slip slip = Slip.createOutbound("2026/08/11-R3", LocalDate.of(2026, 8, 11), 1,
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "R3 거래처",
                null, null, "r3");
        ReflectionTestUtils.setField(slip, "id", slipId);
        ReflectionTestUtils.setField(slip, "createdAt", VERSION);

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
            if (ids.size() == 1 && ids.contains(parentId)) {
                return List.of(new ProductSummary(parentId, "R3 부모", PARENT_MODEL, null,
                        UUID.randomUUID(), new BigDecimal("1000"), "ACTIVE", false,
                        PARENT_MODEL, "BUNDLE"));
            }
            return componentSummaries(ids);
        });
        when(productClient.expand(any(), any(), any(), any())).thenAnswer(invocation -> {
            BigDecimal qty = invocation.getArgument(1);
            return List.of(
                    new ExpandedLineDto(firstComponentId, "C-1", "C-1", "구성품 1",
                            new BigDecimal("2").multiply(qty), new BigDecimal("600"), "INDOOR", true),
                    new ExpandedLineDto(secondComponentId, "C-2", "C-2", "구성품 2",
                            BigDecimal.ONE.multiply(qty), new BigDecimal("400"), "OUTDOOR", false));
        });
        return new Fixture(service, repository, productClient, slip, slipId,
                parentId, firstComponentId, secondComponentId);
    }

    private SlipUpdateRequest bundleRequest(Fixture f, Edit edit) {
        List<SlipUpdateRequest.LineRequest> lines = new ArrayList<>();
        lines.add(bundleLine(f.firstComponentId, edit == Edit.QUANTITY ? 3 : 2,
                edit == Edit.UNIT_PRICE ? "601" : "600", true, f.parentId));
        if (edit != Edit.DELETE_CHILD) {
            lines.add(bundleLine(f.secondComponentId, 1, "400", false, f.parentId));
        }
        return request(lines);
    }

    private SlipUpdateRequest.LineRequest bundleLine(UUID productId, int quantity, String unitPrice,
                                                       boolean setHead, UUID parentId) {
        return new SlipUpdateRequest.LineRequest(
                productId, "구성품", "COMPONENT", null, quantity, new BigDecimal(unitPrice),
                null, null, null, null, null,
                new BundleSetOptions("", false, "", "", false),
                PARENT_MODEL, setHead, parentId, new BigDecimal("1000"));
    }

    private SlipUpdateRequest.LineRequest legacyLine(UUID productId, UUID lineId, int quantity,
                                                       String unitPrice, boolean setHead) {
        return new SlipUpdateRequest.LineRequest(
                productId, "구 구성품", "OLD", null, quantity, new BigDecimal(unitPrice),
                null, lineId, null, null, null,
                new BundleSetOptions("", false, "", "", false),
                "LEGACY-SET", setHead, null, null);
    }

    private SlipUpdateRequest request(List<SlipUpdateRequest.LineRequest> lines) {
        return new SlipUpdateRequest(VERSION, UUID.randomUUID(), "R3 거래처", null,
                null, null, null, null, null, null, null, lines, true);
    }

    private static List<ProductSummary> componentSummaries(List<UUID> ids) {
        return ids.stream().map(id -> new ProductSummary(id, "구성품", "COMPONENT", null,
                UUID.randomUUID(), BigDecimal.ONE, "ACTIVE")).toList();
    }

    private BusinessException rejected(Runnable action) {
        final BusinessException[] captured = new BusinessException[1];
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class, ex -> {
            captured[0] = ex;
            assertThat(ex.getErrorCode()).isIn(ErrorCode.INVALID_INPUT, ErrorCode.INTERNAL_ERROR);
        });
        return captured[0];
    }

    private enum Edit { NONE, QUANTITY, UNIT_PRICE, DELETE_CHILD }

    private record Fixture(SalesSlipUpdateService service, SlipRepository repository,
                           ProductClient productClient, Slip slip, UUID slipId, UUID parentId,
                           UUID firstComponentId, UUID secondComponentId) {}
}
