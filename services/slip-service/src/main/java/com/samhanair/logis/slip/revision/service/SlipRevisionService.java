package com.samhanair.logis.slip.revision.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipRevisionType;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository.SlipRevisionSnapshotRow;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse.ChangeSummary;
import com.samhanair.logis.slip.revision.web.dto.SlipRevisionResponse.FieldChange;
import com.samhanair.logis.shared.realtime.presence.PresenceColor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
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
public class SlipRevisionService {

    private static final Logger log = LoggerFactory.getLogger(SlipRevisionService.class);

    private final SlipRevisionRepository repository;
    private final ObjectMapper snapshotObjectMapper;

    private static final java.util.regex.Pattern UUID_PATTERN = java.util.regex.Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private record HeaderField(String path, String label, java.util.function.Function<SlipSnapshot, Object> reader) {
    }

    private record LineField(String name, String label, java.util.function.Function<SlipSnapshot.Line, Object> reader) {
    }

    public SlipRevisionService(SlipRevisionRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.snapshotObjectMapper = objectMapper.copy()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .configure(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL, true);
    }

    private static final List<HeaderField> HEADER_FIELDS = List.of(
            new HeaderField("header.slipNo", "전표번호", SlipSnapshot::slipNo),
            new HeaderField("header.slipDate", "전표일자", SlipSnapshot::slipDate),
            new HeaderField("header.partnerName", "거래처명", SlipSnapshot::partnerName),
            new HeaderField("header.partnerCode", "거래처코드", SlipSnapshot::partnerCode),
            new HeaderField("header.businessNumber", "사업자번호", SlipSnapshot::businessNumber),
            new HeaderField("header.memo", "메모", SlipSnapshot::memo),
            new HeaderField("header.deliveryTag", "배송태그", SlipSnapshot::deliveryTag),
            new HeaderField("header.deliveryAddress", "배송주소", SlipSnapshot::deliveryAddress),
            new HeaderField("header.supervisionAddress", "감리주소", SlipSnapshot::supervisionAddress),
            new HeaderField("header.projectName", "프로젝트명", SlipSnapshot::projectName),
            new HeaderField("header.recipientPhone", "인수자 번호", SlipSnapshot::recipientPhone),
            new HeaderField("header.paymentDueDate", "입금예정일", SlipSnapshot::paymentDueDate),
            new HeaderField("header.destinationWarehouseName", "도착지 창고", SlipSnapshot::destinationWarehouseName),
            new HeaderField("header.shippingAddress", "배송지", SlipSnapshot::shippingAddress),
            new HeaderField("header.inspectionAddress", "검수지", SlipSnapshot::inspectionAddress),
            new HeaderField("header.receiverPhone", "수령자 연락처", SlipSnapshot::receiverPhone),
            new HeaderField("header.customerTel", "거래처 연락처", SlipSnapshot::customerTel),
            new HeaderField("header.customerAddress", "거래처 주소", SlipSnapshot::customerAddress),
            new HeaderField("header.customerRepresentative", "거래처 대표자", SlipSnapshot::customerRepresentative),
            new HeaderField("header.paymentDueLabel", "결제 만기", SlipSnapshot::paymentDueLabel),
            new HeaderField("header.discountInfo", "할인 정보", SlipSnapshot::discountInfo),
            new HeaderField("header.collectTerm", "회수 조건", SlipSnapshot::collectTerm),
            new HeaderField("header.agreeTerm", "약정 조건", SlipSnapshot::agreeTerm)
    );

