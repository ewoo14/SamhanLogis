package com.samhanair.logis.slip.estimate.revision.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.estimate.domain.Estimate;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateRevisionType;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot;
import com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository;
import com.samhanair.logis.slip.estimate.revision.repository.EstimateRevisionRepository.EstimateRevisionSnapshotRow;
import com.samhanair.logis.slip.estimate.revision.web.dto.EstimateRevisionResponse;
import com.samhanair.logis.slip.estimate.revision.web.dto.EstimateRevisionResponse.ChangeSummary;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
public class EstimateRevisionService {
    private static final String LEGACY_CATALOG_MARKER = "\u2060";

    private static final Logger log = LoggerFactory.getLogger(EstimateRevisionService.class);

    private final EstimateRevisionRepository repository;
    private final ObjectMapper snapshotObjectMapper;

    public EstimateRevisionService(EstimateRevisionRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.snapshotObjectMapper = objectMapper.copy()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .configure(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL, true);
    }

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

    /**
     * 견적을 특정 revision 시점 스냅샷으로 복원한다 (권한 재편 Phase 2.2 Task 3).
     *
     * <p>처리 순서:
     * <ol>
     *   <li>복원 대상 revision 스냅샷 로드 — 없으면 {@link ErrorCode#NOT_FOUND}</li>
     *   <li>{@link Estimate#restoreFromSnapshot(EstimateSnapshot)} 로 헤더+라인 통째 복원
     *       (편집 가능 가드 {@code requireEditable} 는 도메인이 책임)</li>
     *   <li>복원 자체를 신규 {@link EstimateRevisionType#RESTORE} revision 1건으로 캡처 —
     *       {@code sourceRevisionNo = targetRevisionNo} 로 복원 출처를 기록</li>
     * </ol>
     *
     * <p>{@link #capture}가 채번하는 신규 revisionNo 는 항상 {@code maxRevisionNo+1} 이므로 복원 후
     * 타임라인의 최신 항목이 된다 (복원 이력도 되돌릴 수 있는 정방향 누적).
     *
     * <p>{@link com.samhanair.logis.slip.revision.service.SlipRevisionService#restore} 미러.
     *
     * @param estimate 복원 대상 견적 (영속 상태, id 필수)
     * @param targetRevisionNo 복원할 시점의 revisionNo
     * @param actorId 복원 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 복원 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 RESTORE EstimateRevision
     * @throws BusinessException(NOT_FOUND) 복원 대상 revision 미존재
     * @throws BusinessException(CONFLICT) 편집 불가 단계의 견적 (도메인 가드)
     */
    public EstimateRevision restore(Estimate estimate, int targetRevisionNo,
                                    UUID actorId, String actorName, String actorColor) {
        EstimateSnapshot targetSnapshot = repository
                .findSnapshotRowByEstimateIdAndRevisionNo(estimate.getId(), targetRevisionNo)
                .map(target -> parseSnapshotForRestore(
                        estimate.getId(), targetRevisionNo, target.getSnapshotJson()))
                .orElseGet(() -> repository.findByEstimateIdAndRevisionNo(estimate.getId(), targetRevisionNo)
                        .map(EstimateRevision::getSnapshot)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "복원 대상 버전을 찾을 수 없습니다 (버전 " + targetRevisionNo + ")")));
        estimate.restoreFromSnapshot(targetSnapshot);
        return capture(estimate, EstimateRevisionType.RESTORE, targetRevisionNo,
                actorId, actorName, actorColor);
    }

    /**
     * 버전 타임라인을 changeSummary 가 포함된 응답 DTO 로 조회한다 (권한 재편 Phase 2.2 Task 4).
     *
     * <p>{@link #list}(repository) 는 revisionNo 내림차순 raw entity 만 반환한다. 본 메서드는 그
     * 결과를 받아 각 revision 의 {@link ChangeSummary} 를 그 <b>직전 revisionNo</b> 스냅샷과
     * 비교해 계산한다 — 인접 비교를 위해 revisionNo 오름차순으로 정렬한 뒤 인접쌍을 훑고,
     * 최종 반환은 다시 최신(revisionNo 내림차순) 우선으로 뒤집어 FE 타임라인 표시 순서와 맞춘다.
     *
     * <p>"직전 revisionNo" 는 단조 증가 채번이므로 정렬된 목록상 바로 이전 원소이며, 첫 원소
     * (가장 오래된 revision) 는 비교 대상이 없어 {@code summarize(null, cur)} 로 처리된다.
     *
     * <p>{@link com.samhanair.logis.slip.revision.service.SlipRevisionService#listWithSummary} 미러.
     *
     * @param estimateId 대상 견적 UUID
     * @return revisionNo 내림차순 정렬 + changeSummary 포함 응답 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<EstimateRevisionResponse> listWithSummary(UUID estimateId) {
        List<EstimateRevisionSnapshotRow> rows =
                repository.findSnapshotRowsByEstimateIdOrderByRevisionNoDesc(estimateId);
        if (rows == null || rows.isEmpty()) {
            return listWithSummaryFromEntities(estimateId);
        }
        List<EstimateRevisionSnapshotRow> revisions = new ArrayList<>(rows);
        // 인접 비교를 위해 revisionNo 오름차순으로 정렬 (list 는 내림차순 반환)
        revisions.sort(Comparator.comparingInt(EstimateRevisionSnapshotRow::getRevisionNo));

        List<EstimateRevisionResponse> responses = new ArrayList<>(revisions.size());
        EstimateSnapshot prev = null;
        for (EstimateRevisionSnapshotRow revision : revisions) {
            EstimateSnapshot cur = parseSnapshotForSummary(estimateId, revision);
            if (cur == null) {
                continue;
            }
            ChangeSummary summary = summarize(prev, cur);
            responses.add(new EstimateRevisionResponse(
                    revision.getRevisionNo(),
                    revision.getRevisionType(),
                    revision.getSourceRevisionNo(),
                    revision.getEstimateNo(),
                    revision.getEstimateDate(),
                    revision.getActorName(),
                    revision.getCreatedAt(),
                    summary));
            prev = cur;
        }
        // 응답은 최신(revisionNo 내림차순) 우선으로 뒤집는다
        java.util.Collections.reverse(responses);
        return responses;
    }

    private List<EstimateRevisionResponse> listWithSummaryFromEntities(UUID estimateId) {
        List<EstimateRevision> revisions = new ArrayList<>(list(estimateId));
        revisions.sort(Comparator.comparingInt(EstimateRevision::getRevisionNo));

        List<EstimateRevisionResponse> responses = new ArrayList<>(revisions.size());
        EstimateSnapshot prev = null;
        for (EstimateRevision revision : revisions) {
            EstimateSnapshot cur = revision.getSnapshot();
            if (cur == null) {
                continue;
            }
            ChangeSummary summary = summarize(prev, cur);
            responses.add(new EstimateRevisionResponse(
                    revision.getRevisionNo(),
                    revision.getRevisionType() == null ? null : revision.getRevisionType().name(),
                    revision.getSourceRevisionNo(),
                    revision.getEstimateNo(),
                    revision.getEstimateDate(),
                    revision.getActorName(),
                    revision.getCreatedAt(),
                    summary));
            prev = cur;
        }
        java.util.Collections.reverse(responses);
        return responses;
    }

    private EstimateSnapshot parseSnapshotForSummary(UUID estimateId, EstimateRevisionSnapshotRow revision) {
        try {
            return snapshotObjectMapper.readValue(revision.getSnapshotJson(), EstimateSnapshot.class);
        } catch (JsonProcessingException ex) {
            log.warn("[EstimateRevisionService] 손상된 revision snapshot 요약 제외 — estimateId={}, revisionNo={}, cause={}",
                    estimateId, revision.getRevisionNo(), ex.getOriginalMessage());
            return null;
        }
    }

    private EstimateSnapshot parseSnapshotForRestore(UUID estimateId, int revisionNo, String snapshotJson) {
        try {
            EstimateSnapshot snapshot = snapshotObjectMapper.readValue(snapshotJson, EstimateSnapshot.class);
            if (snapshot == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "손상된 버전 스냅샷입니다 (버전 " + revisionNo + ")");
            }
            return snapshot;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "손상된 버전 스냅샷입니다 (버전 " + revisionNo + ")");
        }
    }

    /**
     * 두 스냅샷 간 변경 규모를 {@link ChangeSummary} 로 집계한다 (권한 재편 Phase 2.2 Task 4).
     *
     * <p>비교 규칙:
     * <ul>
     *   <li><b>prev == null</b> (최초 revision): headerChanged=0, lineRemoved=0, lineModified=0,
     *       lineAdded = cur 라인 수 (직전 없음 = 전 라인이 신규).</li>
     *   <li><b>헤더</b>: 두 스냅샷의 헤더 필드값을 {@link Objects#equals}로 비교해 다른 필드 수를
     *       센다 (estimateNo, estimateDate, partner 계열, validUntil, memo — UUID 포함 복원
     *       식별자 전부). 라인 리스트는 헤더 카운트에서 제외.</li>
     *   <li><b>라인</b>: productId 기준 매칭 — cur 에만 있으면 added, prev 에만 있으면 removed,
     *       양쪽 존재하나 라인 필드(quantity, unitPrice, supplyAmount, vatAmount, lineTotal,
     *       productName, modelName, specification, note) 중 하나라도 다르면 modified.
     *       구 revision/DB의 source 누락(null)이 현재 저장 과정에서 정규화된 경우에는 표시 규격이
     *       같다면 provenance만으로 modified로 세지 않으며, 양쪽 source가 명시된 CATALOG↔USER
     *       전환은 실제 사용자 의미 변경으로 계속 modified로 센다.</li>
     * </ul>
     *
     * <p>productId 가 null 인 라인은 매칭 키가 없어 added/removed 로만 집계된다 (modified 미판정).
     *
     * <p>{@link com.samhanair.logis.slip.revision.service.SlipRevisionService#summarize} 미러.
     *
     * @param prev 직전 시점 스냅샷 (최초 revision 이면 null)
     * @param cur 현 시점 스냅샷 (필수)
     * @return 변경 규모 요약
     */
    public ChangeSummary summarize(EstimateSnapshot prev, EstimateSnapshot cur) {
        if (cur == null) {
            return null;
        }
        List<EstimateSnapshot.Line> curLines = cur.lines() == null ? List.of() : cur.lines();
        if (prev == null) {
            return new ChangeSummary(0, curLines.size(), 0, 0);
        }
        List<EstimateSnapshot.Line> prevLines = prev.lines() == null ? List.of() : prev.lines();

        int headerChanged = countHeaderChanges(prev, cur);

        // productId 기준 매칭 맵 (null productId 는 added/removed 로만 잡히도록 맵 제외)
        Map<UUID, EstimateSnapshot.Line> prevById = new LinkedHashMap<>();
        for (EstimateSnapshot.Line line : prevLines) {
            if (line.productId() != null) {
                prevById.put(line.productId(), line);
            }
        }
        Map<UUID, EstimateSnapshot.Line> curById = new LinkedHashMap<>();
        for (EstimateSnapshot.Line line : curLines) {
            if (line.productId() != null) {
                curById.put(line.productId(), line);
            }
        }

        int lineAdded = 0;
        int lineRemoved = 0;
        int lineModified = 0;

        // productId 가 null 인 라인은 키 매칭 불가 → cur=added, prev=removed
        for (EstimateSnapshot.Line line : curLines) {
            if (line.productId() == null) {
                lineAdded++;
            }
        }
        for (EstimateSnapshot.Line line : prevLines) {
            if (line.productId() == null) {
                lineRemoved++;
            }
        }

        for (Map.Entry<UUID, EstimateSnapshot.Line> entry : curById.entrySet()) {
            EstimateSnapshot.Line prevLine = prevById.get(entry.getKey());
            if (prevLine == null) {
                lineAdded++;
            } else if (lineDiffers(prevLine, entry.getValue())) {
                lineModified++;
            }
        }
        for (UUID prevKey : prevById.keySet()) {
            if (!curById.containsKey(prevKey)) {
                lineRemoved++;
            }
        }

        return new ChangeSummary(headerChanged, lineAdded, lineRemoved, lineModified);
    }

    /**
     * 두 스냅샷의 헤더 필드를 1:1 비교해 값이 달라진 필드 수를 센다 (라인 리스트 제외).
     */
    private int countHeaderChanges(EstimateSnapshot prev, EstimateSnapshot cur) {
        int changed = 0;
        if (!Objects.equals(prev.estimateNo(), cur.estimateNo())) {
            changed++;
        }
        if (!Objects.equals(prev.estimateDate(), cur.estimateDate())) {
            changed++;
        }
        if (!Objects.equals(prev.partnerId(), cur.partnerId())) {
            changed++;
        }
        if (!Objects.equals(prev.partnerName(), cur.partnerName())) {
            changed++;
        }
        if (!Objects.equals(prev.partnerBusinessNo(), cur.partnerBusinessNo())) {
            changed++;
        }
        if (!Objects.equals(prev.partnerAddress(), cur.partnerAddress())) {
            changed++;
        }
        if (!Objects.equals(prev.validUntil(), cur.validUntil())) {
            changed++;
        }
        if (!Objects.equals(prev.memo(), cur.memo())) {
            changed++;
        }
        return changed;
    }

    /**
     * 동일 productId 라인 2건의 필드값이 하나라도 다른지 판정한다 (BigDecimal 은 compareTo).
     */
    private boolean lineDiffers(EstimateSnapshot.Line a, EstimateSnapshot.Line b) {
        if (a.quantity() != b.quantity()) {
            return true;
        }
        if (!bigDecimalEquals(a.unitPrice(), b.unitPrice())) {
            return true;
        }
        if (!bigDecimalEquals(a.supplyAmount(), b.supplyAmount())) {
            return true;
        }
        if (!bigDecimalEquals(a.vatAmount(), b.vatAmount())) {
            return true;
        }
        if (!bigDecimalEquals(a.lineTotal(), b.lineTotal())) {
            return true;
        }
        return !Objects.equals(a.productName(), b.productName())
                || !Objects.equals(a.modelName(), b.modelName())
                || specificationDiffers(a, b)
                || specificationSourceDiffers(a.specification(), a.specificationSource(), b.specificationSource())
                || !Objects.equals(a.note(), b.note());
    }

    /**
     * 구 snapshot의 source 누락과 현재 hydrate 정규화를 실제 source 전환과 구분한다.
     * 구 marker는 hydrate 시 제거되므로, 기대 source가 CATALOG인 경우에만 표시값을
     * canonicalize한다. 그 밖의 source 조합은 실제 provenance 전환으로 취급한다.
     */
    private boolean specificationDiffers(EstimateSnapshot.Line previous, EstimateSnapshot.Line current) {
        if (Objects.equals(previous.specification(), current.specification())) {
            return false;
        }
        if (previous.specificationSource() == null
                && "CATALOG".equals(current.specificationSource())
                && previous.specification() != null
                && previous.specification().startsWith(LEGACY_CATALOG_MARKER)) {
            return !Objects.equals(previous.specification().substring(LEGACY_CATALOG_MARKER.length()),
                    current.specification());
        }
        return true;
    }

    private boolean specificationSourceDiffers(String previousSpecification,
                                               String previousSource,
                                               String currentSource) {
        if (Objects.equals(previousSource, currentSource)) {
            return false;
        }
        if (previousSource == null && currentSource != null) {
            String expectedLegacySource = previousSpecification != null
                    && previousSpecification.startsWith(LEGACY_CATALOG_MARKER)
                    ? "CATALOG"
                    : previousSpecification != null && !previousSpecification.isBlank()
                    ? "USER"
                    : null;
            return !Objects.equals(expectedLegacySource, currentSource);
        }
        return true;
    }

    /**
     * BigDecimal 동등 비교 — scale 차이 무시 (compareTo). null 안전.
     */
    private boolean bigDecimalEquals(java.math.BigDecimal a, java.math.BigDecimal b) {
        if (a == null || b == null) {
            return a == b;
        }
        return a.compareTo(b) == 0;
    }
}
