/**
 * calculations.test.js
 * Unit tests for App.calc — capacity / occupancy / overflow / KPI math.
 */
(function () {
  'use strict';

  var describe = TestHarness.describe;
  var it = TestHarness.it;
  var expect = TestHarness.expect;
  var calc = App.calc;
  var C = App.constants;

  /** Build a small scenario fixture mirroring 03_DATA_MODEL_EXAMPLE.json. */
  function fixture() {
    return {
      id: 's1',
      name: 'Test',
      comment: '',
      offices: [
        { id: 'old1', type: 'old', name: 'Старый', area: 500, currentCapacity: 80 },
        {
          id: 'new1', type: 'new', name: 'Новый B', area: 1200, isDraft: false,
          zones: [
            { id: 'z_open', name: 'Опенспейс', type: 'open_space', capacity: 130, isVipZone: false },
            { id: 'z_cab', name: 'Кабинеты', type: 'cabinet', capacity: 40, isVipZone: false },
            { id: 'z_vip', name: 'VIP', type: 'vip', capacity: 10, isVipZone: true }
          ]
        },
        { id: 'remote', type: 'remote', name: 'Удаленка', isSystem: true, unlimitedCapacity: true }
      ],
      teams: [
        { id: 't1', name: 'Finance', employeesCount: 40, isVip: false, canSplit: true }
      ],
      employees: [],
      allocations: [
        { id: 'a1', type: 'team', teamId: 't1', employeeId: null, employeesCount: 20, targetOfficeId: 'new1', targetZoneId: 'z_open' },
        { id: 'a2', type: 'team', teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'remote', targetZoneId: null }
      ]
    };
  }

  var thresholds = { greenMaxPercent: 85, yellowMaxPercent: 100 };

  describe('calculateOfficeCapacity', function () {
    it('sums zone capacities for a new office', function () {
      var s = fixture();
      expect(calc.calculateOfficeCapacity(s.offices[1])).toBe(180);
    });
    it('returns Infinity for remote office', function () {
      var s = fixture();
      expect(calc.calculateOfficeCapacity(s.offices[2])).toBe(Infinity);
    });
    it('returns 0 for old office (not counted)', function () {
      var s = fixture();
      expect(calc.calculateOfficeCapacity(s.offices[0])).toBe(0);
    });
  });

  describe('occupancy & overflow', function () {
    it('office occupancy sums allocations into the office', function () {
      var s = fixture();
      expect(calc.calculateOfficeOccupancy(s, 'new1')).toBe(20);
    });
    it('zone occupancy sums allocations into the zone', function () {
      var s = fixture();
      expect(calc.calculateZoneOccupancy(s, 'z_open')).toBe(20);
    });
    it('overflow is max(0, occupied - capacity)', function () {
      expect(calc.calculateOverflow(130, 147)).toBe(17);
      expect(calc.calculateOverflow(130, 100)).toBe(0);
    });
    it('free places can be negative', function () {
      expect(calc.calculateFreePlaces(130, 147)).toBe(-17);
    });
    it('occupancy percent is null when no capacity', function () {
      expect(calc.calculateOccupancyPercent(5, 0)).toBe(null);
    });
    it('occupancy percent computes correctly', function () {
      expect(calc.calculateOccupancyPercent(20, 180)).toBeCloseTo(11.11, 2);
    });
  });

  describe('statusColor', function () {
    it('green at or below greenMax', function () {
      expect(calc.statusColor(85, thresholds)).toBe(C.STATUS_COLOR.GREEN);
    });
    it('yellow between green and yellow max', function () {
      expect(calc.statusColor(95, thresholds)).toBe(C.STATUS_COLOR.YELLOW);
    });
    it('red above yellow max', function () {
      expect(calc.statusColor(120, thresholds)).toBe(C.STATUS_COLOR.RED);
    });
    it('grey when percent is null', function () {
      expect(calc.statusColor(null, thresholds)).toBe(C.STATUS_COLOR.GREY);
    });
  });

  describe('team allocation', function () {
    it('counts allocated seats across team allocations', function () {
      var s = fixture();
      expect(calc.calculateTeamAllocated(s, 't1')).toBe(25);
    });
    it('remainder = headcount - allocated', function () {
      var s = fixture();
      expect(calc.calculateTeamRemainder(s, s.teams[0])).toBe(15);
    });
  });

  describe('KPI block', function () {
    it('total employees falls back to team headcount when no list', function () {
      var s = fixture();
      expect(calc.calculateTotalEmployees(s)).toBe(40);
    });
    it('required seats = total - remote', function () {
      var s = fixture();
      var k = calc.calculateScenarioKpis(s, []);
      expect(k.requiredSeats).toBe(35); // 40 total - 5 remote
    });
    it('placed in offices excludes remote', function () {
      var s = fixture();
      var k = calc.calculateScenarioKpis(s, []);
      expect(k.placedInOffices).toBe(20);
    });
    it('remote count counts remote allocations', function () {
      var s = fixture();
      var k = calc.calculateScenarioKpis(s, []);
      expect(k.remoteCount).toBe(5);
    });
    it('free reserve = new capacity - placed in offices', function () {
      var s = fixture();
      var k = calc.calculateScenarioKpis(s, []);
      expect(k.freeReserve).toBe(160); // 180 - 20
    });
    it('office and zone overflow reported separately', function () {
      var s = fixture();
      // Overload the open space zone: add 130 more to z_open (20 + 130 = 150 > 130)
      s.allocations.push({ id: 'a3', type: 'team', teamId: 't1', employeesCount: 130, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      var k = calc.calculateScenarioKpis(s, []);
      // office capacity 180, occupied 150 -> no office overflow; zone 130 cap, 150 occ -> 20 zone overflow
      expect(k.zoneOverflow).toBe(20);
      expect(k.officeOverflow).toBe(0);
    });
  });

  describe('unplaced (aggregated mode)', function () {
    it('total minus everything allocated', function () {
      var s = fixture();
      // 40 headcount, allocated 25 -> 15 unplaced
      expect(calc.calculateUnplacedCount(s)).toBe(15);
    });
  });
})();