    private static final List<LineField> LINE_FIELDS = List.of(
            new LineField("productName", "품목명", SlipSnapshot.Line::productName),
            new LineField("modelName", "모델명", SlipSnapshot.Line::modelName),
            new LineField("specification", "규격", SlipSnapshot.Line::specification),
            new LineField("quantity", "수량", SlipSnapshot.Line::quantity),
            // 🚨 #937 재수렴 6차 ⑦ — 종전에는 {@code Line::unitPrice} 컬럼을 정규화 없이 그대로
            // 읽었다. 재수렴 4차가 그 컬럼의 의미를 "사용자 입력 단가" → "공급가액 ÷ 수량"(VAT
            // 제외 파생값)으로 바꾸면서, 그 위에 얹혀 있던 버전이력의 의미가 조용히 바뀌었다.
            // 실측(전표 2026/07/27-209): 사용자는 단가 100,000(VAT 포함)을 한 번 입력하고 이후
            // 공급가액·부가세만 편집했는데 버전이력은 "단가 null→90,909" + "단가 90,909→100,000"
            // 이라는 <b>하지 않은 변경 2건</b>을 기록했다. 같은 상세 화면이 레드라인(VAT 포함)과
            // 버전이력(VAT 제외)을 나란히 렌더하므로 사용자는 한 화면에서 두 단가를 본다.
            // 레드라인과 같은 표시 판정({@link #unitPriceDisplayValue})을 쓴다.
            new LineField("unitPrice", "단가", SlipRevisionService::unitPriceDisplayValue),
            // 🚨 #937 재수렴 7차 R7-1 — 개발책임자 결정 A안 "이력 합계도 VAT 포함으로".
            // 종전에는 {@code lineTotal} 저장 컬럼(= 공급가액, VAT 제외)을 그대로 읽었다. 그 결과
            // 같은 상세 화면이 <b>전표 라인 표</b>에 "합계(VAT포함) 240,000" 을, 바로 아래
            // <b>버전 이력</b>에 "합계 218,181" 을 나란히 렌더해 <b>같은 단어가 다른 값</b>을
            // 가리켰다(실측: 단가 VAT포함 100,000 × 2 → 단가만 120,000 수정). 위 "단가"가 이미
            // VAT 포함 도메인이므로 {@code 단가 × 수량 = 합계} 항등식도 깨져 있었다
            // (120,000 × 2 = 240,000 ≠ 218,181).
            // 레드라인({@link SlipRedlineService} LINE_TOTAL)은 이미 {@link #lineTotalDisplayValue}
            // 를 쓰고 있었다 — 이 한 줄만 저장 컬럼을 직접 읽던 유일한 예외였다.
            // ⚠️ 과거 이력의 표시 숫자가 소급 변경된다. 개발책임자가 그 규모를 인지한 상태의 결정.
            new LineField("lineTotal", "합계", SlipRevisionService::lineTotalDisplayValue),
            new LineField("note", "비고", SlipSnapshot.Line::note)
    );

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
        // 채번 race 가드 (PR #318 cycle1 P2-1):
        // maxRevisionNo+1 read-then-insert 가 동시 mutation 시 uq_slip_revisions_active(slip_id,
        // revision_no) 를 위반하면 DataIntegrityViolationException 이 발생한다. 이를 그대로 흘리면
        // 500 이 되므로, 1회 재채번 재시도 후에도 충돌하면 409 CONFLICT 로 변환한다 (사용자 재시도 안내).
        SlipSnapshot snapshot = slip.toSnapshot();
        try {
            return saveWithNextRevisionNo(slip, type, sourceRevisionNo, snapshot,
                    actorId, actorName, actorColor);
        } catch (org.springframework.dao.DataIntegrityViolationException firstConflict) {
            try {
                // 1회 재채번 — 직전 insert 가 채간 revision_no 다음 번호로 재시도
                return saveWithNextRevisionNo(slip, type, sourceRevisionNo, snapshot,
                        actorId, actorName, actorColor);
            } catch (org.springframework.dao.DataIntegrityViolationException retryConflict) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "동시 수정 충돌 — 잠시 후 다시 시도해 주세요");
            }
        }
    }

    /**
     * 현 시점 {@code maxRevisionNo+1} 로 채번해 SlipRevision 1건을 저장한다 (capture 의 채번 단위).
     *
     * <p>분리 목적: 채번 read 와 insert 가 한 호출에 묶여 있어야 재시도 시 갱신된 maxRevisionNo 로
     * 다시 채번된다. 스냅샷은 호출자가 1회만 만들어 재시도 간 재사용한다 (불변 — 재계산 불필요).
     */
    private SlipRevision saveWithNextRevisionNo(Slip slip, SlipRevisionType type,
                                                Integer sourceRevisionNo, SlipSnapshot snapshot,
                                                UUID actorId, String actorName, String actorColor) {
        Integer max = repository.maxRevisionNo(slip.getId());
        int next = (max == null ? 0 : max) + 1;
        SlipRevision revision = SlipRevision.of(
                slip.getId(), next, type, sourceRevisionNo,
                slip.getSlipNo(), slip.getSlipDate(), snapshot,
                actorId, actorName, actorColor);
        // saveAndFlush — unique 제약 위반을 commit 이 아닌 이 시점에 동기 노출시켜 catch/재시도 가능하게 한다.
        return repository.saveAndFlush(revision);
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

    /**
     * 전표를 특정 revision 시점 스냅샷으로 복원한다 (권한 재편 Phase 2.1 Task 3).
     *
     * <p>처리 순서:
     * <ol>
     *   <li>복원 대상 revision 스냅샷 로드 — 없으면 {@link ErrorCode#NOT_FOUND}</li>
     *   <li>{@link Slip#restoreFromSnapshot(SlipSnapshot)} 로 헤더+라인 통째 복원
     *       (마감 lock 가드는 도메인이 책임)</li>
     *   <li>복원 자체를 신규 {@link SlipRevisionType#RESTORE} revision 1건으로 캡처 —
     *       {@code sourceRevisionNo = targetRevisionNo} 로 복원 출처를 기록</li>
     * </ol>
     *
     * <p>{@link #capture}가 채번하는 신규 revisionNo 는 항상 {@code maxRevisionNo+1} 이므로 복원 후
     * 타임라인의 최신 항목이 된다 (복원 이력도 되돌릴 수 있는 정방향 누적).
     *
     * @param slip 복원 대상 전표 (영속 상태, id 필수)
     * @param targetRevisionNo 복원할 시점의 revisionNo
     * @param actorId 복원 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 복원 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 RESTORE SlipRevision
     * @throws BusinessException(NOT_FOUND) 복원 대상 revision 미존재
     * @throws BusinessException(CONFLICT) 마감 lock 적용 슬립 (도메인 가드)
     */
    public SlipRevision restore(Slip slip, int targetRevisionNo,
                                UUID actorId, String actorName, String actorColor) {
        SlipSnapshot targetSnapshot = repository
                .findSnapshotRowBySlipIdAndRevisionNo(slip.getId(), targetRevisionNo)
                .map(target -> parseSnapshotForRestore(
                        slip.getId(), targetRevisionNo, target.getSnapshotJson()))
                .orElseGet(() -> repository.findBySlipIdAndRevisionNo(slip.getId(), targetRevisionNo)
                        .map(SlipRevision::getSnapshot)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                                "복원 대상 버전을 찾을 수 없습니다 (버전 " + targetRevisionNo + ")")));
        slip.restoreFromSnapshot(targetSnapshot);
        return capture(slip, SlipRevisionType.RESTORE, targetRevisionNo,
                actorId, actorName, actorColor);
    }

    /**
     * 버전 타임라인을 changeSummary 가 포함된 응답 DTO 로 조회한다 (권한 재편 Phase 2.1 Task 4).
     *
     * <p>{@link #list}(repository) 는 revisionNo 내림차순 raw entity 만 반환한다. 본 메서드는 그
     * 결과를 받아 각 revision 의 {@link ChangeSummary} 를 그 <b>직전 revisionNo</b> 스냅샷과
     * 비교해 계산한다 — 인접 비교를 위해 revisionNo 오름차순으로 정렬한 뒤 인접쌍을 훑고,
     * 최종 반환은 다시 최신(revisionNo 내림차순) 우선으로 뒤집어 FE 타임라인 표시 순서와 맞춘다.
     *
     * <p>"직전 revisionNo" 는 단조 증가 채번이므로 정렬된 목록상 바로 이전 원소이며, 첫 원소
     * (가장 오래된 revision) 는 비교 대상이 없어 {@code summarize(null, cur)} 로 처리된다.
     *
     * @param slipId 대상 전표 UUID
     * @return revisionNo 내림차순 정렬 + changeSummary 포함 응답 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<SlipRevisionResponse> listWithSummary(UUID slipId) {
        List<SlipRevisionSnapshotRow> rows = repository.findSnapshotRowsBySlipIdOrderByRevisionNoDesc(slipId);
        if (rows == null || rows.isEmpty()) {
            return listWithSummaryFromEntities(slipId);
        }
        List<SlipRevisionSnapshotRow> revisions = new ArrayList<>(rows);
        // 인접 비교를 위해 revisionNo 오름차순으로 정렬 (list 는 내림차순 반환)
        revisions.sort(Comparator.comparingInt(SlipRevisionSnapshotRow::getRevisionNo));

        List<SlipRevisionResponse> responses = new ArrayList<>(revisions.size());
        SlipSnapshot prev = null;
        for (SlipRevisionSnapshotRow revision : revisions) {
            SlipSnapshot cur = parseSnapshotForSummary(slipId, revision);
            if (cur == null) {
                continue;
            }
            ChangeSummary summary = summarize(prev, cur);
            String actorColor = resolveActorColor(revision);
            String actorName = safeActorName(revision.getActorName());
            responses.add(new SlipRevisionResponse(
                    revision.getRevisionNo(),
                    revision.getRevisionType(),
                    revision.getSourceRevisionNo(),
                    revision.getSlipNo(),
                    revision.getSlipDate(),
                    actorName,
                    actorColor,
                    revision.getCreatedAt(),
                    summary,
                    fieldChanges(prev, cur, actorName, actorColor, revision.getCreatedAt())));
            prev = cur;
        }
        // 응답은 최신(revisionNo 내림차순) 우선으로 뒤집는다
        java.util.Collections.reverse(responses);
        return responses;
    }

    private List<SlipRevisionResponse> listWithSummaryFromEntities(UUID slipId) {
        List<SlipRevision> revisions = new ArrayList<>(list(slipId));
        revisions.sort(Comparator.comparingInt(SlipRevision::getRevisionNo));

        List<SlipRevisionResponse> responses = new ArrayList<>(revisions.size());
        SlipSnapshot prev = null;
        for (SlipRevision revision : revisions) {
            SlipSnapshot cur = revision.getSnapshot();
            if (cur == null) {
                continue;
            }
            ChangeSummary summary = summarize(prev, cur);
            String actorColor = resolveActorColor(revision);
            String actorName = safeActorName(revision.getActorName());
            responses.add(new SlipRevisionResponse(
                    revision.getRevisionNo(),
                    revision.getRevisionType() == null ? null : revision.getRevisionType().name(),
                    revision.getSourceRevisionNo(),
                    revision.getSlipNo(),
                    revision.getSlipDate(),
                    actorName,
                    actorColor,
                    revision.getCreatedAt(),
                    summary,
                    fieldChanges(prev, cur, actorName, actorColor, revision.getCreatedAt())));
            prev = cur;
        }
        java.util.Collections.reverse(responses);
        return responses;
    }

    private SlipSnapshot parseSnapshotForSummary(UUID slipId, SlipRevisionSnapshotRow revision) {
        try {
            return snapshotObjectMapper.readValue(revision.getSnapshotJson(), SlipSnapshot.class);
        } catch (JsonProcessingException ex) {
            log.warn("[SlipRevisionService] 손상된 revision snapshot 요약 제외 — slipId={}, revisionNo={}, cause={}",
                    slipId, revision.getRevisionNo(), ex.getOriginalMessage());
            return null;
        }
    }

    private SlipSnapshot parseSnapshotForRestore(UUID slipId, int revisionNo, String snapshotJson) {
        try {
            SlipSnapshot snapshot = snapshotObjectMapper.readValue(snapshotJson, SlipSnapshot.class);
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
     * 두 스냅샷 간 변경 규모를 {@link ChangeSummary} 로 집계한다 (권한 재편 Phase 2.1 Task 4).
     *
     * <p>비교 규칙:
     * <ul>
     *   <li><b>prev == null</b> (최초 revision): headerChanged=0, lineRemoved=0, lineModified=0,
     *       lineAdded = cur 라인 수 (직전 없음 = 전 라인이 신규).</li>
     *   <li><b>헤더</b>: 두 스냅샷의 헤더 필드값을 {@link Objects#equals}로 비교해 다른 필드 수를
     *       센다 (slipNo, slipDate, partner 계열, memo, delivery 계열, supervision, project,
     *       recipient, payment, destinationWarehouse 계열 등 UUID 포함 복원 식별자 전부). 라인
     *       리스트는 헤더 카운트에서 제외.</li>
     *   <li><b>라인</b>: productId 기준 매칭 — cur 에만 있으면 added, prev 에만 있으면 removed,
     *       양쪽 존재하나 라인 필드(quantity, unitPrice, productName, modelName, specification,
     *       lineTotal, note) 중 하나라도 다르면 modified. 단가·합계는 저장 컬럼이 아니라
     *       {@link #LINE_FIELDS} 와 같은 <b>화면 표시값</b>으로 비교한다 (재수렴 7차 #937 —
     *       {@link #lineDiffers} 참고).</li>
     * </ul>
     *
     * <p>productId 가 null 인 라인은 매칭 키가 없어 added/removed 로만 집계된다 (modified 미판정).
     *
     * @param prev 직전 시점 스냅샷 (최초 revision 이면 null)
     * @param cur 현 시점 스냅샷 (필수)
     * @return 변경 규모 요약
     */
    public ChangeSummary summarize(SlipSnapshot prev, SlipSnapshot cur) {
        if (cur == null) {
            return null;
        }
        List<SlipSnapshot.Line> curLines = cur.lines() == null ? List.of() : cur.lines();
        if (prev == null) {
            return new ChangeSummary(0, curLines.size(), 0, 0);
        }
        List<SlipSnapshot.Line> prevLines = prev.lines() == null ? List.of() : prev.lines();

        int headerChanged = countHeaderChanges(prev, cur);

        // productId 기준 매칭. 동일 productId 복수 행은 등장 순서대로 매칭해 덮어쓰기 오귀속을 방지한다.
        Map<UUID, Deque<SlipSnapshot.Line>> prevById = lineQueuesByProductId(prevLines);

        int lineAdded = 0;
        int lineRemoved = 0;
        int lineModified = 0;

        // productId 가 null 인 라인은 키 매칭 불가 → cur=added, prev=removed
        for (SlipSnapshot.Line line : curLines) {
            if (line.productId() == null) {
                lineAdded++;
            }
        }
        for (SlipSnapshot.Line line : prevLines) {
            if (line.productId() == null) {
                lineRemoved++;
            }
        }

        for (SlipSnapshot.Line curLine : curLines) {
            if (curLine.productId() == null) {
                continue;
            }
            Deque<SlipSnapshot.Line> prevMatches = prevById.get(curLine.productId());
            SlipSnapshot.Line prevLine = prevMatches == null ? null : prevMatches.pollFirst();
            if (prevLine == null) {
                lineAdded++;
            } else if (lineDiffers(prevLine, curLine)) {
                lineModified++;
            }
        }
        for (Deque<SlipSnapshot.Line> remaining : prevById.values()) {
            lineRemoved += remaining.size();
        }

        return new ChangeSummary(headerChanged, lineAdded, lineRemoved, lineModified);
    }

    /**
     * 두 스냅샷의 헤더 필드를 1:1 비교해 값이 달라진 필드 수를 센다 (라인 리스트 제외).
     */
    private int countHeaderChanges(SlipSnapshot prev, SlipSnapshot cur) {
        int changed = 0;
        if (!Objects.equals(prev.slipNo(), cur.slipNo())) {
            changed++;
        }
        if (!Objects.equals(prev.slipDate(), cur.slipDate())) {
            changed++;
        }
        if (!Objects.equals(prev.partnerId(), cur.partnerId())) {
            changed++;
        }
        if (!Objects.equals(prev.partnerName(), cur.partnerName())) {
            changed++;
        }
        if (!Objects.equals(prev.partnerCode(), cur.partnerCode())) {
            changed++;
        }
        if (!Objects.equals(prev.businessNumber(), cur.businessNumber())) {
            changed++;
        }
        if (!Objects.equals(prev.memo(), cur.memo())) {
            changed++;
        }
        if (!Objects.equals(prev.deliveryTag(), cur.deliveryTag())) {
            changed++;
        }
        if (!Objects.equals(prev.deliveryAddress(), cur.deliveryAddress())) {
            changed++;
        }
        if (!Objects.equals(prev.supervisionAddress(), cur.supervisionAddress())) {
            changed++;
        }
        if (!Objects.equals(prev.projectName(), cur.projectName())) {
            changed++;
        }
        if (!Objects.equals(prev.recipientPhone(), cur.recipientPhone())) {
            changed++;
        }
        if (!Objects.equals(prev.paymentDueDate(), cur.paymentDueDate())) {
            changed++;
        }
        if (!Objects.equals(prev.destinationWarehouseId(), cur.destinationWarehouseId())) {
            changed++;
        }
        if (!Objects.equals(prev.destinationWarehouseName(), cur.destinationWarehouseName())) {
            changed++;
        }
        // audit overlay 필드 10개 (PR #318 cycle1 P1-1) — overlay 수정도 헤더 변경으로 집계
        if (!Objects.equals(prev.shippingAddress(), cur.shippingAddress())) {
            changed++;
        }
        if (!Objects.equals(prev.inspectionAddress(), cur.inspectionAddress())) {
            changed++;
        }
        if (!Objects.equals(prev.receiverPhone(), cur.receiverPhone())) {
            changed++;
        }
        if (!Objects.equals(prev.customerTel(), cur.customerTel())) {
            changed++;
        }
        if (!Objects.equals(prev.customerAddress(), cur.customerAddress())) {
            changed++;
        }
        if (!Objects.equals(prev.customerRepresentative(), cur.customerRepresentative())) {
            changed++;
        }
        if (!Objects.equals(prev.paymentDueLabel(), cur.paymentDueLabel())) {
            changed++;
        }
        if (!Objects.equals(prev.discountInfo(), cur.discountInfo())) {
            changed++;
        }
        if (!Objects.equals(prev.collectTerm(), cur.collectTerm())) {
            changed++;
        }
        if (!Objects.equals(prev.agreeTerm(), cur.agreeTerm())) {
            changed++;
        }
        return changed;
    }

    /**
     * 동일 productId 라인 2건의 필드값이 하나라도 다른지 판정한다 (BigDecimal 은 compareTo).
     *
     * <p>🚨 <b>#937 재수렴 7차 R7-1 부수 — 요약과 목록이 같은 판정을 한다</b>. 금액 2필드는
     * 저장 컬럼이 아니라 {@link #LINE_FIELDS} 와 <b>같은 표시값</b>으로 비교한다. 같은 카드가
     * {@code changeSummary}(FE {@code formatChangeSummary} 가 전부 0 이면 "변경 없음"으로 렌더)와
     * {@code fieldChanges} 목록을 함께 보여주므로, 두 지점이 다른 판정을 하면 "변경 없음"이라고
     * 쓴 카드가 그 아래에 변경을 나열하는 자기모순이 된다 — 부가세만 편집한 라인이 정확히 그
     * 경우다(저장 {@code lineTotal}=공급가액은 그대로인데 표시 합계 {@code S+V} 는 바뀐다).
     */
    private boolean lineDiffers(SlipSnapshot.Line a, SlipSnapshot.Line b) {
        if (a.quantity() != b.quantity()) {
            return true;
        }
        if (!bigDecimalEquals(unitPriceDisplayValue(a), unitPriceDisplayValue(b))) {
            return true;
        }
        if (!bigDecimalEquals(lineTotalDisplayValue(a), lineTotalDisplayValue(b))) {
            return true;
        }
        return !Objects.equals(a.productName(), b.productName())
                || !Objects.equals(a.modelName(), b.modelName())
                || !Objects.equals(a.specification(), b.specification())
                || !Objects.equals(a.note(), b.note());
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

    /**
     * 직전 스냅샷 대비 사용자 표시 가능한 필드/품목 셀 변경 목록을 만든다.
     *
     * <p>UUID 계열 식별자(partnerId/productId/warehouseId)는 복원 내부값이므로 응답에서 제외한다.
     * 라인은 {@code productId} 기준으로 매칭해 셀 변경을 표시한다 — row index 기준 비교는 행
     * 삽입/삭제 시 엉뚱한 셀끼리 비교돼 잘못된 변경자 귀속(오정보)을 만든다(리뷰 BE B-1).
     */
    List<FieldChange> fieldChanges(SlipSnapshot prev, SlipSnapshot cur,
                                   String actorName, String actorColor,
                                   LocalDateTime changedAt) {
        List<FieldChange> changes = new ArrayList<>();
        for (HeaderField field : HEADER_FIELDS) {
            Object before = prev == null ? null : field.reader().apply(prev);
            Object after = cur == null ? null : field.reader().apply(cur);
            addChange(changes, field.path(), field.label(), before, after, actorName, actorColor, changedAt);
        }

        List<SlipSnapshot.Line> prevLines = prev == null || prev.lines() == null ? List.of() : prev.lines();
        List<SlipSnapshot.Line> curLines = cur == null || cur.lines() == null ? List.of() : cur.lines();

        // 품목 라인을 productId 기준으로 매칭(summarize 와 동일). matched 쌍만 셀 diff, 미매칭은 추가/삭제.
        Map<UUID, Deque<SlipSnapshot.Line>> prevById = lineQueuesByProductId(prevLines);
        // cur 순서 유지 — productId 매칭되면 그 prev 라인과 셀 diff(remove 로 소진), 미매칭(또는 null)이면 행 추가
        for (int i = 0; i < curLines.size(); i++) {
            SlipSnapshot.Line curLine = curLines.get(i);
            Deque<SlipSnapshot.Line> prevMatches =
                    curLine.productId() == null ? null : prevById.get(curLine.productId());
            SlipSnapshot.Line prevLine = prevMatches == null ? null : prevMatches.pollFirst();
            // 라벨은 현재 행 위치(i) 기준 — 매칭은 productId 로 정확히 하되 표시는 현재 위치(기존 계약).
            String label = "품목 " + (i + 1) + "행";
            for (LineField field : LINE_FIELDS) {
                Object before = prevLine == null ? null : field.reader().apply(prevLine);
                Object after = field.reader().apply(curLine);
                addChange(changes, "lines[" + i + "]." + field.name(),
                        label + " " + field.label(), before, after, actorName, actorColor, changedAt);
            }
        }
        // prevById 에 남은 라인 = cur 에서 삭제됨(productId null prev 라인도 매칭 불가 → 삭제) → value→null
        int removedIdx = 0;
        for (SlipSnapshot.Line prevLine : prevLines) {
            Deque<SlipSnapshot.Line> remaining =
                    prevLine.productId() == null ? null : prevById.get(prevLine.productId());
            boolean removed = prevLine.productId() == null
                    || (remaining != null && remaining.removeFirstOccurrence(prevLine));
            if (!removed) {
                continue;
            }
            String label = lineLabel(prevLine, -1) + " (삭제)";
            for (LineField field : LINE_FIELDS) {
                addChange(changes, "lines.removed[" + removedIdx + "]." + field.name(),
                        label + " " + field.label(), field.reader().apply(prevLine), null,
                        actorName, actorColor, changedAt);
            }
            removedIdx++;
        }
        return changes;
    }

    /**
     * 스냅샷 라인의 "단가" 표시값 — 화면과 같은 VAT 포함 도메인. <b>버전이력·레드라인 공용</b>.
     *
     * <p>🚨 <b>#937 재수렴 6차 — 개발책임자 결정 A안 "저장 시점에 도메인 기록"</b>.
     * {@code unitPriceDomain} 이 실려 있으면 <b>휴리스틱 판정을 아예 하지 않고</b> 저장된
     * {@code unitPriceWithVat} 를 그대로 쓴다. 이 값이 곧 "이 단가가 어느 도메인의 사용자
     * 입력인가"에 대한 저장 시점의 답이기 때문이다.
     *
     * <p><b>왜 판정식으로는 닫히지 않았나</b>: 6라운드에 걸쳐 기준을 세 번 바꿨지만(동일성 →
     * 항등식 → 공급가액 일치) 오판 표면이 22행 → 10행으로 줄었을 뿐 0 이 되지 않았다. 같은 행
     * {@code 100000|100000|200000|20000|2} 에 대해 "구 BE 오염 방지"는 유도(110,000)를,
     * 2026-07-25 결정 P4 는 보존(100,000)을 요구하는데 <b>두 경우의 저장 상태가 완전히 같다</b>.
     *
     * <p><b>legacy 행({@code unitPriceDomain == null})은 현행 휴리스틱을 유지한다</b> — 개발책임자
     * 결정 내용이며, 그 행들의 도메인은 실제로 알 수 없다. 휴리스틱 규칙(4차·5차 근본수정):
     * {@code unit_price_with_vat} 는 사용자 권위 입력이므로 P4 대로 역산하지 않되,
     * <b>저장값 × 수량이 VAT 제외 총액(공급가액)과 맞아떨어질 때만</b>(= 구 BE 가 화면 단가를 두
     * 컬럼에 그대로 각인한 오염 신호) 권위 합계에서 유도한다.
     *
     * <p>FE {@code lineVat.resolveUnitPrices} 와 같은 판정 규칙의 미러다 — 갈리면 화면과 감사
     * 이력이 어긋난다.
     *
     * @param line 스냅샷 라인
     * @return 화면 도메인(VAT 포함) 단가 표시값
     */
    static BigDecimal unitPriceDisplayValue(SlipSnapshot.Line line) {
        BigDecimal stored = line.unitPriceWithVat() != null ? line.unitPriceWithVat() : line.unitPrice();
        // A안 — 저장 시점에 기록된 도메인이 있으면 추측하지 않는다.
        if (line.unitPriceDomain() != null && !line.unitPriceDomain().isBlank()
                && line.unitPriceWithVat() != null) {
            return line.unitPriceWithVat();
        }
        BigDecimal total = lineTotalDisplayValue(line);
        if (total == null || line.quantity() <= 0) {
            return stored;
        }
        BigDecimal supply = line.supplyAmount() != null ? line.supplyAmount() : line.lineTotal();
        if (stored != null && !scaledEquals(stored.multiply(BigDecimal.valueOf(line.quantity())), supply)) {
            return stored;
        }
        if (stored != null && scaledEquals(stored.multiply(BigDecimal.valueOf(line.quantity())), total)) {
            return stored;
        }
        return total.divide(BigDecimal.valueOf(line.quantity()), 2, java.math.RoundingMode.HALF_UP);
    }

    /** 원 단위(scale 0, HALF_UP)로 반올림해 두 금액이 같은지 본다. */
    private static boolean scaledEquals(BigDecimal left, BigDecimal right) {
        if (left == null || right == null) {
            return false;
        }
        return left.setScale(0, java.math.RoundingMode.HALF_UP)
                .compareTo(right.setScale(0, java.math.RoundingMode.HALF_UP)) == 0;
    }

    /**
     * 스냅샷 라인의 "합계" 표시값 — 화면과 같은 VAT 포함 합계 {@code S + V}.
     * <b>버전이력·레드라인 공용</b> (재수렴 7차 R7-1 부터 버전이력도 이 함수를 쓴다).
     *
     * <p>🚨 <b>#937 재수렴 7차 R7-2 — FE 미러 정렬</b>. 종전에는 {@code supplyAmount} 와
     * {@code vatAmount} 가 <b>둘 다 없는</b> 구 스냅샷에서 {@code lineTotal}(VAT 제외)을 총액으로
     * 그대로 반환했다. 그런데 같은 좌표에서 화면({@code SlipDetailPage.slipLineAmounts})은
     * {@code 공급가액 = lineTotal}, {@code 부가세 = 그 10%} 로 보아 {@code lineTotal + 10%} 를
     * 총액으로 쓴다. 이 발산 때문에 실전표 {@code 2026/06/24-7} 은 rev3(금액 3값 없음) →
     * rev4(금액 3값 채워짐) 전이에서 <b>사용자가 하지 않은</b> "품목 1행 단가 100000 → 110000"
     * 을 버전이력에 남겼다 — 표시 총액이 100,000 에서 110,000 으로 <i>해석만</i> 바뀐 탓이다.
     * 화면이 사용자가 보는 권위이므로 BE 를 화면에 맞춘다(불변식 3).
     *
     * <p>따라서 판정은 화면과 1:1 이다: {@code S = supplyAmount ?: lineTotal},
     * {@code V = vatAmount ?: S 의 10%(0 방향 절사)}, 총액 {@code = S + V}.
     * FE 미러: {@code SlipDetailPage.slipLineAmounts} / {@code vatRounding.vatFromSupply}.
     *
     * @param line 스냅샷 라인
     * @return VAT 포함 라인 합계 (금액 정보가 전혀 없으면 null)
     */
    static BigDecimal lineTotalDisplayValue(SlipSnapshot.Line line) {
        BigDecimal supply = line.supplyAmount() != null ? line.supplyAmount() : line.lineTotal();
        if (supply == null) {
            return null;
        }
        if (line.vatAmount() != null) {
            return supply.add(line.vatAmount());
        }
        return supply.add(com.samhanair.logis.common.financial.VatAmountCalculator.fromSupply(supply));
    }

    private Map<UUID, Deque<SlipSnapshot.Line>> lineQueuesByProductId(List<SlipSnapshot.Line> lines) {
        Map<UUID, Deque<SlipSnapshot.Line>> byId = new LinkedHashMap<>();
        for (SlipSnapshot.Line line : lines) {
            if (line.productId() != null) {
                byId.computeIfAbsent(line.productId(), ignored -> new ArrayDeque<>()).addLast(line);
            }
        }
        return byId;
    }

    /**
     * 품목 라인 표시 라벨 — productName 있으면 "품목 {productName}", 없으면 "품목 {n}행"(추가/매칭) 또는 "품목"(삭제).
     */
    private String lineLabel(SlipSnapshot.Line line, int displayIndex) {
        String productName = line.productName();
        if (productName != null && !productName.isBlank()) {
            return "품목 " + productName;
        }
        return displayIndex >= 0 ? "품목 " + (displayIndex + 1) + "행" : "품목";
    }

    private void addChange(List<FieldChange> changes, String fieldPath, String label,
                           Object before, Object after, String actorName, String actorColor,
                           LocalDateTime changedAt) {
        if (valueEquals(before, after)) {
            return;
        }
        changes.add(new FieldChange(fieldPath, label, formatValue(before), formatValue(after),
                actorName, actorColor, changedAt));
    }

    private boolean valueEquals(Object before, Object after) {
        if (before instanceof BigDecimal a && after instanceof BigDecimal b) {
            return bigDecimalEquals(a, b);
        }
        return Objects.equals(before, after);
    }

    private String formatValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof BigDecimal decimal) {
            return decimal.stripTrailingZeros().toPlainString();
        }
        if (value instanceof LocalDate date) {
            return date.toString();
        }
        return String.valueOf(value);
    }

    String resolveActorColor(SlipRevision revision) {
        if (revision.getActorColor() != null && !revision.getActorColor().isBlank()) {
            return revision.getActorColor();
        }
        if (revision.getActorId() == null) {
            return null;
        }
        return PresenceColor.fromUserId(revision.getActorId().toString()).hex();
    }

    String resolveActorColor(SlipRevisionSnapshotRow revision) {
        if (revision.getActorColor() != null && !revision.getActorColor().isBlank()) {
            return revision.getActorColor();
        }
        if (revision.getActorId() == null) {
            return null;
        }
        return PresenceColor.fromUserId(revision.getActorId().toString()).hex();
    }

    String safeActorName(String actorName) {
        if (actorName == null || actorName.isBlank()) {
            return null;
        }
        String trimmed = actorName.trim();
        return UUID_PATTERN.matcher(trimmed).matches() ? null : trimmed;
    }
}
