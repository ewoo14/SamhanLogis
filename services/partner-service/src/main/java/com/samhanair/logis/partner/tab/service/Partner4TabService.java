package com.samhanair.logis.partner.tab.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerContact;
import com.samhanair.logis.partner.domain.PartnerPriceDiscount;
import com.samhanair.logis.partner.domain.PartnerShippingAddress;
import com.samhanair.logis.partner.repository.PartnerRepository;
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

    private final PartnerRepository partnerRepository;
    private final PartnerPriceDiscountRepository priceDiscountRepository;
    private final PartnerShippingAddressRepository shippingAddressRepository;
    private final PartnerContactRepository contactRepository;

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
        Partner partner = findPartnerByCode(partnerCode);
        UUID partnerId = partner.getId();

        // 기본정보 수정 (name 이 입력된 경우)
        if (req.name() != null && !req.name().isBlank()) {
            partner.updateProfile(req.name(), partner.getAddress(), partner.getPhone());
        }

        // 단가/할인 정책 UPSERT
        if (req.priceDiscount() != null) {
            upsertPriceDiscount(partnerId, req.priceDiscount());
        }

        // 배송지 soft-delete 후 재등록
        if (req.shippingAddresses() != null) {
            softDeleteAllShippingAddresses(partnerId, "system");
            if (!req.shippingAddresses().isEmpty()) {
                saveShippingAddressList(partnerId, req.shippingAddresses());
            }
        }

        // 담당자 soft-delete 후 재등록
        if (req.contacts() != null) {
            softDeleteAllContacts(partnerId, "system");
            if (!req.contacts().isEmpty()) {
                saveContactList(partnerId, req.contacts());
            }
        }

        return buildFullResponse(partner, partnerId);
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
        return PartnerPriceDiscountResponse.from(discount);
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
        return PartnerShippingAddressResponse.from(address);
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
        return PartnerContactResponse.from(contact);
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
    }

    // ================================================================
    // Private helpers
    // ================================================================

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
