package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SupplierBankAccount;
import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.repository.SupplierBankAccountRepository;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
import com.samhanair.logis.accounting.web.dto.BankAccountRequest;
import com.samhanair.logis.accounting.web.dto.BankAccountResponse;
import com.samhanair.logis.accounting.web.dto.CreateSupplierProfileRequest;
import com.samhanair.logis.accounting.web.dto.SupplierProfileResponse;
import com.samhanair.logis.accounting.web.dto.UpdateStampRequest;
import com.samhanair.logis.accounting.web.dto.UpdateSupplierProfileRequest;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
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
 *
 * <p>인감 업로드 가드:
 * <ul>
 *   <li>200KB 초과 → {@link BusinessException}(INVALID_INPUT)</li>
 *   <li>SHA-256 재계산 후 stampHash 불일치 → {@link BusinessException}(INVALID_INPUT)</li>
 * </ul>
 *
 * <p>은행계좌는 replace-all 시맨틱 — 기존 활성 rows Soft Delete 후 신규 insert.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class SupplierProfileService {

    /** 인감 PNG 최대 크기 (200KB). */
    private static final int MAX_STAMP_BYTES = 200 * 1024;

    private final SupplierProfileRepository repository;
    private final SupplierBankAccountRepository bankAccountRepository;

    // =========================================================================
    // 조회
    // =========================================================================

    /**
     * 전체 사업자 프로필 목록 조회 (Soft Delete 제외, stamp payload 제외 경량화).
     *
     * <p>목록 응답은 {@code bankAccounts=null}, {@code stampPngBase64=null} — payload 경량화.
     * {@code hasStamp} 는 포함.
     *
     * @return 전체 사업자 프로필 목록 (경량화)
     */
    @Transactional(readOnly = true)
    public List<SupplierProfileResponse> listAll() {
        return repository.findAll().stream()
                .map(SupplierProfileResponse::of)
                .toList();
    }

    /**
     * 기본 사업자(isPrimary=true) 단건 조회 (은행계좌 + 인감 포함 전체 응답).
     *
     * @return 기본 사업자 응답 (bankAccounts + stampPngBase64 포함)
     * @throws BusinessException(NOT_FOUND) primary 사업자 미존재 시
     */
    @Transactional(readOnly = true)
    public SupplierProfileResponse getPrimary() {
        SupplierProfile profile = repository.findByIsPrimaryTrueAndIsDeletedFalse()
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "기본 사업자 양식이 설정되어 있지 않습니다."));
        return toDetailResponse(profile);
    }

    // =========================================================================
    // 생성
    // =========================================================================

    /**
     * 신규 사업자 프로필 등록.
     *
     * <p>사업자등록번호 중복 체크 (active row 기준).
     * {@code isPrimary=true} 요청 시 기존 primary 를 자동 해제 후 설정.
     * 은행계좌는 replace-all 시맨틱으로 저장.
     *
     * @param req 등록 요청 DTO
     * @return 등록된 사업자 프로필 응답 (bankAccounts + hasStamp 포함)
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
                req.tel(),
                req.fax(),
                req.isPrimary()
        );
        SupplierProfile saved = repository.save(profile);

        // 은행계좌 replace-all
        replaceAllBankAccounts(saved.getId(), req.bankAccounts(), "SYSTEM");

        return toDetailResponse(saved);
    }

    // =========================================================================
    // 수정
    // =========================================================================

    /**
     * 사업자 프로필 수정.
     *
     * <p>null 필드는 기존 값 유지. 사업자등록번호 변경 시 중복 체크.
     * 은행계좌({@code bankAccounts}) 가 null 이 아닌 경우 replace-all 시맨틱으로 교체.
     *
     * @param id          수정 대상 UUID
     * @param req         수정 요청 DTO
     * @param actorUserId 수정 실행자 user-id (Soft Delete audit 용)
     * @return 수정된 사업자 프로필 응답 (bankAccounts + hasStamp 포함)
     * @throws BusinessException(NOT_FOUND) 미존재 시
     * @throws BusinessException(CONFLICT)  다른 사업자와 사업자등록번호 중복 시
     */
    public SupplierProfileResponse update(UUID id, UpdateSupplierProfileRequest req, String actorUserId) {
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
                req.email(),
                req.tel(),
                req.fax()
        );
        SupplierProfile saved = repository.save(profile);

        // 은행계좌: null 이면 기존 유지, null 이 아니면 replace-all
        if (req.bankAccounts() != null) {
            replaceAllBankAccounts(id, req.bankAccounts(), actorUserId);
        }

        return toDetailResponse(saved);
    }

    /**
     * 사업자 프로필 수정 (actorUserId 생략 오버로드 — 기존 호출부 호환용).
     *
     * @param id  수정 대상 UUID
     * @param req 수정 요청 DTO
     * @return 수정된 사업자 프로필 응답
     */
    public SupplierProfileResponse update(UUID id, UpdateSupplierProfileRequest req) {
        return update(id, req, "SYSTEM");
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
     * @return 갱신된 사업자 프로필 응답 (bankAccounts + hasStamp 포함)
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
        return toDetailResponse(repository.save(target));
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
    // 인감 관리
    // =========================================================================

    /**
     * 인감 PNG 등록/교체.
     *
     * <p>처리 순서:
     * <ol>
     *   <li>base64 디코드</li>
     *   <li>200KB 초과 가드 ({@link #MAX_STAMP_BYTES})</li>
     *   <li>SHA-256 재계산 후 {@code req.stampHash()} 와 비교 — mismatch → 400</li>
     *   <li>도메인 메서드 {@link SupplierProfile#registerStamp} 호출</li>
     * </ol>
     *
     * @param id  대상 사업자 프로필 UUID
     * @param req 인감 등록 요청 DTO
     * @return 갱신된 사업자 프로필 응답
     * @throws BusinessException(NOT_FOUND)    미존재 시
     * @throws BusinessException(INVALID_INPUT) base64 오류 / 크기 초과 / hash mismatch
     */
    public SupplierProfileResponse registerStamp(UUID id, UpdateStampRequest req) {
        SupplierProfile profile = findByIdOrThrow(id);

        // base64 디코드
        byte[] pngBytes;
        try {
            pngBytes = Base64.getDecoder().decode(req.stampPngBase64());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "stampPngBase64 가 유효한 Base64 형식이 아닙니다");
        }

        // 200KB 가드
        if (pngBytes.length > MAX_STAMP_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "인감 PNG 크기가 200KB 를 초과합니다: " + pngBytes.length + " bytes");
        }

        // SHA-256 재계산 검증
        String computedHash = sha256Hex(pngBytes);
        if (!computedHash.equals(req.stampHash())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "stampHash 가 PNG 의 실제 SHA-256 해시와 일치하지 않습니다");
        }

        profile.registerStamp(pngBytes, computedHash);
        return toDetailResponse(repository.save(profile));
    }

    /**
     * 인감 삭제.
     *
     * @param id 대상 사업자 프로필 UUID
     * @throws BusinessException(NOT_FOUND) 미존재 시
     */
    public void clearStamp(UUID id) {
        SupplierProfile profile = findByIdOrThrow(id);
        profile.clearStamp();
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

    /**
     * 은행계좌 replace-all — 기존 활성 rows Soft Delete 후 신규 insert.
     *
     * @param profileId    대상 프로필 UUID
     * @param bankAccounts 새 계좌 목록 (null 또는 빈 배열이면 기존 전체 삭제만)
     * @param actorUserId  Soft Delete audit 용 user-id
     */
    private void replaceAllBankAccounts(
            UUID profileId,
            List<BankAccountRequest> bankAccounts,
            String actorUserId) {
        // 기존 활성 계좌 Soft Delete
        List<SupplierBankAccount> existing =
                bankAccountRepository.findBySupplierProfileIdOrderByDisplayOrderAsc(profileId);
        existing.forEach(acc -> acc.markDeleted(actorUserId));
        bankAccountRepository.saveAll(existing);

        // 신규 계좌 insert
        if (bankAccounts != null && !bankAccounts.isEmpty()) {
            for (int i = 0; i < bankAccounts.size(); i++) {
                BankAccountRequest req = bankAccounts.get(i);
                SupplierBankAccount newAcc = SupplierBankAccount.create(
                        profileId,
                        req.accountHolder(),
                        req.bankName(),
                        req.accountNumber(),
                        i   // displayOrder = 배열 index
                );
                bankAccountRepository.save(newAcc);
            }
        }
    }

    /**
     * 사업자 프로필을 상세 응답 DTO (bankAccounts + stamp 포함) 로 변환.
     *
     * @param profile 변환 대상 엔티티
     * @return 상세 응답 DTO
     */
    private SupplierProfileResponse toDetailResponse(SupplierProfile profile) {
        List<BankAccountResponse> bankAccounts =
                bankAccountRepository
                        .findBySupplierProfileIdOrderByDisplayOrderAsc(profile.getId())
                        .stream()
                        .map(BankAccountResponse::of)
                        .toList();
        return SupplierProfileResponse.ofDetail(profile, bankAccounts);
    }

    /**
     * byte[] 의 SHA-256 소문자 hex 문자열 계산.
     *
     * @param data 입력 데이터
     * @return SHA-256 소문자 hex (64자)
     */
    private static String sha256Hex(byte[] data) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(data);
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 알고리즘을 사용할 수 없습니다", e);
        }
    }
}
