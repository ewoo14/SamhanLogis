package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/sales-slips")
@RequiredArgsConstructor
public class SalesAccountingSlipController {

    private final SalesAccountingSlipService service;

    @PostMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT', 'MASTER')")
    public ResponseEntity<SalesAccountingSlipResponse> createDraft(
            @RequestBody CreateSalesAccountingSlipRequest req,
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(service.createDraft(req, userId));
    }

    @PostMapping("/{slipNo}/post")
    @PreAuthorize("hasAnyRole('ACCOUNTANT', 'MASTER')")
    public ResponseEntity<Void> post(@PathVariable String slipNo,
            @RequestHeader("X-User-Id") String userId) {
        service.post(slipNo, userId);
        return ResponseEntity.noContent().build();
    }
}
