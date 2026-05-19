package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.PurchaseAccountingSlipService;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.PurchaseAccountingSlipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/purchase-slips")
@RequiredArgsConstructor
public class PurchaseAccountingSlipController {

    private final PurchaseAccountingSlipService service;

    @PostMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT', 'MASTER')")
    public ResponseEntity<PurchaseAccountingSlipResponse> createDraft(
            @RequestBody CreatePurchaseAccountingSlipRequest req,
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
