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

  // ── Fixture: two TOBE offices with named employees ────────────────────────
  function twoOfficeFixture() {
    return {
      id: 's2',
      offices: [
        { id: 'offA', type: 'physical', phase: 'tobe', name: 'Офис A',
          zones: [{ id: 'zA', name: 'Зона A', capacity: 50, isVipZone: false }] },
        { id: 'offB', type: 'physical', phase: 'tobe', name: 'Офис B',
          zones: [{ id: 'zB', name: 'Зона B', capacity: 50, isVipZone: false }] },
        { id: 'remote', type: 'remote', name: 'Удаленка' }
      ],
      teams: [{ id: 't1', name: 'Alpha', employeesCount: 10, canSplit: true }],
      employees: [
        { id: 'e1', fullName: 'Иван Иванов', teamId: 't1' },
        { id: 'e2', fullName: 'Мария Петрова', teamId: 't1' }
      ],
      allocations: []
    };
  }

  // ── No double-counting: zone level ────────────────────────────────────────

  describe('zone occupancy — no double-counting', function () {
    it('TEAM + EMPLOYEE alloc in same zone counts employee once', function () {
      var s = twoOfficeFixture();
      s.allocations = [
        { id: 'a1', type: 'team',     teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' }
      ];
      // e1 is one of the 5 team seats — max(5,1)=5, not 6
      expect(calc.calculateZoneOccupancy(s, 'zA')).toBe(5);
    });

    it('named count > team seats — uses named count', function () {
      var s = twoOfficeFixture();
      s.employees.push({ id: 'e3', fullName: 'Э3', teamId: 't1' });
      s.allocations = [
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae2', type: 'employee', teamId: 't1', employeeId: 'e2', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae3', type: 'employee', teamId: 't1', employeeId: 'e3', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' }
      ];
      // 3 named > 1 team seat → max(1,3)=3
      expect(calc.calculateZoneOccupancy(s, 'zA')).toBe(3);
    });

    it('only EMPLOYEE allocs (no TEAM) counts correctly', function () {
      var s = twoOfficeFixture();
      s.allocations = [
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae2', type: 'employee', teamId: 't1', employeeId: 'e2', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' }
      ];
      expect(calc.calculateZoneOccupancy(s, 'zA')).toBe(2);
    });

    it('zone counter correct after drag: source zone loses employee, target gains', function () {
      var s = twoOfficeFixture();
      // After drag: team still in zA, e1 moved to zB
      s.allocations = [
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offB', targetZoneId: 'zB' }
      ];
      expect(calc.calculateZoneOccupancy(s, 'zA')).toBe(5); // team stays at 5
      expect(calc.calculateZoneOccupancy(s, 'zB')).toBe(1); // e1 individually
    });
  });

  // ── No double-counting: cross-office (drag-and-drop / Employees tab) ──────

  describe('placedInOffices — no double-counting across offices', function () {
    it('before drag: employee+team in same office counted once', function () {
      var s = twoOfficeFixture();
      s.allocations = [
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' }
      ];
      expect(calc.calculatePlacedInOffices(s)).toBe(5);
    });

    it('after drag A→B: total stays 5, not inflated to 6', function () {
      var s = twoOfficeFixture();
      // TEAM stays in offA, e1 individually moved to offB
      s.allocations = [
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offB', targetZoneId: 'zB' }
      ];
      // e1 is one of team's 5 → max(5,1)=5 across all TOBE offices
      expect(calc.calculatePlacedInOffices(s)).toBe(5);
    });

    it('employee placed via form (no TEAM alloc) moves cleanly A→B', function () {
      var s = twoOfficeFixture();
      s.allocations = [
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' }
      ];
      expect(calc.calculatePlacedInOffices(s)).toBe(1);

      // Simulate placement in offB via form/drag
      s.allocations = [
        { id: 'ae2', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offB', targetZoneId: 'zB' }
      ];
      expect(calc.calculatePlacedInOffices(s)).toBe(1); // still 1, not 2
    });

    it('named count > team seats: extra individuals are counted', function () {
      var s = twoOfficeFixture();
      s.allocations = [
        // Team has 1 TEAM seat in offA
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' },
        // 2 named employees across different offices
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae2', type: 'employee', teamId: 't1', employeeId: 'e2', employeesCount: 1, targetOfficeId: 'offB', targetZoneId: 'zB' }
      ];
      // 2 named > 1 team seat → max(1,2)=2
      expect(calc.calculatePlacedInOffices(s)).toBe(2);
    });

    it('two employees dragged to different offices: both counted once each', function () {
      var s = twoOfficeFixture();
      s.allocations = [
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae2', type: 'employee', teamId: 't1', employeeId: 'e2', employeesCount: 1, targetOfficeId: 'offB', targetZoneId: 'zB' }
      ];
      // 2 named in team (1 in A, 1 in B), team has 5 seats in A → max(5,2)=5
      expect(calc.calculatePlacedInOffices(s)).toBe(5);
    });

    it('teamAllocated stays correct after drag (no phantom seats)', function () {
      var s = twoOfficeFixture();
      // Before drag: e1 in same zone as team
      s.allocations = [
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' }
      ];
      expect(calc.calculateTeamAllocated(s, 't1')).toBe(5);

      // After drag: e1 moved to offB
      s.allocations = [
        { id: 'a1',  type: 'team',     teamId: 't1', employeeId: null, employeesCount: 5, targetOfficeId: 'offA', targetZoneId: 'zA' },
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offB', targetZoneId: 'zB' }
      ];
      // Still 5: e1 counts as 1 individual + max(0, 5-1)=4 anonymous = 5
      expect(calc.calculateTeamAllocated(s, 't1')).toBe(5);
    });

    it('unplacedCount stable before and after drag', function () {
      var s = twoOfficeFixture();
      s.allocations = [
        { id: 'ae1', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offA', targetZoneId: 'zA' }
      ];
      var before = calc.calculateUnplacedCount(s);

      s.allocations = [
        { id: 'ae2', type: 'employee', teamId: 't1', employeeId: 'e1', employeesCount: 1, targetOfficeId: 'offB', targetZoneId: 'zB' }
      ];
      var after = calc.calculateUnplacedCount(s);

      expect(before).toBe(after); // drag must not affect unplaced count
      expect(before).toBe(1);     // only e2 is unplaced
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

  // ── indexationStartDate tests ────────────────────────────────────────────

  describe('cfForYear — indexationStartDate', function () {
    it('null indexationStartDate gives base rate (exponent=0)', function () {
      // area=1000, rent=100, opex=50 => base=150000 => 0.15M/yr, idx=10%
      var result = calc.cfForYear(1000, 100, 50, 10, null, 2025, null, null);
      expect(result).toBeCloseTo(0.15, 4);
    });

    it('year before indexationStartDate.year gives base rate', function () {
      var result = calc.cfForYear(1000, 100, 50, 10, null, 2022, null, '2023-01-01');
      expect(result).toBeCloseTo(0.15, 4);
    });

    it('start year gives exponent 1 (0.15 * 1.1^1 = 0.165)', function () {
      var result = calc.cfForYear(1000, 100, 50, 10, null, 2023, null, '2023-01-01');
      expect(result).toBeCloseTo(0.165, 4);
    });

    it('year+2 after start gives exponent 3 (0.15 * 1.1^3 = 0.19965)', function () {
      var result = calc.cfForYear(1000, 100, 50, 10, null, 2025, null, '2023-01-01');
      expect(result).toBeCloseTo(0.19965, 4);
    });
  });

  describe('cfForMonth — indexationStartDate', function () {
    it('month before indexationStartDate gives base rate (0.15/12 = 0.0125)', function () {
      // March 2023, idx starts June 2023 => exponent 0
      var result = calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 3, null, '2023-06-01');
      expect(result).toBeCloseTo(0.0125, 4);
    });

    it('month after indexationStartDate gives indexed rate (0.15*1.1/12 = 0.01375)', function () {
      // August 2023, idx starts June 2023 => exponent 1
      var result = calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 8, null, '2023-06-01');
      expect(result).toBeCloseTo(0.01375, 4);
    });

    it('idx start month day=1 gives full indexed rate (no proration)', function () {
      // June 2023, idx starts June 1 => exponent 1, no proration
      var result = calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 6, null, '2023-06-01');
      expect(result).toBeCloseTo(0.01375, 4);
    });

    it('idx start month mid-month prorates correctly', function () {
      // June 2023 (30 days), idx starts June 16
      // baseDays=15 at 0.0125, idxDays=15 at 0.01375
      // = (0.0125*15 + 0.01375*15) / 30 = 0.013125
      var result = calc.cfForMonth(1000, 100, 50, 10, '2023-01-01', 2023, 6, null, '2023-06-16');
      expect(result).toBeCloseTo(0.013125, 4);
    });
  });

  describe('cfForMonth — leaseEndDate', function () {
    it('month entirely after leaseEndDate is 0', function () {
      // lease ends 2028-08-30; September 2028 => no expense
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 9, null, null, '2028-08-30');
      expect(result).toBe(0);
    });

    it('lease-end month prorated by day (Aug 2028, 31 days, ends day 30 => 30/31)', function () {
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 8, null, null, '2028-08-30');
      expect(result).toBeCloseTo(0.0125 * 30 / 31, 6);
    });

    it('lease ends on last day of month => full month, no proration', function () {
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 8, null, null, '2028-08-31');
      expect(result).toBeCloseTo(0.0125, 6);
    });

    it('lease start and end in the same month => only active days charged', function () {
      // Aug 2028 (31 days), active days 10..20 = 11 days
      var result = calc.cfForMonth(1000, 100, 50, 10, '2028-08-10', 2028, 8, null, null, '2028-08-20');
      expect(result).toBeCloseTo(0.0125 * 11 / 31, 6);
    });

    it('no leaseEndDate => full month within lease (backward compatible)', function () {
      var result = calc.cfForMonth(1000, 100, 50, 10, null, 2028, 8, null, null);
      expect(result).toBeCloseTo(0.0125, 6);
    });
  });
})();
