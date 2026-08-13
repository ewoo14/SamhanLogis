package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.repository.SourceOperationJournalRepository;
import com.samhanair.logis.inventory.repository.StockInstanceRepository;
import com.samhanair.logis.inventory.repository.StockLotRepository;
import com.samhanair.logis.inventory.web.dto.RevertabilityEvidenceResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 되돌림 S1 preflight 전용 읽기 endpoint. 상태·재고·journal을 변경하지 않는다. */
@RestController
@RequestMapping("/internal/inventory/revertability")
@RequiredArgsConstructor
public class InternalRevertabilityController {
    private final SourceOperationJournalRepository journalRepository;
    private final StockLotRepository lotRepository;
    private final StockInstanceRepository instanceRepository;

    @GetMapping
    @PreAuthorize("hasRole('MASTER')")
    public ApiResponse<RevertabilityEvidenceResponse> get(@RequestParam UUID slipId,
                                                          @RequestParam String slipNo) {
        long lots = lotRepository.countByLotNoAndIsDeletedFalse(slipNo);
        long instances = instanceRepository.countByInboundSlipNoAndIsDeletedFalse(slipNo)
                + instanceRepository.countByOutboundSlipNoAndIsDeletedFalse(slipNo);
        return ApiResponse.ok(new RevertabilityEvidenceResponse(
                lots + instances, journalRepository.countBySlipIdAndIsDeletedFalse(slipId)));
    }
}
