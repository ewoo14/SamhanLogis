package com.samhanair.logis.inventory.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.samhanair.logis.inventory.InventoryServiceApplication;
import com.samhanair.logis.inventory.domain.Warehouse;
import com.samhanair.logis.inventory.domain.WarehouseType;
import com.samhanair.logis.inventory.repository.WarehouseRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.jpa.JpaSystemException;
import org.springframework.transaction.annotation.Transactional;

/**
 * V2 시드 4개 창고 (Plan §3.1 4-tier — HQ-001/VH-001/CS-001/VR-001) +
 * code partial unique (WHERE is_deleted = FALSE) + VIRTUAL 존재 검증.
 *
 * <p>BE 도메인 시그니처:
 * <ul>
 *   <li>{@code Warehouse.create(code, name, type, address, displayOrder, description)}</li>
 *   <li>{@code WarehouseType.HEADQUARTERS | VEHICLE | CONSIGNMENT | VIRTUAL}</li>
 *   <li>partial unique on warehouses(code) WHERE is_deleted = FALSE (V1 SQL)</li>
 * </ul>
 */
@SpringBootTest(classes = InventoryServiceApplication.class)
@Transactional
class WarehouseRepositoryIT extends AbstractPostgresIT {

    @Autowired
    private WarehouseRepository warehouseRepository;

    @PersistenceContext
    private EntityManager entityManager;

    @Test
    void seed_fourWarehouses_areLoadedByFlyway() {
        // V2__seed_inventory_warehouses.sql 이 영속한 4개 시드 — 본사/차량/거래처위탁/가상.
        List<Warehouse> all = warehouseRepository.findAll();

        assertThat(all).extracting(Warehouse::getCode)
                .contains("HQ-001", "VH-001", "CS-001", "VR-001");
        assertThat(all).hasSizeGreaterThanOrEqualTo(4);
    }

    @Test
    void seed_includesAtLeastOneVirtualWarehouse() {
        // VIRTUAL 창고 (VR-001 가상창고) 가 시드돼 있어야 한다 — Service 가드의 대상.
        List<Warehouse> virtuals = warehouseRepository.findAll().stream()
                .filter(w -> w.getType() == WarehouseType.VIRTUAL)
                .toList();

        assertThat(virtuals).isNotEmpty();
        assertThat(virtuals).extracting(Warehouse::getCode).contains("VR-001");
    }

    @Test
    void partialUniqueIndex_code_blocksLiveDuplicate() {
        // 신규 등록 — 시드와 충돌하지 않는 code.
        Warehouse first = warehouseRepository.save(
                Warehouse.create("UNIQ-DUP-001", "중복테스트1",
                        WarehouseType.HEADQUARTERS, null, 100, null));
        warehouseRepository.flush();

        // 동일 code 중복 등록 시도 — partial unique index 에 의해 거부돼야 한다.
        assertThatThrownBy(() -> {
            warehouseRepository.save(
                    Warehouse.create("UNIQ-DUP-001", "중복테스트2",
                            WarehouseType.HEADQUARTERS, null, 101, null));
            warehouseRepository.flush();
        }).isInstanceOfAny(
                DataIntegrityViolationException.class,
                JpaSystemException.class,
                org.hibernate.exception.ConstraintViolationException.class
        );

        assertThat(first.getId()).isNotNull();
    }

    @Test
    void partialUniqueIndex_code_allowsReuseAfterSoftDelete() {
        Warehouse original = warehouseRepository.save(
                Warehouse.create("UNIQ-REBORN-001", "재등록 원본",
                        WarehouseType.VEHICLE, null, 200, null));
        warehouseRepository.flush();

        original.markDeleted("test");
        warehouseRepository.save(original);
        warehouseRepository.flush();
        entityManager.clear();

        // partial unique (WHERE is_deleted = FALSE) 덕분에 동일 code 재등록 가능.
        Warehouse reborn = warehouseRepository.save(
                Warehouse.create("UNIQ-REBORN-001", "재등록 본",
                        WarehouseType.VEHICLE, null, 201, null));
        warehouseRepository.flush();

        assertThat(reborn.getId()).isNotNull();
        assertThat(reborn.getId()).isNotEqualTo(original.getId());
    }

    @Test
    void searchAdmin_nullKeyword_returnsAll_noLowerByteaError() {
        // RC4 회귀 — q=null 시 PostgreSQL 이 파라미터를 bytea 로 바인딩 → "function lower(bytea)
        // does not exist" 500 이 나던 결함. CAST(:q AS string) 로 타입 고정 후 전체 목록 반환돼야 한다.
        Page<Warehouse> all = warehouseRepository.searchAdmin(null, PageRequest.of(0, 50));

        assertThat(all.getContent()).extracting(Warehouse::getCode)
                .contains("HQ-001", "VH-001", "CS-001", "VR-001");
        assertThat(all.getTotalElements()).isGreaterThanOrEqualTo(4);
    }

    @Test
    void searchAdmin_withKeyword_filtersByCodeOrName() {
        // 키워드 지정 시 code/name/address LIKE 부분 일치 (대소문자 무시) 가 동작해야 한다.
        Page<Warehouse> hq = warehouseRepository.searchAdmin("hq-001", PageRequest.of(0, 50));

        assertThat(hq.getContent()).extracting(Warehouse::getCode).contains("HQ-001");
        assertThat(hq.getContent()).extracting(Warehouse::getCode).doesNotContain("VR-001");
    }
}
