package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
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

/** 출고전표 목록 soft-delete 복원 서비스 (E2). */
@Service
@RequiredArgsConstructor
public class SlipRestoreService {

    private final SlipRepository slipRepository;
    private final SlipLineRepository slipLineRepository;
    private final CollectionRealtimePublisher collectionRealtimePublisher;
    private final SlipClosedDateGuard closedDateGuard;

    @PersistenceContext
    private EntityManager entityManager;

    /**
     * soft-deleted 전표를 복원한다.
     *
     * <p>동일 {@code slipType + slipNo} 활성행이 이미 있으면 partial unique 위반 전에 409 로 차단한다.
     *
     * <p><b>라인 복원 = 헤더 deletedAt 정확일치 매칭</b> (#758 머지게이트 감사 HIGH fix). 출고전표
     * 라인은 {@code removeLine}/{@code replaceSalesLines}/{@code restoreFromSnapshot} 등 편집
     * 플로우에서도 개별 soft-delete 되므로, {@code slipId} 만으로 삭제 라인을 무차별 복원하면
     * 이미 편집으로 제거된 라인까지 함께 부활해 수량·금액이 중복 집계된다(#758 CRITICAL 재현).
     * 헤더 삭제({@code deleteForSales})는 cascade 라인에 헤더와 <b>동일한 단일 시각</b>을
     * 각인하므로, 복원도 그 시각과 정확히 일치하는 라인만 대상으로 삼는다 — 주문(C)
     * {@code PartnerOrderDeleteService#restoreDeleted} (#757 R2) 와 동일한 패턴 (별도 서비스라
     * 컴파일 의존은 없음, 패턴만 이식).
     *
     * <p><b>레거시 삭제 전표 fail-loud (BE 적대검증 BLOCKING fix, 2026-07-07)</b>: 단일시각 각인이
     * 도입되기 <b>이전</b>에 {@code deleteForSales} 로 삭제된 출고전표는 헤더와 라인이 각자 다른
     * {@code deletedAt} 을 갖는다({@code slip_db} 실측: {@code 2026/06/03-1}, 삭제 라인 2건 전부
     * 헤더 시각 불일치). 이런 레거시 삭제행은 시각한정 복원 쿼리가 <b>0-match</b> 로 끝나 헤더만
     * {@code is_deleted=false} 로 되돌아가고 라인은 전부 삭제 상태로 남는 "무음 빈 껍데기" 가
     * 200 OK 로 반환될 위험이 있다. 이를 막기 위해 복원 시도 <b>이전</b>에
     * {@link SlipLineRepository#countDeletedLinesBySlipId} 로 삭제 라인 수를 캡처해 두고,
     * 복원 쿼리의 실제 리턴값(복원된 라인 수)과 대조한다 — 삭제 라인이 있었는데 하나도 복원되지
     * 않았다면(또는 헤더 {@code deletedAt} 자체가 {@code null} 이라 매칭 시도조차 불가능했다면)
     * {@link ErrorCode#CONFLICT} 로 fail-loud 처리하고 트랜잭션을 롤백한다(헤더/라인
     * {@code is_deleted=true} 그대로 유지, 목록 화면에서도 여전히 삭제행으로 노출).
     *
     * <p><b>한계(레거시 백로그)</b>: 주문(C) {@code PartnerOrderRevisionType.DELETE} 는 삭제 직전
     * 스냅샷을 버전이력에 보존해 두어 인라인 복원이 막혀도 revision-restore 로 복구 가능하지만,
     * 출고전표(D) {@code SlipRevisionType} 은 아직 {@code DELETE} 타입이 없어 이 fallback 경로가
     * 미도입 상태다. 즉 본 fix 는 <b>레거시 삭제행의 데이터 오염(무음 손실)을 차단</b>할 뿐, 그
     * 레거시 삭제행 자체를 인라인으로 복구하는 수단은 아직 없다 — 복구가 필요하면 DB 운영 절차
     * (수동 {@code deleted_at} 정정 등)를 거쳐야 한다. DELETE revision 도입은 후속 백로그.
     *
     * @param slipId 복원 대상 slip UUID
     * @return 복원된 전표
     * @throws BusinessException(CONFLICT) 레거시 삭제(헤더·라인 삭제 시각 불일치)로 라인이 하나도
     *                                     복원되지 않았을 때 — 트랜잭션 롤백, is_deleted 그대로 유지
     */
    @Transactional
    public Slip restore(UUID slipId) {
        return restore(slipId, null);
    }

