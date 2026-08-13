package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockBalance;
import com.samhanair.logis.inventory.domain.StockLot;
import com.samhanair.logis.inventory.domain.StockMovement;
import com.samhanair.logis.inventory.domain.SourceOperationOutcome;
import com.samhanair.logis.inventory.domain.StockTransfer;
import com.samhanair.logis.inventory.domain.StockTransferLine;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.StockBalanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.StockInstanceBalanceProjection;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import com.samhanair.logis.inventory.web.dto.AdjustRequest;
import com.samhanair.logis.inventory.web.dto.DeductRequest;
import com.samhanair.logis.inventory.web.dto.DeductionResponse;
import com.samhanair.logis.inventory.web.dto.InboundRequest;
import com.samhanair.logis.inventory.web.dto.ProductBalanceResponse;
import com.samhanair.logis.inventory.web.dto.ReleaseRequest;
import com.samhanair.logis.inventory.web.dto.ReservationResponse;
import com.samhanair.logis.inventory.web.dto.ReserveRequest;
import com.samhanair.logis.inventory.web.dto.StockLotResponse;
import com.samhanair.logis.inventory.web.dto.StockBalanceResponse;
import jakarta.persistence.OptimisticLockException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 재고 입고 / 예약 / 해제 / 차감(FIFO) / 조정. balance 와 movement 를 동시에 갱신한다.
 *
 * <p>낙관적 락(version) 충돌 시 1회 재시도 후 그래도 실패하면 BusinessException(CONFLICT).
 *
 * <p>차감(FIFO): {@link StockLotRepository#findAvailableLotsForFifo} 로 received_at ASC 정렬된
 * 가용 lot 들을 받아 quantity 가 모두 소진될 때까지 분배. 부족하면 BusinessException(CONFLICT).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class StockService {

    private static final Logger log = LoggerFactory.getLogger(StockService.class);

    private final StockLotRepository stockLotRepository;
    private final StockBalanceRepository stockBalanceRepository;
    private final StockMovementRepository stockMovementRepository;
    private final StockInstanceRepository stockInstanceRepository;
    private final WarehouseRepository warehouseRepository;
    private final ProductClient productClient;

    private final SourceOperationJournalWriter sourceJournalWriter;

    /**
     * 재고 현황 페이지를 조회하고 페이지에 포함된 품목 메타데이터를 bulk 병합한다.
     * 품목 UUID 자체는 응답 식별자로 사용하되 화면에는 모델코드/품목명만 표시한다.
     *
     * @param productId 기존 품목별 호출의 선택 필터
     * @param warehouseId 전체 또는 특정 창고 선택 필터
     * @param pageable 페이지 조건
     * @return 창고·품목 메타데이터가 채워진 재고 현황 페이지
     */
    @Transactional(readOnly = true)
    public Page<StockBalanceResponse> findBalancePage(UUID productId, UUID warehouseId, Pageable pageable) {
        Page<StockBalance> balances = stockBalanceRepository.findBalancePage(
                productId, warehouseId, Pageable.unpaged());
        List<BalanceRow> rows = balances.getContent().stream()
                .map(BalanceRow::existing)
                .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        List<StockInstanceBalanceProjection> serialGroups = stockInstanceRepository.findActiveBalanceGroups(
                productId, warehouseId);
        Set<BalanceKey> existingKeys = rows.stream()
                .map(row -> new BalanceKey(row.productId(), row.warehouse().getId()))
                .collect(java.util.stream.Collectors.toCollection(HashSet::new));

        List<Warehouse> virtualWarehouses = findVirtualWarehouses(warehouseId);
        if (!virtualWarehouses.isEmpty()) {
            // warehouseId=VIRTUAL 이면 기존 조회 결과가 비어 있으므로, 같은 product 모집단을
            // 일반 창고 잔액에서 다시 읽는다. 그 밖의 warehouseId 는 기존 행만 반환한다.
            List<StockBalance> productSource = warehouseId == null
                    ? balances.getContent()
                    : stockBalanceRepository.findBalancePage(
                            productId, null, Pageable.unpaged()).getContent();
            List<UUID> productIdsWithBalances = productSource.stream()
                    .map(StockBalance::getProductId)
                    .filter(java.util.Objects::nonNull)
                    .distinct()
                    .toList();
            for (Warehouse virtualWarehouse : virtualWarehouses) {
                for (UUID productIdWithBalance : productIdsWithBalances) {
                    if (existingKeys.add(new BalanceKey(
                            productIdWithBalance, virtualWarehouse.getId()))) {
                        rows.add(BalanceRow.virtual(productIdWithBalance, virtualWarehouse));
                    }
                }
            }
        }

        rows.sort(Comparator.comparing(BalanceRow::productId)
                .thenComparing(row -> row.warehouse().getCode()));

        Map<UUID, ProductSummary> productsById = new LinkedHashMap<>();
        List<UUID> productIds = java.util.stream.Stream.concat(
                rows.stream().map(BalanceRow::productId),
                serialGroups.stream().map(StockInstanceBalanceProjection::getProductId))
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        for (int from = 0; from < productIds.size(); from += 100) {
            int to = Math.min(from + 100, productIds.size());
            List<UUID> chunkIds = productIds.subList(from, to);
            List<ProductSummary> summaries = productClient.lookupAllowMissing(chunkIds);
            Set<UUID> foundIds = summaries.stream()
                    .map(ProductSummary::id)
                    .collect(java.util.stream.Collectors.toSet());
            List<UUID> missingIds = chunkIds.stream()
                    .filter(id -> !foundIds.contains(id))
                    .toList();
            if (!missingIds.isEmpty()) {
                log.warn("재고 잔고 품목 마스터 누락 — 정상 잔고 행은 계속 반환합니다. "
                                + "요청={}, 응답={}, missingProductIds={}",
                        chunkIds.size(), summaries.size(), missingIds);
            }
            for (ProductSummary product : summaries) {
                productsById.put(product.id(), product);
            }
        }

        Map<BalanceKey, SerialQuantities> serialQuantities = serialQuantities(serialGroups);
        Map<UUID, Warehouse> warehousesById = warehouseRepository
                .findAllByIsDeletedFalseOrderByDisplayOrderAsc().stream()
                .collect(java.util.stream.Collectors.toMap(Warehouse::getId, w -> w));

        // 시리얼 품목은 stock_instances가 정본이다. 혹시 과거 데이터에 남은
        // stock_balances가 있어도 중복 표시하지 않고 활성 인스턴스 수로 대체한다.
        rows.removeIf(row -> {
            ProductSummary product = productsById.get(row.productId());
            return row.balance() != null && product != null && product.serialManaged();
        });
        for (Map.Entry<BalanceKey, SerialQuantities> entry : serialQuantities.entrySet()) {
            BalanceKey key = entry.getKey();
            Warehouse warehouse = warehousesById.get(key.warehouseId());
            ProductSummary product = productsById.get(key.productId());
            if (warehouse != null && warehouse.getType() != WarehouseType.VIRTUAL
                    && product != null && product.serialManaged()) {
                rows.add(BalanceRow.serial(key.productId(), warehouse, entry.getValue()));
            }
        }

        rows.sort(Comparator.comparing(BalanceRow::productId)
                .thenComparing(row -> row.warehouse().getCode()));
        List<StockBalanceResponse> responses = rows.stream()
                .map(row -> row.toResponse(productsById))
                .toList();
        return pageOf(responses, pageable);
    }

    /**
     * 활성 VIRTUAL 창고만 응답 합성 대상으로 찾는다. HEADQUARTERS 등 일반 창고의
     * 재고 0 조합은 기존처럼 응답에 추가하지 않는다.
     */
    private List<Warehouse> findVirtualWarehouses(UUID warehouseId) {
        return warehouseRepository.findAllByIsDeletedFalseOrderByDisplayOrderAsc().stream()
                .filter(warehouse -> warehouse.getType() == WarehouseType.VIRTUAL)
                .filter(warehouse -> warehouseId == null || warehouseId.equals(warehouse.getId()))
                .toList();
    }

    /** 합성된 전체 응답 행을 기존 pageable 계약으로 자른다. */
    private Page<StockBalanceResponse> pageOf(List<StockBalanceResponse> rows, Pageable pageable) {
        if (pageable.isUnpaged()) {
            return new PageImpl<>(rows);
        }
        int start = (int) Math.min(pageable.getOffset(), rows.size());
        int end = Math.min(start + pageable.getPageSize(), rows.size());
        return new PageImpl<>(rows.subList(start, end), pageable, rows.size());
    }

    /** DB 잔액 행과 저장하지 않는 VIRTUAL 표시 행을 같은 정렬 단위로 다룬다. */
    private record BalanceRow(UUID productId, Warehouse warehouse, StockBalance balance,
                              int serialAvailableQty, int serialReservedQty) {

        private static BalanceRow existing(StockBalance balance) {
            return new BalanceRow(balance.getProductId(), balance.getWarehouse(), balance, 0, 0);
        }

        private static BalanceRow virtual(UUID productId, Warehouse warehouse) {
            return new BalanceRow(productId, warehouse, null, 0, 0);
        }

        private static BalanceRow serial(UUID productId, Warehouse warehouse, SerialQuantities quantities) {
            return new BalanceRow(productId, warehouse, null,
                    quantities.availableQty(), quantities.reservedQty());
        }

        private StockBalanceResponse toResponse(Map<UUID, ProductSummary> productsById) {
            ProductSummary product = productsById.get(productId);
            return balance == null && (serialAvailableQty != 0 || serialReservedQty != 0)
                    ? StockBalanceResponse.serial(warehouse, product, serialAvailableQty, serialReservedQty)
                    : balance == null
                    ? StockBalanceResponse.virtual(warehouse, product)
                    : StockBalanceResponse.from(balance, product);
        }
    }

    private record BalanceKey(UUID productId, UUID warehouseId) {
    }

    private record SerialQuantities(int availableQty, int reservedQty) {
        private SerialQuantities add(StockInstanceBalanceProjection group) {
            return switch (group.getStatus()) {
                case AVAILABLE -> new SerialQuantities(availableQty + Math.toIntExact(group.getQuantity()), reservedQty);
                case RESERVED -> new SerialQuantities(availableQty, reservedQty + Math.toIntExact(group.getQuantity()));
                default -> this;
            };
        }
    }

    private Map<BalanceKey, SerialQuantities> serialQuantities(List<StockInstanceBalanceProjection> groups) {
        Map<BalanceKey, SerialQuantities> result = new LinkedHashMap<>();
        for (StockInstanceBalanceProjection group : groups) {
            BalanceKey key = new BalanceKey(group.getProductId(), group.getWarehouseId());
            result.put(key, result.getOrDefault(key, new SerialQuantities(0, 0)).add(group));
        }
        return result;
    }

    /**
     * 입고 — ProductClient 로 productId 존재 검증 후 단일 트랜잭션 안에서
     * StockLot 생성 + StockBalance 가산 + StockMovement(INBOUND) 기록.
     *
     * @param req 입고 요청 (productId / warehouseId / quantity / lotNo / receivedAt / unitCost / note)
     * @param actorUserId 행위자 user-id (gateway X-User-Id 또는 "system")
     * @return 새로 생성된 lot 의 StockLotResponse
     * @throws BusinessException(NOT_FOUND) productId 가 product-service 에 없거나 warehouseId 가 없을 때
     * @throws BusinessException(CONFLICT) balance 갱신 시 낙관적 락 1회 재시도 후에도 실패할 때
     * @throws BusinessException(INTERNAL_ERROR) product-service 호출 자체가 실패할 때
     */
    public StockLotResponse inbound(InboundRequest req, String actorUserId) {
        ProductSummary product = productClient.requireExists(req.productId());
        if (isInventoryExcluded(product)) {
            // 비상품/세트 SKU — 재고(lot/balance/movement) 미생성 no-op.
            // 세트는 구성품(SINGLE)만 재고 대상이며, 직접 inventory 호출로 세트가 도달해도 graceful skip.
            recordSource(req.sourceContext(), product, SourceOperationOutcome.NO_OP_EXCLUDED, List.of(), List.of());
            return null;
        }
        Warehouse warehouse = loadWarehouseOrThrow(req.warehouseId());

        if (req.lotNo() != null) {
            StockLot existingLot = (req.inboundLineId() == null
                    ? stockLotRepository.findFirstByProductIdAndWarehouse_IdAndLotNoAndIsDeletedFalse(
                            req.productId(), req.warehouseId(), req.lotNo())
                    : stockLotRepository.findFirstByProductIdAndWarehouse_IdAndLotNoAndInboundLineIdAndIsDeletedFalse(
                            req.productId(), req.warehouseId(), req.lotNo(), req.inboundLineId()))
                    .orElse(null);
            if (existingLot != null) {
                // 검수 완료 경로가 먼저 만든 동일 전표 lot — 전표 경로는 중복 반영하지 않는다.
                recordSource(req.sourceContext(), product, SourceOperationOutcome.NO_OP_EXISTING, List.of(), List.of());
                return StockLotResponse.from(existingLot);
            }
        }

        StockLot lot = stockLotRepository.save(StockLot.create(
                req.productId(), warehouse, req.lotNo(), req.inboundLineId(), req.quantity(),
                req.receivedAt(), req.unitCost()));

        StockBalance balance = loadOrCreateBalance(req.productId(), warehouse);
        applyWithRetry(() -> balance.addInbound(req.quantity()));

        stockMovementRepository.save(StockMovement.of(
                lot.getId(), req.productId(), warehouse.getId(),
                MovementType.INBOUND, req.quantity(),
                "INBOUND", null, req.note(), actorUserId));

        recordSource(req.sourceContext(), product, SourceOperationOutcome.APPLIED,
                lot.getId() == null ? List.of() : List.of(lot.getId()), List.of());
        return StockLotResponse.from(lot);
    }

    /**
     * 이동전표 확정 — 출발 FIFO lot/balance 를 차감하고 도착 lot/balance 를 가산한다.
     * 출고와 입고 movement 를 같은 트랜잭션에 기록하여 이동 전후 총 수량을 보존한다.
     *
     * @param transfer RECEIVED 상태의 이동전표
     * @param actorUserId 확정자 user-id
     * @throws BusinessException(CONFLICT) 출발 가용 lot 또는 balance 가 부족할 때
     */
    public void transfer(StockTransfer transfer, String actorUserId) {
        for (StockTransferLine line : transfer.getLines()) {
            transferLine(line, transfer, actorUserId);
        }
    }

    private void transferLine(StockTransferLine line, StockTransfer transfer, String actorUserId) {
        UUID productId = line.getProductId();
        UUID sourceWarehouseId = transfer.getSourceWarehouse().getId();
        UUID destinationWarehouseId = transfer.getDestinationWarehouse().getId();
        int quantity = line.getRequestedQuantity();
        StockBalance sourceBalance = loadBalanceOrThrow(productId, sourceWarehouseId);
        Warehouse destinationWarehouse = transfer.getDestinationWarehouse();
        List<StockLot> sourceLots = stockLotRepository.findAvailableLotsForFifo(productId, sourceWarehouseId);
        int available = sourceLots.stream().mapToInt(StockLot::getQuantity).sum();
        if (available < quantity) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이동 재고 부족: 요청 " + quantity + ", 가용 " + available);
        }

        int remaining = quantity;
        StockLot sourceLot = null;
        for (StockLot lot : sourceLots) {
            if (remaining == 0) {
                break;
            }
            int taken = Math.min(remaining, lot.getQuantity());
            if (sourceLot == null) {
                sourceLot = lot;
            }
            lot.deduct(taken);
            applyWithRetry(() -> sourceBalance.deduct(taken, false));
            stockMovementRepository.save(StockMovement.of(
                    lot.getId(), productId, sourceWarehouseId,
                    MovementType.TRANSFER_OUT, -taken,
                    "STOCK_TRANSFER", transfer.getId(), transfer.getTransferNo(), actorUserId));
            remaining -= taken;
        }

        StockLot destinationLot = stockLotRepository.save(StockLot.createFromTransfer(
                productId, destinationWarehouse, transfer.getTransferNo(), quantity,
                LocalDateTime.now(), null, transfer.getId()));
        StockBalance destinationBalance = loadOrCreateBalance(productId, destinationWarehouse);
        applyWithRetry(() -> destinationBalance.addInbound(quantity));
        stockMovementRepository.save(StockMovement.of(
                destinationLot.getId(), productId, destinationWarehouseId,
                MovementType.TRANSFER_IN, quantity,
                "STOCK_TRANSFER", transfer.getId(), transfer.getTransferNo(), actorUserId));

        line.recordShipment(quantity, sourceLot == null ? null : sourceLot.getId());
        line.recordReceipt(quantity, destinationLot.getId());
    }

    /**
     * 예약 — availableQty 에서 reservedQty 로 이동. RESERVE movement 기록.
     *
     * <p><b>멱등 보장</b>: referenceType + referenceId + productId 조합이 이미 RESERVE movement 로
     * 기록된 경우 no-op 으로 기존 잔량을 그대로 반환한다 (Phase 2.6c 사전차단 멱등 가드).
     * referenceType 또는 referenceId 가 null 이면 멱등 검사를 건너뛴다 (기존 호출 무영향).
     *
     * @param req 예약 요청 (productId / warehouseId / quantity / referenceType / referenceId / note)
     * @param actorUserId 행위자 user-id
     * @return 예약 후 잔량을 담은 ReservationResponse
     * @throws BusinessException(NOT_FOUND) warehouse 또는 (productId, warehouseId) balance 가 없을 때
     * @throws BusinessException(CONFLICT) 가용 재고 부족 또는 낙관적 락 1회 재시도 후에도 실패할 때
     */
    public ReservationResponse reserve(ReserveRequest req, String actorUserId) {
        if (isInventoryExcluded(productClient.requireExists(req.productId()))) {
            // 비상품/세트 SKU — balance/reserve movement 를 만들지 않고 no-op skip.
            return new ReservationResponse(req.productId(), req.warehouseId(), 0,
                    0, 0, actorUserId);
        }
        Warehouse warehouse = loadWarehouseOrThrow(req.warehouseId());
        // 가용 재고가 없거나(balance 미존재) 부족한 경우 모두 CONFLICT(409) 사전차단 —
        // Phase 2.6c §0 도메인 규칙: 입고된 적 없는 제품에 대한 예약도 동일하게 차단.
        StockBalance balance = stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(req.productId(), req.warehouseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.CONFLICT,
                        "가용 재고가 없습니다: 해당 제품의 입고 이력이 없습니다"));

        // 멱등 가드 — (referenceType, referenceId, productId, RESERVE) 중복 시 no-op 반환
        // alreadyReserved=true 를 반환하여 호출자(PartnerOrderConvertService)가
        // 보상 대상(reservedLines)에서 제외할 수 있도록 한다 (double-release 방지).
        if (req.referenceType() != null && req.referenceId() != null) {
            boolean alreadyReserved = stockMovementRepository
                    .findByReferenceTypeAndReferenceIdAndProductIdAndMovementType(
                            req.referenceType(), req.referenceId(),
                            req.productId(), MovementType.RESERVE)
                    .isPresent();
            if (alreadyReserved) {
                return new ReservationResponse(
                        req.productId(), req.warehouseId(), req.quantity(),
                        balance.getAvailableQty(), balance.getReservedQty(), actorUserId,
                        true /* alreadyReserved — 실제 reservedQty 변동 없음 */);
            }
        }

        applyWithRetry(() -> balance.reserve(req.quantity()));

        stockMovementRepository.save(StockMovement.of(
                balance.getId(), req.productId(), warehouse.getId(),
                MovementType.RESERVE, req.quantity(),
                req.referenceType(), req.referenceId(), req.note(), actorUserId));

        return new ReservationResponse(
                req.productId(), req.warehouseId(), req.quantity(),
                balance.getAvailableQty(), balance.getReservedQty(), actorUserId);
    }

    /**
     * 예약 해제 — reservedQty 에서 availableQty 로 되돌림. RELEASE movement 기록.
     *
     * @param req 해제 요청 (productId / warehouseId / quantity / referenceType / referenceId / note)
     * @param actorUserId 행위자 user-id
     * @return 해제 후 잔량을 담은 ReservationResponse
     * @throws BusinessException(NOT_FOUND) warehouse 또는 balance 가 없을 때
     * @throws BusinessException(CONFLICT) 예약 재고 부족 또는 낙관적 락 1회 재시도 후에도 실패할 때
     */
    public ReservationResponse release(ReleaseRequest req, String actorUserId) {
        if (isInventoryExcluded(productClient.requireExists(req.productId()))) {
            // 예약되지 않은 비상품/세트 SKU의 보상 해제도 재고를 만들지 않고 no-op skip.
            return new ReservationResponse(req.productId(), req.warehouseId(), 0,
                    0, 0, actorUserId);
        }
        Warehouse warehouse = loadWarehouseOrThrow(req.warehouseId());
        StockBalance balance = loadBalanceOrThrow(req.productId(), req.warehouseId());

        // 멱등 가드 — 실제 RESERVE movement 가 없는 referenceId 에 대한 release no-op 처리.
        // 멱등 no-op 예약 라인(alreadyReserved=true)이 compensateReserved 에서 잘못
        // release 되는 경우 또는 보상 release 가 중복 호출되는 경우 reservedQty 음수 방지.
        if (req.referenceType() != null && req.referenceId() != null) {
            boolean hasReserveMovement = stockMovementRepository
                    .findByReferenceTypeAndReferenceIdAndProductIdAndMovementType(
                            req.referenceType(), req.referenceId(),
                            req.productId(), MovementType.RESERVE)
                    .isPresent();
            if (!hasReserveMovement) {
                // 대응하는 RESERVE movement 가 없으므로 no-op 반환 (reservedQty 불변)
                return new ReservationResponse(
                        req.productId(), req.warehouseId(), req.quantity(),
                        balance.getAvailableQty(), balance.getReservedQty(), actorUserId);
            }
        }

        applyWithRetry(() -> balance.release(req.quantity()));

        stockMovementRepository.save(StockMovement.of(
                balance.getId(), req.productId(), warehouse.getId(),
                MovementType.RELEASE, req.quantity(),
                req.referenceType(), req.referenceId(), req.note(), actorUserId));

        return new ReservationResponse(
                req.productId(), req.warehouseId(), req.quantity(),
                balance.getAvailableQty(), balance.getReservedQty(), actorUserId);
    }

    /**
     * FIFO 차감 — received_at ASC 정렬된 가용 lot 들을 순서대로 소진하고,
     * StockBalance 의 available 또는 reserved 도 동시 차감 (총합 = 요청량).
     *
     * <p>각 lot 차감마다 DEDUCT movement 1건씩 기록 (quantityDelta 는 음수).
     * 모든 lot 합계가 요청량 미만이면 차감 시도 전에 즉시 CONFLICT 반환.
     *
     * @param req 차감 요청 (productId / warehouseId / quantity / fromReservation / referenceType / referenceId / note)
     * @param actorUserId 행위자 user-id
     * @return 차감된 lot 들의 (lotId, qty) 리스트 + 차감 후 balance
     * @throws BusinessException(NOT_FOUND) warehouse 또는 balance 가 없을 때
     * @throws BusinessException(CONFLICT) 가용 lot 합계가 요청량보다 작거나, balance 낙관적 락
     *         1회 재시도 후에도 실패할 때
     */
    public DeductionResponse deduct(DeductRequest req, String actorUserId) {
        ProductSummary product = productClient.requireExists(req.productId());
        if (isInventoryExcluded(product)) {
            recordSource(req.sourceContext(), product, SourceOperationOutcome.NO_OP_EXCLUDED, List.of(), List.of());
            return new DeductionResponse(req.productId(), req.warehouseId(), 0, 0, 0, 0, 0, List.of());
        }
        Warehouse warehouse = loadWarehouseOrThrow(req.warehouseId());
        StockBalance balance = loadBalanceOrThrow(req.productId(), req.warehouseId());

        boolean fromReservation = req.fromReservationOrFalse();
        int requested = req.quantity();
        int totalAvailableAcrossLots = sumLotQuantities(req.productId(), req.warehouseId());
        if (totalAvailableAcrossLots < requested) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "재고 부족: 요청 " + requested + ", 가용 " + totalAvailableAcrossLots);
        }

        List<StockLot> lots = stockLotRepository
                .findAvailableLotsForFifo(req.productId(), req.warehouseId());
        List<DeductionResponse.DeductedLotEntry> affected = new ArrayList<>();
        int remaining = requested;
        for (StockLot lot : lots) {
            if (remaining == 0) {
                break;
            }
            int take = Math.min(remaining, lot.getQuantity());
            lot.deduct(take);
            remaining -= take;
            affected.add(new DeductionResponse.DeductedLotEntry(lot.getId(), take));

            stockMovementRepository.save(StockMovement.of(
                    lot.getId(), req.productId(), warehouse.getId(),
                    MovementType.DEDUCT, -take,
                    req.referenceType(), req.referenceId(), req.note(), actorUserId));
        }

        applyWithRetry(() -> balance.deduct(requested, fromReservation));

        recordSource(req.sourceContext(), product, SourceOperationOutcome.APPLIED, List.of(), List.of());
        return new DeductionResponse(
                req.productId(), req.warehouseId(), requested, requested,
                balance.getAvailableQty(), balance.getReservedQty(), balance.getTotalQty(),
                affected);
    }

    private void recordSource(com.samhanair.logis.inventory.web.dto.SourceOperationContext context,
                              ProductSummary product, SourceOperationOutcome outcome,
                              List<UUID> createdLotIds, List<UUID> createdInstanceIds) {
        if (sourceJournalWriter != null) {
            sourceJournalWriter.record(context, product, outcome, createdLotIds, createdInstanceIds);
        }
    }

    /**
     * 실사 조정 — delta 부호에 따라 balance 만 가감하고 ADJUST movement 기록 (lot 단위 분배는 별도 운영 정책).
     * balance 가 없으면 신규 생성 후 적용 (delta 양수 케이스).
     *
     * @param req 조정 요청 (productId / warehouseId / quantityDelta / reason)
     * @param actorUserId 행위자 user-id
     * @return 조정 후 balance 잔량 (DeductionResponse 형식 재사용, affected lot 리스트는 빈 리스트)
     * @throws BusinessException(NOT_FOUND) warehouseId 가 없을 때
     * @throws BusinessException(CONFLICT) 음수 조정으로 가용 재고가 음수가 되거나 낙관적 락 재시도 실패 시
     */
    public DeductionResponse adjust(AdjustRequest req, String actorUserId) {
        if (isInventoryExcluded(productClient.requireExists(req.productId()))) {
            // 비상품/세트 SKU — balance 신규 생성/조정 no-op skip.
            return new DeductionResponse(req.productId(), req.warehouseId(), 0, 0, 0, 0, 0, List.of());
        }
        Warehouse warehouse = loadWarehouseOrThrow(req.warehouseId());
        StockBalance balance = loadOrCreateBalance(req.productId(), warehouse);

        int delta = req.quantityDelta();
        applyWithRetry(() -> balance.adjust(delta));

        // 조정은 단일 가상 lot 으로 movement 기록 (lotId = balance.id 로 대체).
        stockMovementRepository.save(StockMovement.of(
                balance.getId(), req.productId(), warehouse.getId(),
                MovementType.ADJUST, delta,
                "ADJUST", null, req.reason(), actorUserId));

        return new DeductionResponse(
                req.productId(), req.warehouseId(),
                Math.abs(delta), Math.abs(delta),
                balance.getAvailableQty(), balance.getReservedQty(), balance.getTotalQty(),
                List.of());
    }

    /**
     * (productId, warehouseId) 의 AVAILABLE lot 잔량 총합을 반환한다.
     * 차감 사전 검증 + 운영 조회용 read-only.
     *
     * @param productId 제품 UUID
     * @param warehouseId 창고 UUID
     * @return AVAILABLE 상태 lot 들의 quantity 합계 (없으면 0)
     */
    @Transactional(readOnly = true)
    public int sumLotQuantities(UUID productId, UUID warehouseId) {
        return stockLotRepository.findAvailableLotsForFifo(productId, warehouseId).stream()
                .mapToInt(StockLot::getQuantity)
                .sum();
    }

    /** 다중 productId 일괄 잔량 조회 batch 한도 — product-service lookup 한도와 동일. */
    public static final int BALANCE_LOOKUP_BATCH_MAX = 100;

    /**
     * 다중 productId × 모든 창고 잔량 일괄 조회 — Sales Form Polish 슬라이스의 다행 견적 입력용.
     *
     * <p>입력 productId 별로 활성 stock_balance row 를 모두 묶어 반환한다. 입력 순서를 보존하며,
     * 한 번도 입고된 적이 없어 row 가 없는 (productId, warehouse) 조합은 응답에서 제외 (FE 가
     * dash 표시). 가상창고 (VIRTUAL) row 도 포함하되 FE 가 별도 표시 분기.
     *
     * <p>{@link #BALANCE_LOOKUP_BATCH_MAX} 건을 초과하면 INVALID_INPUT. 입력이 null/empty 면
     * INVALID_INPUT — Bean Validation 으로 1차 거르되 서비스 레이어 방어 호출.
     *
     * @param productIds 조회할 제품 UUID 컬렉션 (1 ~ {@value #BALANCE_LOOKUP_BATCH_MAX} 건)
     * @return productId 별 ProductBalanceResponse 리스트 (입력 순서 유지, 모든 입력 ID 포함)
     * @throws BusinessException(INVALID_INPUT) productIds 가 null/empty 또는 batch 한도 초과
     */
    @Transactional(readOnly = true)
    public List<ProductBalanceResponse> findBalancesByProductIds(Collection<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "조회할 제품 ID가 비어있습니다");
        }
        if (productIds.size() > BALANCE_LOOKUP_BATCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 제품 수는 "
                            + BALANCE_LOOKUP_BATCH_MAX + "건입니다");
        }

        // 입력 순서 보존 + 중복 제거 — LinkedHashMap key set 을 그대로 응답 순서로 사용.
        Map<UUID, List<StockBalance>> grouped = new LinkedHashMap<>();
        for (UUID id : productIds) {
            grouped.putIfAbsent(id, new ArrayList<>());
        }

        List<StockBalance> rows = stockBalanceRepository
                .findAllByProductIdInAndIsDeletedFalse(grouped.keySet());
        for (StockBalance row : rows) {
            grouped.get(row.getProductId()).add(row);
        }

        List<ProductBalanceResponse> result = new ArrayList<>(grouped.size());
        grouped.forEach((productId, balances) ->
                result.add(ProductBalanceResponse.of(productId, balances)));
        return result;
    }

    private StockBalance loadBalanceOrThrow(UUID productId, UUID warehouseId) {
        return stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 (제품, 창고) 조합의 재고가 없습니다"));
    }

    private StockBalance loadOrCreateBalance(UUID productId, Warehouse warehouse) {
        return stockBalanceRepository
                .findByProductIdAndWarehouse_IdAndIsDeletedFalse(productId, warehouse.getId())
                .orElseGet(() -> stockBalanceRepository.save(
                        StockBalance.create(productId, warehouse)));
    }

    private Warehouse loadWarehouseOrThrow(UUID id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "창고를 찾을 수 없습니다"));
    }

    /**
     * 재고 제외 품목 여부 — true 면 재고를 생성/차감/조정하지 않고 no-op skip 한다.
     *
     * <p>개발책임자 2026-06-15 결정: inventory 게이트 no-op skip. 비상품을 reject(throw) 하면
     * 전표/주문 전환 루프가 비상품 라인을 inventory 로 보낼 때 전표 전체가 깨지므로(고아 재고),
     * 재고를 만들지 않고 graceful 하게 건너뛴다. 수동 입고도 조용히 no-op.
     *
     * <p>개발책임자 2026-06-19 결정: 세트 SKU({@code productType=BUNDLE}) 자체는 재고 없음.
     * 견적/전표 정상 경로에서는 이미 구성품({@code SINGLE})으로 전개되지만, 수동/직접/이카운트 경로로
     * 세트가 들어와도 비상품과 동일하게 no-op skip 한다.
     */
    private boolean isInventoryExcluded(ProductSummary product) {
        return InventoryProductGate.isExcluded(product);
    }

    /**
     * 낙관적 락 충돌 발생 시 1회 재시도. 도메인 메서드의 IllegalStateException 은 CONFLICT 로 변환.
     */
    private void applyWithRetry(Runnable mutation) {
        try {
            tryApply(mutation);
        } catch (OptimisticLockException | OptimisticLockingFailureException firstFailure) {
            try {
                tryApply(mutation);
            } catch (OptimisticLockException | OptimisticLockingFailureException secondFailure) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "재고 동시 수정 충돌 — 잠시 후 재시도하세요");
            }
        }
    }

    private void tryApply(Runnable mutation) {
        try {
            mutation.run();
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }
}
