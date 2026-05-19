package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import com.samhanair.logis.accounting.domain.SalesAccountingSlipLine;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest.AllocationRequest;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest.LineRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse.AllocationResponse;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse.LineResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class SalesAccountingSlipService {

    private final SalesAccountingSlipRepository slipRepository;
    private final SalesAccountingSlipAllocationRepository allocationRepository;
    private final SlipServiceClient slipServiceClient;
    private final SalesAccountingSlipNumberGenerator numberGenerator;

    public SalesAccountingSlipResponse createDraft(CreateSalesAccountingSlipRequest req, String actorUserId) {
        int attempt = 0;
        while (true) {
            try {
                attempt++;
                return doCreateDraft(req, actorUserId);
            } catch (DataIntegrityViolationException ex) {
                if (attempt >= 2 || !isSlipNoUniqueViolation(ex)) {
                    throw new BusinessException(ErrorCode.SAS_SLIP_NO_CONFLICT,
                            "slipNo 생성 충돌 (attempt=" + attempt + ")", ex);
                }
                log.warn("SalesAccountingSlip slipNo 충돌 retry — attempt={}", attempt);
            }
        }
    }

    private SalesAccountingSlipResponse doCreateDraft(CreateSalesAccountingSlipRequest req, String actorUserId) {
        String slipNo = numberGenerator.next(req.slipDate());
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, req.slipDate(), req.partnerId(), req.partnerCode(),
                req.partnerName(), req.taxType(), req.memo());

        int lineNo = 0;
        for (LineRequest lr : req.lines()) {
            if (lr.allocations() == null || lr.allocations().isEmpty()) {
                throw new BusinessException(ErrorCode.SAS_LINE_AMOUNT_MISMATCH,
                        "매출전표 line allocation 이 비어 있습니다");
            }
            lineNo++;
            VatCalculator.Result vat = VatCalculator.split(lr.qty(), lr.unitPrice(), req.taxType());
            SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                    slip, lineNo, lr.productCode(), lr.productName(),
                    lr.qty(), lr.unitPrice(),
                    vat.supplyAmount(), vat.vatAmount(), vat.lineTotal());
            slip.getLines().add(line);

            for (AllocationRequest ar : lr.allocations()) {
                verifySourceAndAllocation(ar);
                line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                        ar.sourceSlipId(), ar.sourceSlipNo(),
                        ar.sourceLineId(), ar.sourceLineNo(),
                        ar.allocatedQty(), ar.allocatedAmount()));
            }
        }

        slip.recalcTotals();
        slipRepository.save(slip);
        return toResponse(slip);
    }

    private boolean isSlipNoUniqueViolation(DataIntegrityViolationException ex) {
        Throwable cause = ex.getMostSpecificCause();
        return cause != null && cause.getMessage() != null
                && cause.getMessage().contains("slip_no");
    }

    public void post(String slipNo, String actorUserId) {
        SalesAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "매출전표 없음: " + slipNo));
        slip.post(actorUserId);
    }

    private void verifySourceAndAllocation(AllocationRequest ar) {
        SlipLineSnapshot src = slipServiceClient.getSlipLine(ar.sourceLineId());
        if (!"CONFIRMED".equals(src.slipStatus())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED,
                    "(slip=" + src.slipNo() + " 상태=" + src.slipStatus() + ", CONFIRMED 요구)");
        }
        BigDecimal already = allocationRepository.sumAllocatedAmountBySourceLineIdLocked(ar.sourceLineId());
        BigDecimal next = already.add(ar.allocatedAmount());
        if (next.compareTo(src.lineTotal()) > 0) {
            throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION,
                    "(slip=" + src.slipNo() + " 잔여를 초과: 요청=" + ar.allocatedAmount()
                            + ", 잔여=" + src.lineTotal().subtract(already) + ")");
        }
    }

    private SalesAccountingSlipResponse toResponse(SalesAccountingSlip s) {
        List<LineResponse> lines = s.getLines().stream().map(l -> new LineResponse(
                l.getLineNo(), l.getProductCode(), l.getProductName(),
                l.getQty(), l.getUnitPrice(),
                l.getSupplyAmount(), l.getVatAmount(), l.getLineTotal(),
                l.getAllocations().stream().map(a -> new AllocationResponse(
                        a.getSourceSlipNo(), a.getSourceLineNo(),
                        a.getAllocatedQty(), a.getAllocatedAmount())).toList()
        )).toList();
        return new SalesAccountingSlipResponse(s.getSlipNo(), s.getSlipDate(),
                s.getPartnerCode(), s.getPartnerName(), s.getTaxType().name(), s.getStatus().name(),
                s.getTotalSupplyAmount(), s.getTotalVatAmount(), s.getTotalAmount(),
                s.getMemo(), lines);
    }
}
