package com.samhanair.logis.partnerorder.revision.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.partnerorder.domain.PartnerOrder;
import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import com.samhanair.logis.partnerorder.repository.PartnerOrderRepository;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevision;
import com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType;
import com.samhanair.logis.partnerorder.revision.repository.PartnerOrderRevisionRepository;
import com.samhanair.logis.partnerorder.revision.snapshot.PartnerOrderSnapshot;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
@RequiredArgsConstructor
public class PartnerOrderRevisionService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderRevisionService.class);

    /** UUID 패턴 — 8-4-4-4-12 hex. actorName 필터링에 사용한다. */
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final PartnerOrderRevisionRepository revisionRepository;
    private final PartnerOrderRepository orderRepository;
    private final ObjectMapper objectMapper;

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
     * @param type            캡처 유형 CREATE/EDIT/STATUS/RESTORE
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
     *   <li>{@link PartnerOrder#requireRestorable()} — DRAFT 아니면 409</li>
     *   <li>스냅샷 역직렬화 → 헤더 도메인 메서드로 역적용 + 라인 전량교체(soft-delete 후 재생성)</li>
     *   <li>복원 결과를 RESTORE type revision 으로 capture</li>
     * </ol>
     *
     * <p>헤더 역적용은 {@link PartnerOrder#restoreHeader(String, String, java.time.LocalDate, String)} 를 통해
     * 도메인 메서드를 사용하며, 직접 setter 호출은 금지한다.
     *
     * <p>라인 전량교체는 {@link PartnerOrder#replaceLines(List)} 를 재사용한다 —
     * 기존 draft update 의 soft-delete 후 재생성 패턴과 동일하다.
     *
     * @param orderId        복원 대상 주문 UUID
     * @param targetRevisionNo 복원할 시점의 revision_no
     * @param actorId        복원 주체 UUID (감사용)
     * @param actorName      복원 주체 표시명 (UUID 비공개 가드 적용 전 원본)
     * @param actorColor     FE userIdToColor 결과 backup (선택, null 허용)
     * @return 갱신된 PartnerOrder (헤더+라인 원복 완료 후 영속 상태)
     * @throws ResponseStatusException(404) orderId 또는 targetRevisionNo 미존재
     * @throws ResponseStatusException(409) DRAFT 아닌 상태에서 복원 시도
     */
    public PartnerOrder restore(UUID orderId,
                                int targetRevisionNo,
                                UUID actorId,
                                String actorName,
                                String actorColor) {
        // 1. 주문 로드
        PartnerOrder order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "주문을 찾을 수 없습니다. orderId=" + orderId));

        // 2. 대상 revision 로드
        PartnerOrderRevision target = revisionRepository
                .findByPartnerOrderIdAndRevisionNo(orderId, targetRevisionNo)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "복원 대상 revision 이 없습니다. orderId=" + orderId
                                + ", revisionNo=" + targetRevisionNo));

        // 3. DRAFT 상태 가드
        order.requireRestorable();

        // 4. 스냅샷 역직렬화 → 헤더 역적용 + 라인 전량교체
        PartnerOrderSnapshot snapshot = deserialize(target.getSnapshot());

        // 헤더 도메인 메서드로 역적용 (직접 setter 금지)
        order.restoreHeader(
                snapshot.partnerCode(),
                snapshot.bizCode(),
                snapshot.dueDate(),
                snapshot.memo());

        // 라인 전량교체 — 기존 draft update 의 soft-delete 후 재생성 패턴 재사용
        String actorIdStr = actorId != null ? actorId.toString() : "system-restore";
        List<PartnerOrderLine> newLines = snapshot.lines().stream()
                .map(ls -> PartnerOrderLine.create(
                        ls.productId(),
                        ls.modelName(),
                        ls.productName(),
                        ls.categoryKey(),
                        ls.quantity(),
                        ls.priceVat(),
                        ls.remark()))
                .toList();
        order.replaceLines(newLines);

        // 영속화 (낙관적 락 충돌은 호출자가 처리)
        PartnerOrder saved = orderRepository.saveAndFlush(order);

        // 5. 복원 결과를 RESTORE revision 으로 캡처
        capture(saved, PartnerOrderRevisionType.RESTORE, targetRevisionNo,
                actorId, actorName, actorColor);

        return saved;
    }

    // ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

    /**
     * 현 시점 MAX(revision_no)+1 로 채번해 PartnerOrderRevision 1건을 저장한다.
     *
     * <p>분리 목적: 채번 read 와 insert 가 한 호출에 묶여 있어야 재시도 시 갱신된 maxRevisionNo 로
     * 다시 채번된다. 스냅샷 JSON 은 호출자가 1회만 직렬화해 재시도 간 재사용한다 (불변).
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
            return objectMapper.readValue(json, PartnerOrderSnapshot.class);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR,
                    "스냅샷 역직렬화에 실패했습니다: " + e.getMessage());
        }
    }
}
