package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import com.samhanair.logis.accounting.service.PurchaseAccountingSlipService;
import com.samhanair.logis.accounting.web.dto.CreatePurchaseAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.PurchaseAccountingSlipResponse;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/purchase-slips")
@RequiredArgsConstructor
public class PurchaseAccountingSlipController {

    private final PurchaseAccountingSlipService service;

    @GetMapping
    @RequirePermission(page = "accounting.purchase-slip.accounting", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    public ResponseEntity<List<PurchaseAccountingSlipResponse>> list(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false) PurchaseSlipStatus status) {
        return ResponseEntity.ok(service.list(from, to, partnerCode, status));
    }

    @PostMapping
    @RequirePermission(page = "accounting.purchase-slip.accounting", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ResponseEntity<PurchaseAccountingSlipResponse> createDraft(
            @RequestBody CreatePurchaseAccountingSlipRequest req,
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(service.createDraft(req, userId));
    }

    @PostMapping("/{slipNo}/post")
    @RequirePermission(page = "accounting.purchase-slip.accounting", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ResponseEntity<Void> post(@PathVariable String slipNo,
            @RequestHeader("X-User-Id") String userId) {
        service.post(slipNo, userId);
        return ResponseEntity.noContent().build();
    }
}
