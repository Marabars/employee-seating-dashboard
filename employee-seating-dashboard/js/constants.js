/**
 * constants.js
 * Application-wide constants: enums, default thresholds, message codes,
 * Excel column mappings (RU/EN), empty-state texts.
 *
 * All values live under the global App namespace (no ES modules — file:// safe).
 */
window.App = window.App || {};

App.constants = (function () {
  'use strict';

  // Office types
  var OFFICE_TYPE = {
    PHYSICAL: 'physical',
    REMOTE: 'remote'
  };

  // Office phase: AS IS (current) vs TO BE (planned). Remote offices have no phase.
  var OFFICE_PHASE = {
    ASIS: 'asis',
    TOBE: 'tobe'
  };

  var OFFICE_PHASE_LABEL = {
    asis: 'AS IS',
    tobe: 'TO BE'
  };

  // Units shown next to numbers.
  var UNIT = {
    PLACES: 'шт. мест',
    AREA: 'м²'
  };

  // Default money rates used as placeholders (editable per office).
  var MONEY_5Y = 5; // lease projection horizon in years

  // Zone types
  var ZONE_TYPE = {
    CABINET: 'cabinet',
    OPEN_SPACE: 'open_space',
    VIP: 'vip'
  };

  // Work formats
  var WORK_FORMAT = {
    OFFICE: 'office',
    HYBRID: 'hybrid',
    REMOTE: 'remote'
  };

  // Allocation types
  var ALLOCATION_TYPE = {
    TEAM: 'team',
    EMPLOYEE: 'employee'
  };

  // Validation message levels
  var LEVEL = {
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
  };

  // Validation message codes
  var CODE = {
    TEAM_OVERALLOCATED: 'TEAM_OVERALLOCATED',
    EMPLOYEE_DUPLICATE: 'EMPLOYEE_DUPLICATE',
    OFFICE_OVERFLOW: 'OFFICE_OVERFLOW',
    ZONE_OVERFLOW: 'ZONE_OVERFLOW',
    EMPLOYEE_UNPLACED: 'EMPLOYEE_UNPLACED',
    TEAM_PARTIAL: 'TEAM_PARTIAL',
    NON_VIP_IN_VIP: 'NON_VIP_IN_VIP',
    VIP_NOT_IN_VIP: 'VIP_NOT_IN_VIP',
    DRAFT_ZERO_CAPACITY: 'DRAFT_ZERO_CAPACITY',
    TEAM_SPLIT_FORBIDDEN: 'TEAM_SPLIT_FORBIDDEN',
    LINKED_TEAMS_SEPARATED: 'LINKED_TEAMS_SEPARATED',
    EMPLOYEE_REMOTE: 'EMPLOYEE_REMOTE',
    HAS_REMOTE: 'HAS_REMOTE'
  };

  // Status colors (semantic)
  var STATUS_COLOR = {
    GREEN: 'green',
    YELLOW: 'yellow',
    RED: 'red',
    GREY: 'grey',
    BLUE: 'blue'
  };

  // Default editable thresholds (percent)
  var DEFAULT_THRESHOLDS = {
    greenMaxPercent: 85,
    yellowMaxPercent: 100
  };

  // Undo/redo history depth
  var HISTORY_LIMIT = 50;

  // localStorage key for autosave
  var STORAGE_KEY = 'employee-seating-dashboard:project';
  var ONBOARDING_KEY = 'employee-seating-dashboard:onboarding-done';

  // Standard (selectable) zone presets shown in the office editor.
  var STANDARD_ZONES = [
    { name: 'Кабинеты', type: ZONE_TYPE.CABINET, isVipZone: false },
    { name: 'Опенспейс', type: ZONE_TYPE.OPEN_SPACE, isVipZone: false },
    { name: 'VIP-кабинеты', type: ZONE_TYPE.VIP, isVipZone: true }
  ];

  // Human-readable labels (RU) for enums used in the UI.
  var OFFICE_TYPE_LABEL = {
    physical: 'Офис',
    remote: 'Удаленка'
  };

  var ZONE_TYPE_LABEL = {
    cabinet: 'Кабинеты',
    open_space: 'Опенспейс',
    vip: 'VIP-кабинеты'
  };

  var WORK_FORMAT_LABEL = {
    office: 'Офис',
    hybrid: 'Гибрид',
    remote: 'Удаленка'
  };

  // Placement status labels (derived per employee).
  var PLACEMENT_STATUS = {
    PLACED_OFFICE: 'placed_office',
    PLACED_REMOTE: 'placed_remote',
    UNPLACED: 'unplaced'
  };

  var PLACEMENT_STATUS_LABEL = {
    placed_office: 'Размещен в офисе',
    placed_remote: 'На удаленке',
    unplaced: 'Не размещен'
  };

  // Empty-state texts (ТЗ §24.2).
  var EMPTY_STATES = {
    offices: 'Пока нет офисов. Добавьте офис вручную или импортируйте Excel.',
    teams: 'Пока нет команд. Добавьте команду или загрузите шаблон.',
    employees: 'Пока нет сотрудников. Вы можете работать без сотрудников или импортировать список.',
    allocations: 'Пока нет размещений. Перетащите команду в офис или создайте размещение вручную.'
  };

  // Onboarding steps (ТЗ §24.1).
  var ONBOARDING_STEPS = [
    'Создайте сценарий.',
    'Добавьте офисы.',
    'Добавьте команды.',
    'Добавьте сотрудников при необходимости.',
    'Распределите команды и сотрудников.',
    'Проверьте предупреждения.',
    'Экспортируйте отчет.'
  ];

  /**
   * Excel column header mapping: canonical field -> array of accepted headers
   * (lowercased, trimmed). Supports both RU and EN names (ТЗ §20).
   */
  var EXCEL_HEADERS = {
    offices: {
      office_name: ['office_name', 'название офиса'],
      office_type: ['office_type', 'тип офиса', 'фаза', 'phase'],
      area: ['area', 'площадь'],
      capacity: ['capacity', 'вместимость'],
      cabinet_capacity: ['cabinet_capacity', 'кабинеты'],
      open_space_capacity: ['open_space_capacity', 'опенспейс'],
      vip_capacity: ['vip_capacity', 'vip-кабинеты'],
      rent_per_sqm: ['rent_per_sqm', 'аренда', 'аренда руб/м2', 'аренда, ₽/м²'],
      opex_per_sqm: ['opex_per_sqm', 'эксплуатация', 'эксплуатация руб/м2', 'эксплуатация, ₽/м²'],
      indexation_pct: ['indexation_pct', 'индексация', 'индексация %'],
      lease_start_date: ['lease_start_date', 'дата начала аренды'],
      is_draft: ['is_draft', 'черновик'],
      comment: ['comment', 'комментарий']
    },
    zones: {
      office_name: ['office_name', 'название офиса'],
      office_phase: ['office_phase', 'фаза офиса', 'фаза'],
      zone_name: ['zone_name', 'название зоны'],
      zone_type: ['zone_type', 'тип зоны'],
      capacity: ['capacity', 'вместимость'],
      is_vip_zone: ['is_vip_zone', 'vip-зона'],
      comment: ['comment', 'комментарий']
    },
    teams: {
      team_name: ['team_name', 'название команды'],
      employees_count: ['employees_count', 'количество сотрудников'],
      current_office: ['current_office', 'текущий офис', 'as-is офис', 'as is офис'],
      to_be_office: ['to_be_office', 'to be офис', 'to-be офис', 'tobe офис', 'целевой офис'],
      is_vip: ['is_vip', 'vip'],
      can_split: ['can_split', 'можно делить'],
      linked_teams: ['linked_teams', 'связанные команды'],
      comment: ['comment', 'комментарий']
    },
    allocations: {
      type:    ['type',    'тип'],
      entity:  ['entity',  'название'],
      count:   ['count',   'количество'],
      office:  ['office',  'офис'],
      zone:    ['zone',    'зона'],
      comment: ['comment', 'комментарий']
    },
    employees: {
      full_name: ['full_name', 'фио'],
      position: ['position', 'должность'],
      team_name: ['team_name', 'команда'],
      current_office: ['current_office', 'текущий офис', 'as-is офис', 'as is офис'],
      cabinet: ['cabinet', 'кабинет'],
      is_vip: ['is_vip', 'vip'],
      work_format: ['work_format', 'формат работы'],
      comment: ['comment', 'комментарий']
    }
  };

  // Office phase values accepted in Excel import (RU/EN -> canonical).
  // The Excel `office_type` column now carries the phase (AS IS / TO BE).
  var OFFICE_PHASE_ALIASES = {
    asis: OFFICE_PHASE.ASIS,
    'as is': OFFICE_PHASE.ASIS,
    'as_is': OFFICE_PHASE.ASIS,
    'старый': OFFICE_PHASE.ASIS,
    'старый офис': OFFICE_PHASE.ASIS,
    'как есть': OFFICE_PHASE.ASIS,
    old: OFFICE_PHASE.ASIS,
    'new': OFFICE_PHASE.TOBE,
    tobe: OFFICE_PHASE.TOBE,
    'to be': OFFICE_PHASE.TOBE,
    'to_be': OFFICE_PHASE.TOBE,
    'новый': OFFICE_PHASE.TOBE,
    'новый офис': OFFICE_PHASE.TOBE,
    'как будет': OFFICE_PHASE.TOBE
  };

  // Work-format values accepted in Excel import (RU/EN -> canonical).
  var WORK_FORMAT_ALIASES = {
    office: WORK_FORMAT.OFFICE,
    'офис': WORK_FORMAT.OFFICE,
    hybrid: WORK_FORMAT.HYBRID,
    'гибрид': WORK_FORMAT.HYBRID,
    remote: WORK_FORMAT.REMOTE,
    'удаленка': WORK_FORMAT.REMOTE,
    'удаленный': WORK_FORMAT.REMOTE
  };

  // Zone-type values accepted in Excel import (RU/EN -> canonical).
  var ZONE_TYPE_ALIASES = {
    cabinet: ZONE_TYPE.CABINET,
    'кабинеты': ZONE_TYPE.CABINET,
    'кабинет': ZONE_TYPE.CABINET,
    open_space: ZONE_TYPE.OPEN_SPACE,
    'опенспейс': ZONE_TYPE.OPEN_SPACE,
    vip: ZONE_TYPE.VIP,
    'vip-кабинеты': ZONE_TYPE.VIP,
    'vip-кабинет': ZONE_TYPE.VIP
  };

  return {
    OFFICE_TYPE: OFFICE_TYPE,
    OFFICE_PHASE: OFFICE_PHASE,
    OFFICE_PHASE_LABEL: OFFICE_PHASE_LABEL,
    UNIT: UNIT,
    MONEY_5Y: MONEY_5Y,
    ZONE_TYPE: ZONE_TYPE,
    WORK_FORMAT: WORK_FORMAT,
    ALLOCATION_TYPE: ALLOCATION_TYPE,
    LEVEL: LEVEL,
    CODE: CODE,
    STATUS_COLOR: STATUS_COLOR,
    DEFAULT_THRESHOLDS: DEFAULT_THRESHOLDS,
    HISTORY_LIMIT: HISTORY_LIMIT,
    STORAGE_KEY: STORAGE_KEY,
    ONBOARDING_KEY: ONBOARDING_KEY,
    STANDARD_ZONES: STANDARD_ZONES,
    OFFICE_TYPE_LABEL: OFFICE_TYPE_LABEL,
    ZONE_TYPE_LABEL: ZONE_TYPE_LABEL,
    WORK_FORMAT_LABEL: WORK_FORMAT_LABEL,
    PLACEMENT_STATUS: PLACEMENT_STATUS,
    PLACEMENT_STATUS_LABEL: PLACEMENT_STATUS_LABEL,
    EMPTY_STATES: EMPTY_STATES,
    ONBOARDING_STEPS: ONBOARDING_STEPS,
    EXCEL_HEADERS: EXCEL_HEADERS,
    OFFICE_PHASE_ALIASES: OFFICE_PHASE_ALIASES,
    WORK_FORMAT_ALIASES: WORK_FORMAT_ALIASES,
    ZONE_TYPE_ALIASES: ZONE_TYPE_ALIASES
  };
})();
