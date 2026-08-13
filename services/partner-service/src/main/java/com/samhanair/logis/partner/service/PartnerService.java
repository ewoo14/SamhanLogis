package com.samhanair.logis.partner.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerStatus;
import com.samhanair.logis.partner.dto.PartnerAdminRequest;
import com.samhanair.logis.partner.dto.PartnerDirectoryResponse;
import com.samhanair.logis.partner.dto.PartnerInternalResponse;
import com.samhanair.logis.partner.dto.PartnerSummaryResponse;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.realtime.PartnerListRealtime;
import com.samhanair.logis.partner.revision.domain.PartnerRevisionType;
import com.samhanair.logis.partner.revision.service.PartnerRevisionService;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 마스터 라이프사이클 관리 — 등록 / 조회 / 프로필 수정 / 상태 전이 / 삭제 (soft).
 *
 * <p>본 service 는 마스터 정보만 책임. 신용한도 / 미수금 갱신은 {@link PartnerCreditService} 가 담당
 * (history append-only 일관성 확보).
 */
@Service
@RequiredArgsConstructor
public class PartnerService {

    /** actor 미상 경로 (헤더 무전달) 의 revision actorId 폴백 — UUID(0,0) = system. */
    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);

    private final PartnerRepository partnerRepository;
    private final CollectionRealtimePublisher collectionRealtimePublisher;
    /**
     * 거래처 버전이력 캡처 서비스 (권한 재편 Phase 2.3 Task 2). content-mutation 성공 후 현 상태를
     * full-snapshot 1건으로 적재해 point-in-time RESTORE 의 source-of-truth 를 구축한다.
     */
    private final PartnerRevisionService partnerRevisionService;
    /**
     * shared:realtime-abstraction audit recorder — PR-H4b. PartnerAuditLogService 가 본 interface
     * 를 구현. {@code @Autowired(required=false)} setter 주입 — 기존 단위 테스트 (constructor mock)
     * 회귀 0 보장.
     */
    private AuditLogRecorder auditRecorder;

    /** Spring DI 가 PartnerAuditLogService 를 자동 주입 (required=false 로 단위 테스트 안전). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setAuditRecorder(AuditLogRecorder auditRecorder) {
        this.auditRecorder = auditRecorder;
    }

    /**
     * 신규 거래처 등록.
     *
     * @param req partnerCode / bizNo / name 필수, 나머지 선택. partnerCode + bizNo 중복 시 409 CONFLICT.
     * @return 영속화된 Partner
     */
    @Transactional
    public Partner register(PartnerAdminRequest req) {
        partnerRepository.findByPartnerCode(req.partnerCode()).ifPresent(p -> {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 partnerCode: " + req.partnerCode());
        });
        partnerRepository.findByBizNo(req.bizNo()).ifPresent(p -> {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 사용 중인 사업자번호: " + req.bizNo());
        });
        Partner partner = Partner.register(req.partnerCode(), req.bizNo(), req.name(),
                req.address(), req.phone(), req.creditLimit());
        Partner saved = partnerRepository.save(partner);
        // 권한 재편 Phase 2.3 — 생성 직후 CREATE 스냅샷 1건 캡처 (revision 1). register 진입 경로
        // (PartnerAdminController.create) 는 actor 정보를 전달하지 않으므로 system actor 로 기록한다.
        partnerRevisionService.captureFor(saved.getId(), PartnerRevisionType.CREATE, null,
                SYSTEM_ACTOR_ID, null, null);
        publishListChanged("CREATED");
        return saved;
    }

    /**
     * partnerCode 로 거래처 단건 조회. 미존재 시 404.
     *
     * <p>본 메서드는 internal endpoint (slip-service M5 lookup) 와 admin endpoint 양쪽에서 사용.
     */
    @Transactional(readOnly = true)
    public Partner findByCode(String partnerCode) {
        return partnerRepository.findByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 코드의 거래처를 찾을 수 없습니다: " + partnerCode));
    }

    /**
     * partnerCode N건 bulk lookup — Phase 9 W5 신규 (D-P9-16, BE 의견 3 채택).
     *
     * <p>dashboard-service 의 매출 집계 fan-out 단계에서 직렬 N회 RPC 회피용. 입력 컬렉션의 중복 코드는
     * Set 으로 정규화 (DB 조회 비용 절감). 미존재 코드는 결과에서 자동 누락 — 호출 측이 응답 partnerCode 로
     * 매칭하여 누락 분기 처리. 빈 컬렉션 시 빈 리스트 반환 (DB 조회 회피).
     *
     * <p>UUID 비공개 가드 — 응답 record 자체는 partnerId 를 보유하지만 internal endpoint 에서만
     * 노출되며, 호출 측 (dashboard) 이 사용자 응답 DTO 에 partnerId 를 첨부하지 않는다.
     *
     * @param partnerCodes 조회할 partnerCode 모음 (null/empty 시 빈 리스트, 중복 자동 정규화)
     * @return 매칭된 PartnerInternalResponse 리스트 (입력 순서 보장 X)
     */
    @Transactional(readOnly = true)
    public List<PartnerInternalResponse> findByCodes(Collection<String> partnerCodes) {
        if (partnerCodes == null || partnerCodes.isEmpty()) {
            return List.of();
        }
        Set<String> distinct = new HashSet<>(partnerCodes);
        distinct.removeIf(c -> c == null || c.isBlank());
        if (distinct.isEmpty()) {
            return List.of();
        }
        return partnerRepository.findAllByPartnerCodeIn(distinct).stream()
                .map(PartnerInternalResponse::from)
                .toList();
    }

    /**
     * partnerId N건 batch lookup — accounting-service admin 조회의 거래처명 N+1 호출 제거용.
     *
     * <p>입력 순서와 중복은 보장하지 않는다. null/blank 역할의 null UUID 는 제거하고, 미존재 ID 는
     * 결과에서 누락한다. 호출 측은 응답 id 기준으로 매칭한다.
     *
     * @param ids 거래처 UUID 목록
     * @return 존재하는 Partner 목록
     */
    @Transactional(readOnly = true)
    public List<Partner> findAllByIds(Collection<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        Set<UUID> distinct = new HashSet<>(ids);
        distinct.removeIf(Objects::isNull);
        if (distinct.isEmpty()) {
            return List.of();
        }
        return partnerRepository.findAllByIdIn(distinct);
    }

    /**
     * 활성 거래처 페이지 조회 — admin 목록 화면 ({@code GET /admin/partners}) 전용.
     *
     * <p>Phase 10 W10-6 — 50 partner 시드 검증을 위한 페이지네이션 조회. 본 메서드는 활성 row
     * (BaseEntity 의 {@code @SQLRestriction("is_deleted = false")}) 만 반환. 정렬 / 페이지 크기는
     * 호출 측 {@link Pageable} 에 위임.
     *
     * @param pageable 페이지 / 정렬 (예: page=0&size=3)
     * @return 활성 거래처 페이지 (UUID 비공개 가드 — 후속 controller 변환 시 partnerCode 만 노출)
     */
    @Transactional(readOnly = true)
    public Page<Partner> findAll(Pageable pageable) {
        return partnerRepository.findAll(pageable);
    }

    /**
     * 거래처 admin 검색 — Phase 10 P0-5.
     *
     * <p>q (partnerCode / name / bizNo / phone LIKE) + status 필터. q 가 null/blank 시 미적용,
     * status 가 null 시 미적용. {@link #findAll(Pageable)} 와 별도 — frontend 검색창 + dropdown
     * 동작 backing.
     */
    @Transactional(readOnly = true)
    public Page<Partner> searchAdmin(String q, PartnerStatus status, Pageable pageable) {
        return searchAdmin(q, status, false, pageable);
    }

    /**
     * 거래처 admin 검색 — includeDeleted=true 인 관리자 목록 전용 경로만 soft-deleted row 를 포함한다.
     *
     * <p>기본값(false)은 JPQL 검색을 사용해 {@code @SQLRestriction("is_deleted = false")} 를 적용한다.
     * 자동완성/전표/회계 소비처가 공유하는 {@code /admin/partners/search} 계약에서 삭제행 누출을 막기 위함이다.
     */
    @Transactional(readOnly = true)
    public Page<Partner> searchAdmin(String q, PartnerStatus status, boolean includeDeleted, Pageable pageable) {
        String normalized = (q == null || q.isBlank()) ? null : escapeLikeLiteral(q);
        if (!includeDeleted) {
            return partnerRepository.searchAdmin(normalized, status, pageable);
        }
        // native query 는 enum name() 문자열을 요구한다(raw enum → ordinal 바인딩 시 status 필터 영구 0건).
        String statusName = status == null ? null : status.name();
        return partnerRepository.searchAdminIncludingDeleted(normalized, statusName, unsorted(pageable));
    }

    /**
     * 종합견적서 거래처 directory 조회.
     *
     * <p>ACTIVE 거래처만 반환하며 q 는 partnerCode/name/bizNo 부분일치 검색이다. limit/page 는 호출자가
     * 크게 넘겨도 내부 directory endpoint 계약에 맞춰 보정한다.
     *
     * @param q 검색어 (blank 시 전체)
     * @param limit 최대 반환 건수
     * @param page 0-base 페이지 번호
     * @return estimate-app legacy 거래처 shape 로 변환 가능한 directory DTO 목록
     */
    @Transactional(readOnly = true)
    public List<PartnerDirectoryResponse> listDirectory(String q, int limit, int page) {
        String normalized = (q == null || q.isBlank()) ? null : escapeLikeLiteral(q);
        int normalizedLimit = Math.min(Math.max(limit, 1), 5000);
        int normalizedPage = Math.max(page, 0);
        Pageable pageable = PageRequest.of(normalizedPage, normalizedLimit, Sort.by("partnerCode").ascending());
        return partnerRepository.searchDirectory(normalized, pageable).stream()
                .map(PartnerDirectoryResponse::from)
                .toList();
    }

    /** 사용자 검색어를 SQL LIKE 리터럴로 보존한다. escape 문자를 먼저 처리한다. */
    static String escapeLikeLiteral(String value) {
        return value.trim()
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }

    /**
     * Phase 10 PR-D Part A — 거래처 상호 lookup (정확 일치 우선, 미발견 시 LIKE 1건만 허용).
     *
     * <p>BE-D ChatRoom 매핑 + BLOCK 발송금지 CSV import 의 lookup 핵심 메서드. 흐름:
     * <ol>
     *   <li>{@code findByName(name)} 정확 일치 시도 — 발견 시 즉시 반환</li>
     *   <li>정확 일치 미발견 시 LIKE %name% 으로 fallback (size=2 로 검색)</li>
     *   <li>fallback 결과가 0건 → 404 NOT_FOUND</li>
     *   <li>fallback 결과가 2건 이상 → 409 CONFLICT (lookup 모호)</li>
     *   <li>fallback 결과가 정확히 1건 → 해당 Partner 반환</li>
     * </ol>
     *
     * <p>{@link #findByNameForLookup(String)} 와 별도 — 본 메서드는 호출 측이 거래처 상호로
     * partnerCode 를 확정해야 하는 admin 작업 (BLOCK 등록, ChatRoom 생성 등) 에서 사용.
     *
     * @param name 거래처 상호
     * @return 정확 일치 또는 1건만 매칭되는 Partner
     * @throws BusinessException NOT_FOUND (0건) / CONFLICT (2건 이상)
     */
    @Transactional(readOnly = true)
    public Partner findByName(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "name 필수");
        }
        String trimmed = name.trim();
        Optional<Partner> exact = partnerRepository.findByName(trimmed);
        if (exact.isPresent()) {
            return exact.get();
        }
        String escapedKeyword = escapeLikeLiteral(trimmed);
        List<Partner> candidates = partnerRepository
                .findAllByNameContaining(escapedKeyword, PageRequest.of(0, 2))
                .getContent();
        if (candidates.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "해당 상호의 거래처를 찾을 수 없습니다: " + trimmed);
        }
        if (candidates.size() > 1) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "동일 상호로 여러 거래처가 매칭됩니다 (LIKE 검색): " + trimmed);
        }
        return candidates.get(0);
    }

    /**
     * TM PR-D Part 3 — partnerCode 직접 검증 (CSV import 거래처코드 컬럼 우선 매핑용).
     *
     * <p>{@link #findByCode(String)} 와 동일하되 throw 대신 {@link Optional} 반환. CSV import 에서
     * 사업자명 lookup 보다 우선 호출하여 모호한 LIKE 매칭을 회피한다 (사용자 명시: "거래처명이 아니라
     * 거래처코드로 매핑").
     *
     * @param partnerCode 거래처코드 (예: "P-2026-0001")
     * @return 활성 거래처 존재 시 Partner, 미존재 시 empty
     */
    @Transactional(readOnly = true)
    public Optional<Partner> findByCodeForLookup(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return Optional.empty();
        }
        return partnerRepository.findByPartnerCode(partnerCode.trim());
    }

    /**
     * Phase 10 PR-D Part A — null-safe lookup (CSV import / batch 용).
     *
     * <p>{@link #findByName(String)} 와 동일 정확/LIKE 흐름이지만 throw 대신 {@link Optional} 반환.
     * 모호한 다중결과는 lookup 실패로 간주 (empty). CSV import 에서 reject row 로 분류 시 사용.
     *
     * @param name 거래처 상호
     * @return 단일 매칭 시 Partner, 0건/2건+ 시 empty
     */
    @Transactional(readOnly = true)
    public Optional<Partner> findByNameForLookup(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        String trimmed = name.trim();
        Optional<Partner> exact = partnerRepository.findByName(trimmed);
        if (exact.isPresent()) {
            return exact;
        }
        String escapedKeyword = escapeLikeLiteral(trimmed);
        List<Partner> candidates = partnerRepository
                .findAllByNameContaining(escapedKeyword, PageRequest.of(0, 2))
                .getContent();
        if (candidates.size() == 1) {
            return Optional.of(candidates.get(0));
        }
        return Optional.empty();
    }

    /**
     * partnerId (UUID) 로 거래처 단건 조회 — slip-service 전표 생성 시 사업자등록번호 snapshot 용.
     *
     * <p>본 메서드는 {@link PartnerInternalController} 의 {@code GET /api/v1/partners/internal/{id}/business-number}
     * endpoint 에서 호출된다. 미존재 시 404 BusinessException 발생.
     *
     * @param id 거래처 UUID
     * @return 조회된 Partner
     * @throws BusinessException NOT_FOUND 거래처 미존재 시
     */
    @Transactional(readOnly = true)
    public Partner findById(UUID id) {
        return partnerRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 ID의 거래처를 찾을 수 없습니다: " + id));
    }

    /**
     * 거래처 프로필 수정 (name / address / phone 만). partnerCode / bizNo 는 식별자 — 변경 불가.
     *
     * <p>PR-H4b — shared audit recorder 가 등록되어 있으면 변경된 필드별로 audit_log 1행 + SSE
     * broadcast 자동 발행 ("partner.name" / "partner.address" / "partner.phone" 필드명). 호출자
     * X-User-Id / X-User-Name 헤더는 controller 에서 callerUserId/callerName 로 전달.
     */
    @Transactional
    public Partner updateProfile(String partnerCode, PartnerAdminRequest req) {
        return updateProfile(partnerCode, req, null, null);
    }

    /**
     * 거래처 프로필 수정 — audit actor 명시 overload (PR-H4b).
     *
     * @param actorUserId 수정자 UUID (audit/감사용, null 가능)
     * @param actorName 수정자 표시명 (UUID 비공개 가드, null 가능)
     */
    @Transactional
    public Partner updateProfile(String partnerCode, PartnerAdminRequest req,
                                 java.util.UUID actorUserId, String actorName) {
        Partner partner = findByCode(partnerCode);
        // diff snapshot for audit
        String oldName = partner.getName();
        String oldAddress = partner.getAddress();
        String oldPhone = partner.getPhone();

        partner.updateProfile(req.name(), req.address(), req.phone());

        // audit overlay 기록 — recorder bean 등록된 환경 (Spring 부팅) 만 동작.
        if (auditRecorder != null) {
            recordIfChanged(partner.getId(), actorUserId, actorName, "partner.name", oldName, partner.getName());
            recordIfChanged(partner.getId(), actorUserId, actorName, "partner.address", oldAddress, partner.getAddress());
            recordIfChanged(partner.getId(), actorUserId, actorName, "partner.phone", oldPhone, partner.getPhone());
        }
        // 권한 재편 Phase 2.3 — 헤더 변경 후 EDIT 스냅샷 캡처 (4탭 자식 현재값 포함). actor 는 overload
        // 로 전달된 X-User-* 정보를 사용하며, 미전달 시 system actor 로 폴백한다.
        partnerRevisionService.captureFor(partner.getId(), PartnerRevisionType.EDIT, null,
                actorUserId == null ? SYSTEM_ACTOR_ID : actorUserId, actorName, null);
        publishListChanged("UPDATED");
        return partner;
    }

    /** 변경된 경우만 audit row 1행 INSERT — UUID 비공개 가드 (actorName 표시). */
    private void recordIfChanged(java.util.UUID entityId, java.util.UUID actorUserId,
                                 String actorName, String fieldName, String oldVal, String newVal) {
        if (Objects.equals(oldVal, newVal)) {
            return;
        }
        java.util.UUID safeActorId = actorUserId == null ? new java.util.UUID(0L, 0L) : actorUserId;
        String safeActorName = com.samhanair.logis.common.security.ActorDisplayName.resolve(
                safeActorId.toString(), actorName);
        try {
            auditRecorder.recordOverlayPatch(entityId, safeActorId, safeActorName, null,
                    fieldName, oldVal, newVal);
        } catch (RuntimeException ex) {
            // graceful — audit 실패가 비즈니스 mutation 차단하지 않음
        }
    }

    /**
     * 거래처 soft-delete. 활성 row partial unique index 가 partnerCode 재사용을 허용한다.
     */
    @Transactional
    public void delete(String partnerCode, String actorUserId) {
        delete(partnerCode, actorUserId, null);
    }

    /**
     * 거래처 soft-delete. 현행 무가드 soft-delete 정책을 유지하고, 표시용 삭제자명만 별도 저장한다.
     */
    @Transactional
    public void delete(String partnerCode, String actorUserId, String actorName) {
        Partner partner = findByCode(partnerCode);
        partner.markDeletedWithName(actorUserId, PartnerSummaryResponse.resolveActorName(actorName));
        publishListChanged("DELETED");
    }

    /** 거래 일시 중지. */
    @Transactional
    public void suspend(String partnerCode) {
        findByCode(partnerCode).suspend();
        publishListChanged("UPDATED");
    }

    /** 거래 재개. */
    @Transactional
    public void activate(String partnerCode) {
        findByCode(partnerCode).activate();
        publishListChanged("UPDATED");
    }

    /** 거래 종료. */
    @Transactional
    public void terminate(String partnerCode) {
        findByCode(partnerCode).terminate();
        publishListChanged("UPDATED");
    }

    /**
     * soft-deleted 거래처 복원.
     *
     * <p>{@code @SQLRestriction} 우회를 위해 native lookup 을 사용한다. 이미 활성 행이면 no-op 으로
     * 응답하며, 삭제 참조가드는 신설하지 않는다.
     */
    @Transactional
    public Partner restore(String partnerCode, String actorUserId) {
        Partner partner = partnerRepository.findByPartnerCodeIncludingDeleted(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 코드의 거래처를 찾을 수 없습니다: " + partnerCode));
        if (Boolean.TRUE.equals(partner.getIsDeleted())) {
            // partnerCode 재사용(삭제행 + 동일코드 활성행 공존)을 partial unique index 가 허용하므로,
            // 삭제행 복원 시 활성 행이 이미 있으면 unique 위반(500)이 난다 → 사전 409 로 차단(create 의 409 패턴 정합).
            if (partnerRepository.findByPartnerCode(partnerCode).isPresent()) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "이미 사용 중인 거래처 코드로 활성 거래처가 존재하여 복원할 수 없습니다: " + partnerCode);
            }
            partner.markRestoredWithNameCleared();
            publishListChanged("RESTORED");
        }
        return partner;
    }

    /** 거래처 목록 변경 발화 (커밋 후). changeType = CREATED/UPDATED/DELETED/RESTORED. */
    private void publishListChanged(String changeType) {
        collectionRealtimePublisher.publishChange(
                PartnerListRealtime.CHANNEL_ID,
                PartnerListRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }

    private Pageable unsorted(Pageable pageable) {
        if (pageable == null || pageable.isUnpaged()) {
            return Pageable.unpaged();
        }
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }
}
