package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.PurchaseAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.repository.PurchaseAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기존 slip-service 원천 snapshot과 회계전표 allocation을 한 계약으로 합치는 조회 서비스.
 *
 * <p>UUID는 서비스 간 내부 조회 키로만 사용하고 반환 모델에는 전표번호를 사용한다.
 */
@Service
@RequiredArgsConstructor
public class AccountingSlipLinkReadModelService {

    private final SlipServiceClient slipServiceClient;
    private final SalesAccountingSlipAllocationRepository salesAllocationRepository;
    private final PurchaseAccountingSlipAllocationRepository purchaseAllocationRepository;

    /** 원천 전표 한 건의 연결 상태·금액을 조회한다. */
    @Transactional(readOnly = true)
    public AccountingSlipLinkReadModel read(UUID sourceSlipId, String sourceSlipType) {
        List<SlipLineSnapshot> sourceLines = slipServiceClient.getSlipLines(sourceSlipId);
        BigDecimal sourceAmount = sourceLines.stream()
                .map(SlipLineSnapshot::lineTotal)
                .filter(value -> value != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal allocatedAmount = BigDecimal.ZERO;
        BigDecimal allocatedQuantity = BigDecimal.ZERO;
        Map<String, AccountingSlipLinkReadModel.LinkedSlip> linked = new LinkedHashMap<>();
        String sourceSlipNo = sourceLines.isEmpty() ? null : sourceLines.get(0).slipNo();
        String sourceSlipStatus = sourceLines.isEmpty() ? null : sourceLines.get(0).slipStatus();
        String sourcePartnerCode = sourceLines.isEmpty() ? null : sourceLines.get(0).partnerCode();
        if ("OUTBOUND".equals(sourceSlipType)) {
            for (SalesAccountingSlipAllocation allocation
                    : salesAllocationRepository.findActiveBySourceSlipId(sourceSlipId)) {
                allocatedAmount = allocatedAmount.add(allocation.getAllocatedAmount());
                allocatedQuantity = allocatedQuantity.add(allocation.getAllocatedQty());
                var slip = allocation.getSalesSlipLine().getSlip();
                linked.putIfAbsent(slip.getSlipNo(), new AccountingSlipLinkReadModel.LinkedSlip(
                        slip.getSlipNo(), slip.getStatus().name(), slip.getTotalAmount()));
            }
        } else if ("INBOUND".equals(sourceSlipType)) {
            for (PurchaseAccountingSlipAllocation allocation
                    : purchaseAllocationRepository.findActiveBySourceSlipId(sourceSlipId)) {
                allocatedAmount = allocatedAmount.add(allocation.getAllocatedAmount());
                allocatedQuantity = allocatedQuantity.add(allocation.getAllocatedQty());
                var slip = allocation.getPurchaseSlipLine().getSlip();
                linked.putIfAbsent(slip.getSlipNo(), new AccountingSlipLinkReadModel.LinkedSlip(
                        slip.getSlipNo(), slip.getStatus().name(), slip.getTotalAmount()));
            }
        } else {
            throw new IllegalArgumentException("sourceSlipType은 OUTBOUND 또는 INBOUND여야 합니다");
        }
        return new AccountingSlipLinkReadModel(sourceSlipNo, sourceSlipType, sourceSlipStatus,
                sourcePartnerCode, sourceAmount, allocatedAmount, allocatedQuantity, List.copyOf(linked.values()),
                sourceAmount.compareTo(allocatedAmount) == 0);
    }
}
