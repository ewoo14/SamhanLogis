package com.samhanair.logis.groupware.repository;

import com.samhanair.logis.groupware.domain.DocumentTemplateRevision;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/**
 * 문서 양식 revision 이력 저장소. 수정·삭제 메서드는 의도적으로 제공하지 않는다.
 *
 * <p>FABLE5 R1 M-2: {@code JpaRepository}는 {@code delete}/{@code deleteById}/
 * {@code deleteAll} 등을 노출해, 호출자가 없는 지금은 무해하지만 미래의 실수 호출이
 * 컴파일이 아니라 DB append-only trigger가 던지는 런타임 500으로만 걸러진다. Spring
 * Data 최소 마커 인터페이스({@link org.springframework.data.repository.Repository})만
 * 상속해 삭제 메서드 자체가 존재하지 않도록 컴파일 타임에 봉쇄한다.
 *
 * <p>이력 append는 {@link com.samhanair.logis.groupware.service.DocumentTemplateRevisionService}
 * 가 일반 경로에서는 {@code saveAndFlush}, 승인 경로에서는 {@code save} 후 호출자 flush로
 * 수행한다. 삭제 메서드는 노출하지 않아 append-only 의도를 유지하고, Spring Data repository
 * proxy의 예외 변환 경계를 보존한다.
 */
@Repository
public interface DocumentTemplateRevisionRepository
        extends org.springframework.data.repository.Repository<DocumentTemplateRevision, UUID> {

    Optional<DocumentTemplateRevision> findByTemplateIdAndRevisionAndIsDeletedFalse(UUID templateId, int revision);

    Optional<DocumentTemplateRevision> findById(UUID id);

    DocumentTemplateRevision save(DocumentTemplateRevision revision);

    DocumentTemplateRevision saveAndFlush(DocumentTemplateRevision revision);
}
