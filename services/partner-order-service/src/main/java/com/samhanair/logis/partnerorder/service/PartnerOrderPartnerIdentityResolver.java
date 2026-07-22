package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 주문 생성 시 거래처 표시 snapshot을 내부 거래처 UUID로 해석한다.
 *
 * <p>partnerCode는 soft-delete 후 재사용될 수 있으므로 주문 생성 시점의 활성 거래처 lookup 결과를
 * 함께 저장해야 한다. lookup 실패나 코드/사업자번호 불일치는 fail-soft하지 않고 주문 생성을 거부한다.
 */
@Component
@RequiredArgsConstructor
public class PartnerOrderPartnerIdentityResolver {

    private final PartnerLookupClient partnerLookupClient;

    /**
     * 현재 활성 거래처의 UUID를 확인한다.
     *
     * @param partnerCode 주문 표시 거래처 코드
     * @param bizCode 주문 표시 사업자번호
     * @return 주문에 저장할 거래처 UUID
     * @throws BusinessException 거래처 lookup 실패, UUID 누락, 코드/사업자번호 불일치
     */
    public UUID requirePartnerId(String partnerCode, String bizCode) {
        if (partnerCode == null || partnerCode.isBlank()
                || bizCode == null || bizCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거래처 정체성 확인에 필요한 코드와 사업자번호가 없습니다");
        }

        PartnerSummary summary = partnerLookupClient.findByPartnerCode(partnerCode.trim())
                .orElseThrow(() -> unresolved(partnerCode));
        if (summary.partnerId() == null
                || !partnerCode.trim().equals(summary.partnerCode())
                || (summary.businessNo() != null
                && !sameBusinessNumber(bizCode, summary.businessNo()))) {
            throw unresolved(partnerCode);
        }
        return summary.partnerId();
    }

    private BusinessException unresolved(String partnerCode) {
        return new BusinessException(ErrorCode.INVALID_INPUT,
                "거래처 정체성을 확인할 수 없습니다. 거래처 코드와 사업자번호를 확인해 주세요: "
                        + partnerCode);
    }

    /** 하이픈 포함 여부만 다른 사업자번호 표현은 같은 snapshot 값으로 취급한다. */
    private boolean sameBusinessNumber(String left, String right) {
        return normalizeBusinessNumber(left).equals(normalizeBusinessNumber(right));
    }

    private String normalizeBusinessNumber(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }
}
