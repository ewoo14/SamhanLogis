package com.samhanair.logis.partnerorder.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.config.PartnerOrderProperties;
import com.samhanair.logis.partnerorder.domain.HistoryEventType;
import com.samhanair.logis.partnerorder.domain.PartnerOrderDraft;
import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import com.samhanair.logis.partnerorder.repository.PartnerOrderDraftRepository;
import com.samhanair.logis.partnerorder.repository.PartnerOrderHistoryRepository;
import com.samhanair.logis.partnerorder.web.dto.DraftCreateRequest;
import com.samhanair.logis.partnerorder.web.dto.DraftDetailResponse;
import com.samhanair.logis.partnerorder.web.dto.DraftResponse;
import com.samhanair.logis.partnerorder.web.dto.WebPartnerOrderDraftListResponse;
import java.math.BigDecimal;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 임시저장 (PartnerOrderDraft) 도메인 서비스. 30일 TTL ({@link PartnerOrderProperties#getTtlDays}).
 *
 * <p>핵심 책임:
 * <ul>
 *   <li>거래처별 draftSeq MAX+1 산출 (UNIQUE per partner)</li>
 *   <li>cleanup batch (TTL 만료 row 삭제 — soft delete)</li>
 *   <li>history 기록 (DRAFT_CREATED/UPDATED/DELETED)</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class PartnerOrderDraftService {

    private static final Logger log = LoggerFactory.getLogger(PartnerOrderDraftService.class);
    private static final String AUTO_CONFIRM_LABEL = "주문서 확정 임시저장";

    private final PartnerOrderDraftRepository draftRepository;
    private final PartnerOrderHistoryRepository historyRepository;
    private final PartnerOrderProperties properties;
    private final EntityManager entityManager;

    /**
     * 임시저장 1건 생성. draftSeq 는 거래처별 MAX+1.
     *
     * @param partnerCode 거래처 코드 (JWT 또는 헤더에서 도출)
     * @param actorUserId X-User-Id (history actor)
     * @param request label + payloadJson
     * @return 생성된 DraftResponse
     */
    @Transactional
    public DraftResponse create(String partnerCode, String actorUserId, DraftCreateRequest request) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "partnerCode 필수");
        }
        lockDraftSeq(partnerCode);

        // 주문 전송 재시도/동시 탭·기기 요청은 같은 snapshot의 draft를 재사용한다.
        // 그러면 confirm은 새 멱등키를 만들지 않고 기존 PO-CONF-{partnerCode}-{draftSeq}를
        // 다시 조회한다. 만료된 snapshot만 새 draft로 만든다.
        if (AUTO_CONFIRM_LABEL.equals(request.label())) {
            var existing = draftRepository
                    .findFirstByPartnerCodeAndLabelAndPayloadJsonOrderByCreatedAtDesc(
                            partnerCode, request.label(), request.payloadJson())
                    .filter(draft -> !draft.isExpired(LocalDateTime.now()));
            if (existing.isPresent()) {
                return DraftResponse.from(existing.get());
            }
        }

        long nextSeq = draftRepository.findMaxDraftSeqByPartnerCode(partnerCode) + 1L;
        LocalDateTime expiresAt = LocalDateTime.now().plusDays(properties.getTtlDays());

        PartnerOrderDraft draft = PartnerOrderDraft.create(
                partnerCode, nextSeq, request.label(), request.payloadJson(), expiresAt);
        draft = draftRepository.save(draft);

        historyRepository.save(PartnerOrderHistory.ofDraft(
                draft.getId(), partnerCode, HistoryEventType.DRAFT_CREATED,
                actorUserId, "{\"draftSeq\":" + nextSeq + "}"));

        return DraftResponse.from(draft);
    }

    /** 거래처별 draft 페이지 조회 (legacy getDraftList). 본인 거래처만. */
    @Transactional(readOnly = true)
    public Page<DraftResponse> list(String partnerCode, Pageable pageable) {
        return list(partnerCode, null, null, pageable);
    }

    /** 데스크톱 견적 목록용 UUID-free draft 메타데이터. */
    @Transactional(readOnly = true)
    public List<WebPartnerOrderDraftListResponse> desktopList() {
        return draftRepository.findAllByOrderByCreatedAtDesc().stream().map(draft ->
                new WebPartnerOrderDraftListResponse(
                        draft.getPartnerCode() + ":" + draft.getDraftSeq(),
                        draft.getLabel(),
                        draft.getPartnerCode(),
                        draft.getCreatedAt(),
                        BigDecimal.ZERO)).toList();
    }

    /** 거래처별 draft 페이지 조회 (legacy getOrderSnapshotHistory). 날짜 필터는 선택이다. */
    @Transactional(readOnly = true)
    public Page<DraftResponse> list(String partnerCode, LocalDate from, LocalDate to, Pageable pageable) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED, "partnerCode 필수");
        }
        if (from != null && to != null) {
            return draftRepository.findAllByPartnerCodeAndCreatedAtBetweenOrderByCreatedAtDesc(
                            partnerCode, from.atStartOfDay(), to.atTime(LocalTime.MAX), pageable)
                    .map(DraftResponse::from);
        }
        if (from != null) {
            return draftRepository.findAllByPartnerCodeAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
                            partnerCode, from.atStartOfDay(), pageable)
                    .map(DraftResponse::from);
        }
        if (to != null) {
            return draftRepository.findAllByPartnerCodeAndCreatedAtLessThanEqualOrderByCreatedAtDesc(
                            partnerCode, to.atTime(LocalTime.MAX), pageable)
                    .map(DraftResponse::from);
        }
        return draftRepository.findAllByPartnerCodeOrderByCreatedAtDesc(partnerCode, pageable)
                .map(DraftResponse::from);
    }

    /** 단건 상세 조회 (payload 포함). 본인 거래처 검증. */
    @Transactional(readOnly = true)
    public DraftDetailResponse getOne(String partnerCode, UUID draftId) {
        PartnerOrderDraft draft = draftRepository.findById(draftId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "임시저장을 찾을 수 없습니다"));
        if (!draft.getPartnerCode().equals(partnerCode)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "본인 거래처 임시저장만 조회 가능");
        }
        return DraftDetailResponse.from(draft);
    }

    /**
     * TTL cleanup batch — expiresAt &lt; now() 인 row 를 soft-delete.
     * scheduler 또는 admin endpoint 가 호출.
     *
     * @param actorUserId 실행 주체 (보통 'system' 또는 admin id)
     * @return 삭제 처리된 row 수
     */
    @Transactional
    public int cleanupExpired(String actorUserId) {
        LocalDateTime cutoff = LocalDateTime.now();
        List<PartnerOrderDraft> expired = draftRepository.findAllByExpiresAtBefore(cutoff);
        for (PartnerOrderDraft d : expired) {
            d.markDeleted(actorUserId);
            historyRepository.save(PartnerOrderHistory.ofDraft(
                    d.getId(), d.getPartnerCode(), HistoryEventType.DRAFT_DELETED,
                    actorUserId, "{\"reason\":\"TTL_EXPIRED\"}"));
        }
        if (!expired.isEmpty()) {
            log.info("Draft cleanup batch: {} rows expired", expired.size());
        }
        return expired.size();
    }

    /**
     * PostgreSQL transaction advisory lock 으로 거래처별 draftSeq 채번 구간을 직렬화한다.
     *
     * <p>D-LOAD-05 fix8: {@code ux_partner_order_drafts_partner_seq_active} 는 최종 백업일 뿐,
     * {@code MAX+1} 계산과 INSERT 사이를 보호하지 않으면 병렬 생성이 같은 draftSeq 를 고를 수 있다.
     */
    private void lockDraftSeq(String partnerCode) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(?1) AS bigint))")
                .setParameter(1, "partner_draft_seq_" + partnerCode)
                .getSingleResult();
    }
}
