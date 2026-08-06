package com.samhanair.logis.partnerorder.revision.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.domain.PartnerOrderStatus;
import com.samhanair.logis.partnerorder.repository.PartnerOrderLineRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.realtime.PartnerOrderBoardChangePublisher;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.revision.snapshot.PartnerOrderSnapshot;
import com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionDetailResponse;
import com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionResponse;
import com.samhanair.logis.partnerorder.revision.web.dto.PartnerOrderRevisionResponse.ChangeSummary;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 거래처 주문 버전이력 캡처 + point-in-time 복원 서비스 (Phase 2.4).
 *
 * <p>핵심 책임:
 * <ul>
 *   <li>{@link #assemble(PartnerOrder)} — 주문 헤더+라인(is_deleted=false) 을 {@link PartnerOrderSnapshot} 으로 조립</li>
 *   <li>{@link #capture} — 스냅샷 직렬화 + revision_no 채번(MAX+1) + {@code saveAndFlush}
 *       + {@link DataIntegrityViolationException} 1회 재시도 → 409</li>
 *   <li>{@link #restore} — 대상 revision 스냅샷 역직렬화 → 헤더 역적용 + 라인 전량교체 + RESTORE revision 캡처</li>
 * </ul>
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}):
 * actorName 이 UUID 패턴(또는 actorId 와 동일한 UUID 문자열)이면 null 로 저장한다.
 * 게이트웨이 X-User-Name 미전파 시 principal=UUID 가 actorName 으로 흘러드는 케이스(PR #320 F4 회귀) 차단.
 * {@link #displayNameOrNull(UUID, String)} 헬퍼가 담당.
 *
 * <p>revision_no 채번은 {@link PartnerOrderRevisionRepository#findMaxRevisionNo(UUID)} + 1.
 * {@code partner_orders.revision_count} 와는 별개 채널.
 *
 * <p>{@link com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService} 미러.
 */
@Service
@Transactional
public class PartnerOrderRevisionService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderRevisionService.class);

    /** UUID 패턴 — 8-4-4-4-12 hex. actorName 필터링에 사용한다. */
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final PartnerOrderRevisionRepository revisionRepository;
    private final PartnerOrderRepository orderRepository;
    private final PartnerOrderLineRepository lineRepository;
    private final ObjectMapper objectMapper;
    private final ObjectMapper snapshotObjectMapper;
    private final PartnerOrderBoardChangePublisher boardChangePublisher;

    public PartnerOrderRevisionService(PartnerOrderRevisionRepository revisionRepository,
                                       PartnerOrderRepository orderRepository,
                                       PartnerOrderLineRepository lineRepository,
                                       ObjectMapper objectMapper) {
        this(revisionRepository, orderRepository, lineRepository, objectMapper, null);
    }

    @Autowired
    public PartnerOrderRevisionService(PartnerOrderRevisionRepository revisionRepository,
                                       PartnerOrderRepository orderRepository,
                                       PartnerOrderLineRepository lineRepository,
                                       ObjectMapper objectMapper,
                                       PartnerOrderBoardChangePublisher boardChangePublisher) {
        this.revisionRepository = revisionRepository;
        this.orderRepository = orderRepository;
        this.lineRepository = lineRepository;
        this.objectMapper = objectMapper;
        this.boardChangePublisher = boardChangePublisher;
        this.snapshotObjectMapper = objectMapper.copy()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
                .configure(DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL, true);
    }

    /**
     * 주문 헤더+라인(is_deleted=false) 을 불변 스냅샷으로 조립한다.
     *
     * <p>{@link PartnerOrder#getLines()} 는 {@code @SQLRestriction("is_deleted = false")} +
     * 런타임 null-deletedAt 필터로 활성 라인만 반환하므로, soft-deleted 라인은 스냅샷에 포함되지 않는다.
     *
     * @param order 영속 상태의 거래처 주문
     * @return 헤더+라인 full-snapshot record
     */
    public PartnerOrderSnapshot assemble(PartnerOrder order) {
        return PartnerOrderSnapshot.from(order);
    }

    /**
     * 현 주문 상태를 버전 스냅샷 1건으로 캡처해 영속화한다.
     *
     * <p>revision_no 는 {@code findMaxRevisionNo(orderId) + 1} 로 채번한다. 기존 스냅샷이
     * 없으면 MAX 가 null 이므로 첫 버전은 1 이 된다. {@code saveAndFlush} 로 unique 제약
     * 위반을 즉시 노출시켜 재시도 가드를 작동시킨다.
     *
     * @param order           캡처 대상 주문 (영속 상태, id 필수)
     * @param type            캡처 유형 CREATE/EDIT/STATUS/RESTORE/DELETE
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param actorId         변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName       변경 주체 표시명 (UUID 비공개 가드 적용 전 원본)
     * @param actorColor      FE userIdToColor 결과 backup (선택, null 허용)
     * @return 영속화된 PartnerOrderRevision
     * @throws ResponseStatusException(409) 동시 채번 충돌 1회 재시도 후에도 실패 시
     */
    public PartnerOrderRevision capture(PartnerOrder order,
                                        PartnerOrderRevisionType type,
                                        Integer sourceRevisionNo,
                                        UUID actorId,
                                        String actorName,
                                        String actorColor) {
        PartnerOrderSnapshot snapshot = assemble(order);
        String snapshotJson = serialize(snapshot);
        String safeActorName = displayNameOrNull(actorId, actorName);

        try {
            return saveWithNextRevisionNo(order, type, sourceRevisionNo,
                    snapshotJson, actorId, safeActorName, actorColor);
        } catch (DataIntegrityViolationException firstConflict) {
            log.warn("[PartnerOrderRevisionService] revision_no 채번 충돌 1차 재시도 — orderId={}",
                    order.getId());
            try {
                return saveWithNextRevisionNo(order, type, sourceRevisionNo,
                        snapshotJson, actorId, safeActorName, actorColor);
            } catch (DataIntegrityViolationException retryConflict) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "동시 수정 충돌로 버전 캡처에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            }
        }
    }

    /**
     * 거래처 주문을 특정 revision 시점 스냅샷으로 복원한다 (Phase 2.4 point-in-time 복원).
     *
     * <p>처리 순서:
     * <ol>
     *   <li>order 로드 — 없으면 404</li>
     *   <li>target revision 로드 — 없으면 404</li>
     *   <li>{@link PartnerOrder#requireRestorable()} — CONFIRMING/CANCELED 이면 409</li>
     *   <li>복원 직전 상태가 CONFIRMED 인지 캡처 ({@code wasConfirmed}) — slip 재동기화 플래그 산출용</li>
     *   <li>스냅샷 역직렬화 → 헤더 도메인 메서드로 역적용 + 라인 전량교체(soft-delete 후 재생성)</li>
     *   <li>복원 결과를 RESTORE type revision 으로 capture</li>
     * </ol>
     *
     * <p>헤더 역적용은 {@link PartnerOrder#restoreHeader(UUID, String, String, java.time.LocalDate, String)} 를 통해
     * 도메인 메서드를 사용하며, 직접 setter 호출은 금지한다.
     *
     * <p>라인 전량교체는 {@link PartnerOrder#replaceLines(List)} 를 재사용한다.
     * <b>경로 분기 (cycle2c)</b>: soft-deleted 주문({@code wasDeleted=true}) 복원 시에만
     * native query({@code findAllIncludingDeletedByPartnerOrderId}) 로 전체 라인을 조회해
     * 선(先) markDeleted 전처리를 수행한다. 이미 soft-deleted 라인이 @SQLRestriction 컬렉션에서
     * 빠져 있어 replaceLines() 내부 루프가 처리하지 못하기 때문이다.
     * 일반 복원({@code wasDeleted=false}, DRAFT/CONFIRMED)은 불필요한 전처리 없이
     * replaceLines() 단독 경로로 처리한다.
     *
     * <p>{@code slipResyncRequired} 플래그 의미:
     * 복원 직전 주문이 {@link com.samhanair.logis.partnerorder.domain.PartnerOrderStatus#CONFIRMED} 상태였을 때
     * {@code true} 로 설정된다. restoreHeader 가 status 를 변경하지 않으므로 복원 후에도
     * 주문은 CONFIRMED 상태를 유지하지만, 헤더/라인이 과거 스냅샷으로 원복되었으므로
     * 연결 출고전표의 재발행 여부를 담당자가 확인해야 한다.
     *
     * @param orderId          복원 대상 주문 UUID
     * @param targetRevisionNo 복원할 시점의 revision_no
     * @param actorId          복원 주체 UUID (감사용)
     * @param actorName        복원 주체 표시명 (UUID 비공개 가드 적용 전 원본)
     * @param actorColor       FE userIdToColor 결과 backup (선택, null 허용)
     * @return {@link PartnerOrderRestoreResult} — 갱신된 주문 + slipResyncRequired 플래그
     * @throws ResponseStatusException(404) orderId 또는 targetRevisionNo 미존재
     * @throws ResponseStatusException(409) CONFIRMING/CANCELED 상태에서 복원 시도
     */
    public PartnerOrderRestoreResult restore(UUID orderId,
                                             int targetRevisionNo,
                                             UUID actorId,
                                             String actorName,
                                             String actorColor) {
        // 1. 주문 로드 — soft-deleted 주문도 복원 대상이므로 @SQLRestriction 우회 조회 사용
        //    (설계서 §3.3a: 삭제된 주문도 복원 가능)
        PartnerOrder order = orderRepository.findByIdIncludingDeleted(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "주문을 찾을 수 없습니다"));

        // 2. 대상 revision 로드
        PartnerOrderRevision target = revisionRepository
                .findByPartnerOrderIdAndRevisionNo(orderId, targetRevisionNo)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "복원 대상 버전을 찾을 수 없습니다 (버전 " + targetRevisionNo + ")"));

        // 3. 복원 가드 (CONFIRMING · CANCELED 만 거부 — soft-deleted 여부 무관, status 기준 검사)
        order.requireRestorable();

        // 4. soft-deleted 주문 undelete — is_deleted=false + deletedAt/deletedBy 클리어
        //    (설계서 §3.3a: 복원 시 undelete + 시점 내용 적용)
        boolean wasDeleted = Boolean.TRUE.equals(order.getIsDeleted());
        if (wasDeleted) {
            order.restoreFromDeleted();
            log.info("[PartnerOrderRevisionService] soft-deleted 주문 undelete — orderId={}", orderId);
        }

        // 5. 복원 직전 CONFIRMED 여부 캡처 — restoreHeader 는 status 를 변경하지 않으므로
        //    가드 통과 직후에 캡처해야 의미가 명확하다.
        boolean wasConfirmed = order.getStatus() == PartnerOrderStatus.CONFIRMED;

        // 6. 스냅샷 역직렬화 → 헤더 역적용 + 라인 전량교체
        PartnerOrderSnapshot snapshot = deserialize(target.getSnapshot());

        // 헤더 도메인 메서드로 역적용 (직접 setter 금지)
        order.restoreHeader(
                snapshot.partnerId(),
                snapshot.partnerCode(),
                snapshot.bizCode(),
                snapshot.dueDate(),
                snapshot.memo(),
                snapshot.deliveryAddress());

        // [P1-1 lines 정합 보장 + cycle2c 경로 분기]
        //
        // 삭제주문 복원(wasDeleted=true) 경로:
        //   PartnerOrder.lines 는 @SQLRestriction("is_deleted = false") 컬렉션이다.
        //   soft-deleted 주문을 undelete 한 후에도 이전에 soft-delete 된 라인들은
        //   @SQLRestriction 필터로 인해 this.lines 에 포함되지 않는다. 따라서
        //   replaceLines() 내부 markDeleted 루프가 이 라인들을 처리하지 못하고
        //   DB 에 중복 활성 라인으로 잔존할 수 있다.
        //   해법: native query 로 soft-deleted 포함 전체 라인을 조회하여 선(先) markDeleted 후
        //   replaceLines() 를 호출한다 (이중 처리 방지는 replaceLines 내부 deletedAt != null 가드).
        //   검증: IT case7(삭제→복원), case8(create→edit→delete→restore) 참조.
        //
        // 일반 복원(wasDeleted=false, DRAFT/CONFIRMED) 경로:
        //   삭제주문 전처리가 불필요하다. this.lines 컬렉션이 이미 활성 라인 전체를 포함하므로
        //   replaceLines() 내부 루프만으로 정확하게 처리된다(기존 draft update 패턴과 동일).
        //   불필요한 native 쿼리/전처리를 제거해 효율·명료성을 높인다.
        //   검증: IT case9(create→edit→restore, 비삭제 흐름) 참조.
        if (wasDeleted) {
            // 삭제주문 복원 전처리: native query 로 soft-deleted 라인 포함 전량 조회 → 활성 라인만 markDeleted
            List<PartnerOrderLine> allLinesIncludingDeleted =
                    lineRepository.findAllIncludingDeletedByPartnerOrderId(orderId);
            for (PartnerOrderLine line : allLinesIncludingDeleted) {
                if (line.getDeletedAt() == null) {
                    line.markDeleted("system-restore-pre-replace");
                }
            }
            log.debug("[PartnerOrderRevisionService] 삭제주문 복원 전처리 — orderId={}, totalLines={}, markedDeleted={}",
                    orderId,
                    allLinesIncludingDeleted.size(),
                    allLinesIncludingDeleted.stream().filter(l -> l.getDeletedAt() != null).count());
        } else {
            // 일반 복원: 전처리 불필요 — replaceLines() 가 this.lines(활성 라인) 만 markDeleted 처리
            log.debug("[PartnerOrderRevisionService] 일반 복원(비삭제 흐름) — replaceLines 단독 경로 — orderId={}", orderId);
        }

        // 라인 전량교체 — 기존 draft update 의 soft-delete 후 재생성 패턴 재사용.
        //   삭제주문 복원 시: 위 전처리에서 모든 라인(soft-deleted 포함) markDeleted 완료 →
        //     replaceLines() 내부 루프는 deletedAt != null 가드로 스킵하고 새 라인만 addLine().
        //   일반 복원 시: replaceLines() 가 this.lines(활성 라인)을 markDeleted 후 새 라인 addLine().
        List<PartnerOrderLine> newLines = snapshot.lines().stream()
                .map(this::restoreLine)
                .toList();
        order.replaceLines(newLines);

        // 영속화 (낙관적 락 충돌은 호출자가 처리)
        PartnerOrder saved = orderRepository.saveAndFlush(order);

        // 7. 복원 결과를 RESTORE revision 으로 캡처
        capture(saved, PartnerOrderRevisionType.RESTORE, targetRevisionNo,
                actorId, actorName, actorColor);
        if (boardChangePublisher != null) {
            boardChangePublisher.publishListChanged("RESTORED");
        }

        return new PartnerOrderRestoreResult(saved, wasConfirmed);
    }

    /** 금액 컬럼이 있는 신규 snapshot은 그대로 복원하고, legacy snapshot은 기존 PRICE 경로를 쓴다. */
    private PartnerOrderLine restoreLine(PartnerOrderSnapshot.LineSnapshot line) {
        if (line.authority() == null) {
            return PartnerOrderLine.create(line.productId(), line.modelName(), line.productName(),
                    line.categoryKey(), line.quantity(), line.priceVat(), line.remark());
        }
        return PartnerOrderLine.createFromAuthoritativeAmounts(
                line.productId(), line.modelName(), line.productName(), line.categoryKey(),
                line.quantity(), line.priceVat(), line.supplyAmount(), line.vatAmount(),
                line.subtotal(), line.authority(), line.remark());
    }

    // ── 조회 API 지원 ─────────────────────────────────────────────────────────

    /**
     * 거래처 주문의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param partnerOrderId 대상 거래처 주문 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<PartnerOrderRevision> list(UUID partnerOrderId) {
        return revisionRepository.findByPartnerOrderIdOrderByRevisionNoDesc(partnerOrderId);
    }

    /**
     * 버전 타임라인을 changeSummary 가 포함된 응답 DTO 로 조회한다 (Phase 2.4 Task 7).
     *
     * <p>인접 revision 스냅샷을 비교해 각 revision 의 {@link ChangeSummary} 를 계산한다 —
     * revisionNo 오름차순으로 정렬한 뒤 인접쌍을 훑고, 최종 반환은 다시 최신(내림차순) 우선으로 뒤집는다.
     *
     * <p>{@link com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService#listWithSummary} 미러.
     *
     * @param partnerOrderId 대상 거래처 주문 UUID
     * @return revisionNo 내림차순 정렬 + changeSummary 포함 응답 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<PartnerOrderRevisionResponse> listWithSummary(UUID partnerOrderId) {
        List<PartnerOrderRevision> revisions = new ArrayList<>(list(partnerOrderId));
        // 인접 비교를 위해 revisionNo 오름차순으로 정렬 (list 는 내림차순 반환)
        revisions.sort(Comparator.comparingInt(PartnerOrderRevision::getRevisionNo));

        List<PartnerOrderRevisionResponse> responses = new ArrayList<>(revisions.size());
        PartnerOrderSnapshot prev = null;
        for (PartnerOrderRevision revision : revisions) {
            PartnerOrderSnapshot cur = deserializeForSummary(revision);
            ChangeSummary summary = summarize(prev, cur);
            responses.add(new PartnerOrderRevisionResponse(
                    revision.getRevisionNo(),
                    revision.getRevisionType() == null ? null : revision.getRevisionType().name(),
                    revision.getSourceRevisionNo(),
                    revision.getOrderNo(),
                    revision.getActorName(),
                    revision.getActorColor(),
                    revision.getCreatedAt(),
                    summary));
            if (cur != null) {
                prev = cur;
            }
        }
        // 응답은 최신(revisionNo 내림차순) 우선으로 뒤집는다
        Collections.reverse(responses);
        return responses;
    }

    /**
     * 거래처 주문의 특정 revision 단일 스냅샷 상세를 조회한다 (Phase 2.4 Task 7).
     *
     * @param partnerOrderId 대상 거래처 주문 UUID
     * @param revisionNo     조회할 버전 번호
     * @return 단일 스냅샷 상세 응답 DTO
     * @throws org.springframework.web.server.ResponseStatusException(404) revision 미존재 시
     */
    @Transactional(readOnly = true)
    public PartnerOrderRevisionDetailResponse getRevisionDetail(UUID partnerOrderId, int revisionNo) {
        PartnerOrderRevision revision = revisionRepository
                .findByPartnerOrderIdAndRevisionNo(partnerOrderId, revisionNo)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "버전을 찾을 수 없습니다 (버전 " + revisionNo + ")"));
        PartnerOrderSnapshot snapshot = deserialize(revision.getSnapshot());
        return PartnerOrderRevisionDetailResponse.of(
                revision.getRevisionNo(),
                revision.getRevisionType() == null ? null : revision.getRevisionType().name(),
                revision.getSourceRevisionNo(),
                revision.getOrderNo(),
                revision.getActorName(),
                revision.getActorColor(),
                revision.getCreatedAt(),
                snapshot);
    }

    /**
     * 두 스냅샷 간 변경 규모를 {@link ChangeSummary} 로 집계한다 (Phase 2.4 Task 7).
     *
     * <p>비교 규칙:
     * <ul>
     *   <li><b>prev == null</b> (최초 revision): headerChanged=0, lineRemoved=0, lineModified=0,
     *       lineAdded = cur 라인 수 (직전 없음 = 전 라인이 신규).</li>
     *   <li><b>헤더</b>: partnerCode, bizCode, status, slipNo, totalAmount, dueDate, memo 등
     *       핵심 필드를 {@link Objects#equals}로 비교해 다른 필드 수를 센다.</li>
     *   <li><b>라인</b>: productId 기준 매칭 — cur 에만 있으면 added, prev 에만 있으면 removed,
     *       양쪽 존재하나 라인 필드 중 하나라도 다르면 modified.</li>
     * </ul>
     *
     * <p>{@link com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService#summarize} 미러.
     *
     * @param prev 직전 시점 스냅샷 (최초 revision 이면 null)
     * @param cur  현 시점 스냅샷 (필수)
     * @return 변경 규모 요약
     */
    public ChangeSummary summarize(PartnerOrderSnapshot prev, PartnerOrderSnapshot cur) {
        if (cur == null) {
            return null;
        }
        List<PartnerOrderSnapshot.LineSnapshot> curLines =
                cur.lines() == null ? List.of() : cur.lines();
        if (prev == null) {
            return new ChangeSummary(0, curLines.size(), 0, 0);
        }
        List<PartnerOrderSnapshot.LineSnapshot> prevLines =
                prev.lines() == null ? List.of() : prev.lines();

        int headerChanged = countHeaderChanges(prev, cur);

        // productId 기준 매칭 맵 (null productId 는 added/removed 로만 집계)
        Map<UUID, PartnerOrderSnapshot.LineSnapshot> prevById = new LinkedHashMap<>();
        for (PartnerOrderSnapshot.LineSnapshot line : prevLines) {
            if (line.productId() != null) {
                prevById.put(line.productId(), line);
            }
        }
        Map<UUID, PartnerOrderSnapshot.LineSnapshot> curById = new LinkedHashMap<>();
        for (PartnerOrderSnapshot.LineSnapshot line : curLines) {
            if (line.productId() != null) {
                curById.put(line.productId(), line);
            }
        }

        int lineAdded = 0;
        int lineRemoved = 0;
        int lineModified = 0;

        // productId 가 null 인 라인은 키 매칭 불가 → cur=added, prev=removed
        for (PartnerOrderSnapshot.LineSnapshot line : curLines) {
            if (line.productId() == null) {
                lineAdded++;
            }
        }
        for (PartnerOrderSnapshot.LineSnapshot line : prevLines) {
            if (line.productId() == null) {
                lineRemoved++;
            }
        }

        for (Map.Entry<UUID, PartnerOrderSnapshot.LineSnapshot> entry : curById.entrySet()) {
            PartnerOrderSnapshot.LineSnapshot prevLine = prevById.get(entry.getKey());
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
     * 두 스냅샷의 헤더 핵심 필드를 1:1 비교해 값이 달라진 필드 수를 센다 (라인 리스트 제외).
     *
     * <p>비교 대상: partnerCode, bizCode, status, slipNo, totalAmount, dueDate, memo.
     */
    private int countHeaderChanges(PartnerOrderSnapshot prev, PartnerOrderSnapshot cur) {
        int changed = 0;
        if (!Objects.equals(prev.partnerCode(), cur.partnerCode())) {
            changed++;
        }
        if (!Objects.equals(prev.bizCode(), cur.bizCode())) {
            changed++;
        }
        if (!Objects.equals(prev.status(), cur.status())) {
            changed++;
        }
        if (!Objects.equals(prev.slipNo(), cur.slipNo())) {
            changed++;
        }
        if (!bigDecimalEquals(prev.totalAmount(), cur.totalAmount())) {
            changed++;
        }
        if (!Objects.equals(prev.dueDate(), cur.dueDate())) {
            changed++;
        }
        if (!Objects.equals(prev.memo(), cur.memo())) {
            changed++;
        }
        if (!Objects.equals(prev.deliveryAddress(), cur.deliveryAddress())) {
            changed++;
        }
        return changed;
    }

    /**
     * 동일 productId 라인 2건의 필드값이 하나라도 다른지 판정한다 (BigDecimal 은 compareTo).
     */
    private boolean lineDiffers(PartnerOrderSnapshot.LineSnapshot a,
                                 PartnerOrderSnapshot.LineSnapshot b) {
        if (a.quantity() != b.quantity()) {
            return true;
        }
        if (!bigDecimalEquals(a.priceVat(), b.priceVat())) {
            return true;
        }
        if (!bigDecimalEquals(a.subtotal(), b.subtotal())) {
            return true;
        }
        if (!bigDecimalEquals(a.supplyAmount(), b.supplyAmount())
                || !bigDecimalEquals(a.vatAmount(), b.vatAmount())) {
            return true;
        }
        return !Objects.equals(a.modelName(), b.modelName())
                || !Objects.equals(a.productName(), b.productName())
                || !Objects.equals(a.categoryKey(), b.categoryKey())
                || !Objects.equals(a.remark(), b.remark());
    }

    /**
     * BigDecimal 동등 비교 — scale 차이 무시 (compareTo). null 안전.
     */
    private boolean bigDecimalEquals(BigDecimal a, BigDecimal b) {
        if (a == null || b == null) {
            return Objects.equals(a, b);
        }
        return a.compareTo(b) == 0;
    }

    // ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

    /**
     * 현 시점 MAX(revision_no)+1 로 채번해 PartnerOrderRevision 1건을 저장한다.
     *
     * <p>분리 목적: 채번 read 와 insert 가 한 호출에 묶여 있어야 재시도 시 갱신된 maxRevisionNo 로
     * 다시 채번된다. 스냅샷 JSON 은 호출자가 1회만 직렬화해 재시도 간 재사용한다 (불변).
     *
     * <p><b>채번 재시도 트랜잭션 격리 판단</b> (P2 검토, 2026-05-30):
     * {@link com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService}
     * 의 {@code saveWithNextRevisionNo} 가 동일한 구조 — 같은 트랜잭션 내 {@code saveAndFlush}
     * + {@link org.springframework.dao.DataIntegrityViolationException} 1회 재시도 — 로
     * 운영 검증되어 있으며, 본 메서드는 해당 패턴의 미러다.
     *
     * <p>Hibernate 6 + PostgreSQL 환경에서 {@code saveAndFlush} 후 unique 제약 위반은
     * Spring 이 {@code DataIntegrityViolationException} 으로 변환하여 상위로 전달한다.
     * 이 시점에서 Hibernate 세션이 {@code rollback-only} 로 전환될 가능성이 있으나,
     * {@code saveAndFlush} 내부에서 flush 가 실패할 때 Spring Data JPA 는
     * {@code EntityManager.clear()} 후 예외를 re-throw 하므로 세션 상태가 오염되지 않고
     * 재시도가 정상 동작한다 (EstimateRevisionService 운영 사례로 검증됨).
     *
     * <p>보수적 격리({@code @Transactional(propagation = REQUIRES_NEW)}) 가 필요한 시점은
     * EstimateRevisionService 와 본 서비스 양쪽에서 실 운영 충돌이 관찰될 때 적용한다.
     */
    private PartnerOrderRevision saveWithNextRevisionNo(PartnerOrder order,
                                                        PartnerOrderRevisionType type,
                                                        Integer sourceRevisionNo,
                                                        String snapshotJson,
                                                        UUID actorId,
                                                        String safeActorName,
                                                        String actorColor) {
        Integer max = revisionRepository.findMaxRevisionNo(order.getId());
        int next = (max == null ? 0 : max) + 1;
        PartnerOrderRevision revision = PartnerOrderRevision.of(
                order.getId(), next, type, sourceRevisionNo,
                order.getOrderNo(), snapshotJson,
                actorId, safeActorName, actorColor);
        return revisionRepository.saveAndFlush(revision);
    }

    /**
     * actorName UUID 비공개 가드 — actorName 이 UUID 패턴이거나 actorId 의 문자열 표현과
     * 일치하면 null 을 반환한다.
     *
     * <p>게이트웨이 X-User-Name 미전파 시 principal(UUID) 이 actorName 으로 흘러드는
     * 케이스(PR #320 F4 회귀)를 차단한다.
     *
     * @param actorId   변경 주체 UUID (null 허용)
     * @param actorName 변경 주체 표시명 원본 (null 허용)
     * @return UUID 패턴이면 null, 그 외 원본 actorName
     */
    public static String displayNameOrNull(UUID actorId, String actorName) {
        if (actorName == null) {
            return null;
        }
        // UUID 패턴 직접 매칭
        if (UUID_PATTERN.matcher(actorName).matches()) {
            return null;
        }
        // actorId 문자열과 동일한 경우 (대소문자 무시)
        if (actorId != null && actorId.toString().equalsIgnoreCase(actorName)) {
            return null;
        }
        return actorName;
    }

    /**
     * {@link PartnerOrderSnapshot} 을 JSON 문자열로 직렬화한다.
     *
     * @param snapshot 직렬화 대상 스냅샷
     * @return JSON 문자열
     * @throws ResponseStatusException(500) 직렬화 실패 시
     */
    private String serialize(PartnerOrderSnapshot snapshot) {
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "스냅샷 직렬화에 실패했습니다: " + e.getMessage());
        }
    }

    /**
     * JSON 문자열을 {@link PartnerOrderSnapshot} 으로 역직렬화한다.
     *
     * @param json 역직렬화 대상 JSON 문자열
     * @return 역직렬화된 스냅샷 record
     * @throws ResponseStatusException(500) 역직렬화 실패 시
     */
    private PartnerOrderSnapshot deserialize(String json) {
        try {
            return snapshotObjectMapper.readValue(json, PartnerOrderSnapshot.class);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "스냅샷 역직렬화에 실패했습니다: " + e.getMessage());
        }
    }

    /**
     * 목록 요약용 스냅샷 역직렬화.
     *
     * <p>과거 저장 스냅샷이 현재 record 로 더 이상 역직렬화되지 않아도 타임라인 전체를
     * 500 으로 실패시키지 않는다. 손상된 revision 은 summary=null 로 비우고, 다음 정상
     * revision 비교 기준은 직전 정상 스냅샷으로 유지한다.
     */
    private PartnerOrderSnapshot deserializeForSummary(PartnerOrderRevision revision) {
        try {
            return snapshotObjectMapper.readValue(revision.getSnapshot(), PartnerOrderSnapshot.class);
        } catch (JsonProcessingException e) {
            log.warn("[PartnerOrderRevisionService] revision snapshot 요약 생략 — orderId={}, revisionNo={}, cause={}",
                    revision.getPartnerOrderId(), revision.getRevisionNo(), e.getOriginalMessage());
            return null;
        }
    }
}
