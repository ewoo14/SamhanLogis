package com.samhanair.logis.partner.tab.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerContact;
import com.samhanair.logis.partner.domain.PartnerPriceDiscount;
import com.samhanair.logis.partner.domain.PartnerShippingAddress;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.revision.domain.PartnerRevisionType;
import com.samhanair.logis.partner.revision.service.PartnerRevisionService;
import com.samhanair.logis.partner.tab.dto.PartnerBasicResponse;
import com.samhanair.logis.partner.tab.dto.PartnerContactRequest;
import com.samhanair.logis.partner.tab.dto.PartnerContactResponse;
import com.samhanair.logis.partner.tab.dto.PartnerFullRequest;
import com.samhanair.logis.partner.tab.dto.PartnerFullResponse;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountRequest;
import com.samhanair.logis.partner.tab.dto.PartnerPriceDiscountResponse;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressRequest;
import com.samhanair.logis.partner.tab.dto.PartnerShippingAddressResponse;
import com.samhanair.logis.partner.tab.repository.PartnerContactRepository;
import com.samhanair.logis.partner.tab.repository.PartnerPriceDiscountRepository;
import com.samhanair.logis.partner.tab.repository.PartnerShippingAddressRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 4탭 (기본정보 / 단가-할인정책 / 배송지 / 담당자) 통합 서비스.
 *
 * <p>주요 책임:
 * <ul>
 *   <li>4탭 일괄 조회 ({@link #getFull(String)}) — 단일 round-trip</li>
 *   <li>4탭 일괄 등록 ({@link #registerFull(PartnerFullRequest)}) — Partner + 3 서브 엔티티 동일 TX</li>
 *   <li>4탭 일괄 수정 ({@link #updateFull(String, PartnerFullRequest)}) — 기존 sub 엔티티 soft-delete 후 재등록</li>
 *   <li>탭별 개별 endpoint 지원 (price-discount / shipping-addresses / contacts CRUD)</li>
 * </ul>
 *
 * <p>도메인 메서드만 사용 — setter/reflection 직접 호출 금지.
 * 기본 배송지 / 주 담당자 단일성 보장은 {@code clearDefault*} / {@code clearPrimary*} bulk update 후
 * 개별 {@code markAsDefault()} / {@code markAsPrimary()} 순서 준수.
 */
@Service
@RequiredArgsConstructor
public class Partner4TabService {

    /** actor 미상 경로 (헤더 무전달) 의 revision actorId 폴백 — UUID(0,0) = system. */
    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);

    private final PartnerRepository partnerRepository;
    private final PartnerPriceDiscountRepository priceDiscountRepository;
    private final PartnerShippingAddressRepository shippingAddressRepository;
    private final PartnerContactRepository contactRepository;
    /**
     * 거래처 버전이력 캡처 서비스 (권한 재편 Phase 2.3 Task 2). 4탭 content-mutation 성공 후 같은 TX 에서
     * 거래처 헤더 + 4탭 자식 현재값을 full-snapshot 1건으로 적재한다 (자식 교체가 flush 된 뒤 조립).
     */
    private final PartnerRevisionService partnerRevisionService;

    // ================================================================
    // 4탭 일괄 조회
    // ================================================================

    /**
     * 거래처 4탭 전체 데이터 일괄 조회.
     *
     * <p>basic (Partner) + priceDiscount + shippingAddresses + contacts 를 단일 TX 에서 조회.
     * 단가/할인 정책 미등록 시 {@link PartnerPriceDiscountResponse#empty()} 반환.
     *
     * @param partnerCode 거래처 코드
     * @return PartnerFullResponse (4탭 데이터 일괄)
     * @throws BusinessException NOT_FOUND — 해당 partnerCode 미존재
     */
    @Transactional(readOnly = true)
    public PartnerFullResponse getFull(String partnerCode) {
        Partner partner = findPartnerByCode(partnerCode);
        UUID partnerId = partner.getId();

        PartnerPriceDiscountResponse priceDiscount = priceDiscountRepository
                .findByPartnerId(partnerId)
                .map(PartnerPriceDiscountResponse::from)
                .orElse(PartnerPriceDiscountResponse.empty());

        List<PartnerShippingAddressResponse> addresses = shippingAddressRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(PartnerShippingAddressResponse::from)
                .toList();

        List<PartnerContactResponse> contacts = contactRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(PartnerContactResponse::from)
                .toList();

        return new PartnerFullResponse(
                PartnerBasicResponse.from(partner),
                priceDiscount,
                addresses,
                contacts
        );
    }

    // ================================================================
    // 4탭 일괄 등록
    // ================================================================

    /**
     * 거래처 4탭 일괄 등록.
     *
     * <p>Partner 신규 등록 후 priceDiscount / shippingAddresses / contacts 를 동일 TX 에서 저장.
     * partnerCode / bizNo 중복 시 409 CONFLICT.
     *
     * @param req 4탭 일괄 요청 (partnerCode / bizNo / name 필수)
     * @return 등록된 4탭 응답
     * @throws BusinessException CONFLICT — partnerCode 또는 bizNo 중복
     * @throws BusinessException INVALID_INPUT — partnerCode / bizNo / name 미입력
     */
    @Transactional
    public PartnerFullResponse registerFull(PartnerFullRequest req) {
        return registerFull(req, null);
    }

    /**
     * 거래처 4탭 일괄 등록 — revision actor 명시 overload (거래처 버전이력 actorName null 결함 수정).
     *
     * <p>{@link Partner4TabController} 가 {@code X-User-Name} 헤더(UUID 비공개 가드 적용)에서 추출한
     * actor 표시명을 전달한다. 등록 직후 CREATE 스냅샷(revision 1) 캡처 시 actorName 으로 기록하여
     * 버전이력 화면의 변경자 공란을 해소한다 ({@link #updateFull(String, PartnerFullRequest, UUID, String)}
     * 과 동일 패턴).
     *
     * @param req       4탭 일괄 요청 (partnerCode / bizNo / name 필수)
     * @param actorName 등록자 표시명 (UUID 비공개 가드, null 가능)
     * @return 등록된 4탭 응답
     * @throws BusinessException CONFLICT — partnerCode 또는 bizNo 중복
     * @throws BusinessException INVALID_INPUT — partnerCode / bizNo / name 미입력
     */
    @Transactional
    public PartnerFullResponse registerFull(PartnerFullRequest req, String actorName) {
        if (req.partnerCode() == null || req.partnerCode().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerCode 필수");
        }
        if (req.bizNo() == null || req.bizNo().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "bizNo 필수");
        }
        partnerRepository.findByPartnerCode(req.partnerCode()).ifPresent(p -> {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 사용 중인 partnerCode: " + req.partnerCode());
        });
        partnerRepository.findByBizNo(req.bizNo()).ifPresent(p -> {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 사용 중인 사업자번호: " + req.bizNo());
        });

        Partner partner = Partner.register(req.partnerCode(), req.bizNo(), req.name(),
                null, null, BigDecimal.ZERO);
        partner = partnerRepository.save(partner);
        UUID partnerId = partner.getId();

        // 단가/할인 정책
        if (req.priceDiscount() != null) {
            saveNewPriceDiscount(partnerId, req.priceDiscount());
        }

        // 배송지
        if (req.shippingAddresses() != null && !req.shippingAddresses().isEmpty()) {
            saveShippingAddressList(partnerId, req.shippingAddresses());
        }

        // 담당자
        if (req.contacts() != null && !req.contacts().isEmpty()) {
            saveContactList(partnerId, req.contacts());
        }

        // 권한 재편 Phase 2.3 — 4탭 일괄 등록 직후 CREATE 스냅샷 1건 캡처 (revision 1).
        // actorId 는 헤더로 전달되지 않으므로 system actor 폴백, actorName 은 X-User-Name(표시명)을 기록해
        // 버전이력 화면의 변경자 공란을 해소한다 (UUID 비공개 가드는 컨트롤러 displayNameOrNull 에서 적용).
        partnerRevisionService.captureFor(partnerId, PartnerRevisionType.CREATE, null,
                SYSTEM_ACTOR_ID, actorName, null);

        return buildFullResponse(partner, partnerId);
    }

    // ================================================================
    // 4탭 일괄 수정
    // ================================================================

    /**
     * 거래처 4탭 일괄 수정.
     *
     * <p>기존 배송지 / 담당자 는 soft-delete 후 요청 목록으로 재등록.
     * 단가/할인 정책은 UPSERT (존재 시 update, 미존재 시 create).
     * 기본정보(name/phone/address)는 요청이 있을 경우만 반영.
     *
     * @param partnerCode 거래처 코드 (path variable)
     * @param req         4탭 수정 요청
     * @return 수정된 4탭 응답
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional
    public PartnerFullResponse updateFull(String partnerCode, PartnerFullRequest req) {
        return updateFull(partnerCode, req, null, null);
    }

    /**
     * 거래처 4탭 일괄 수정 — revision actor 명시 overload (권한 재편 Phase 2.3 Task 2).
     *
     * <p>{@link Partner4TabController} 가 {@link java.security.Principal} 에서 추출한 actor 정보를
     * 전달한다. 수정 성공 후 거래처 헤더 + 4탭 자식 현재값(교체 flush 후)을 EDIT 스냅샷 1건으로 캡처한다.
     *
     * @param partnerCode 거래처 코드 (path variable)
     * @param req         4탭 수정 요청
     * @param actorId     수정자 UUID (감사용, null 이면 system 폴백)
     * @param actorName   수정자 표시명 (UUID 비공개 가드, null 가능)
     * @return 수정된 4탭 응답
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional
    public PartnerFullResponse updateFull(String partnerCode, PartnerFullRequest req,
                                          UUID actorId, String actorName) {
        Partner partner = findPartnerByCode(partnerCode);
        UUID partnerId = partner.getId();

        // 기본정보 수정 (name 이 입력된 경우)
        if (req.name() != null && !req.name().isBlank()) {
            partner.updateProfile(req.name(), partner.getAddress(), partner.getPhone());
        }

        // 4탭 자식 전량교체 (단가/할인 UPSERT + 배송지/담당자 soft-delete 후 재등록).
        // 복원(PartnerRevisionService#restore)이 같은 로직을 재사용하도록 공통 helper 로 추출됨.
        replaceChildrenFromFull(partnerId, req.priceDiscount(),
                req.shippingAddresses(), req.contacts());

        PartnerFullResponse response = buildFullResponse(partner, partnerId);
        // 권한 재편 Phase 2.3 — 4탭 일괄 수정 후 EDIT 스냅샷 캡처. buildFullResponse 가 자식을 재조회해
        // flush 를 유발하므로 capture 의 assemble 는 교체된 자식을 읽는다.
        captureEdit(partnerId, actorId, actorName);
        return response;
    }

    // ================================================================
    // 단가/할인 정책 탭별 endpoint
    // ================================================================

    /**
     * 거래처 단가/할인 정책 단건 조회 (탭 2 개별 endpoint).
     *
     * @param partnerCode 거래처 코드
     * @return 단가/할인 정책 응답 (미등록 시 empty 응답)
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional(readOnly = true)
    public PartnerPriceDiscountResponse getPriceDiscount(String partnerCode) {
        Partner partner = findPartnerByCode(partnerCode);
        return priceDiscountRepository.findByPartnerId(partner.getId())
                .map(PartnerPriceDiscountResponse::from)
                .orElse(PartnerPriceDiscountResponse.empty());
    }

    /**
     * 거래처 단가/할인 정책 UPSERT (탭 2 개별 PUT endpoint).
     *
     * @param partnerCode 거래처 코드
     * @param req         단가/할인 정책 요청
     * @return 갱신된 단가/할인 정책 응답
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional
    public PartnerPriceDiscountResponse upsertPriceDiscountTab(String partnerCode,
                                                                PartnerPriceDiscountRequest req) {
        Partner partner = findPartnerByCode(partnerCode);
        PartnerPriceDiscount discount = upsertPriceDiscount(partner.getId(), req);
        PartnerPriceDiscountResponse response = PartnerPriceDiscountResponse.from(discount);
        // 권한 재편 Phase 2.3 — 단가/할인 정책 변경 (탭2) 도 거래처 content-mutation → EDIT 스냅샷 캡처.
        captureEdit(partner.getId(), null, null);
        return response;
    }

    // ================================================================
    // 배송지 탭별 endpoint
    // ================================================================

    /**
     * 거래처 배송지 목록 조회 (탭 3 개별 endpoint).
     *
     * @param partnerCode 거래처 코드
     * @return 배송지 목록
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional(readOnly = true)
    public List<PartnerShippingAddressResponse> getShippingAddresses(String partnerCode) {
        Partner partner = findPartnerByCode(partnerCode);
        return shippingAddressRepository.findAllByPartnerId(partner.getId())
                .stream()
                .map(PartnerShippingAddressResponse::from)
                .toList();
    }

    /**
     * 거래처 배송지 단건 추가 (탭 3 개별 POST endpoint).
     *
     * <p>isDefault = true 요청 시 기존 기본 배송지를 자동 해제.
     *
     * @param partnerCode 거래처 코드
     * @param req         배송지 요청
     * @return 등록된 배송지 응답
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional
    public PartnerShippingAddressResponse addShippingAddress(String partnerCode,
                                                              PartnerShippingAddressRequest req) {
        Partner partner = findPartnerByCode(partnerCode);
        UUID partnerId = partner.getId();

        boolean isDefault = Boolean.TRUE.equals(req.isDefault());
        if (isDefault) {
            shippingAddressRepository.clearDefaultByPartnerId(partnerId);
        }

        PartnerShippingAddress address = PartnerShippingAddress.create(
                partnerId, req.alias(), req.zipCode(), req.address(),
                req.phone(), req.receiverName(), isDefault, req.memo());
        address = shippingAddressRepository.save(address);
        PartnerShippingAddressResponse response = PartnerShippingAddressResponse.from(address);
        // 권한 재편 Phase 2.3 — 배송지 추가 (탭3) → EDIT 스냅샷 캡처.
        captureEdit(partnerId, null, null);
        return response;
    }

    /**
     * 거래처 배송지 soft-delete (탭 3 개별 DELETE endpoint).
     *
     * @param partnerCode 거래처 코드
     * @param addrId      삭제할 배송지 UUID
     * @param actorUserId 삭제 수행자 (audit deletedBy)
     * @throws BusinessException NOT_FOUND — 거래처 또는 배송지 미존재
     */
    @Transactional
    public void deleteShippingAddress(String partnerCode, UUID addrId, String actorUserId) {
        Partner partner = findPartnerByCode(partnerCode);
        PartnerShippingAddress address = shippingAddressRepository.findById(addrId)
                .filter(a -> a.getPartnerId().equals(partner.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "배송지를 찾을 수 없습니다: " + addrId));
        address.softDelete(actorUserId);
        // 권한 재편 Phase 2.3 — 배송지 삭제 (탭3) → EDIT 스냅샷 캡처 (삭제 후 잔여 자식 조립).
        captureEdit(partner.getId(), parseActorId(actorUserId), null);
    }

    // ================================================================
    // 담당자 탭별 endpoint
    // ================================================================

    /**
     * 거래처 담당자 목록 조회 (탭 4 개별 endpoint).
     *
     * @param partnerCode 거래처 코드
     * @return 담당자 목록
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional(readOnly = true)
    public List<PartnerContactResponse> getContacts(String partnerCode) {
        Partner partner = findPartnerByCode(partnerCode);
        return contactRepository.findAllByPartnerId(partner.getId())
                .stream()
                .map(PartnerContactResponse::from)
                .toList();
    }

    /**
     * 거래처 담당자 단건 추가 (탭 4 개별 POST endpoint).
     *
     * <p>isPrimary = true 요청 시 기존 주 담당자를 자동 해제.
     *
     * @param partnerCode 거래처 코드
     * @param req         담당자 요청
     * @return 등록된 담당자 응답
     * @throws BusinessException NOT_FOUND — 거래처 미존재
     */
    @Transactional
    public PartnerContactResponse addContact(String partnerCode, PartnerContactRequest req) {
        Partner partner = findPartnerByCode(partnerCode);
        UUID partnerId = partner.getId();

        boolean isPrimary = Boolean.TRUE.equals(req.isPrimary());
        if (isPrimary) {
            contactRepository.clearPrimaryByPartnerId(partnerId);
        }

        PartnerContact contact = PartnerContact.create(
                partnerId, req.contactName(), req.position(),
                req.phone(), req.email(), isPrimary, req.memo());
        contact = contactRepository.save(contact);
        PartnerContactResponse response = PartnerContactResponse.from(contact);
        // 권한 재편 Phase 2.3 — 담당자 추가 (탭4) → EDIT 스냅샷 캡처.
        captureEdit(partnerId, null, null);
        return response;
    }

    /**
     * 거래처 담당자 soft-delete (탭 4 개별 DELETE endpoint).
     *
     * @param partnerCode 거래처 코드
     * @param contactId   삭제할 담당자 UUID
     * @param actorUserId 삭제 수행자 (audit deletedBy)
     * @throws BusinessException NOT_FOUND — 거래처 또는 담당자 미존재
     */
    @Transactional
    public void deleteContact(String partnerCode, UUID contactId, String actorUserId) {
        Partner partner = findPartnerByCode(partnerCode);
        PartnerContact contact = contactRepository.findById(contactId)
                .filter(c -> c.getPartnerId().equals(partner.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "담당자를 찾을 수 없습니다: " + contactId));
        contact.softDelete(actorUserId);
        // 권한 재편 Phase 2.3 — 담당자 삭제 (탭4) → EDIT 스냅샷 캡처 (삭제 후 잔여 자식 조립).
        captureEdit(partner.getId(), parseActorId(actorUserId), null);
    }

    // ================================================================
    // 4탭 자식 전량교체 공통 helper (updateFull + restore 공유)
    // ================================================================

    /**
     * 거래처 4탭 자식(단가/할인 1:1, 배송지 1:N, 담당자 1:N)을 요청 기준으로 전량교체한다
     * (권한 재편 Phase 2.3 Task 3 — {@link #updateFull} 과 복원이 공유하는 공통 로직).
     *
     * <p>각 자식의 의미 규칙 ({@code null = skip}, {@code non-null = replace}):
     * <ul>
     *   <li><b>priceDiscount</b>: null 이면 정책 미변경, non-null 이면 UPSERT (존재 시 update,
     *       미존재 시 create).</li>
     *   <li><b>shippingAddresses</b>: null 이면 배송지 미변경, non-null 이면 기존 전량 soft-delete 후
     *       재등록 (빈 리스트면 전량 삭제만 수행 — 복원 시점에 배송지가 없으면 현재 자식을 비운다).</li>
     *   <li><b>contacts</b>: 배송지와 동일 규칙.</li>
     * </ul>
     *
     * <p>{@code @Transactional} 경계는 호출자({@link #updateFull} / {@code restore})가 책임진다.
     * 복원이 호출할 때는 스냅샷의 자식을 각 Request DTO 로 변환해 전달한다.
     *
     * @param partnerId         대상 거래처 UUID
     * @param priceDiscount     단가/할인 정책 요청 (null = 미변경)
     * @param shippingAddresses 배송지 요청 목록 (null = 미변경, 빈 리스트 = 전량 삭제)
     * @param contacts          담당자 요청 목록 (null = 미변경, 빈 리스트 = 전량 삭제)
     */
    public void replaceChildrenFromFull(UUID partnerId, PartnerPriceDiscountRequest priceDiscount,
                                        List<PartnerShippingAddressRequest> shippingAddresses,
                                        List<PartnerContactRequest> contacts) {
        // 단가/할인 정책 UPSERT
        if (priceDiscount != null) {
            upsertPriceDiscount(partnerId, priceDiscount);
        }

        // 배송지 soft-delete 후 재등록
        if (shippingAddresses != null) {
            softDeleteAllShippingAddresses(partnerId, "system");
            if (!shippingAddresses.isEmpty()) {
                saveShippingAddressList(partnerId, shippingAddresses);
            }
        }

        // 담당자 soft-delete 후 재등록
        if (contacts != null) {
            softDeleteAllContacts(partnerId, "system");
            if (!contacts.isEmpty()) {
                saveContactList(partnerId, contacts);
            }
        }
    }

    // ================================================================
    // Private helpers
    // ================================================================

    /**
     * 거래처 EDIT 스냅샷 1건을 캡처한다 (4탭 content-mutation 공통 훅).
     *
     * <p>같은 트랜잭션 내에서 {@link PartnerRevisionService#captureFor}가 거래처 + 4탭 자식의 갱신본을
     * 조립한다. actor 미상 경로는 {@link #SYSTEM_ACTOR_ID} 로 폴백한다.
     */
    private void captureEdit(UUID partnerId, UUID actorId, String actorName) {
        partnerRevisionService.captureFor(partnerId, PartnerRevisionType.EDIT, null,
                actorId == null ? SYSTEM_ACTOR_ID : actorId, actorName, null);
    }

    /**
     * 감사용 actor UUID 파싱. X-User-Id 가 UUID 가 아닌 legacy employeeCode 등이면 system UUID(0,0)
     * 로 폴백한다 (revision actorId 일관성).
     */
    private UUID parseActorId(String actorUserId) {
        if (actorUserId == null || actorUserId.isBlank()) {
            return SYSTEM_ACTOR_ID;
        }
        try {
            return UUID.fromString(actorUserId);
        } catch (IllegalArgumentException ex) {
            return SYSTEM_ACTOR_ID;
        }
    }

    private Partner findPartnerByCode(String partnerCode) {
        return partnerRepository.findByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 코드의 거래처를 찾을 수 없습니다: " + partnerCode));
    }

    private PartnerPriceDiscount upsertPriceDiscount(UUID partnerId,
                                                      PartnerPriceDiscountRequest req) {
        BigDecimal rate = req.basicDiscountRate() != null ? req.basicDiscountRate() : BigDecimal.ZERO;
        return priceDiscountRepository.findByPartnerId(partnerId)
                .map(existing -> {
                    existing.update(rate, req.paymentTermDays(), req.discountMemo());
                    return existing;
                })
                .orElseGet(() -> priceDiscountRepository.save(
                        PartnerPriceDiscount.create(partnerId, rate,
                                req.paymentTermDays(), req.discountMemo())));
    }

    private void saveNewPriceDiscount(UUID partnerId, PartnerPriceDiscountRequest req) {
        BigDecimal rate = req.basicDiscountRate() != null ? req.basicDiscountRate() : BigDecimal.ZERO;
        priceDiscountRepository.save(
                PartnerPriceDiscount.create(partnerId, rate, req.paymentTermDays(), req.discountMemo()));
    }

    private void saveShippingAddressList(UUID partnerId,
                                          List<PartnerShippingAddressRequest> list) {
        boolean hasDefault = list.stream()
                .anyMatch(r -> Boolean.TRUE.equals(r.isDefault()));
        boolean firstAsDefault = !hasDefault;
        for (int i = 0; i < list.size(); i++) {
            PartnerShippingAddressRequest r = list.get(i);
            boolean isDefault = Boolean.TRUE.equals(r.isDefault()) || (firstAsDefault && i == 0);
            PartnerShippingAddress address = PartnerShippingAddress.create(
                    partnerId, r.alias(), r.zipCode(), r.address(),
                    r.phone(), r.receiverName(), isDefault, r.memo());
            shippingAddressRepository.save(address);
        }
    }

    private void saveContactList(UUID partnerId, List<PartnerContactRequest> list) {
        boolean hasPrimary = list.stream()
                .anyMatch(r -> Boolean.TRUE.equals(r.isPrimary()));
        boolean firstAsPrimary = !hasPrimary;
        for (int i = 0; i < list.size(); i++) {
            PartnerContactRequest r = list.get(i);
            boolean isPrimary = Boolean.TRUE.equals(r.isPrimary()) || (firstAsPrimary && i == 0);
            PartnerContact contact = PartnerContact.create(
                    partnerId, r.contactName(), r.position(),
                    r.phone(), r.email(), isPrimary, r.memo());
            contactRepository.save(contact);
        }
    }

    private void softDeleteAllShippingAddresses(UUID partnerId, String actorUserId) {
        shippingAddressRepository.findAllByPartnerId(partnerId)
                .forEach(a -> a.softDelete(actorUserId));
    }

    private void softDeleteAllContacts(UUID partnerId, String actorUserId) {
        contactRepository.findAllByPartnerId(partnerId)
                .forEach(c -> c.softDelete(actorUserId));
    }

    private PartnerFullResponse buildFullResponse(Partner partner, UUID partnerId) {
        PartnerPriceDiscountResponse priceDiscount = priceDiscountRepository
                .findByPartnerId(partnerId)
                .map(PartnerPriceDiscountResponse::from)
                .orElse(PartnerPriceDiscountResponse.empty());

        List<PartnerShippingAddressResponse> addresses = shippingAddressRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(PartnerShippingAddressResponse::from)
                .toList();

        List<PartnerContactResponse> contacts = contactRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(PartnerContactResponse::from)
                .toList();

        return new PartnerFullResponse(
                PartnerBasicResponse.from(partner),
                priceDiscount,
                addresses,
                contacts
        );
    }
}
