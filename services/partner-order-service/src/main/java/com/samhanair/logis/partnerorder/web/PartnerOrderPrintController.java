package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.partnerorder.service.PartnerOrderPrintService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 거래처 주문 인쇄 HTML endpoint.
 */
@RestController
@RequestMapping("/api/v1/partner-orders")
@RequiredArgsConstructor
public class PartnerOrderPrintController {

    private final PartnerOrderPrintService printService;

    /**
     * 주문번호 또는 내부 UUID 문자열로 A4 인쇄 HTML 을 반환한다.
     */
    @Operation(summary = "거래처 주문 인쇄 HTML",
            description = "브라우저 새 탭에서 바로 인쇄 가능한 A4 주문서 HTML 을 반환합니다.")
    @GetMapping(value = "/{id}/print", produces = MediaType.TEXT_HTML_VALUE + ";charset=UTF-8")
    @PreAuthorize("hasAnyRole('SALES','MANAGER','MASTER','PARTNER')")
    public String print(
            @PathVariable String id,
            @RequestHeader(value = HttpHeaderConstants.PARTNER_CODE_HEADER, required = false) String partnerCode) {
        return printService.renderPrintHtml(id, partnerCode);
    }
}
