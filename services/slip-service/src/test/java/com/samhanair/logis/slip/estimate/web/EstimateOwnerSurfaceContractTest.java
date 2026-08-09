package com.samhanair.logis.slip.estimate.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;

/** #1092 S2 RED-A/C: 조회 표면과 담당 변경 계약은 역할명이 아니라 endpoint 경계로 분리한다. */
class EstimateOwnerSurfaceContractTest {

    @Test
    void assignedWebSurface_andOwnerChange_contracts_are_present() {
        Method assignedList = Arrays.stream(EstimateController.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("assignedList"))
                .findFirst().orElseThrow();
        assertThat(assignedList.getAnnotation(GetMapping.class).value())
                .containsExactly("/assigned");

        Method assignedRestore = Arrays.stream(EstimateController.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("assignedRestore"))
                .findFirst().orElseThrow();
        assertThat(assignedRestore.getAnnotation(PostMapping.class).value())
                .containsExactly("/assigned/{id}/restore");

        Method ownerChange = Arrays.stream(EstimateController.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("changeOwner"))
                .findFirst().orElseThrow();
        assertThat(ownerChange.getAnnotation(PatchMapping.class).value())
                .containsExactly("/{id}/owner");
    }
}
