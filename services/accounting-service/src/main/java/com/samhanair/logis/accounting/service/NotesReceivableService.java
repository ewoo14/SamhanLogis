package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLookupSupport;
import com.samhanair.logis.accounting.domain.NoteStatus;
import com.samhanair.logis.accounting.domain.NotesReceivable;
import com.samhanair.logis.accounting.repository.NotesReceivableRepository;
import com.samhanair.logis.accounting.web.dto.CreateNotesReceivableRequest;
import com.samhanair.logis.accounting.web.dto.NotesReceivableResponse;
import com.samhanair.logis.accounting.web.dto.NotesReceivableResponse.PartnerDisplay;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 받을어음 CRUD 서비스.
 *
 * <p>쓰기 요청은 partnerCode/bizNo/partnerName 중 하나로 거래처를 resolve 한 뒤 내부 partnerId 만
 * 저장한다. 응답은 다시 PartnerLookupClient 로 표시 식별자만 채워 UUID 노출을 차단한다.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class NotesReceivableService {

    private final NotesReceivableRepository repository;
    private final PartnerLookupClient partnerLookupClient;

    /**
     * 받을어음을 등록한다.
     *
     * @param request 등록 요청
     * @return 등록된 받을어음 응답
     */
    public NotesReceivableResponse register(CreateNotesReceivableRequest request) {
        if (repository.existsByNoteNoAndIsDeletedFalse(request.noteNo().trim())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 등록된 어음번호입니다: " + request.noteNo());
        }
        PartnerSummary partner = resolvePartner(
                request.partnerCode(), request.bizNo(), request.partnerName());
        NotesReceivable note = NotesReceivable.register(
                partner.partnerId(),
                request.noteNo(),
                request.issueDate(),
                request.maturityDate(),
                request.amount(),
                request.noteType(),
                request.memo()
        );
        NotesReceivable saved = repository.save(note);
        return NotesReceivableResponse.of(saved, displayOf(partner));
    }

    /**
     * 받을어음 목록을 조회한다. 기본 정렬은 만기 임박순이다.
     *
     * @param status 상태 필터
     * @param partnerCode 거래처코드 필터
     * @param bizNo 사업자번호 필터
     * @param partnerName 거래처명 필터
     * @return 받을어음 목록
     */
    @Transactional(readOnly = true)
    public List<NotesReceivableResponse> list(NoteStatus status, String partnerCode, String bizNo, String partnerName) {
        PartnerSummary filterPartner = hasText(partnerCode) || hasText(bizNo) || hasText(partnerName)
                ? resolvePartner(partnerCode, bizNo, partnerName)
                : null;
        List<NotesReceivable> notes = repository.search(status,
                filterPartner == null ? null : filterPartner.partnerId());
        Map<UUID, PartnerSummary> partners = resolveDisplays(notes);
        return notes.stream()
                .map(note -> NotesReceivableResponse.of(note,
                        displayOf(partners.get(note.getPartnerId()))))
                .toList();
    }

    /**
     * 어음번호로 단건 조회한다.
     *
     * @param noteNo 어음번호
     * @return 받을어음 응답
     */
    @Transactional(readOnly = true)
    public NotesReceivableResponse getOne(String noteNo) {
        NotesReceivable note = findByNoteNo(noteNo);
        PartnerSummary partner = partnerLookupClient.findByPartnerId(note.getPartnerId()).orElse(null);
        return NotesReceivableResponse.of(note, displayOf(partner));
    }

    /**
     * 상태를 전이한다.
     *
     * @param noteNo 어음번호
     * @param status 목표 상태
     * @return 갱신된 받을어음 응답
     */
    public NotesReceivableResponse transition(String noteNo, NoteStatus status) {
        NotesReceivable note = findByNoteNo(noteNo);
        if (status == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "status 는 필수입니다.");
        }
        switch (status) {
            case BOARDING -> throw new BusinessException(ErrorCode.CONFLICT,
                    NoteStatus.BOARDING.getDisplayName() + " 상태는 등록 시에만 지정할 수 있습니다.");
            case COLLECTING -> note.collect();
            case SETTLED -> note.settle();
            case DISHONORED -> note.dishonor();
        }
        NotesReceivable saved = repository.save(note);
        PartnerSummary partner = partnerLookupClient.findByPartnerId(saved.getPartnerId()).orElse(null);
        return NotesReceivableResponse.of(saved, displayOf(partner));
    }

    private NotesReceivable findByNoteNo(String noteNo) {
        if (!hasText(noteNo)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "noteNo 는 필수입니다.");
        }
        return repository.findByNoteNoAndIsDeletedFalse(noteNo.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "받을어음을 찾을 수 없습니다: " + noteNo));
    }

    private PartnerSummary resolvePartner(String partnerCode, String bizNo, String partnerName) {
        if (hasText(partnerCode)) {
            PartnerSummary partner = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byCode(partnerLookupClient, partnerCode.trim()),
                    "거래처코드로 거래처를 찾을 수 없습니다: " + partnerCode);
            if (partner.partnerId() == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                        "거래처코드 조회 결과에 내부 거래처 ID가 없습니다: " + partnerCode);
            }
            return partner;
        }
        if (hasText(bizNo)) {
            return resolveByDirectorySingle(bizNo.trim(), "사업자번호");
        }
        if (hasText(partnerName)) {
            PartnerSummary partner = PartnerLookupSupport.requireFound(
                    PartnerLookupSupport.byName(partnerLookupClient, partnerName.trim()),
                    "거래처명으로 거래처를 찾을 수 없습니다: " + partnerName);
            if (partner.partnerId() == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                        "거래처명 조회 결과에 내부 거래처 ID가 없습니다: " + partnerName);
            }
            return partner;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT,
                "partnerCode, bizNo, partnerName 중 하나는 필수입니다.");
    }

    private PartnerSummary resolveByDirectorySingle(String query, String label) {
        List<PartnerSummary> matches = PartnerLookupSupport.availableDirectory(
                PartnerLookupSupport.directory(partnerLookupClient, query, 2));
        if (matches.isEmpty()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + "로 거래처를 찾을 수 없습니다: " + query);
        }
        if (matches.size() > 1) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + " 조회 결과가 2건 이상입니다. 거래처코드로 다시 선택하세요: " + query);
        }
        PartnerSummary partner = matches.get(0);
        if (partner.partnerId() == null) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    label + " 조회 결과에 내부 거래처 ID가 없습니다: " + query);
        }
        return partner;
    }

    private Map<UUID, PartnerSummary> resolveDisplays(List<NotesReceivable> notes) {
        List<UUID> ids = notes.stream()
                .map(NotesReceivable::getPartnerId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<UUID, PartnerSummary> resolved = partnerLookupClient.findByPartnerIdsBatch(ids);
        if (resolved == null || resolved.isEmpty()) {
            return Map.of();
        }
        return resolved.values().stream()
                .filter(p -> p.partnerId() != null)
                .collect(Collectors.toMap(
                        PartnerSummary::partnerId,
                        Function.identity(),
                        (left, right) -> left,
                        LinkedHashMap::new));
    }

    private static PartnerDisplay displayOf(PartnerSummary partner) {
        if (partner == null) {
            return new PartnerDisplay("미등록", "", "(미조회)");
        }
        return new PartnerDisplay(
                valueOrDefault(partner.partnerCode(), "미등록"),
                digitsOnly(partner.bizNo()),
                valueOrDefault(partner.name(), "(미조회)")
        );
    }

    private static String valueOrDefault(String value, String fallback) {
        return hasText(value) ? value.trim() : fallback;
    }

    private static String digitsOnly(String value) {
        return value == null ? "" : value.replaceAll("[^0-9]", "");
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
