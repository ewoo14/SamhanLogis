package com.samhanair.logis.dcconfig.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처별 DC 설정 조회.
 *
 * <p>DC 노출 5겹 가드: 본 서비스의 응답은 internal controller 만 사용해야 한다.
 * Public controller 가 본 서비스를 의존성 주입받지 않도록 BE 책임.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DcConfigService {

    private final DcConfigRepository dcConfigRepository;
    private final PartnerService partnerService;

    /**
     * partnerCode 로 DC 설정 조회. 미설정 거래처는 빈 Optional 반환 (404 X — 0% DC 로 처리).
     */
    public Optional<DcConfig> findByPartnerCode(String partnerCode) {
        return dcConfigRepository.findByPartner_PartnerCode(partnerCode);
    }

    /**
     * partnerCode 로 DC 설정 강제 조회 (없으면 404).
     */
    public DcConfig getByPartnerCode(String partnerCode) {
        return dcConfigRepository.findByPartner_PartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DC 설정을 찾을 수 없습니다: " + partnerCode));
    }

    /**
     * Partner 보장 후 DC 설정 조회. (Partner 자체가 미존재면 404, DC 설정만 미존재는 빈 Optional)
     */
    public PartnerWithDc resolveByPartnerCode(String partnerCode) {
        Partner partner = partnerService.getByPartnerCode(partnerCode);
        return new PartnerWithDc(partner,
                dcConfigRepository.findByPartner_Id(partner.getId()).orElse(null));
    }

    /** Partner + (nullable) DcConfig 페어 — internal RPC 응답 빌드용. */
    public record PartnerWithDc(Partner partner, DcConfig dcConfig) {}
}
