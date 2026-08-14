package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.AccountingSlipEligibility;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModel;
import com.samhanair.logis.accounting.service.AccountingSlipLinkReadModelService;
import com.samhanair.logis.accounting.web.dto.AccountingSlipLinkEligibilityResponse;
import com.samhanair.logis.accounting.web.dto.OpaqueUuidDeserializer;
import com.samhanair.logis.common.dto.ApiResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 회계전표 연결 read model/eligibility 운영 경로. 사용자 응답에는 UUID를 반환하지 않는다. */
@RestController
@RequestMapping("/accounting/slip-links")
@RequiredArgsConstructor
public class AccountingSlipLinkController {

    private final AccountingSlipLinkReadModelService readModelService;

    /** 원천 전표 연결 상태와 Q1~Q6 연결 가능 여부를 함께 반환한다. */
    @GetMapping("/eligibility")
    public ApiResponse<AccountingSlipLinkEligibilityResponse> eligibility(
            @RequestParam String sourceSlipIdToken,
            @RequestParam String sourceSlipType,
            @RequestParam(defaultValue = "false") boolean dailyAmountVerified,
            @RequestHeader(value = "X-User-Role", required = false) String actorRole) {
        UUID sourceSlipId = OpaqueUuidDeserializer.decode(sourceSlipIdToken);
        AccountingSlipLinkReadModel readModel = readModelService.read(sourceSlipId, sourceSlipType);
        AccountingSlipEligibility eligibility = AccountingSlipEligibility.evaluate(
                readModel, dailyAmountVerified, actorRole);
        return ApiResponse.ok(AccountingSlipLinkEligibilityResponse.of(readModel, eligibility));
    }
}
