package com.samhanair.logis.slip.estimate.revision.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot;
import com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 견적 버전이력 스냅샷 캡처/조회 서비스 (권한 재편 Phase 2.2 Task 2).
 *
 * <p>견적 mutation 커밋 직후 현 상태를 {@link EstimateRevision} 1건으로 기록한다. revisionNo 는
 * estimate 별 단조 증가 — {@code maxRevisionNo + 1} 로 채번한다 (첫 캡처는 1).
 *
 * <p>{@link com.samhanair.logis.slip.estimate.service.EstimateService} 의 create/update 훅에서
 * 같은 트랜잭션 내 return 직전에 {@link #capture}를 호출한다 (스냅샷 일관성).
 *
 * <p>{@link com.samhanair.logis.slip.revision.service.SlipRevisionService} 미러
 * (slipId→estimateId, slipNo→estimateNo).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class EstimateRevisionService {

    private final EstimateRevisionRepository repository;

    /**
     * 현 견적 상태를 버전 스냅샷 1건으로 캡처해 영속화한다.
     *
     * <p>revisionNo 는 {@code repository.maxRevisionNo(estimateId) + 1} 로 채번한다. 기존 스냅샷이
     * 없으면 {@code maxRevisionNo} 가 null 이므로 첫 버전은 1 이 된다. 스냅샷 본문은
     * {@link Estimate#toSnapshot()} 결과를 그대로 보관한다.
     *
     * @param estimate 캡처 대상 견적 (영속 상태, id 필수)
     * @param type 캡처 유형 CREATE/EDIT/RESTORE
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 EstimateRevision
     */
    public EstimateRevision capture(Estimate estimate, EstimateRevisionType type,
                                    Integer sourceRevisionNo, UUID actorId, String actorName,
                                    String actorColor) {
        // 채번 race 가드 (SlipRevisionService 동형):
        // maxRevisionNo+1 read-then-insert 가 동시 mutation 시 (estimate_id, revision_no) unique 를
        // 위반하면 DataIntegrityViolationException 이 발생한다. 이를 그대로 흘리면 500 이 되므로,
        // 1회 재채번 재시도 후에도 충돌하면 409 CONFLICT 로 변환한다 (사용자 재시도 안내).
        EstimateSnapshot snapshot = estimate.toSnapshot();
        try {
            return saveWithNextRevisionNo(estimate, type, sourceRevisionNo, snapshot,
                    actorId, actorName, actorColor);
        } catch (org.springframework.dao.DataIntegrityViolationException firstConflict) {
            try {
                // 1회 재채번 — 직전 insert 가 채간 revision_no 다음 번호로 재시도
                return saveWithNextRevisionNo(estimate, type, sourceRevisionNo, snapshot,
                        actorId, actorName, actorColor);
            } catch (org.springframework.dao.DataIntegrityViolationException retryConflict) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "동시 수정 충돌 — 잠시 후 다시 시도해 주세요");
            }
        }
    }

    /**
     * 현 시점 {@code maxRevisionNo+1} 로 채번해 EstimateRevision 1건을 저장한다 (capture 의 채번 단위).
     *
     * <p>분리 목적: 채번 read 와 insert 가 한 호출에 묶여 있어야 재시도 시 갱신된 maxRevisionNo 로
     * 다시 채번된다. 스냅샷은 호출자가 1회만 만들어 재시도 간 재사용한다 (불변 — 재계산 불필요).
     */
    private EstimateRevision saveWithNextRevisionNo(Estimate estimate, EstimateRevisionType type,
                                                    Integer sourceRevisionNo,
                                                    EstimateSnapshot snapshot, UUID actorId,
                                                    String actorName, String actorColor) {
        Integer max = repository.maxRevisionNo(estimate.getId());
        int next = (max == null ? 0 : max) + 1;
        EstimateRevision revision = EstimateRevision.of(
                estimate.getId(), next, type, sourceRevisionNo,
                estimate.getEstimateNo(), estimate.getEstimateDate(), snapshot,
                actorId, actorName, actorColor);
        // saveAndFlush — unique 제약 위반을 commit 이 아닌 이 시점에 동기 노출시켜 catch/재시도 가능하게 한다.
        return repository.saveAndFlush(revision);
    }

    /**
     * 견적의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param estimateId 대상 견적 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<EstimateRevision> list(UUID estimateId) {
        return repository.findByEstimateIdOrderByRevisionNoDesc(estimateId);
    }
}
