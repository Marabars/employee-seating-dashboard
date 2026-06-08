/**
 * offices.js
 * CRUD for offices and their zones within the active scenario.
 * Enforces: new offices always keep >=1 zone (auto "Опенспейс"),
 * system offices (remote) are protected, deleting an office/zone cleans up
 * affected allocations.
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

  /** Create an old office (reference location, no zones). */
  function addOldOffice(data) {
    var office = {
      id: U.genId('office_old'),
      type: C.OFFICE_TYPE.OLD,
      name: data.name || 'Старый офис',
      area: U.toNonNegativeInt(data.area),
      currentCapacity: U.toNonNegativeInt(data.currentCapacity),
      isDraft: !!data.isDraft,
      comment: data.comment || ''
    };
    state.commit('Добавление старого офиса', function () {
      scenario().offices.push(office);
    });
    return office.id;
  }

  /**
   * Create a new office. `zones` is an optional array of
   * { name, type, capacity, isVipZone }. If empty, an auto "Опенспейс" is added.
   */
  function addNewOffice(data) {
    var office = {
      id: U.genId('office_new'),
      type: C.OFFICE_TYPE.NEW,
      name: data.name || 'Новый офис',
      area: U.toNonNegativeInt(data.area),
      isDraft: !!data.isDraft,
      comment: data.comment || '',
      zones: []
    };
    (data.zones || []).forEach(function (z) {
      office.zones.push(makeZone(z));
    });
    if (office.zones.length === 0) {
      office.zones.push(state.createDefaultOpenSpaceZone());
    }
    state.commit('Добавление нового офиса', function () {
      scenario().offices.push(office);
    });
    return office.id;
  }

  function makeZone(z) {
    var isVip = z.type === C.ZONE_TYPE.VIP || !!z.isVipZone;
    return {
      id: U.genId('zone'),
      name: z.name || 'Зона',
      type: z.type || C.ZONE_TYPE.OPEN_SPACE,
      capacity: U.toNonNegativeInt(z.capacity),
      isVipZone: isVip,
      isSystem: false,
      comment: z.comment || ''
    };
  }

  /** Update office fields (name/area/comment/isDraft, and currentCapacity for old). */
  function updateOffice(officeId, data) {
    var office = find(officeId);
    if (!office || office.type === C.OFFICE_TYPE.REMOTE) {
      return;
    }
    state.commit('Изменение офиса', function () {
      if (data.name !== undefined) {
        office.name = data.name;
      }
      if (data.area !== undefined) {
        office.area = U.toNonNegativeInt(data.area);
      }
      if (data.comment !== undefined) {
        office.comment = data.comment;
      }
      if (data.isDraft !== undefined) {
        office.isDraft = !!data.isDraft;
      }
      if (office.type === C.OFFICE_TYPE.OLD && data.currentCapacity !== undefined) {
        office.currentCapacity = U.toNonNegativeInt(data.currentCapacity);
      }
    });
  }

  /** Delete an office (not the system remote). Removes its allocations. */
  function removeOffice(officeId) {
    var office = find(officeId);
    if (!office || office.isSystem || office.type === C.OFFICE_TYPE.REMOTE) {
      return false;
    }
    state.commit('Удаление офиса', function () {
      var s = scenario();
      s.offices = s.offices.filter(function (o) {
        return o.id !== officeId;
      });
      s.allocations = s.allocations.filter(function (a) {
        return a.targetOfficeId !== officeId;
      });
    });
    return true;
  }

  /** Add a zone to a new office. */
  function addZone(officeId, zoneData) {
    var office = find(officeId);
    if (!office || office.type !== C.OFFICE_TYPE.NEW) {
      return null;
    }
    var zone = makeZone(zoneData);
    state.commit('Добавление зоны', function () {
      office.zones.push(zone);
    });
    return zone.id;
  }

  function updateZone(officeId, zoneId, zoneData) {
    var office = find(officeId);
    if (!office || office.type !== C.OFFICE_TYPE.NEW) {
      return;
    }
    var zone = U.findById(office.zones, zoneId);
    if (!zone) {
      return;
    }
    state.commit('Изменение зоны', function () {
      if (zoneData.name !== undefined) {
        zone.name = zoneData.name;
      }
      if (zoneData.type !== undefined) {
        zone.type = zoneData.type;
        zone.isVipZone = zoneData.type === C.ZONE_TYPE.VIP;
      }
      if (zoneData.isVipZone !== undefined) {
        zone.isVipZone = !!zoneData.isVipZone;
      }
      if (zoneData.capacity !== undefined) {
        zone.capacity = U.toNonNegativeInt(zoneData.capacity);
      }
      if (zoneData.comment !== undefined) {
        zone.comment = zoneData.comment;
      }
    });
  }

  /**
   * Delete a zone. A new office must keep at least one zone, so if the last
   * zone is removed an auto "Опенспейс" is recreated. Allocations to the zone
   * are removed.
   */
  function removeZone(officeId, zoneId) {
    var office = find(officeId);
    if (!office || office.type !== C.OFFICE_TYPE.NEW) {
      return false;
    }
    state.commit('Удаление зоны', function () {
      office.zones = office.zones.filter(function (z) {
        return z.id !== zoneId;
      });
      if (office.zones.length === 0) {
        office.zones.push(state.createDefaultOpenSpaceZone());
      }
      var s = scenario();
      s.allocations = s.allocations.filter(function (a) {
        return a.targetZoneId !== zoneId;
      });
    });
    return true;
  }

  return {
    list: list,
    find: find,
    addOldOffice: addOldOffice,
    addNewOffice: addNewOffice,
    updateOffice: updateOffice,
    removeOffice: removeOffice,
    addZone: addZone,
    updateZone: updateZone,
    removeZone: removeZone
  };
})();
