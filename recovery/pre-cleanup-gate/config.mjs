export const DATABASE_NAME = "yarnai-local";
export const FIXTURE_TITLE = "Stage 70 happy-path manual fixture";
export const FORMAT_VERSION = "YARNAI_TARGETED_FIXTURE_RECOVERY_V1";

export const FIXTURES = [
  { projectId: "019fe040-4ff8-7533-b8e4-66f4e800d04a", stage: "foundation_section_preparation_completed", revision: 12, recordCount: 35, aggregateLogicalHash: "1ea82829f6c2c3995be9ca90239f59e9fe1cddcaf978c0e9dcadcb48daf9fd7d" },
  { projectId: "019fe074-0c15-764c-b8aa-5f8934d80395", stage: "foundation_section_execution_active", revision: 22, recordCount: 56, aggregateLogicalHash: "8bbb690e278ceaa483682c78a2cbf7e3ce47e4c1a33695c98820a2d50a671b28" },
  { projectId: "019fe0a2-aea6-7a8e-ad36-261c71de8239", stage: "foundation_section_measurement_target_reached", revision: 23, recordCount: 60, aggregateLogicalHash: "29f7fc9e7d064eb79ca9e0bdaaee28179a96357229a6a9fb260d3dfc296cafcb" },
  { projectId: "019fe0b5-4342-76b7-93d0-f247c6902d5b", stage: "foundation_section_measurement_target_reached", revision: 23, recordCount: 60, aggregateLogicalHash: "2a1fad09dbf5436ae71887624a1b22b4436bb0ba12e3ad85968f81483d5cd744" },
  { projectId: "019fe0be-0744-74cd-b233-61c59579d695", stage: "foundation_section_measurement_collecting", revision: 16, recordCount: 45, aggregateLogicalHash: "5690d33b9d9f44ddfbb94c81873af402ce52af0fc39bcdbc962f808aa6a02dad" },
  { projectId: "019fe0be-5e28-76cb-9394-c6b8a6156795", stage: "foundation_section_measurement_target_reached", revision: 21, recordCount: 56, aggregateLogicalHash: "a0785329c0475d8f81ac98769fb113e4ef229e98305d61e2efccc7dc45a2cce0" },
  { projectId: "019fe0df-fb7d-719e-a6f3-efe0ebc83789", stage: "foundation_section_measurement_target_reached", revision: 17, recordCount: 47, aggregateLogicalHash: "ccc986e8179a203957b4a2cf4c23795cf529a7e438d8dcf13690c1b9b9bab2b0" },
  { projectId: "019fe1ea-ecf8-7822-a625-99118a76036d", stage: "primary_fabric_preparation_completed", revision: 18, recordCount: 50, aggregateLogicalHash: "e916099ef87b8e5ca45a6fd14194502cfbeb5bc4bdfa91c8ea64f200a9dec6cd" },
  { projectId: "019fe1fe-849c-7b38-acac-536601506387", stage: "primary_fabric_preparation_completed", revision: 18, recordCount: 50, aggregateLogicalHash: "438b1572d60bafe2ba2ec6ed2153a25ddbf56f24a00cca74c4e94d4afc6397b3" },
  { projectId: "019fe20d-f70d-754a-b34c-030b5970317d", stage: "primary_fabric_execution_active", revision: 22, recordCount: 59, aggregateLogicalHash: "8c3a41d8af9f11b8c5f8f0f21b8ed6c143b0ccadddbf16bb938d37670b99fdf8" },
  { projectId: "019fe227-48b2-7815-8b72-a4757ffb269d", stage: "primary_fabric_execution_paused", revision: 21, recordCount: 57, aggregateLogicalHash: "5c28e0b26962fa74ef15fa5948ead97755a56c364e1d6530d55328d378ed1c1f" },
  { projectId: "019fe228-ee8c-766e-883e-26687b40f2c5", stage: "primary_fabric_measurement_target_reached", revision: 27, recordCount: 71, aggregateLogicalHash: "cd629c2a24e0a3561cce83e2221668cce6ad6a14e2337930e5cf6b1abccacf3b" },
  { projectId: "019fe22a-fc75-7ba4-8473-78beeda58631", stage: "primary_fabric_measurement_target_reached", revision: 23, recordCount: 62, aggregateLogicalHash: "1d3a4362f6de1e910671bc4684ed2f8b43a5c14edb3147b6698192e189ec3b90" },
  { projectId: "019fe24d-7e01-788b-a7ee-56ddc3d4343e", stage: "next_section_direction_confirmed", revision: 24, recordCount: 65, aggregateLogicalHash: "806eb716639b2887e2f72f86eec4bd31056ecefc8f4c7070103529d5ccd43169" },
  { projectId: "019fe252-3855-7d6e-a199-4816000210a5", stage: "construction_strategy_confirmed", revision: 25, recordCount: 68, aggregateLogicalHash: "626b88d8225e50c073b824d3680c757fdfefce37f9a80f303c9476fb271ba944" },
  { projectId: "019fe266-b954-7708-9bdf-17b79aa1b308", stage: "construction_strategy_confirmed", revision: 25, recordCount: 68, aggregateLogicalHash: "0925384515a757ff43bcbe5fdee50b09da525539577feb9b32836f0f2e67f950" },
  { projectId: "019fe268-86d7-77fe-be9a-b5db56254a4d", stage: "sleeve_target_geometry_ready_to_collect", revision: 27, recordCount: 74, aggregateLogicalHash: "3b4b0bc3a7d8e0b55f643ad8f824baa8c5ae417e4c2553c73a5d29d8ace9b6dd" },
];

export const PROTECTED = {
  flax: { projectId: "01a04c4a-769d-7cc8-9d3a-bc8fcbbda06b", revision: 270, stage: "pattern_execution_plan_ready", recordCount: 559, aggregateLogicalHash: "6099b4d0259a681cf4608a9a1d0bd4a67b5b9c0c2a7a745e52e643342b462546" },
  stage63: { projectId: "019fc3ba-4100-71c3-b7f9-bd06e3bff304", revision: 33, stage: "project_execution_next_step_clarification_completed", recordCount: 73, aggregateLogicalHash: "23d52cdbbb484209f0568b1a459cb50e62ebe41f621dc66b0d62d6c2272aa972" },
};

export const EXPECTED_PRODUCTION = {
  projectCount: 19,
  totalRecords: 1619,
  databaseLogicalHash: "e3716124f58121874f7fc3845f74d3ae0f1a4de35fd9560f008e5909e926702d",
  storeCounts: {
    calculations: 19,
    checkpoints: 684,
    meta: 3,
    operations: 666,
    pattern_file_blobs: 2,
    pattern_files: 2,
    progress: 223,
    projects: 19,
    settings: 1,
  },
};
