package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.ProductClient;
import com.samhanair.logis.inventory.client.ProductSummary;
import com.samhanair.logis.inventory.domain.MovementType;
import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockMovement;
import com.samhanair.logis.inventory.domain.StockScanEvent;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.repository.StockMovementRepository;
import com.samhanair.logis.inventory.repository.StockScanEventRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 전표 귀속 QR 시리얼 입출고 — 검증·상태전이·정본 수불·스캔감사를 한 트랜잭션으로 처리한다. */
@Service
@RequiredArgsConstructor
public class StockInstanceScanService {

    private final StockInstanceRepository instanceRepository;
    private final StockMovementRepository movementRepository;
    private final StockScanEventRepository scanEventRepository;
    private final SlipScanReferenceResolver slipResolver;
    private final ProductClient productClient;

    /**
     * 전표와 스캔 목록 전체를 검증한 뒤 성공할 때만 일괄 반영한다.
     *
     * @param request 전표번호·방향·시리얼키/품목코드 목록
     * @return 반영된 사용자 식별자 목록
     * @throws BusinessException 전표/품목/상태/중복/존재 검증 실패
     */
    @Transactional
    public StockScanResponse scan(StockScanRequest request) {
        validateRequest(request);
        SlipScanReference slip = slipResolver.resolve(request.slipNo(), request.direction());
        if (slip.direction() != request.direction()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "선택한 전표 유형과 스캔 동작이 일치하지 않습니다.");
        }
        Set<String> serialKeys = new HashSet<>();
        List<StockInstance> instances = new ArrayList<>();
        for (StockScanItem item : request.items()) {
            if (!serialKeys.add(item.serialKey())) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "중복 스캔입니다: " + item.serialKey());
            }
            if (!slip.productCodes().contains(item.productCode())) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "품목코드가 전표와 일치하지 않습니다: " + item.productCode());
            }
            ProductSummary product = productClient.requireExistsByCode(item.productCode());
            if (!product.serialManaged()) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "부자재 등 개별시리얼 관리 대상이 아닌 품목은 QR 스캔할 수 없습니다: "
                                + item.productCode());
            }
            StockInstance instance = instanceRepository.findBySerialKeyForUpdate(item.serialKey())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                            "시리얼키를 찾을 수 없습니다: " + item.serialKey()));
            if (!instance.getProductCode().equals(item.productCode())) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "스캔한 개체의 품목코드가 요청과 일치하지 않습니다: " + item.productCode());
            }
            validateState(request.direction(), instance, item.serialKey());
            instances.add(instance);
        }

        for (StockInstance instance : instances) {
            if (request.direction() == StockScanDirection.INBOUND) {
                instance.receiveIntoSlip(request.slipNo());
            } else {
                instance.ship(slip.partnerCode(), request.slipNo(), LocalDateTime.now());
            }
        }
        instanceRepository.saveAll(instances);
        movementRepository.saveAll(instances.stream()
                .map(instance -> movement(instance, slip, request.direction()))
                .toList());
        scanEventRepository.saveAll(instances.stream()
                .map(instance -> StockScanEvent.of(slip.slipId(), slip.slipNo(),
                        instance.getSerialKey(), instance.getProductCode(), request.direction()))
                .toList());
        return new StockScanResponse(slip.slipNo(), request.direction(), request.items());
    }

    private void validateRequest(StockScanRequest request) {
        if (request == null || request.slipNo() == null || request.slipNo().isBlank()
                || request.direction() == null || request.items() == null || request.items().isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "전표번호, 스캔 방향, 스캔 목록은 필수입니다.");
        }
        for (StockScanItem item : request.items()) {
            if (item == null || item.serialKey() == null || item.serialKey().isBlank()
                    || item.productCode() == null || item.productCode().isBlank()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "시리얼키와 품목코드는 필수입니다.");
            }
        }
    }

    private void validateState(StockScanDirection direction, StockInstance instance, String serialKey) {
        if (direction == StockScanDirection.INBOUND && instance.getInboundSlipNo() != null) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 입고 처리된 개체입니다: " + serialKey);
        }
        if (direction == StockScanDirection.OUTBOUND
                && instance.getStatus() == com.samhanair.logis.inventory.domain.StockInstanceStatus.SHIPPED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 출고된 개체입니다: " + serialKey);
        }
    }

    private StockMovement movement(StockInstance instance, SlipScanReference slip,
                                   StockScanDirection direction) {
        boolean inbound = direction == StockScanDirection.INBOUND;
        return StockMovement.of(instance.getId(), instance.getProductId(), instance.getWarehouseId(),
                inbound ? MovementType.INBOUND : MovementType.DEDUCT,
                inbound ? 1 : -1,
                inbound ? "INBOUND" : "SLIP", slip.slipId(),
                inbound ? "serial scan inbound" : "serial scan outbound", "system");
    }
}
