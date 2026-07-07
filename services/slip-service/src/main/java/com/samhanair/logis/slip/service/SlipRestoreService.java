package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.realtime.SlipListRealtime;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 판매전표 목록 soft-delete 복원 서비스 (E2). */
@Service
@RequiredArgsConstructor
public class SlipRestoreService {

    private final SlipRepository slipRepository;
    private final CollectionRealtimePublisher collectionRealtimePublisher;

    /**
     * soft-deleted 전표를 복원한다.
     *
     * <p>동일 {@code slipType + slipNo} 활성행이 이미 있으면 partial unique 위반 전에 409 로 차단한다.
     *
     * @param slipId 복원 대상 slip UUID
     * @return 복원된 전표
     */
    @Transactional
    public Slip restore(UUID slipId) {
        Slip slip = slipRepository.findByIdIncludingDeleted(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다."));
        // deleteForSales 의 OUTBOUND 타입가드와 대칭 — 복원도 판매전표(OUTBOUND) 전용.
        // sales.slip.list RESTORE 권한만으로 INBOUND(구매) 전표를 UUID 로 복원하는 최소권한 우회를 차단.
        if (slip.getSlipType() != com.samhanair.logis.slip.domain.SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다.");
        }
        if (!Boolean.TRUE.equals(slip.getIsDeleted())) {
            slip.getLines().size();
            return slip;
        }
        if (slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(slip.getSlipType(), slip.getSlipNo()).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 같은 전표번호의 활성 전표가 존재하여 복원할 수 없습니다: " + slip.getSlipNo());
        }
        try {
            slip.markRestoredWithNameCleared();
            Slip saved = slipRepository.saveAndFlush(slip);
            saved.getLines().size();
            publishListChanged("RESTORED");
            return saved;
        } catch (DataIntegrityViolationException ex) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 같은 전표번호의 활성 전표가 존재하여 복원할 수 없습니다: " + slip.getSlipNo());
        }
    }

    private void publishListChanged(String changeType) {
        collectionRealtimePublisher.publishChange(
                SlipListRealtime.CHANNEL_ID,
                SlipListRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }
}
