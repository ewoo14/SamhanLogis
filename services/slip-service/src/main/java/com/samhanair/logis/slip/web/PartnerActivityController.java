package com.samhanair.logis.slip.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 주문서 접근권한 판정이 읽는 거래처별 마지막 출고일 내부 API. */
@RestController
@RequestMapping("/internal/partner-activity")
@RequiredArgsConstructor
public class PartnerActivityController {

    private final SlipRepository slipRepository;

    /** UUID·전표 상세·개인정보 없이 사업자번호 기준 마지막 출고일만 반환한다. */
    @GetMapping("/{partnerCode}")
    public ApiResponse<ActivityResponse> getLastActivity(
            @PathVariable String partnerCode,
            @RequestParam(required = false) String legacyPartnerCode) {
        LocalDate date = slipRepository.findLastOutboundDateByBusinessNumber(partnerCode);
        if (date == null && legacyPartnerCode != null && !legacyPartnerCode.isBlank()) {
            date = slipRepository.findLastOutboundDateByPartnerOrderCode(legacyPartnerCode);
        }
        return ApiResponse.ok(new ActivityResponse(date == null ? null : date.atStartOfDay()));
    }

    /** 내부 활동 응답 — 거래처코드와 시각만 공개한다. */
    public record ActivityResponse(LocalDateTime lastActivityAt) {}
}
