package com.samhanair.logis.partnerorder.web;

import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 주문서 접근권한 판정이 읽는 거래처별 마지막 주문 확정 시각 내부 API. */
@RestController
@RequestMapping("/internal/partner-activity")
@RequiredArgsConstructor
public class PartnerActivityController {

    private final PartnerOrderRepository partnerOrderRepository;

    /** UUID·주문 상세·개인정보 없이 마지막 주문 확정 시각만 반환한다. */
    @GetMapping("/{partnerCode}")
    public ApiResponse<ActivityResponse> getLastActivity(@PathVariable String partnerCode) {
        return ApiResponse.ok(new ActivityResponse(
                partnerOrderRepository.findLastConfirmedAtByPartnerCode(partnerCode)));
    }

    /** 내부 활동 응답 — 거래처코드와 시각만 공개한다. */
    public record ActivityResponse(LocalDateTime lastActivityAt) {}
}
