package com.samhanair.logis.partnerauth.service;

import com.samhanair.logis.partnerauth.client.DcConfigClient;
import com.samhanair.logis.partnerauth.client.PartnerConfigDto;
import com.samhanair.logis.partnerauth.domain.PartnerAuth;
import com.samhanair.logis.partnerauth.domain.PartnerStatus;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalResponse;
import com.samhanair.logis.partnerauth.dto.PartnerApprovalStatus;
import com.samhanair.logis.partnerauth.repository.PartnerAuthRepository;
import jakarta.persistence.EntityNotFoundException;
import java.util.Collection;
import java.util.List;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
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
@Transactional
public class PartnerApprovalService {

    private final PartnerAuthRepository partnerAuthRepository;
    /**
     * 4a backlog — dc-config-service 의 Partner.name 을 가져와 partnerName 컬럼을 채운다.
     * resolve 실패 시 PartnerApprovalResponse 는 partnerCode 폴백.
     */
    private final DcConfigClient dcConfigClient;
    private final PartnerActivityReader partnerActivityReader;

    /** 주문·출고 활동 조회를 주입받아 로그인 시각과 판정 기준을 분리한다. */
    @Autowired
    public PartnerApprovalService(PartnerAuthRepository partnerAuthRepository,
                                  DcConfigClient dcConfigClient,
                                  PartnerActivityReader partnerActivityReader) {
        this.partnerAuthRepository = partnerAuthRepository;
        this.dcConfigClient = dcConfigClient;
        this.partnerActivityReader = partnerActivityReader;
    }

    @Transactional(readOnly = true)
    public Page<PartnerApprovalResponse> list(PartnerApprovalStatus status, Pageable pageable) {
        Page<PartnerAuth> page;
        if (status == null) {
            page = partnerAuthRepository.findAllByOrderByCreatedAtDesc(pageable);
        } else {
            page = partnerAuthRepository.findByStatusInOrderByCreatedAtDesc(
                    toInternalGroup(status), pageable);
        }
        return page.map(this::buildResponse);
    }

    /**
     * 주문서 앱 접근권한 설정의 장기미사용 후보 미리보기.
     *
     * <p>장기미발주는 로그인·비밀번호 시각이 아니라 주문·출고 활동 시각을 기준으로
     * 레거시 30일을 적용한다. 비밀번호 재설정 자체의 시각 기준은 이 메서드에 섞지 않는다.
     *
     * @param unusedDays 레거시 API 호환용 입력(판정은 항상 30일)
     * @return 사람이 확인할 거래처 후보
     */
    @Transactional(readOnly = true)
    public List<PartnerApprovalResponse> previewLongUnused(int unusedDays) {
        LocalDateTime now = LocalDateTime.now();
        return partnerAuthRepository.findAll().stream()
                .filter(pa -> pa.getStatus() == PartnerStatus.NEED_PW_INPUT
                        || pa.getStatus() == PartnerStatus.OK
                        || pa.getStatus() == PartnerStatus.LONG_UNUSED)
                .filter(pa -> {
                    PartnerActivity activity = partnerActivityReader.read(pa.getPartnerCode());
                    return PartnerAccessPolicy.isPreviewCandidate(pa, activity, now);
                })
                .map(this::buildResponse)
                .toList();
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
                } else if (pa.getStatus() == PartnerStatus.LONG_UNUSED) {
                    pa.restoreFromLongUnused();
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
        return buildResponse(pa);
    }

    public PartnerApprovalResponse resetPassword(String partnerCode) {
        PartnerAuth pa = partnerAuthRepository.findByBizNo(partnerCode)
                .orElseThrow(() -> new EntityNotFoundException("PartnerAuth not found: " + partnerCode));
        pa.issueTempPassword("{noop}TEMP-RESET");
        return buildResponse(pa);
    }

    /**
     * 4a 마무리 (manager 잔여 항목 포함) — dc-config-service 의 Partner 정보 RPC 한 번으로
     * partnerName + assignedManagerName 둘 다 resolve.
     *
     * <p>{@link DcConfigClient} 가 dc-config Partner.manager(legacy CSV '담당자') 를
     * {@code PartnerConfigDto.managerName} 으로 매핑해온다. 본 메서드는 이를 그대로 활용해
     * 영업담당자명을 채운다 (사내 user-service 조직도 lookup 은 추후 backlog).
     *
     * <p>장애 / 미존재 / 토큰 오류 모두 {@link DcConfigClient} 가 {@code Optional.empty()}
     * 로 dampen 하므로, resolve 실패 시 두 필드 모두 null/폴백.
     */
    private PartnerApprovalResponse buildResponse(PartnerAuth pa) {
        PartnerConfigDto cfg = dcConfigClient.findByBizNo(pa.getBizNo()).orElse(null);
        String name = (cfg == null) ? null : trimToNull(cfg.partnerName());
        String manager = (cfg == null) ? null : trimToNull(cfg.managerName());
        return PartnerApprovalResponse.from(pa, name, manager);
    }

    private static String trimToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
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
