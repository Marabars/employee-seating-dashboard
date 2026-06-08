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
        { id: 'old1', type: 'physical', phase: 'asis', name: 'Старый', area: 500,
          zones: [{ id: 'z_as', name: 'Опен AS', type: 'open_space', capacity: 80, isVipZone: false }] },
        {
          id: 'new1', type: 'physical', phase: 'tobe', name: 'Новый B', area: 1200, isDraft: false,
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
    it('AS IS physical office also sums its zones', function () {
      var s = fixture();
      expect(calc.calculateOfficeCapacity(s.offices[0])).toBe(80);
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
    it('total places = TO BE capacity (180), balance = 180 - 20', function () {
      var s = fixture();
      var k = calc.calculateScenarioKpis(s, []);
      expect(k.totalPlaces).toBe(180);
      expect(k.placesBalance).toBe(160); // 180 - 20 placed
    });
    it('zone overflow still reported; office overflow metric removed', function () {
      var s = fixture();
      s.allocations.push({ id: 'a3', type: 'team', teamId: 't1', employeesCount: 130, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      var k = calc.calculateScenarioKpis(s, []);
      expect(k.zoneOverflow).toBe(20); // zone 130 cap, 150 occ
      expect(k.officeOverflow).toBe(undefined); // metric removed
    });
    it('negative balance = deficit', function () {
      var s = fixture();
      s.allocations.push({ id: 'a4', type: 'team', teamId: 't1', employeesCount: 200, targetOfficeId: 'new1', targetZoneId: 'z_open' });
      var k = calc.calculateScenarioKpis(s, []);
      // placed in offices now 220, capacity 180 -> balance -40
      expect(k.placesBalance).toBe(-40);
    });
  });

  describe('money (lease)', function () {
    it('annual cost = (rent + opex) * area', function () {
      var office = { type: 'physical', phase: 'tobe', area: 100, zones: [], rentPerSqm: 30000, opexPerSqm: 5000, indexationPct: 0 };
      expect(calc.officeAnnualCost(office)).toBe(3500000); // (30000+5000)*100
    });
    it('returns null when rates unset', function () {
      var office = { type: 'physical', phase: 'tobe', area: 100, zones: [], rentPerSqm: null, opexPerSqm: null };
      expect(calc.officeAnnualCost(office)).toBe(null);
    });
    it('5-year cost compounds with indexation', function () {
      var office = { type: 'physical', phase: 'tobe', area: 100, zones: [], rentPerSqm: 10000, opexPerSqm: 0, indexationPct: 10 };
      // annual = 1,000,000; sum k=0..4 of 1e6*(1.1)^k = 1e6*(1+1.1+1.21+1.331+1.4641)=6,105,100
      expect(Math.round(calc.officeCostNYears(office, 5))).toBe(6105100);
    });
  });

  describe('unplaced (aggregated mode)', function () {
    it('total minus everything allocated', function () {
      var s = fixture();
      // 40 headcount, allocated 25 -> 15 unplaced
      expect(calc.calculateUnplacedCount(s)).toBe(15);
    });
  });

  describe('move progress (no percentages over 100%)', function () {
    it('normal case partitions correctly', function () {
      var s = fixture(); // total 40, inOffices 20, remote 5
      var p = calc.calculateMoveProgress(s);
      expect(p.inOfficesPercent).toBe(50);  // 20/40
      expect(p.remotePercent).toBe(13);     // 5/40 rounded
      expect(p.unplacedPercent).toBe(38);   // 15/40 rounded
      expect(p.overAllocated).toBe(false);
    });
    it('over-allocation never yields percentages over 100%', function () {
      // Regression: total 10 but 40 in offices + 20 remote -> previously 400%/200%.
      var s = {
        id: 's', offices: [
          { id: 'new1', type: 'physical', phase: 'tobe', name: 'B', zones: [{ id: 'z1', name: 'O', type: 'open_space', capacity: 10, isVipZone: false }] },
          { id: 'remote', type: 'remote', name: 'Удаленка', unlimitedCapacity: true }
        ],
        teams: [{ id: 't1', name: 'A', employeesCount: 10, canSplit: true }],
        employees: [],
        allocations: [
          { id: 'a1', type: 'team', teamId: 't1', employeesCount: 40, targetOfficeId: 'new1', targetZoneId: 'z1' },
          { id: 'a2', type: 'team', teamId: 't1', employeesCount: 20, targetOfficeId: 'remote', targetZoneId: null }
        ]
      };
      var p = calc.calculateMoveProgress(s);
      expect(p.inOfficesPercent <= 100).toBeTruthy();
      expect(p.remotePercent <= 100).toBeTruthy();
      expect(p.inOfficesPercent + p.remotePercent + p.unplacedPercent <= 100).toBeTruthy();
      expect(p.overAllocated).toBe(true);
      expect(p.inOfficesPercent).toBe(67); // 40 / max(10,60)=60
      expect(p.remotePercent).toBe(33);    // 20 / 60
    });
    it('zero workforce yields zeros, not NaN', function () {
      var s = { id: 's', offices: [{ id: 'r', type: 'remote', unlimitedCapacity: true }], teams: [], employees: [], allocations: [] };
      var p = calc.calculateMoveProgress(s);
      expect(p.inOfficesPercent).toBe(0);
      expect(p.unplacedPercent).toBe(0);
    });
  });
})();
