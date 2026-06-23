/**
 * offices.js
 * CRUD for physical offices (phase asis/tobe) and their zones within the
 * active scenario. Every physical office keeps >=1 zone (auto "Опенспейс");
 * the system remote office is protected; deleting an office/zone cleans up
 * affected allocations. Office capacity (places) = sum of zone capacities.
 */
window.App = window.App || {};

App.offices = (function () {
  'use strict';

  var C = App.constants;
  var U = App.utils;
  var state = App.state;

  function scenario() {
    return state.getActiveScenario();
  }

  function list() {
    return scenario().offices;
  }

  function find(officeId) {
    return U.findById(list(), officeId);
  }

  function isPhysical(office) {
    return office && office.type === C.OFFICE_TYPE.PHYSICAL;
  }

  /**
   * Add a physical office in the given phase. `data` may include name, area,
   * zones[], money fields (rentPerSqm/opexPerSqm/indexationPct), isDraft.
   */
  function addOffice(phase, data) {
    var office = state.createOffice(phase, data || {});
    state.commit('Добавление офиса', function () {
      scenario().offices.push(office);
    });
    return office.id;
  }

  /** Update office fields including money. Not applicable to remote. */
  function updateOffice(officeId, data) {
    var office = find(officeId);
    if (!isPhysical(office)) {
      return;
    }
    state.commit('Изменение офиса', function () {
      if (data.name !== undefined) { office.name = data.name; }
      if (data.area !== undefined) { office.area = U.toNonNegativeInt(data.area); }
      if (data.comment !== undefined) { office.comment = data.comment; }
      if (data.isDraft !== undefined) { office.isDraft = !!data.isDraft; }
      if (data.phase !== undefined &&
          (data.phase === C.OFFICE_PHASE.ASIS || data.phase === C.OFFICE_PHASE.TOBE)) {
        office.phase = data.phase;
      }
      if (data.rentPerSqm !== undefined) {
        office.rentPerSqm = data.rentPerSqm === '' || data.rentPerSqm === null ? null : Number(data.rentPerSqm);
      }
      if (data.opexPerSqm !== undefined) {
        office.opexPerSqm = data.opexPerSqm === '' || data.opexPerSqm === null ? null : Number(data.opexPerSqm);
      }
      if (data.indexationPct !== undefined) {
        office.indexationPct = data.indexationPct === '' || data.indexationPct === null ? null : Number(data.indexationPct);
      }
      if (data.leaseEndDate !== undefined) {
        office.leaseEndDate = data.leaseEndDate || null;
      }
      if (data.leaseStartDate !== undefined) {
        office.leaseStartDate = data.leaseStartDate || null;
      }
      if (data.tenants !== undefined) {
        office.tenants = Array.isArray(data.tenants) ? data.tenants : [];
      }
    });
  }

  /** Delete an office (not the system remote). Removes its allocations. */
  function removeOffice(officeId) {
    var office = find(officeId);
    if (!isPhysical(office)) {
      return false;
    }
    state.commit('Удаление офиса', function () {
      var s = scenario();
      s.offices = s.offices.filter(function (o) { return o.id !== officeId; });
      s.allocations = s.allocations.filter(function (a) { return a.targetOfficeId !== officeId; });
    });
    return true;
  }

  function addZone(officeId, zoneData) {
    var office = find(officeId);
    if (!isPhysical(office)) {
      return null;
    }
    var zone = state.makeZoneObject(zoneData);
    state.commit('Добавление зоны', function () {
      office.zones.push(zone);
    });
    return zone.id;
  }

  function updateZone(officeId, zoneId, zoneData) {
    var office = find(officeId);
    if (!isPhysical(office)) {
      return;
    }
    var zone = U.findById(office.zones, zoneId);
    if (!zone) {
      return;
    }
    state.commit('Изменение зоны', function () {
      if (zoneData.name !== undefined) { zone.name = zoneData.name; }
      if (zoneData.type !== undefined) {
        zone.type = zoneData.type;
        zone.isVipZone = zoneData.type === C.ZONE_TYPE.VIP;
      }
      if (zoneData.isVipZone !== undefined) { zone.isVipZone = !!zoneData.isVipZone; }
      if (zoneData.capacity !== undefined) { zone.capacity = U.toNonNegativeInt(zoneData.capacity); }
      if (zoneData.comment !== undefined) { zone.comment = zoneData.comment; }
    });
  }

  /**
   * Delete a zone. A physical office must keep at least one zone, so if the
   * last zone is removed an auto "Опенспейс" is recreated. Allocations to the
   * zone are removed.
   */
  function removeZone(officeId, zoneId) {
    var office = find(officeId);
    if (!isPhysical(office)) {
      return false;
    }
    state.commit('Удаление зоны', function () {
      office.zones = office.zones.filter(function (z) { return z.id !== zoneId; });
      if (office.zones.length === 0) {
        office.zones.push(state.createDefaultOpenSpaceZone());
      }
      var s = scenario();
      s.allocations = s.allocations.filter(function (a) { return a.targetZoneId !== zoneId; });
    });
    return true;
  }

  /**
   * Move a physical office to targetPhase and reorder relative to targetId.
   * insertBefore=true -> before targetId; false -> after. targetId=null -> append.
   */
  function moveOffice(draggedId, targetId, insertBefore, targetPhase) {
    var dragged = find(draggedId);
    if (!isPhysical(dragged)) { return; }
    state.commit('Перемещение офиса', function () {
      var s = scenario();
      dragged.phase = (targetPhase === C.OFFICE_PHASE.ASIS) ? C.OFFICE_PHASE.ASIS : C.OFFICE_PHASE.TOBE;
      var rest = s.offices.filter(function (o) { return o.id !== draggedId; });
      if (!targetId) {
        s.offices = rest.concat([dragged]);
      } else {
        var idx = -1;
        for (var i = 0; i < rest.length; i++) {
          if (rest[i].id === targetId) { idx = i; break; }
        }
        rest.splice(idx === -1 ? rest.length : (insertBefore ? idx : idx + 1), 0, dragged);
        s.offices = rest;
      }
    });
  }

  return {
    list: list,
    find: find,
    addOffice: addOffice,
    updateOffice: updateOffice,
    removeOffice: removeOffice,
    addZone: addZone,
    updateZone: updateZone,
    removeZone: removeZone,
    moveOffice: moveOffice
  };
})();
