/**
 * validation.test.js
 * Unit tests for App.validation.validateScenario — each message code.
 */
(function () {
  'use strict';

  var describe = TestHarness.describe;
  var it = TestHarness.it;
  var expect = TestHarness.expect;
  var V = App.validation;
  var C = App.constants;

  function base() {
    return {
      id: 's', name: 'T', comment: '',
      offices: [
        {
          id: 'new1', type: 'physical', phase: 'tobe', name: 'Новый B', area: 100, isDraft: false,
          zones: [
            { id: 'z_open', name: 'Опенспейс', type: 'open_space', capacity: 30, isVipZone: false },
            { id: 'z_vip', name: 'VIP', type: 'vip', capacity: 5, isVipZone: true }
          ]
        },
        { id: 'remote', type: 'remote', name: 'Удаленка', isSystem: true, unlimitedCapacity: true }
      ],
      teams: [], employees: [], allocations: []
    };
  }

  function codes(messages) {
    return messages.map(function (m) { return m.code; });
  }

  describe('errors', function () {
    it('team over-allocated', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 10, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 15, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.TEAM_OVERALLOCATED);
    });
    it('employee placed twice', function () {
      var s = base();
      s.employees.push({ id: 'e1', fullName: 'Иван', teamId: null, isVip: false, workFormat: 'office' });
      s.allocations.push({ id: 'a1', type: 'employee', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      s.allocations.push({ id: 'a2', type: 'employee', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.EMPLOYEE_DUPLICATE);
    });
  });

  describe('warnings', function () {
    it('office and zone overflow', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 100, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 50, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      var c = codes(V.validateScenario(s));
      expect(c).toContain(C.CODE.OFFICE_OVERFLOW);
      expect(c).toContain(C.CODE.ZONE_OVERFLOW);
    });
    it('overflow message is formatted with places', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 100, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 47, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      var msg = V.validateScenario(s).filter(function (m) { return m.code === C.CODE.ZONE_OVERFLOW; })[0];
      expect(msg.message).toContain('Переполнение: 17');
    });
    it('team partially allocated', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 10, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 4, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.TEAM_PARTIAL);
    });
    it('employee unplaced', function () {
      var s = base();
      s.employees.push({ id: 'e1', fullName: 'Иван', teamId: null, isVip: false, workFormat: 'office' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.EMPLOYEE_UNPLACED);
    });
    it('non-VIP in VIP zone', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 3, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 3, targetOfficeId: 'new1', targetZoneId: 'z_vip' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.NON_VIP_IN_VIP);
    });
    it('VIP not in VIP zone', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 3, isVip: true, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 3, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.VIP_NOT_IN_VIP);
    });
    it('non-splittable team split across targets', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 10, isVip: false, canSplit: false });
      s.allocations.push({ id: 'a1', type: 'team', teamId: 't1', employeesCount: 3, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      s.allocations.push({ id: 'a2', type: 'team', teamId: 't1', employeesCount: 3, targetOfficeId: 'new1', targetZoneId: 'z_vip' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.TEAM_SPLIT_FORBIDDEN);
    });
    it('draft office with zero capacity used', function () {
      var s = base();
      s.offices[0].isDraft = true;
      s.offices[0].zones.forEach(function (z) { z.capacity = 0; });
      s.teams.push({ id: 't1', name: 'A', employeesCount: 3, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 3, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.DRAFT_ZERO_CAPACITY);
    });
  });

  describe('linked teams (must move together)', function () {
    function withLinkedTeams() {
      var s = base();
      // second office to test separation
      s.offices.splice(1, 0, {
        id: 'new2', type: 'physical', phase: 'tobe', name: 'Новый C', area: 100, isDraft: false,
        zones: [{ id: 'z2_open', name: 'Опен C', type: 'open_space', capacity: 30, isVipZone: false }]
      });
      s.teams.push({ id: 'tA', name: 'A', employeesCount: 5, isVip: false, canSplit: true, linkedTeamIds: ['tB'] });
      s.teams.push({ id: 'tB', name: 'B', employeesCount: 5, isVip: false, canSplit: true, linkedTeamIds: ['tA'] });
      return s;
    }

    it('error when linked teams are in different offices', function () {
      var s = withLinkedTeams();
      s.allocations.push({ id: 'a1', type: 'team', teamId: 'tA', employeesCount: 5, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      s.allocations.push({ id: 'a2', type: 'team', teamId: 'tB', employeesCount: 5, targetOfficeId: 'new2', targetZoneId: 'z2_open' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.LINKED_TEAMS_SEPARATED);
    });

    it('no error when linked teams are in the same office (different zones OK)', function () {
      var s = withLinkedTeams();
      // both in new1, but different zones
      s.allocations.push({ id: 'a1', type: 'team', teamId: 'tA', employeesCount: 5, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      s.allocations.push({ id: 'a2', type: 'team', teamId: 'tB', employeesCount: 5, targetOfficeId: 'new1', targetZoneId: 'z_vip' });
      expect(codes(V.validateScenario(s)).indexOf(C.CODE.LINKED_TEAMS_SEPARATED)).toBe(-1);
    });

    it('error when one linked team is placed and the other is not', function () {
      var s = withLinkedTeams();
      s.allocations.push({ id: 'a1', type: 'team', teamId: 'tA', employeesCount: 5, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.LINKED_TEAMS_SEPARATED);
    });

    it('reports a linked pair only once', function () {
      var s = withLinkedTeams();
      s.allocations.push({ id: 'a1', type: 'team', teamId: 'tA', employeesCount: 5, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      s.allocations.push({ id: 'a2', type: 'team', teamId: 'tB', employeesCount: 5, targetOfficeId: 'new2', targetZoneId: 'z2_open' });
      var count = V.validateScenario(s).filter(function (m) { return m.code === C.CODE.LINKED_TEAMS_SEPARATED; }).length;
      expect(count).toBe(1);
    });

    it('no error when neither linked team is placed', function () {
      var s = withLinkedTeams();
      expect(codes(V.validateScenario(s)).indexOf(C.CODE.LINKED_TEAMS_SEPARATED)).toBe(-1);
    });
  });

  describe('info', function () {
    it('has remote employees', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 10, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 5, targetOfficeId: 'remote', targetZoneId: null });
      expect(codes(V.validateScenario(s))).toContain(C.CODE.HAS_REMOTE);
    });
  });

  describe('clean scenario', function () {
    it('no messages when everything fits', function () {
      var s = base();
      s.teams.push({ id: 't1', name: 'A', employeesCount: 10, isVip: false, canSplit: true });
      s.allocations.push({ id: 'a', type: 'team', teamId: 't1', employeesCount: 10, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      expect(V.validateScenario(s).length).toBe(0);
    });
  });
})();
