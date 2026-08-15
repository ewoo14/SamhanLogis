package com.samhanair.logis.accounting.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipAllocationRepository;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 일마감이 allocation으로 연결된 매출전표 posted_at만 읽는 internal endpoint. */
@RestController
@RequestMapping("/internal/sales-accounting-slips")
@RequiredArgsConstructor
public class InternalSalesAccountingSlipController {
    private final SalesAccountingSlipAllocationRepository allocations;

    @GetMapping("/posted-at")
    public ApiResponse<Map<String, LocalDateTime>> postedAt(
            @RequestParam("sourceSlipNo") List<String> sourceSlipNos) {
        Map<String, LocalDateTime> result = new LinkedHashMap<>();
        allocations.findPostedAtBySourceSlipNoIn(sourceSlipNos).forEach(row -> {
            result.putIfAbsent((String) row[0], (LocalDateTime) row[1]);
        });
        return ApiResponse.ok(result);
    }
}
