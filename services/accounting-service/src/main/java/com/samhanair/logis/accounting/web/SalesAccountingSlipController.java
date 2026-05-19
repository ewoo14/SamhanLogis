package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/sales-slips")
@RequiredArgsConstructor
public class SalesAccountingSlipController {

    private final SalesAccountingSlipService service;

    @GetMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT', 'MASTER')")
    public ResponseEntity<List<SalesAccountingSlipResponse>> list(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode,
            @RequestParam(required = false) SalesSlipStatus status) {
        return ResponseEntity.ok(service.list(from, to, partnerCode, status));
    }

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
