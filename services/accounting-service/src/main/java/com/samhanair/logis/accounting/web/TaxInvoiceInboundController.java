package com.samhanair.logis.accounting.web;

import com.samhanair.logis.security.permission.RequirePermission;
import com.samhanair.logis.accounting.service.InboundTaxInvoiceAttachmentService;
import com.samhanair.logis.accounting.service.TaxInvoiceInboundService;
import com.samhanair.logis.accounting.web.dto.InboundTaxInvoiceResponse;
import com.samhanair.logis.accounting.web.dto.RegisterInboundTaxInvoiceRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceSummaryResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(name = "수신 세금계산서", description = "거래처 발행 세금계산서 수신 등록 및 입고전표 매칭")
@RestController
@RequestMapping("/admin/tax-invoices/inbound")
@RequiredArgsConstructor
public class TaxInvoiceInboundController {

    private final TaxInvoiceInboundService inboundService;
    private final InboundTaxInvoiceAttachmentService attachmentService;

    @Operation(summary = "수신 세금계산서 목록 조회",
            description = "INBOUND 세금계산서를 공급일자 기간과 거래처 코드로 필터링합니다.")
    @RequirePermission(page = "accounting.tax-invoice.inbound.manage", action = com.samhanair.logis.security.permission.PermissionAction.VIEW)
    @GetMapping
    public ResponseEntity<List<TaxInvoiceSummaryResponse>> listInbound(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String partnerCode) {
        return ResponseEntity.ok(inboundService.listInbound(from, to, partnerCode));
    }

    @Operation(summary = "수신 세금계산서 등록",
            description = "POSTED 입고전표 N장을 동일 거래처·동일월 기준으로 INBOUND 세금계산서 1장에 연결합니다.")
    @RequirePermission(page = "accounting.tax-invoice.inbound.manage", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @PostMapping
    public ResponseEntity<InboundTaxInvoiceResponse> registerInbound(
            @Valid @RequestBody RegisterInboundTaxInvoiceRequest request,
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(inboundService.registerInbound(request, userId));
    }

    @Operation(summary = "수신 세금계산서 첨부 등록",
            description = "수신 세금계산서 PDF/이미지 메타데이터를 저장합니다. 실 MinIO 업로드는 후속 통합 대상입니다.")
    @RequirePermission(page = "accounting.tax-invoice.inbound.manage", action = com.samhanair.logis.security.permission.PermissionAction.CREATE)
    @PostMapping(value = "/{id}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<InboundTaxInvoiceResponse.AttachmentResponse> uploadAttachment(
            @PathVariable UUID id,
            @RequestParam("file") MultipartFile file,
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(attachmentService.upload(id, file, userId));
    }
}
