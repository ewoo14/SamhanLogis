package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.realtime.SlipListRealtime;
import com.samhanair.logis.slip.repository.SlipLineRepository;
import com.samhanair.logis.slip.repository.SlipRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
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
    private final SlipLineRepository slipLineRepository;
    private final CollectionRealtimePublisher collectionRealtimePublisher;

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * soft-deleted 전표를 복원한다.
     *
     * <p>동일 {@code slipType + slipNo} 활성행이 이미 있으면 partial unique 위반 전에 409 로 차단한다.
     *
     * <p><b>라인 복원 = 헤더 deletedAt 정확일치 매칭</b> (#758 머지게이트 감사 HIGH fix). 판매전표
     * 라인은 {@code removeLine}/{@code replaceSalesLines}/{@code restoreFromSnapshot} 등 편집
     * 플로우에서도 개별 soft-delete 되므로, {@code slipId} 만으로 삭제 라인을 무차별 복원하면
     * 이미 편집으로 제거된 라인까지 함께 부활해 수량·금액이 중복 집계된다(#758 CRITICAL 재현).
     * 헤더 삭제({@code deleteForSales})는 cascade 라인에 헤더와 <b>동일한 단일 시각</b>을
     * 각인하므로, 복원도 그 시각과 정확히 일치하는 라인만 대상으로 삼는다 — 주문(C)
     * {@code PartnerOrderDeleteService#restoreDeleted} (#757 R2) 와 동일한 패턴 (별도 서비스라
     * 컴파일 의존은 없음, 패턴만 이식).
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
            // markRestoredWithNameCleared() 가 deletedAt 을 null 로 비우기 전에 헤더 삭제 시각을
            // 캡처해야 한다 — 이 시각이 deleteForSales 가 cascade 라인에 각인한 단일 시각과 정확히
            // 일치하는 라인만 골라 복원하기 위한 매칭 키다 (#758 머지게이트 감사 HIGH fix).
            LocalDateTime headerDeletedAt = slip.getDeletedAt();
            slip.markRestoredWithNameCleared();
            Slip saved = slipRepository.saveAndFlush(slip);
            // 헤더 삭제 시 deleteForSales 가 cascade 로 soft-delete 한 라인들만 대칭 복원한다
            // (미복원 시 복원 전표가 품목·금액 0 의 빈 껍데기가 됨 — STEP4 적대검증 HIGH).
            // headerDeletedAt 과 시각이 다른 라인(removeLine/replaceSalesLines/restoreFromSnapshot
            // 등 편집으로 개별 soft-delete 된 라인)은 대상에서 제외되어 중복 부활(#758 CRITICAL)이
            // 발생하지 않는다. native bulk 는 영속성 컨텍스트를 우회하므로 refresh 로 되살아난
            // 라인을 컬렉션에 반영.
            if (headerDeletedAt != null) {
                slipLineRepository.restoreDeletedLinesBySlipIdAndDeletedAt(saved.getId(), headerDeletedAt);
            }
            entityManager.refresh(saved);
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
