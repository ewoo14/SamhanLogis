package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import com.samhanair.logis.accounting.util.DocumentNumberPathResolver;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/sales-slips")
@RequiredArgsConstructor
public class SalesAccountingSlipController {

    private final SalesAccountingSlipService service;

    @GetMapping
    @RequirePermission(page = "accounting.sales-slip.accounting", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
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
    @RequirePermission(page = "accounting.sales-slip.accounting", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    public ResponseEntity<SalesAccountingSlipResponse> createDraft(
            @Valid @RequestBody CreateSalesAccountingSlipRequest req,
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(service.createDraft(req, userId));
    }

    /**
     * 매출전표를 회계 반영한다.
     *
     * @param slipNo 전표번호 path 식별자. URL 단일 세그먼트용 {@code yyyy-MM-dd-N} 하이픈 slug 와
     *               내부 표준 {@code yyyy/MM/dd-N} 를 모두 수용한다.
     * @param userId 처리자 ID
     * @return 204 No Content
     */
    @PostMapping("/{slipNo}/post")
    @RequirePermission(page = "accounting.sales-slip.accounting", action = com.samhanair.logis.security.permission.PermissionAction.UPDATE)
    public ResponseEntity<Void> post(@PathVariable String slipNo,
            @RequestHeader("X-User-Id") String userId) {
        service.post(DocumentNumberPathResolver.toSlashDocumentNo(slipNo), userId);
        return ResponseEntity.noContent().build();
    }

    /** 매출전표와 line/allocation을 연쇄 soft-delete한다. */
    @DeleteMapping("/{slipNo}")
    @RequirePermission(page = "accounting.sales-slip.accounting", action = com.samhanair.logis.security.permission.PermissionAction.DELETE)
    public ResponseEntity<Void> delete(@PathVariable String slipNo,
            @RequestHeader("X-User-Id") String userId) {
        service.delete(DocumentNumberPathResolver.toSlashDocumentNo(slipNo), userId);
        return ResponseEntity.noContent().build();
    }
}
