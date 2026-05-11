package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
import com.samhanair.logis.accounting.web.dto.CreateSupplierProfileRequest;
import com.samhanair.logis.accounting.web.dto.SupplierProfileResponse;
import com.samhanair.logis.accounting.web.dto.UpdateSupplierProfileRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 사업자 프로필 비즈니스 로직 서비스.
 *
 * <p>GAS 하드코딩 공급자 정보를 DB 기반으로 전환한 서비스 레이어.
 * 회계 카테고리 "사업자 양식" 메뉴에서 CRUD 를 처리하며,
 * {@link TaxInvoiceBatchService} 가 홈택스 양식 변환 시 primary 사업자를 동적으로 조회한다.
 *
 * <p>primary 사업자 불변 조건:
 * <ul>
 *   <li>활성 row 중 {@code isPrimary=true} 는 항상 정확히 1개 유지</li>
 *   <li>primary 사업자 삭제 시 {@link BusinessException}(CONFLICT)</li>
 *   <li>primary 전환({@link #setPrimary}) 시 기존 primary 를 해제 후 신규 설정</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional
public class SupplierProfileService {

    private final SupplierProfileRepository repository;

    // =========================================================================
    // 조회
    // =========================================================================

    /**
     * 전체 사업자 프로필 목록 조회 (Soft Delete 제외).
     *
     * @return 전체 사업자 프로필 목록
     */
    @Transactional(readOnly = true)
    public List<SupplierProfileResponse> listAll() {
        return repository.findAll().stream()
                .map(SupplierProfileResponse::of)
                .toList();
    }

    /**
     * 기본 사업자(isPrimary=true) 단건 조회.
     *
     * @return 기본 사업자 응답
     * @throws BusinessException(NOT_FOUND) primary 사업자 미존재 시
     */
    @Transactional(readOnly = true)
    public SupplierProfileResponse getPrimary() {
        return repository.findByIsPrimaryTrueAndIsDeletedFalse()
                .map(SupplierProfileResponse::of)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "기본 사업자 양식이 설정되어 있지 않습니다."));
    }

    // =========================================================================
    // 생성
    // =========================================================================

    /**
     * 신규 사업자 프로필 등록.
     *
     * <p>사업자등록번호 중복 체크 (active row 기준).
     * {@code isPrimary=true} 요청 시 기존 primary 를 자동 해제 후 설정.
     *
     * @param req 등록 요청 DTO
     * @return 등록된 사업자 프로필 응답
     * @throws BusinessException(CONFLICT) 사업자등록번호 중복
     */
    public SupplierProfileResponse create(CreateSupplierProfileRequest req) {
        repository.findByBusinessNumber(req.businessNumber()).ifPresent(existing -> {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 등록된 사업자등록번호입니다: " + req.businessNumber());
        });

        if (req.isPrimary()) {
            // 기존 primary 해제
            repository.findByIsPrimaryTrueAndIsDeletedFalse()
                    .ifPresent(SupplierProfile::unmarkPrimary);
        }

        SupplierProfile profile = SupplierProfile.create(
                req.businessNumber(),
                req.subBusinessNumber(),
                req.companyName(),
                req.representativeName(),
                req.businessAddress(),
                req.businessType(),
                req.businessItem(),
                req.email(),
                req.isPrimary()
        );
        return SupplierProfileResponse.of(repository.save(profile));
    }

    // =========================================================================
    // 수정
    // =========================================================================

    /**
     * 사업자 프로필 수정.
     *
     * <p>null 필드는 기존 값 유지. 사업자등록번호 변경 시 중복 체크.
     *
     * @param id  수정 대상 UUID
     * @param req 수정 요청 DTO
     * @return 수정된 사업자 프로필 응답
     * @throws BusinessException(NOT_FOUND) 미존재 시
     * @throws BusinessException(CONFLICT)  다른 사업자와 사업자등록번호 중복 시
     */
    public SupplierProfileResponse update(UUID id, UpdateSupplierProfileRequest req) {
        SupplierProfile profile = findByIdOrThrow(id);

        // 사업자등록번호 변경 시 중복 체크 (자기 자신 제외)
        if (req.businessNumber() != null) {
            repository.findByBusinessNumber(req.businessNumber()).ifPresent(existing -> {
                if (!existing.getId().equals(id)) {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "이미 등록된 사업자등록번호입니다: " + req.businessNumber());
                }
            });
        }

        profile.update(
                req.businessNumber(),
                req.subBusinessNumber(),
                req.companyName(),
                req.representativeName(),
                req.businessAddress(),
                req.businessType(),
                req.businessItem(),
                req.email()
        );
        return SupplierProfileResponse.of(repository.save(profile));
    }

    // =========================================================================
    // primary 전환
    // =========================================================================

    /**
     * 기본 사업자 전환.
     *
     * <p>기존 primary 를 해제하고 지정 id 의 사업자를 primary 로 설정한다.
     * 이미 primary 인 경우 멱등 처리.
     *
     * @param id primary 로 설정할 사업자 UUID
     * @return 갱신된 사업자 프로필 응답
     * @throws BusinessException(NOT_FOUND) 미존재 시
     */
    public SupplierProfileResponse setPrimary(UUID id) {
        SupplierProfile target = findByIdOrThrow(id);

        if (!target.isPrimary()) {
            // 기존 primary 해제
            repository.findByIsPrimaryTrueAndIsDeletedFalse()
                    .ifPresent(SupplierProfile::unmarkPrimary);
            target.markPrimary();
        }
        return SupplierProfileResponse.of(repository.save(target));
    }

    // =========================================================================
    // 삭제
    // =========================================================================

    /**
     * 사업자 프로필 Soft Delete.
     *
     * <p>primary 사업자는 삭제 불가 — {@link BusinessException}(CONFLICT).
     *
     * @param id          삭제 대상 UUID
     * @param actorUserId 삭제 실행자 user-id
     * @throws BusinessException(NOT_FOUND)  미존재 시
     * @throws BusinessException(CONFLICT)   primary 사업자 삭제 시도 시
     */
    public void delete(UUID id, String actorUserId) {
        SupplierProfile profile = findByIdOrThrow(id);
        profile.safeDelete(actorUserId);
        repository.save(profile);
    }

    // =========================================================================
    // 내부 유틸
    // =========================================================================

    /**
     * UUID 로 사업자 프로필 조회 — 미존재 시 예외 발생.
     *
     * @param id 조회 UUID
     * @return 조회된 엔티티
     * @throws BusinessException(NOT_FOUND) 미존재 시
     */
    private SupplierProfile findByIdOrThrow(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "사업자 프로필을 찾을 수 없습니다: " + id));
    }
}
