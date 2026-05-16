package com.samhanair.logis.partner.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.BlockedPartner;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.repository.BlockedPartnerRepository;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Phase 10 PR-D Part B — BLOCK 발송금지 거래처 라이프사이클 관리 (단건 CRUD + 차단 해제).
 *
 * <p>차단 해제 = soft-delete ({@link BlockedPartner#markDeleted(String)}). partial unique
 * index 가 partnerCode 재차단 허용. CSV bulk import 는 {@link PartnerBlockImportService}
 * 가 본 service 의 {@link #block(String, String, LocalDateTime, String, String)} 를 row 단위
 * 호출.
 *
 * <p>PR-E 알림 발송 가드는 {@link #isBlocked(String)} 로 외부 서비스가 호출 (chat-service /
 * push-service Feign) — 본 service 는 partner-service 내부 도메인에 속하므로 외부 노출은
 * controller 가 별도 책임.
 */
@Service
@RequiredArgsConstructor
public class PartnerBlockService {

    private final BlockedPartnerRepository blockedPartnerRepository;
    private final PartnerService partnerService;

    /**
     * 단건 차단 등록 (admin endpoint backing).
     *
     * <p>흐름:
     * <ol>
     *   <li>partnerCode 의 활성 BLOCK 존재 시 409 CONFLICT</li>
     *   <li>partnerCode 가 partners 마스터에 미존재 시 404 NOT_FOUND
     *       ({@link PartnerService#findByCode(String)} throw)</li>
     *   <li>BlockedPartner 신규 row 영속화 — businessName snapshot 은 partners.name 에서 자동 추출</li>
     * </ol>
     *
     * @param partnerCode 차단 대상 partnerCode
     * @param blockReason 차단 사유 (nullable)
     * @return 영속화된 BlockedPartner
     */
    @Transactional
    public BlockedPartner block(String partnerCode, String blockReason) {
        return block(partnerCode, blockReason, LocalDateTime.now(), "MANUAL", null);
    }

    /**
     * 단건 차단 등록 (CSV import 용 overload — blockedAt + source + 명시 snapshot 보존).
     *
     * @param partnerCode 차단 대상 partnerCode
     * @param blockReason 차단 사유 (nullable)
     * @param blockedAt 차단 시점 (CSV 의 "생성 일시" 또는 now())
     * @param source NOTION_IMPORT / MANUAL / LEGACY_GAS
     * @param businessNameOverride snapshot 명시 (CSV 입력 사업자명 보존). null 시 partners.name 사용.
     * @return 영속화된 BlockedPartner
     */
    @Transactional
    public BlockedPartner block(String partnerCode, String blockReason, LocalDateTime blockedAt,
                                String source, String businessNameOverride) {
        if (blockedPartnerRepository.existsByPartnerCodeAndIsDeletedFalse(partnerCode)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 차단된 partnerCode: " + partnerCode);
        }
        Partner partner = partnerService.findByCode(partnerCode);
        String snapshot = businessNameOverride != null && !businessNameOverride.isBlank()
                ? businessNameOverride
                : partner.getName();
        BlockedPartner entity = BlockedPartner.create(partner.getPartnerCode(), snapshot,
                blockReason, blockedAt, source);
        return blockedPartnerRepository.save(entity);
    }

    /**
     * legacy Notion 발송금지처럼 거래처코드 없이 상호만 있는 row 를 보존한다.
     *
     * <p>실제 거래처 마스터와 혼동되지 않도록 caller 가 {@code LEGACY-NAME-*} 형식의 alias code 를
     * 전달한다. 추후 거래처코드가 보강되면 일반 {@link #block(String, String, LocalDateTime, String, String)}
     * 경로로 재등록할 수 있다.
     */
    @Transactional
    public BlockedPartner blockLegacySnapshot(String aliasPartnerCode, String blockReason,
                                              LocalDateTime blockedAt, String source,
                                              String businessNameSnapshot) {
        if (blockedPartnerRepository.existsByPartnerCodeAndIsDeletedFalse(aliasPartnerCode)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 차단된 legacy alias: " + aliasPartnerCode);
        }
        BlockedPartner entity = BlockedPartner.create(aliasPartnerCode, businessNameSnapshot,
                blockReason, blockedAt, source);
        return blockedPartnerRepository.save(entity);
    }

    /**
     * 차단 해제 (soft-delete). id 미존재 시 404. 이미 해제된 row 는 SQLRestriction 으로 미조회 → 404.
     *
     * @param id BLOCK row UUID
     * @param actorUserId 작업자 (audit deleted_by)
     */
    @Transactional
    public void unblock(UUID id, String actorUserId) {
        BlockedPartner entity = blockedPartnerRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 차단 기록을 찾을 수 없습니다: " + id));
        entity.markDeleted(actorUserId);
    }

    /**
     * PR-E 알림 발송 가드 — partnerCode 의 활성 BLOCK 존재 여부.
     *
     * @param partnerCode 거래처 코드
     * @return 차단 시 true
     */
    @Transactional(readOnly = true)
    public boolean isBlocked(String partnerCode) {
        return blockedPartnerRepository.existsByPartnerCodeAndIsDeletedFalse(partnerCode);
    }

    /** admin 목록 페이지 조회. */
    @Transactional(readOnly = true)
    public Page<BlockedPartner> findAll(Pageable pageable) {
        return blockedPartnerRepository.findAll(pageable);
    }
}
