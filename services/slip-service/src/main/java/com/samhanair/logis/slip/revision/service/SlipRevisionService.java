package com.samhanair.logis.slip.revision.service;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 전표 버전이력 스냅샷 캡처/조회 서비스 (권한 재편 Phase 2.1 Task 2).
 *
 * <p>전표 mutation 커밋 직후 현 상태를 {@link SlipRevision} 1건으로 기록한다. revisionNo 는
 * slip 별 단조 증가 — {@code maxRevisionNo + 1} 로 채번한다 (첫 캡처는 1).
 *
 * <p>{@link SlipService} 의 create/updateSlip/applyOverlayPatch 훅에서 같은 트랜잭션 내
 * return 직전에 {@link #capture}를 호출한다 (스냅샷 일관성).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class SlipRevisionService {

    private final SlipRevisionRepository repository;

    /**
     * 현 전표 상태를 버전 스냅샷 1건으로 캡처해 영속화한다.
     *
     * <p>revisionNo 는 {@code repository.maxRevisionNo(slipId) + 1} 로 채번한다. 기존 스냅샷이
     * 없으면 {@code maxRevisionNo} 가 null 이므로 첫 버전은 1 이 된다. 스냅샷 본문은
     * {@link Slip#toSnapshot()} 결과를 그대로 보관한다.
     *
     * @param slip 캡처 대상 전표 (영속 상태, id 필수)
     * @param type 캡처 유형 CREATE/EDIT/RESTORE
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 SlipRevision
     */
    public SlipRevision capture(Slip slip, SlipRevisionType type, Integer sourceRevisionNo,
                                UUID actorId, String actorName, String actorColor) {
        Integer max = repository.maxRevisionNo(slip.getId());
        int next = (max == null ? 0 : max) + 1;
        SlipRevision revision = SlipRevision.of(
                slip.getId(), next, type, sourceRevisionNo,
                slip.getSlipNo(), slip.getSlipDate(), slip.toSnapshot(),
                actorId, actorName, actorColor);
        return repository.save(revision);
    }

    /**
     * 전표의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param slipId 대상 전표 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<SlipRevision> list(UUID slipId) {
        return repository.findBySlipIdOrderByRevisionNoDesc(slipId);
    }
}
