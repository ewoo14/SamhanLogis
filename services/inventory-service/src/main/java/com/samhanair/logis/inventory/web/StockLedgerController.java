package com.samhanair.logis.inventory.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.inventory.service.StockLedgerResponse;
import com.samhanair.logis.inventory.service.StockLedgerService;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.security.permission.RequirePermission;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 품목 단위 재고수불부 조회 API. */
@RestController
@RequestMapping("/inventory")
@RequiredArgsConstructor
public class StockLedgerController {

    private final StockLedgerService stockLedgerService;

    @GetMapping("/ledger")
    @RequirePermission(page = "inventory.stock-balance", action = PermissionAction.VIEW)
    public ApiResponse<StockLedgerResponse> ledger(
            @RequestParam String productCode,
            @RequestParam(required = false) LocalDate startDate,
            @RequestParam(required = false) LocalDate endDate) {
        LocalDate today = LocalDate.now();
        LocalDate resolvedEnd = endDate == null ? today : endDate;
        LocalDate resolvedStart = startDate == null ? resolvedEnd.withDayOfMonth(1) : startDate;
        return ApiResponse.ok(stockLedgerService.getLedger(productCode, resolvedStart, resolvedEnd),
                "재고수불부 조회 완료");
    }
}
