package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.vendor.client.PartnerLookupClient;
import com.samhanair.logis.partnerorder.vendor.client.PartnerSummary;
import java.util.UUID;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 주문 생성 시 거래처 표시 snapshot을 내부 거래처 UUID로 해석한다.
 *
 * <p>partnerCode는 soft-delete 후 재사용될 수 있으므로 주문 생성 시점의 활성 거래처 lookup 결과를
 * 함께 저장해야 한다. 코드/사업자번호 오류는 400으로, partner-service 장애는 502로 구분해
 * 주문 생성을 거부한다.
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
        validateInput(partnerCode, bizCode);
        PartnerSummary summary = lookupSummary(partnerCode);
        boolean codeFallback = partnerCode.trim().equals(bizCode.trim())
                && partnerCode.trim().equals(summary.partnerCode());
        if (summary.partnerId() == null
                || !partnerCode.trim().equals(summary.partnerCode())
                || (!codeFallback && (summary.businessNo() == null || summary.businessNo().isBlank()
                || !sameBusinessNumber(bizCode, summary.businessNo())))) {
            throw unresolved(partnerCode);
        }
        return summary.partnerId();
    }

    private void validateInput(String partnerCode, String bizCode) {
        if (partnerCode == null || partnerCode.isBlank()
                || bizCode == null || bizCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "거래처 정체성 확인에 필요한 코드와 사업자번호가 없습니다");
        }
    }

    private PartnerSummary lookupSummary(String partnerCode) {
        try {
            Optional<PartnerSummary> result = partnerLookupClient
                    .findByPartnerCodeForIdentity(partnerCode.trim());
            // @MockBean/구버전 client가 null을 반환해도 실제 입력 오류처럼 안전하게 차단한다.
            if (result == null || result.isEmpty()) {
                throw unresolved(partnerCode);
            }
            return result.get();
        } catch (PartnerLookupClient.PartnerLookupUnavailableException ex) {
            // I6 결정: I5의 "생성 시점 UUID 저장"을 포기한 채 주문을 만들면 이후 전표 귀속을
            // 추정해야 한다. 따라서 장애 중에는 생성/legacy 보정을 fail-closed하고 400 대신
            // 502를 반환한다. 사용자는 입력을 고치는 대신 partner-service 복구 후 재시도한다.
            throw new BusinessException(ErrorCode.PARTNER_IDENTITY_LOOKUP_UNAVAILABLE,
                    "거래처 서비스에서 정체성을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.", ex);
        }
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
