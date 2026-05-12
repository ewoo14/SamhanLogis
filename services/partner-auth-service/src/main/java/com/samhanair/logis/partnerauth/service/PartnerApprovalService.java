package com.samhanair.logis.partnerauth.service;

import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalResponse;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalStatus;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.Collection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 데스크탑 영업 "주문서 승인" 화면(`/sales/order-approvals`) 백엔드 서비스.
 *
 * <p>외부 6종 status({@link PartnerApprovalStatus}) ↔ 내부 10종({@link PartnerStatus}) 매핑은
 * {@link PartnerApprovalStatus#fromInternal}/{@link PartnerApprovalStatus#toInternal} 참고.
 *
 * <p>임시 비밀번호 발급에 사용하는 placeholder hash 는 본 서비스 단에서는 "{noop}TEMP-RESET"
 * 으로 마킹하여 거래처 다음 접속 시 NEED_PW_SET 흐름이 발동되도록 한다. 운영용 임시 비밀번호
 * SMS/이메일 발송 연동은 backlog (Phase 11 partner-auth 통합 흐름).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class PartnerApprovalService {

    private final PartnerAuthRepository partnerAuthRepository;

    @Transactional(readOnly = true)
    public Page<PartnerApprovalResponse> list(PartnerApprovalStatus status, Pageable pageable) {
        Page<PartnerAuth> page;
        if (status == null) {
            page = partnerAuthRepository.findAllByOrderByCreatedAtDesc(pageable);
        } else {
            page = partnerAuthRepository.findByStatusInOrderByCreatedAtDesc(
                    toInternalGroup(status), pageable);
        }
        return page.map(PartnerApprovalResponse::from);
    }

    public PartnerApprovalResponse updateStatus(String partnerCode, PartnerApprovalStatus next) {
        PartnerAuth pa = partnerAuthRepository.findByBizNo(partnerCode)
                .orElseThrow(() -> new EntityNotFoundException("PartnerAuth not found: " + partnerCode));

        switch (next) {
            case APPROVED -> {
                // PENDING 에서만 approvePending 가능 — 다른 상태에서는 직접 NEED_PW_INPUT 으로 마킹.
                if (pa.getStatus() == PartnerStatus.PENDING) {
                    pa.approvePending();
                } else if (pa.getStatus() == PartnerStatus.LOCKED) {
                    pa.unlock();
                }
                // 그 외 상태에서는 변경 없음 (예: 이미 APPROVED 와 매핑되는 NEED_PW_INPUT/OK)
            }
            case ACCESS_DENIED -> pa.denyAccess();
            case PASSWORD_RESET_PENDING -> pa.issueTempPassword("{noop}TEMP-RESET");
            case LONG_PENDING -> pa.markLongUnused();
            case UNAPPROVED, PASSWORD_ERROR -> {
                // 영업자 화면에서 직접 토글 가능하지만, UNAPPROVED/PASSWORD_ERROR 는 시스템이 진입시키는 상태.
                // 안전을 위해 진입은 허용하지 않고 현재 상태 유지 (no-op).
            }
        }
        return PartnerApprovalResponse.from(pa);
    }

    public PartnerApprovalResponse resetPassword(String partnerCode) {
        PartnerAuth pa = partnerAuthRepository.findByBizNo(partnerCode)
                .orElseThrow(() -> new EntityNotFoundException("PartnerAuth not found: " + partnerCode));
        pa.issueTempPassword("{noop}TEMP-RESET");
        return PartnerApprovalResponse.from(pa);
    }

    /** 외부 6종 → 내부 10종 그룹 — list filter 용. */
    private static Collection<PartnerStatus> toInternalGroup(PartnerApprovalStatus s) {
        return switch (s) {
            case UNAPPROVED -> List.of(PartnerStatus.PENDING, PartnerStatus.NOT_FOUND_AUTH);
            case APPROVED -> List.of(PartnerStatus.NEED_PW_INPUT, PartnerStatus.OK);
            case PASSWORD_RESET_PENDING -> List.of(PartnerStatus.NEED_PW_SET);
            case PASSWORD_ERROR -> List.of(PartnerStatus.LOCKED, PartnerStatus.PW_EXPIRED);
            case ACCESS_DENIED -> List.of(PartnerStatus.ACCESS_DENIED);
            case LONG_PENDING -> List.of(PartnerStatus.LONG_UNUSED);
        };
    }
}