    @Transactional
    public Slip restore(UUID slipId, String requesterId) {
        Slip slip = slipRepository.findByIdIncludingDeleted(slipId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다."));
        // deleteForSales 의 OUTBOUND 타입가드와 대칭 — 복원도 출고전표(OUTBOUND) 전용.
        // sales.slip.list RESTORE 권한만으로 INBOUND(구매) 전표를 UUID 로 복원하는 최소권한 우회를 차단.
        if (slip.getSlipType() != com.samhanair.logis.slip.domain.SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "전표를 찾을 수 없습니다.");
        }
        if (!Boolean.TRUE.equals(slip.getIsDeleted())) {
            slip.getLines().size();
            return slip;
        }
        closedDateGuard.assertAllowed(slip.getSlipType(), slip.getSlipDate(), requesterId);
        if (slipRepository.findBySlipTypeAndSlipNoAndIsDeletedFalse(slip.getSlipType(), slip.getSlipNo()).isPresent()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 같은 전표번호의 활성 전표가 존재하여 복원할 수 없습니다: " + slip.getSlipNo());
        }
        try {
            // markRestoredWithNameCleared() 가 deletedAt 을 null 로 비우기 전에 헤더 삭제 시각을
            // 캡처해야 한다 — 이 시각이 deleteForSales 가 cascade 라인에 각인한 단일 시각과 정확히
            // 일치하는 라인만 골라 복원하기 위한 매칭 키다 (#758 머지게이트 감사 HIGH fix).
            LocalDateTime headerDeletedAt = slip.getDeletedAt();
            // fail-loud 사전 캡처(BE 적대검증 BLOCKING fix) — 복원 시도 전 삭제 라인 수를 세어
            // 두어야 "삭제 라인은 있었는데 하나도 복원되지 않음"(레거시 헤더≠라인 시각) 을
            // 사후에 판정할 수 있다. markRestoredWithNameCleared() 이전에 반드시 캡처.
            long deletedLineCount = slipLineRepository.countDeletedLinesBySlipId(slipId);
            slip.markRestoredWithNameCleared();
            Slip saved = slipRepository.saveAndFlush(slip);
            // 헤더 삭제 시 deleteForSales 가 cascade 로 soft-delete 한 라인들만 대칭 복원한다
            // (미복원 시 복원 전표가 품목·금액 0 의 빈 껍데기가 됨 — STEP4 적대검증 HIGH).
            // headerDeletedAt 과 시각이 다른 라인(removeLine/replaceSalesLines/restoreFromSnapshot
            // 등 편집으로 개별 soft-delete 된 라인)은 대상에서 제외되어 중복 부활(#758 CRITICAL)이
            // 발생하지 않는다. native bulk 는 영속성 컨텍스트를 우회하므로 refresh 로 되살아난
            // 라인을 컬렉션에 반영.
            int restored = 0;
            if (headerDeletedAt != null) {
                restored = slipLineRepository.restoreDeletedLinesBySlipIdAndDeletedAt(saved.getId(), headerDeletedAt);
            }
            // fail-loud 판정(BE 적대검증 BLOCKING fix, slip_db 실측 2026/06/03-1) — 삭제 라인이
            // 있었는데(deletedLineCount > 0) 하나도 복원되지 않았다면(restored == 0, headerDeletedAt
            // 이 null 이라 매칭 시도조차 못 한 경우 포함) 레거시(단일시각 도입 이전) 삭제 전표다.
            // 이대로 진행하면 헤더만 살아나고 라인은 전부 삭제 상태로 남는 무음 빈 껍데기가 200 OK
            // 로 반환되므로, CONFLICT 로 fail-loud 처리하고 트랜잭션을 롤백해 is_deleted=true 를
            // 그대로 유지한다(주문(C) 의 DELETE revision fallback 이 Slip 에는 아직 없음 — 백로그).
            if (deletedLineCount > 0 && restored == 0) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "레거시 삭제 전표(헤더·라인 삭제 시각 불일치)는 인라인 복원할 수 없습니다: " + slip.getSlipNo());
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
