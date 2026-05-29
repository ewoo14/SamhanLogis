package com.samhanair.logis.partner.revision.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partner.domain.Partner;
import com.samhanair.logis.partner.domain.PartnerContact;
import com.samhanair.logis.partner.domain.PartnerPriceDiscount;
import com.samhanair.logis.partner.domain.PartnerShippingAddress;
import com.samhanair.logis.partner.repository.PartnerRepository;
import com.samhanair.logis.partner.revision.domain.PartnerRevision;
import com.samhanair.logis.partner.revision.domain.PartnerRevisionType;
import com.samhanair.logis.partner.revision.domain.PartnerSnapshot;
import com.samhanair.logis.partner.revision.repository.PartnerRevisionRepository;
import com.samhanair.logis.partner.tab.repository.PartnerContactRepository;
import com.samhanair.logis.partner.tab.repository.PartnerPriceDiscountRepository;
import com.samhanair.logis.partner.tab.repository.PartnerShippingAddressRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처 버전이력 스냅샷 조립/캡처/조회 서비스 (권한 재편 Phase 2.3 Task 2).
 *
 * <p>거래처 mutation 커밋 직후 현 상태를 {@link PartnerRevision} 1건으로 기록한다. revisionNo 는
 * partner 별 단조 증가 — {@code maxRevisionNo + 1} 로 채번한다 (첫 캡처는 1).
 *
 * <p>estimate 와의 구조 차이: 거래처 4탭 자식 (단가/할인 1:1, 배송지 1:N, 담당자 1:N) 은 entity 의
 * {@code @OneToMany} 가 아니라 각 자식 repository 로 partnerId join 수집된다. 따라서 스냅샷 조립
 * ({@link #assemble(UUID)}) 이 본 service 책임이다. estimate 는 {@code Estimate#toSnapshot()} 도메인이
 * 책임지는 점만 다르고 capture 채번/race 가드는 동형이다.
 *
 * <p>{@link com.samhanair.logis.partner.service.PartnerService} 및
 * {@link com.samhanair.logis.partner.tab.service.Partner4TabService} 의 content-mutation 훅에서
 * 같은 트랜잭션 내 return 직전에 {@link #captureFor}를 호출한다 (스냅샷 일관성 — 자식 교체가 flush 된 뒤
 * 동일 TX 의 repository 조회가 갱신본을 읽는다).
 *
 * <p>{@code com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService} 미러
 * (estimateId→partnerId, estimateNo→partnerCode, 4탭 자식 join 보강).
 */
@Service
@Transactional
@RequiredArgsConstructor
public class PartnerRevisionService {

    private final PartnerRevisionRepository repository;
    private final PartnerRepository partnerRepository;
    private final PartnerPriceDiscountRepository priceDiscountRepository;
    private final PartnerShippingAddressRepository shippingAddressRepository;
    private final PartnerContactRepository contactRepository;

    /**
     * 거래처 헤더 41필드 + 4탭 자식(단가/할인 1:1, 배송지 1:N, 담당자 1:N)을 한 시점의
     * {@link PartnerSnapshot} 으로 조립한다.
     *
     * <p>각 자식 repository 의 조회 결과는 entity 의 {@code @SQLRestriction("is_deleted = false")} 가
     * 자동 적용되므로 미삭제분만 수집된다. 단가/할인 정책은 거래처당 1행 (1:1) 이며 미등록 시 null 로
     * 스냅샷에 보관한다 (PartnerSnapshot 의 {@code @JsonInclude(NON_NULL)} 와 일관).
     *
     * @param partnerId 대상 거래처 UUID (필수)
     * @return 헤더 + 3자식이 채워진 PartnerSnapshot
     * @throws BusinessException(NOT_FOUND) 거래처 미존재
     */
    @Transactional(readOnly = true)
    public PartnerSnapshot assemble(UUID partnerId) {
        Partner partner = loadPartnerOrThrow(partnerId);
        return assembleFrom(partner);
    }

    /**
     * 영속 상태 {@link Partner} 와 그 4탭 자식을 모아 {@link PartnerSnapshot} 으로 조립한다.
     *
     * <p>{@link #assemble(UUID)} 와 {@link #captureFor}가 공유하는 내부 조립 단위. partner 는 이미
     * 조회된 영속 entity 를 받아 중복 조회를 피한다 (id 로 4탭 자식만 추가 join).
     */
    private PartnerSnapshot assembleFrom(Partner partner) {
        UUID partnerId = partner.getId();

        // 탭2 단가/할인 정책 (1:1, 미등록 시 null)
        PartnerSnapshot.PriceDiscount priceDiscount = priceDiscountRepository.findByPartnerId(partnerId)
                .map(this::toSnapshotPriceDiscount)
                .orElse(null);

        // 탭3 배송지 (1:N)
        List<PartnerSnapshot.ShippingAddress> shippingAddresses = shippingAddressRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(this::toSnapshotShippingAddress)
                .toList();

        // 탭4 담당자 (1:N)
        List<PartnerSnapshot.Contact> contacts = contactRepository
                .findAllByPartnerId(partnerId)
                .stream()
                .map(this::toSnapshotContact)
                .toList();

        return new PartnerSnapshot(
                partner.getPartnerCode(),
                partner.getBizNo(),
                partner.getName(),
                partner.getAddress(),
                partner.getPhone(),
                partner.getCreditLimit(),
                partner.getOutstandingBalance(),
                partner.getStatus(),
                partner.getSubBizNo(),
                partner.getRepresentative(),
                partner.getBusinessType(),
                partner.getIndustry(),
                partner.getFax(),
                partner.getEmail(),
                partner.getEmail2(),
                partner.getMobile(),
                partner.getZipCode1(),
                partner.getAddress1(),
                partner.getZipCode2(),
                partner.getAddress2(),
                partner.getSearchKeyword(),
                partner.getPartnerGroup1(),
                partner.getPartnerGroup2(),
                partner.getWebsite(),
                partner.getCurrency(),
                partner.getShipmentTarget(),
                partner.getSalesType(),
                partner.getPurchaseType(),
                partner.getReceivableNoMgmt(),
                partner.getPayableNoMgmt(),
                partner.getOutboundAdjustmentRate(),
                partner.getInboundAdjustmentRate(),
                partner.getSalesPriceGroup(),
                partner.getPurchasePriceGroup(),
                partner.getCreditPeriodDays(),
                partner.getPaymentDueDays(),
                partner.getRegistrationDate(),
                partner.getTransferInfo(),
                partner.getNote(),
                partner.getManagerName(),
                priceDiscount,
                shippingAddresses,
                contacts);
    }

    /**
     * 거래처 현 상태를 조립({@link #assembleFrom})한 뒤 버전 스냅샷 1건으로 캡처한다 (편의 래퍼).
     *
     * <p>content-mutation 훅이 호출하는 진입점. 같은 트랜잭션 내에서 거래처 + 4탭 자식의 갱신본을
     * 조립하므로, 호출 측은 mutation 성공 직후 partner.getId() 로 본 메서드만 호출하면 된다.
     *
     * @param partnerId 캡처 대상 거래처 UUID (필수)
     * @param type 캡처 유형 CREATE/EDIT/RESTORE
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 PartnerRevision
     * @throws BusinessException(NOT_FOUND) 거래처 미존재
     * @throws BusinessException(CONFLICT) 채번 race 2회 실패
     */
    public PartnerRevision captureFor(UUID partnerId, PartnerRevisionType type,
                                      Integer sourceRevisionNo, UUID actorId, String actorName,
                                      String actorColor) {
        Partner partner = loadPartnerOrThrow(partnerId);
        PartnerSnapshot snapshot = assembleFrom(partner);
        return capture(partner, snapshot, type, sourceRevisionNo, actorId, actorName, actorColor);
    }

    /**
     * 미리 조립된 스냅샷을 버전 1건으로 캡처해 영속화한다.
     *
     * <p>revisionNo 는 {@code repository.maxRevisionNo(partnerId) + 1} 로 채번한다. 기존 스냅샷이
     * 없으면 {@code maxRevisionNo} 가 null 이므로 첫 버전은 1 이 된다.
     *
     * <p>채번 race 가드 ({@code EstimateRevisionService} 동형): maxRevisionNo+1 read-then-insert 가
     * 동시 mutation 시 (partner_id, revision_no) unique 를 위반하면 DataIntegrityViolationException 이
     * 발생한다. 이를 그대로 흘리면 500 이 되므로, 1회 재채번 재시도 후에도 충돌하면 409 CONFLICT 로
     * 변환한다 (사용자 재시도 안내). 스냅샷은 불변이라 재시도 간 그대로 재사용한다.
     *
     * @param partner 캡처 대상 거래처 (영속 상태, id 필수)
     * @param snapshot 미리 조립된 거래처 full-snapshot (호출자가 1회만 만들어 재시도 간 재사용)
     * @param type 캡처 유형 CREATE/EDIT/RESTORE
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드, 없으면 null)
     * @param actorColor FE userIdToColor 결과 backup (선택, 없으면 null)
     * @return 영속화된 PartnerRevision
     * @throws BusinessException(CONFLICT) 채번 race 2회 실패
     */
    public PartnerRevision capture(Partner partner, PartnerSnapshot snapshot,
                                   PartnerRevisionType type, Integer sourceRevisionNo,
                                   UUID actorId, String actorName, String actorColor) {
        try {
            return saveWithNextRevisionNo(partner, snapshot, type, sourceRevisionNo,
                    actorId, actorName, actorColor);
        } catch (org.springframework.dao.DataIntegrityViolationException firstConflict) {
            try {
                // 1회 재채번 — 직전 insert 가 채간 revision_no 다음 번호로 재시도
                return saveWithNextRevisionNo(partner, snapshot, type, sourceRevisionNo,
                        actorId, actorName, actorColor);
            } catch (org.springframework.dao.DataIntegrityViolationException retryConflict) {
                throw new BusinessException(ErrorCode.CONFLICT,
                        "동시 수정 충돌 — 잠시 후 다시 시도해 주세요");
            }
        }
    }

    /**
     * 현 시점 {@code maxRevisionNo+1} 로 채번해 PartnerRevision 1건을 저장한다 (capture 의 채번 단위).
     *
     * <p>분리 목적: 채번 read 와 insert 가 한 호출에 묶여 있어야 재시도 시 갱신된 maxRevisionNo 로
     * 다시 채번된다. 스냅샷은 호출자가 1회만 만들어 재시도 간 재사용한다 (불변 — 재계산 불필요).
     */
    private PartnerRevision saveWithNextRevisionNo(Partner partner, PartnerSnapshot snapshot,
                                                   PartnerRevisionType type, Integer sourceRevisionNo,
                                                   UUID actorId, String actorName, String actorColor) {
        Integer max = repository.maxRevisionNo(partner.getId());
        int next = (max == null ? 0 : max) + 1;
        PartnerRevision revision = PartnerRevision.of(
                partner.getId(), next, type, sourceRevisionNo,
                partner.getPartnerCode(), snapshot, actorId, actorName, actorColor);
        // saveAndFlush — unique 제약 위반을 commit 이 아닌 이 시점에 동기 노출시켜 catch/재시도 가능하게 한다.
        return repository.saveAndFlush(revision);
    }

    /**
     * 거래처의 버전 타임라인을 최신(revisionNo 내림차순) 우선으로 조회한다.
     *
     * @param partnerId 대상 거래처 UUID
     * @return revisionNo 내림차순 정렬된 버전 목록 (없으면 빈 리스트)
     */
    @Transactional(readOnly = true)
    public List<PartnerRevision> list(UUID partnerId) {
        return repository.findByPartnerIdOrderByRevisionNoDesc(partnerId);
    }

    private Partner loadPartnerOrThrow(UUID partnerId) {
        return partnerRepository.findById(partnerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "거래처를 찾을 수 없습니다: " + partnerId));
    }

    private PartnerSnapshot.PriceDiscount toSnapshotPriceDiscount(PartnerPriceDiscount entity) {
        return new PartnerSnapshot.PriceDiscount(
                entity.getBasicDiscountRate(),
                entity.getPaymentTermDays(),
                entity.getDiscountMemo());
    }

    private PartnerSnapshot.ShippingAddress toSnapshotShippingAddress(PartnerShippingAddress entity) {
        return new PartnerSnapshot.ShippingAddress(
                entity.getAlias(),
                entity.getZipCode(),
                entity.getAddress(),
                entity.getPhone(),
                entity.getReceiverName(),
                entity.getIsDefault(),
                entity.getMemo());
    }

    private PartnerSnapshot.Contact toSnapshotContact(PartnerContact entity) {
        return new PartnerSnapshot.Contact(
                entity.getContactName(),
                entity.getPosition(),
                entity.getPhone(),
                entity.getEmail(),
                entity.getIsPrimary(),
                entity.getMemo());
    }
}
