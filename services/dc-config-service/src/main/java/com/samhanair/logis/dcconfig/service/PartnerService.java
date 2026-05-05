package com.samhanair.logis.dcconfig.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.repository.PartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 마스터 조회/수정.
 *
 * <p>본 서비스는 owner 책임 (옵션 A) — M2 partner-service 가 internal RPC 로 호출.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PartnerService {

    private final PartnerRepository partnerRepository;

    /**
     * partnerCode 로 단건 조회. 미존재 시 404.
     *
     * @param partnerCode 사용자 노출 식별자
     * @return Partner entity (영속성 컨텍스트)
     * @throws BusinessException NOT_FOUND
     */
    public Partner getByPartnerCode(String partnerCode) {
        return partnerRepository.findByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처를 찾을 수 없습니다: " + partnerCode));
    }
}
