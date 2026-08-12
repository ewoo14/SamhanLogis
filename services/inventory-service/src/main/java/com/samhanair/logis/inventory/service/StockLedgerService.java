package com.samhanair.logis.inventory.service;

import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.client.SlipClient;
import com.samhanair.logis.inventory.client.SlipDetail;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockMovement;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 품목 전체의 물리 입출고 흐름을 재고수불부 행으로 계산한다. */
@Service
@RequiredArgsConstructor
public class StockLedgerService {

    private static final String COMPANY_NAME = "(주)삼한공조시스템";

    private final ProductClient productClient;
    private final StockMovementRepository movementRepository;
    private final WarehouseRepository warehouseRepository;
    private final SlipClient slipClient;

    @Transactional(readOnly = true)
    public StockLedgerResponse getLedger(String productCode, LocalDate startDate, LocalDate endDate) {
        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("재고수불부 기간이 올바르지 않습니다.");
        }
        ProductSummary product = productClient.requireExistsByCode(productCode);
        List<StockMovement> movements = movementRepository
                .findAllByProductIdOrderByOccurredAtAsc(product.id()).stream()
                .filter(this::isPhysicalMovement)
                .toList();
        Map<UUID, Warehouse> warehouses = movements.stream()
                .map(StockMovement::getWarehouseId)
                .distinct()
                .map(warehouseRepository::findById)
                .flatMap(java.util.Optional::stream)
                .collect(Collectors.toMap(Warehouse::getId, Function.identity()));

        LocalDateTime from = startDate.atStartOfDay();
        LocalDateTime until = endDate.plusDays(1).atStartOfDay();
        int opening = movements.stream()
                .filter(m -> m.getOccurredAt().isBefore(from))
                .mapToInt(StockMovement::getQuantityDelta)
                .sum();
        int balance = opening;
        int totalInbound = 0;
        int totalOutbound = 0;
        List<StockLedgerRow> rows = new java.util.ArrayList<>();
        for (StockMovement movement : movements) {
            if (movement.getOccurredAt().isBefore(from) || !movement.getOccurredAt().isBefore(until)) {
                continue;
            }
            int delta = movement.getQuantityDelta();
            int inbound = delta > 0 ? delta : 0;
            int outbound = delta < 0 ? Math.abs(delta) : 0;
            balance += delta;
            totalInbound += inbound;
            totalOutbound += outbound;
            rows.add(toRow(movement, product, warehouses.get(movement.getWarehouseId()), inbound, outbound, balance));
        }
        return new StockLedgerResponse(COMPANY_NAME, startDate, endDate,
                firstNonBlank(product.name(), product.modelName(), productCode), productCode,
                opening, totalInbound, totalOutbound, balance, rows);
    }

    private boolean isPhysicalMovement(StockMovement movement) {
        return switch (movement.getMovementType()) {
            case INBOUND, DEDUCT, TRANSFER_IN, TRANSFER_OUT, ADJUST -> true;
            case RESERVE, RELEASE -> false;
        };
    }

    private StockLedgerRow toRow(StockMovement movement, ProductSummary product, Warehouse warehouse,
                                int inbound, int outbound, int balance) {
        String note = movement.getNote() == null ? "" : movement.getNote();
        String tag = null;
        String description = note;
        for (String candidate : List.of("지방", "야적")) {
            String prefix = candidate + "/";
            if (note.startsWith(prefix)) {
                tag = candidate;
                description = note.substring(prefix.length());
                break;
            }
        }
        SlipDetail slip = resolveSlip(movement);
        String slipNo = slip == null ? null : slip.slipNo();
        String descriptionToShow = slipNo == null ? description : slipNo;
        String partnerToShow = slip == null || slip.partnerName() == null ? "" : slip.partnerName();
        return new StockLedgerRow(movement.getOccurredAt().toLocalDate(),
                firstNonBlank(product.name(), product.modelName(), product.productCode()),
                product.productCode(), warehouse == null ? "" : warehouse.getName(), partnerToShow,
                descriptionToShow, tag, inbound, outbound, balance, false,
                slipNo, slip == null ? null : slip.slipType());
    }

    /** reference_id 는 내부에서만 slip-service 상세로 해석하고 사용자 계약에는 slipNo 만 남긴다. */
    private SlipDetail resolveSlip(StockMovement movement) {
        if (movement.getReferenceId() == null || movement.getReferenceType() == null) return null;
        if (!("INBOUND".equals(movement.getReferenceType()) || "SLIP".equals(movement.getReferenceType()))) {
            return null;
        }
        try {
            return slipClient.getSlip(movement.getReferenceId());
        } catch (RuntimeException ignored) {
            // 주소/QA 잔재 등 해석 불가 행은 링크 없이 원래 적요를 유지한다.
            return null;
        }
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }
}
