package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipDetail;
import com.samhanair.logis.inventory.client.SlipLineDetail;
import com.samhanair.logis.inventory.domain.InboundInspection;
import com.samhanair.logis.inventory.domain.InboundInspectionLine;
import com.samhanair.logis.inventory.domain.InspectionStatus;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.InboundInspectionLineRepository;
import com.samhanair.logis.inventory.repository.InboundInspectionRepository;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.InboundInspectionLineResult;
import com.samhanair.logis.inventory.web.dto.InboundInspectionRequest;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * InboundInspectionService 단위 테스트 — Mockito 기반, DB 미접근.
 *
 * <p>테스트 범위:
 * <ul>
 *   <li>getOrCreateInspection — 기존 검수 반환 / 신규 생성 / 비입고전표 거부 / 불허 상태 거부</li>
 *   <li>saveInspectionResult — 정상 저장 / 라인 미발견 / COMPLETED 상태 거부</li>
 *   <li>completeInspection — 정상 완료 + 재고 반영 / 검수 미입력 라인 거부 / 이미 완료 멱등</li>
 *   <li>listInspections — status 필터 / 전체</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class InboundInspectionServiceTest {

    @Mock InboundInspectionRepository inspectionRepository;
    @Mock InboundInspectionLineRepository inspectionLineRepository;
    @Mock StockLotRepository stockLotRepository;
    @Mock StockBalanceRepository stockBalanceRepository;
    @Mock StockMovementRepository stockMovementRepository;
    @Mock WarehouseRepository warehouseRepository;
    @Mock ProductClient productClient;
    @Mock SlipClient slipClient;

    @InjectMocks
    InboundInspectionService service;

    private final UUID slipId = UUID.randomUUID();
    private final UUID warehouseId = UUID.randomUUID();
    private final UUID lineId = UUID.randomUUID();
    private final UUID productId = UUID.randomUUID();
    private final String actorId = "user-001";

    // ──────────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("getOrCreateInspection")
    class GetOrCreate {

        @Test
        @DisplayName("기존 검수 레코드가 있으면 slip-service 를 호출해 부가 정보(partnerName/창고명/입고일)를 포함해 반환")
        void existingInspection_returnsWithSlipCallForExtraInfo() {
            InboundInspection existing = makeInspection(slipId, "2025/01/10-001");
            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(existing));
            SlipDetail slipDetail = makeSlipDetail(slipId, "INBOUND", "SAVED");
            when(slipClient.getSlip(slipId)).thenReturn(slipDetail);

            var result = service.getOrCreateInspection(slipId);

            assertThat(result.slipId()).isEqualTo(slipId);
            assertThat(result.partnerName()).isEqualTo("테스트 거래처");
            assertThat(result.destinationWarehouseName()).isEqualTo("본사창고");
            assertThat(result.slipDate()).isEqualTo("2025-01-10");
        }

        @Test
        @DisplayName("검수 레코드 없으면 slip-service 호출 후 신규 생성")
        void noInspection_createsFromSlip() {
            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.empty());
            SlipDetail slipDetail = makeSlipDetail(slipId, "INBOUND", "SAVED");
            when(slipClient.getSlip(slipId)).thenReturn(slipDetail);

            InboundInspection saved = makeInspection(slipId, "2025/01/10-001");
            when(inspectionRepository.save(any())).thenReturn(saved);
            lenient().when(inspectionLineRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            var result = service.getOrCreateInspection(slipId);

            assertThat(result.slipId()).isEqualTo(slipId);
            verify(inspectionRepository).save(any());
        }

        @Test
        @DisplayName("OUTBOUND 슬립은 CONFLICT 예외")
        void outboundSlip_throwsConflict() {
            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.empty());
            when(slipClient.getSlip(slipId))
                    .thenReturn(makeSlipDetail(slipId, "OUTBOUND", "SAVED"));

            assertThatThrownBy(() -> service.getOrCreateInspection(slipId))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.CONFLICT);
        }

        @Test
        @DisplayName("DRAFT 상태 슬립은 CONFLICT 예외")
        void draftSlip_throwsConflict() {
            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.empty());
            when(slipClient.getSlip(slipId))
                    .thenReturn(makeSlipDetail(slipId, "INBOUND", "DRAFT"));

            assertThatThrownBy(() -> service.getOrCreateInspection(slipId))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("작성중")
                    .hasMessageContaining("저장완료")
                    .hasMessageNotContaining("DRAFT")
                    .hasMessageNotContaining("SAVED")
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.CONFLICT);
        }
    }

    // ──────────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("saveInspectionResult")
    class SaveResult {

        @Test
        @DisplayName("정상 라인 결과 저장 성공")
        void normalSave_succeeds() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 10);
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));
            when(slipClient.getSlip(slipId)).thenReturn(makeSlipDetail(slipId, "INBOUND", "SAVED"));

            var request = new InboundInspectionRequest(
                    List.of(new InboundInspectionLineResult(lineId, 9, 1, "외관 불량")));

            var result = service.saveInspectionResult(slipId, request, actorId);

            assertThat(result.lines()).hasSize(1);
            assertThat(result.lines().get(0).inspectedQty()).isEqualTo(9);
            assertThat(result.lines().get(0).defectQty()).isEqualTo(1);
            assertThat(result.lines().get(0).normalQty()).isEqualTo(8);
        }

        @Test
        @DisplayName("defectQty>0 인데 defectReason 빈값이면 INVALID_INPUT 예외")
        void defectQtyWithoutReason_throwsInvalidInput() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 10);
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));

            var request = new InboundInspectionRequest(
                    List.of(new InboundInspectionLineResult(lineId, 9, 1, "")));

            assertThatThrownBy(() -> service.saveInspectionResult(slipId, request, actorId))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.INVALID_INPUT);
        }

        @Test
        @DisplayName("존재하지 않는 lineId 는 NOT_FOUND 예외")
        void unknownLineId_throwsNotFound() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));

            UUID unknownLineId = UUID.randomUUID();
            var request = new InboundInspectionRequest(
                    List.of(new InboundInspectionLineResult(unknownLineId, 5, 0, null)));

            assertThatThrownBy(() -> service.saveInspectionResult(slipId, request, actorId))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NOT_FOUND);
        }

        @Test
        @DisplayName("검수 레코드 없으면 NOT_FOUND 예외")
        void noInspection_throwsNotFound() {
            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.empty());

            var request = new InboundInspectionRequest(
                    List.of(new InboundInspectionLineResult(lineId, 5, 0, null)));

            assertThatThrownBy(() -> service.saveInspectionResult(slipId, request, actorId))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.NOT_FOUND);
        }
    }

    // ──────────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("completeInspection")
    class Complete {

        @Test
        @DisplayName("정상 완료 — StockLot + StockBalance + StockMovement 생성")
        void normalComplete_appliesStock() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 10);
            line.recordResult(10, 0, null);
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));

            SlipDetail slipDetail = makeSlipDetail(slipId, "INBOUND", "SAVED");
            when(slipClient.getSlip(slipId)).thenReturn(slipDetail);

            Warehouse warehouse = makeWarehouse(warehouseId);
            when(warehouseRepository.findById(warehouseId)).thenReturn(Optional.of(warehouse));
            when(productClient.requireExists(productId)).thenReturn(goodsProduct(productId));

            StockBalance balance = StockBalance.create(productId, warehouse);
            when(stockBalanceRepository
                    .findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId))
                    .thenReturn(Optional.of(balance));
            lenient().when(stockLotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            lenient().when(stockMovementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            var result = service.completeInspection(slipId, actorId);

            assertThat(result.status()).isEqualTo(InspectionStatus.COMPLETED);
            assertThat(result.stockApplied()).isTrue();
            ArgumentCaptor<com.samhanair.logis.inventory.domain.StockLot> stockLotCaptor =
                    ArgumentCaptor.forClass(com.samhanair.logis.inventory.domain.StockLot.class);
            verify(stockLotRepository).save(stockLotCaptor.capture());
            assertThat(stockLotCaptor.getValue().getUnitCost()).isEqualByComparingTo("100000");
            verify(stockMovementRepository).save(any());
        }

        @Test
        @DisplayName("전표 경로가 먼저 만든 동일 전표 lot가 있으면 검수 경로는 재고를 중복 반영하지 않음")
        void lifecycleAlreadyApplied_skipsDuplicateStockMutation() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 10);
            line.recordResult(10, 0, null);
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));
            SlipDetail slipDetail = makeSlipDetail(slipId, "INBOUND", "INSPECTING");
            when(slipClient.getSlip(slipId)).thenReturn(slipDetail);
            Warehouse warehouse = makeWarehouse(warehouseId);
            when(warehouseRepository.findById(warehouseId)).thenReturn(Optional.of(warehouse));
            when(productClient.requireExists(productId)).thenReturn(goodsProduct(productId));
            when(stockLotRepository.findFirstByProductIdAndWarehouse_IdAndLotNoAndIsDeletedFalse(
                    productId, warehouseId, "2025/01/10-001"))
                    .thenReturn(Optional.of(com.samhanair.logis.inventory.domain.StockLot.create(
                            productId, warehouse, "2025/01/10-001", 10,
                            java.time.LocalDateTime.now(), new BigDecimal("100000"))));

            var result = service.completeInspection(slipId, actorId);

            assertThat(result.stockApplied()).isTrue();
            verify(stockLotRepository, never()).save(any());
            verify(stockBalanceRepository, never()).save(any());
            verify(stockMovementRepository, never()).save(any());
        }

        @Test
        @DisplayName("권위 금액 라인의 StockLot 원가는 공급가액/수량으로 VAT를 제외한다")
        void authoritativeLine_usesSupplyUnitCostWithoutVat() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 2);
            line.recordResult(2, 0, null);
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));
            when(slipClient.getSlip(slipId)).thenReturn(makeAuthoritativeSlipDetail(slipId));

            Warehouse warehouse = makeWarehouse(warehouseId);
            when(warehouseRepository.findById(warehouseId)).thenReturn(Optional.of(warehouse));
            when(productClient.requireExists(productId)).thenReturn(goodsProduct(productId));
            when(stockBalanceRepository
                    .findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId))
                    .thenReturn(Optional.of(StockBalance.create(productId, warehouse)));
            lenient().when(stockLotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            lenient().when(stockMovementRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            service.completeInspection(slipId, actorId);

            ArgumentCaptor<com.samhanair.logis.inventory.domain.StockLot> captor =
                    ArgumentCaptor.forClass(com.samhanair.logis.inventory.domain.StockLot.class);
            verify(stockLotRepository).save(captor.capture());
            assertThat(captor.getValue().getUnitCost()).isEqualByComparingTo("10000");
        }

        @Test
        @DisplayName("비상품 라인은 재고를 만들지 않고 검수 완료만 처리")
        void nonGoodsProduct_skipsStockCreationButCompletes() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 10);
            line.recordResult(10, 0, null);
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));
            when(slipClient.getSlip(slipId)).thenReturn(makeSlipDetail(slipId, "INBOUND", "SAVED"));
            when(warehouseRepository.findById(warehouseId)).thenReturn(Optional.of(makeWarehouse(warehouseId)));
            when(productClient.requireExists(productId)).thenReturn(nonGoodsProduct(productId));

            var result = service.completeInspection(slipId, actorId);

            assertThat(result.status()).isEqualTo(InspectionStatus.COMPLETED);
            assertThat(result.stockApplied()).isTrue();
            verify(stockLotRepository, never()).save(any());
            verify(stockBalanceRepository, never()).save(any());
            verify(stockMovementRepository, never()).save(any());
        }

        @Test
        @DisplayName("productType=BUNDLE 세트 SKU 라인은 재고를 만들지 않고 검수 완료만 처리")
        void bundleProduct_skipsStockCreationButCompletes() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 10);
            line.recordResult(10, 0, null);
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));
            when(slipClient.getSlip(slipId)).thenReturn(makeSlipDetail(slipId, "INBOUND", "SAVED"));
            when(warehouseRepository.findById(warehouseId)).thenReturn(Optional.of(makeWarehouse(warehouseId)));
            when(productClient.requireExists(productId)).thenReturn(bundleProduct(productId));

            var result = service.completeInspection(slipId, actorId);

            assertThat(result.status()).isEqualTo(InspectionStatus.COMPLETED);
            assertThat(result.stockApplied()).isTrue();
            verify(stockLotRepository, never()).save(any());
            verify(stockBalanceRepository, never()).save(any());
            verify(stockMovementRepository, never()).save(any());
        }

        @Test
        @DisplayName("검수 미입력 라인이 있으면 CONFLICT 예외")
        void uninspectedLine_throwsConflict() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            InboundInspectionLine line = makeLine(inspection, lineId, productId, 10);
            // inspectedQty 미입력 (null 상태)
            inspection.addLine(line);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));

            assertThatThrownBy(() -> service.completeInspection(slipId, actorId))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.CONFLICT);
        }

        @Test
        @DisplayName("이미 stockApplied=true 이면 멱등 응답 반환 (재고 중복 반영 없음)")
        void alreadyApplied_idempotentReturn() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            // 이미 완료된 상태 시뮬레이션 (reflection)
            ReflectionTestUtils.setField(inspection, "stockApplied", true);

            when(inspectionRepository.findBySlipIdAndIsDeletedFalse(slipId))
                    .thenReturn(Optional.of(inspection));
            lenient().when(slipClient.getSlip(slipId))
                    .thenReturn(makeSlipDetail(slipId, "INBOUND", "SAVED"));

            var result = service.completeInspection(slipId, actorId);

            // 재고 반영 로직 미호출
            verify(stockLotRepository, never()).save(any());
            verify(stockMovementRepository, never()).save(any());
            assertThat(result.stockApplied()).isTrue();
        }
    }

    // ──────────────────────────────────────────────────────────────────
    @Nested
    @DisplayName("listInspections")
    class List_ {

        @Test
        @DisplayName("status 필터 있으면 findAllByStatusAndIsDeletedFalse 호출")
        void withStatus_callsFilteredRepo() {
            when(inspectionRepository.findAllByStatusAndIsDeletedFalse(
                    any(InspectionStatus.class), any(Pageable.class)))
                    .thenReturn(new PageImpl<>(List.of()));

            var result = service.listInspections(InspectionStatus.PENDING, Pageable.unpaged());

            assertThat(result.getContent()).isEmpty();
            verify(inspectionRepository).findAllByStatusAndIsDeletedFalse(
                    InspectionStatus.PENDING, Pageable.unpaged());
        }

        @Test
        @DisplayName("목록 요약은 slip-service snapshot 으로 거래처명/거래처코드/입고일을 보강")
        void list_enrichesPartnerBusinessNoFromSlipSnapshot() {
            InboundInspection inspection = makeInspection(slipId, "2025/01/10-001");
            when(inspectionRepository.findAllByStatusAndIsDeletedFalse(
                    any(InspectionStatus.class), any(Pageable.class)))
                    .thenReturn(new PageImpl<>(List.of(inspection)));
            when(slipClient.getSlip(slipId)).thenReturn(makeSlipDetail(slipId, "INBOUND", "SAVED"));

            var result = service.listInspections(InspectionStatus.PENDING, Pageable.unpaged());

            assertThat(result.getContent()).hasSize(1);
            assertThat(result.getContent().get(0).partnerName()).isEqualTo("테스트 거래처");
            assertThat(result.getContent().get(0).partnerBusinessNo()).isEqualTo("1234567890");
            assertThat(result.getContent().get(0).slipDate()).isEqualTo("2025-01-10");
        }

        @Test
        @DisplayName("status null 이면 findAllByIsDeletedFalse 호출")
        void noStatus_callsAllRepo() {
            when(inspectionRepository.findAllByIsDeletedFalse(any(Pageable.class)))
                    .thenReturn(new PageImpl<>(List.of()));

            var result = service.listInspections(null, Pageable.unpaged());

            assertThat(result.getContent()).isEmpty();
            verify(inspectionRepository).findAllByIsDeletedFalse(Pageable.unpaged());
        }
    }

    // ──────────────────────────────────────────────────────────────────
    // 테스트 픽스처 헬퍼

    private InboundInspection makeInspection(UUID slipId, String slipNo) {
        InboundInspection i = InboundInspection.create(slipId, slipNo);
        ReflectionTestUtils.setField(i, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(i, "version", 0L);
        return i;
    }

    /** 결정적 slipLineId — makeLine + makeSlipDetail 가 공유하여 service slipLineMap.get() 매칭 보장. */
    private static final UUID SHARED_SLIP_LINE_ID =
            UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    private InboundInspectionLine makeLine(InboundInspection inspection,
                                           UUID lineId, UUID productId, int expectedQty) {
        InboundInspectionLine line = InboundInspectionLine.create(
                inspection, SHARED_SLIP_LINE_ID, "MODEL-001", "테스트 제품", expectedQty);
        ReflectionTestUtils.setField(line, "id", lineId);
        return line;
    }

    private SlipDetail makeSlipDetail(UUID slipId, String slipType, String status) {
        SlipLineDetail slipLine = new SlipLineDetail(
                SHARED_SLIP_LINE_ID, productId, "테스트 제품", "MODEL-001",
                10, new BigDecimal("100000"));
        return new SlipDetail(slipId, "2025/01/10-001", slipType, status,
                warehouseId, "테스트 거래처", "본사창고", "2025-01-10", "1234567890",
                List.of(slipLine));
    }

    private SlipDetail makeAuthoritativeSlipDetail(UUID slipId) {
        SlipLineDetail slipLine = new SlipLineDetail(
                SHARED_SLIP_LINE_ID, productId, "테스트 제품", "MODEL-001",
                2, new BigDecimal("11000"), new BigDecimal("20000"));
        return new SlipDetail(slipId, "2025/01/10-001", "INBOUND", "SAVED",
                warehouseId, "테스트 거래처", "본사창고", "2025-01-10", "1234567890",
                List.of(slipLine));
    }

    private Warehouse makeWarehouse(UUID id) {
        Warehouse w = Warehouse.create("HQ-001", "본사창고", WarehouseType.HEADQUARTERS,
                "서울시", 1, null);
        ReflectionTestUtils.setField(w, "id", id);
        return w;
    }

    private ProductSummary goodsProduct(UUID id) {
        return new ProductSummary(id, "테스트 제품", "MODEL-001", "MODEL-001",
                UUID.randomUUID(), new BigDecimal("100000"), "ACTIVE", false, true);
    }

    private ProductSummary nonGoodsProduct(UUID id) {
        return new ProductSummary(id, "설치비", "FEE-INSTALL-001", "FEE-INSTALL-001",
                UUID.randomUUID(), new BigDecimal("50000"), "ACTIVE", false, false);
    }

    private ProductSummary bundleProduct(UUID id) {
        return new ProductSummary(id, "세트 품목", "SET-001", "SET-001",
                UUID.randomUUID(), new BigDecimal("50000"), "ACTIVE", false, true, "BUNDLE");
    }
}
