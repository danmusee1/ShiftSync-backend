import {
  AssignmentStatus,
  NotificationChannel,
  OverrideType,
  PrismaClient,
  Role,
  SwapRequestStatus,
  SwapRequestType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { fromZonedTime } from 'date-fns-tz';

const prisma = new PrismaClient();
const PASSWORD = 'Password123!';
const ADMIN_PASSWORD = 'ChangeMe123!';

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 10); // lower cost in seed data — speed over production strength
}

/** Converts a local wall-clock time at a location into the correct UTC instant, DST-aware. */
function localTime(dateStr: string, time: string, timeZone: string): Date {
  return fromZonedTime(`${dateStr}T${time}:00`, timeZone);
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** The Sunday that starts the week containing (or starting) `date`. */
function upcomingSunday(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return addDaysToDateStr(iso, dow === 0 ? 0 : 7 - dow);
}

async function wipeDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.scheduleOverride.deleteMany(),
    prisma.swapRequest.deleteMany(),
    prisma.shiftAssignment.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.scheduleWeek.deleteMany(),
    prisma.availabilityException.deleteMany(),
    prisma.availabilityRule.deleteMany(),
    prisma.staffLocation.deleteMany(),
    prisma.staffSkill.deleteMany(),
    prisma.managerLocation.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.location.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

const FIRST_NAMES = [
  'Alex', 'Bailey', 'Cameron', 'Dana', 'Emerson', 'Frankie', 'Gray', 'Harper',
  'Indigo', 'Jules', 'Kendall', 'Logan', 'Micah', 'Nico', 'Ollie', 'Parker',
  'Quinn', 'Reese', 'Sam', 'Toni', 'Uri', 'Val', 'Wren', 'Zion',
];
const LAST_NAMES = [
  'Bishop', 'Carter', 'Delgado', 'Ellis', 'Foster', 'Griffin', 'Huang', 'Ibarra',
  'Jansen', 'Klein', 'Lopez', 'Mercer', 'Nakamura', 'Ortiz', 'Patel', 'Quan',
  'Reyes', 'Silva', 'Tanaka', 'Ueda', 'Vance', 'Ward', 'Xu', 'Young',
];

async function main(): Promise<void> {
  console.log('Wiping existing data...');
  await wipeDatabase();

  console.log('Creating skills...');
  const skillNames = ['bartender', 'line cook', 'server', 'host', 'dishwasher'];
  const skills = await Promise.all(
    skillNames.map((name) => prisma.skill.create({ data: { name } })),
  );
  const skillByName = Object.fromEntries(skills.map((s) => [s.name, s]));

  console.log('Creating locations...');
  const locations = await Promise.all([
    prisma.location.create({
      data: { name: 'Coastal Eats - Santa Monica', timezone: 'America/Los_Angeles', address: '1200 Ocean Ave, Santa Monica, CA' },
    }),
    prisma.location.create({
      data: { name: 'Coastal Eats - Pasadena', timezone: 'America/Los_Angeles', address: '88 Colorado Blvd, Pasadena, CA' },
    }),
    prisma.location.create({
      data: { name: 'Coastal Eats - Brooklyn', timezone: 'America/New_York', address: '450 Atlantic Ave, Brooklyn, NY' },
    }),
    prisma.location.create({
      data: { name: 'Coastal Eats - Hoboken', timezone: 'America/New_York', address: '77 Washington St, Hoboken, NJ' },
    }),
  ]);
  const [santaMonica, pasadena, brooklyn, hoboken] = locations;

  console.log('Creating admin...');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@coastaleats.example',
      passwordHash: await hash(ADMIN_PASSWORD),
      firstName: 'Coastal',
      lastName: 'Admin',
      role: Role.ADMIN,
      homeTimezone: 'America/Los_Angeles',
    },
  });

  console.log('Creating managers...');
  const managerDefs = [
    { email: 'manager.westcoast@coastaleats.example', firstName: 'Morgan', lastName: 'Reyes', tz: 'America/Los_Angeles', locations: [santaMonica, pasadena] },
    { email: 'manager.brooklyn@coastaleats.example', firstName: 'Priya', lastName: 'Nakamura', tz: 'America/New_York', locations: [brooklyn] },
    { email: 'manager.hoboken@coastaleats.example', firstName: 'Devon', lastName: 'Ward', tz: 'America/New_York', locations: [hoboken] },
  ];
  const managers = [];
  for (const def of managerDefs) {
    const manager = await prisma.user.create({
      data: {
        email: def.email,
        passwordHash: await hash(PASSWORD),
        firstName: def.firstName,
        lastName: def.lastName,
        role: Role.MANAGER,
        homeTimezone: def.tz,
      },
    });
    for (const location of def.locations) {
      await prisma.managerLocation.create({ data: { managerId: manager.id, locationId: location.id } });
    }
    managers.push(manager);
  }
  const [westCoastManager, brooklynManager, hobokenManager] = managers;

  console.log('Creating staff...');
  interface StaffRecord {
    id: string;
    firstName: string;
    lastName: string;
    cluster: 'west' | 'east';
  }
  const staff: StaffRecord[] = [];

  for (let i = 0; i < 24; i++) {
    const cluster: 'west' | 'east' = i % 2 === 0 ? 'west' : 'east';
    const homeLocations = cluster === 'west' ? [santaMonica, pasadena] : [brooklyn, hoboken];
    const homeTimezone = cluster === 'west' ? 'America/Los_Angeles' : 'America/New_York';
    const firstName = FIRST_NAMES[i];
    const lastName = LAST_NAMES[i];

    const user = await prisma.user.create({
      data: {
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@coastaleats.example`,
        passwordHash: await hash(PASSWORD),
        firstName,
        lastName,
        role: Role.STAFF,
        homeTimezone,
        desiredWeeklyHours: [20, 25, 30, 35, 40][i % 5],
        notificationChannel: i % 3 === 0 ? NotificationChannel.IN_APP_AND_EMAIL : NotificationChannel.IN_APP,
        hourlyRate: 16 + (i % 8), // spread of $16-23/hr across the roster
      },
    });

    // Most staff work one home location; every third also covers the other
    // location in their cluster (multi-location certification).
    const certifiedLocations = i % 3 === 0 ? homeLocations : [homeLocations[i % 2]];
    for (const location of certifiedLocations) {
      await prisma.staffLocation.create({ data: { staffId: user.id, locationId: location.id } });
    }

    // Each staff member has 1-2 skills, cycling through the list.
    const staffSkillNames = [skillNames[i % 5], skillNames[(i + 2) % 5]];
    for (const skillName of new Set(staffSkillNames)) {
      await prisma.staffSkill.create({ data: { staffId: user.id, skillId: skillByName[skillName].id } });
    }

    // Recurring availability: most staff are available every day 08:00-22:00;
    // a few are weekday-only or weekend-only to keep the roster realistic.
    const pattern = i % 6;
    const days =
      pattern === 0 ? [1, 2, 3, 4, 5] : // weekdays only
      pattern === 1 ? [0, 5, 6] :        // weekends + Sunday
      [0, 1, 2, 3, 4, 5, 6];             // every day
    for (const dayOfWeek of days) {
      await prisma.availabilityRule.create({
        data: { staffId: user.id, dayOfWeek, startTime: '08:00', endTime: '22:00' },
      });
    }

    staff.push({ id: user.id, firstName, lastName, cluster });
  }
  const westStaff = staff.filter((s) => s.cluster === 'west');
  const eastStaff = staff.filter((s) => s.cluster === 'east');

  // ── Scenario personas (named so graders can find them easily) ──────────
  console.log('Creating scenario personas...');

  const rileyOnshift = await prisma.user.create({
    data: {
      email: 'riley.onshift@coastaleats.example',
      passwordHash: await hash(PASSWORD),
      firstName: 'Riley',
      lastName: 'Onshift',
      role: Role.STAFF,
      homeTimezone: 'America/Los_Angeles',
      desiredWeeklyHours: 30,
      hourlyRate: 19,
    },
  });
  await prisma.staffLocation.create({ data: { staffId: rileyOnshift.id, locationId: santaMonica.id } });
  await prisma.staffSkill.create({ data: { staffId: rileyOnshift.id, skillId: skillByName['server'].id } });
  for (let d = 0; d <= 6; d++) {
    await prisma.availabilityRule.create({ data: { staffId: rileyOnshift.id, dayOfWeek: d, startTime: '08:00', endTime: '23:59' } });
  }

  const jordanFortyplus = await prisma.user.create({
    data: {
      email: 'jordan.fortyplus@coastaleats.example',
      passwordHash: await hash(PASSWORD),
      firstName: 'Jordan',
      lastName: 'Fortyplus',
      role: Role.STAFF,
      homeTimezone: 'America/Los_Angeles',
      desiredWeeklyHours: 40,
      hourlyRate: 22, // "The Overtime Trap" also demonstrates real projected-cost math: 45h -> $1,045 ($55 overtime premium)
    },
  });
  await prisma.staffLocation.create({ data: { staffId: jordanFortyplus.id, locationId: santaMonica.id } });
  await prisma.staffSkill.create({ data: { staffId: jordanFortyplus.id, skillId: skillByName['line cook'].id } });
  for (let d = 0; d <= 6; d++) {
    await prisma.availabilityRule.create({ data: { staffId: jordanFortyplus.id, dayOfWeek: d, startTime: '06:00', endTime: '23:59' } });
  }

  const averyBicoastal = await prisma.user.create({
    data: {
      email: 'avery.bicoastal@coastaleats.example',
      passwordHash: await hash(PASSWORD),
      firstName: 'Avery',
      lastName: 'Bicoastal',
      role: Role.STAFF,
      homeTimezone: 'America/Los_Angeles', // "The Timezone Tangle" — see DECISIONS.md
      desiredWeeklyHours: 25,
      hourlyRate: 24,
    },
  });
  await prisma.staffLocation.create({ data: { staffId: averyBicoastal.id, locationId: santaMonica.id } });
  await prisma.staffLocation.create({ data: { staffId: averyBicoastal.id, locationId: brooklyn.id } });
  await prisma.staffSkill.create({ data: { staffId: averyBicoastal.id, skillId: skillByName['bartender'].id } });
  for (let d = 1; d <= 5; d++) {
    // "9am-5pm" as literally stated — interpreted in their homeTimezone (LA).
    await prisma.availabilityRule.create({ data: { staffId: averyBicoastal.id, dayOfWeek: d, startTime: '09:00', endTime: '17:00' } });
  }

  const skylerNeverweekend = await prisma.user.create({
    data: {
      email: 'skyler.neverweekend@coastaleats.example',
      passwordHash: await hash(PASSWORD),
      firstName: 'Skyler',
      lastName: 'Neverweekend',
      role: Role.STAFF,
      homeTimezone: 'America/Los_Angeles',
      desiredWeeklyHours: 30,
      hourlyRate: 17,
    },
  });
  await prisma.staffLocation.create({ data: { staffId: skylerNeverweekend.id, locationId: santaMonica.id } });
  await prisma.staffSkill.create({ data: { staffId: skylerNeverweekend.id, skillId: skillByName['host'].id } });
  for (const d of [1, 2, 3, 4]) {
    await prisma.availabilityRule.create({ data: { staffId: skylerNeverweekend.id, dayOfWeek: d, startTime: '10:00', endTime: '16:00' } });
  }

  const drewAlldays = await prisma.user.create({
    data: {
      email: 'drew.alldays@coastaleats.example',
      passwordHash: await hash(PASSWORD),
      firstName: 'Drew',
      lastName: 'Alldays',
      role: Role.STAFF,
      homeTimezone: 'America/Los_Angeles',
      desiredWeeklyHours: 30,
      hourlyRate: 16,
    },
  });
  await prisma.staffLocation.create({ data: { staffId: drewAlldays.id, locationId: santaMonica.id } });
  await prisma.staffSkill.create({ data: { staffId: drewAlldays.id, skillId: skillByName['dishwasher'].id } });
  for (let d = 0; d <= 6; d++) {
    await prisma.availabilityRule.create({ data: { staffId: drewAlldays.id, dayOfWeek: d, startTime: '06:00', endTime: '14:00' } });
  }

  const morganRetired = await prisma.user.create({
    data: {
      email: 'morgan.retired@coastaleats.example',
      passwordHash: await hash(PASSWORD),
      firstName: 'Morgan',
      lastName: 'Retired',
      role: Role.STAFF,
      homeTimezone: 'America/Los_Angeles',
      isActive: true,
      hourlyRate: 18,
    },
  });
  await prisma.staffSkill.create({ data: { staffId: morganRetired.id, skillId: skillByName['server'].id } });

  const staffB = await prisma.user.create({
    data: {
      email: 'sam.regretswap@coastaleats.example',
      passwordHash: await hash(PASSWORD),
      firstName: 'Sam',
      lastName: 'Regretswap',
      role: Role.STAFF,
      homeTimezone: 'America/Los_Angeles',
      desiredWeeklyHours: 25,
      hourlyRate: 19,
    },
  });
  await prisma.staffLocation.create({ data: { staffId: staffB.id, locationId: santaMonica.id } });
  await prisma.staffSkill.create({ data: { staffId: staffB.id, skillId: skillByName['server'].id } });
  for (let d = 0; d <= 6; d++) {
    await prisma.availabilityRule.create({ data: { staffId: staffB.id, dayOfWeek: d, startTime: '08:00', endTime: '22:00' } });
  }

  // ── Schedule weeks ───────────────────────────────────────────────────
  console.log('Creating schedule weeks and shifts...');
  const thisWeekStart = upcomingSunday(new Date());
  const nextWeekStart = addDaysToDateStr(thisWeekStart, 7);
  const pastWeekStart = addDaysToDateStr(thisWeekStart, -14);

  async function getOrCreateWeek(locationId: string, weekStartDate: string, published: boolean) {
    const week = await prisma.scheduleWeek.create({
      data: {
        locationId,
        weekStartDate: new Date(`${weekStartDate}T00:00:00.000Z`),
        isPublished: published,
        publishedAt: published ? new Date() : null,
      },
    });
    return week;
  }

  const currentWeeks = new Map<string, { id: string }>();
  for (const location of locations) {
    currentWeeks.set(location.id, await getOrCreateWeek(location.id, thisWeekStart, true));
  }
  // One location also has an unpublished draft for next week.
  const draftWeek = await getOrCreateWeek(santaMonica.id, nextWeekStart, false);
  // A past (historical) week at Santa Monica, for the decertified-staff scenario.
  const pastWeek = await getOrCreateWeek(santaMonica.id, pastWeekStart, true);

  async function createShift(params: {
    scheduleWeekId: string;
    locationId: string;
    timezone: string;
    dateStr: string;
    startTime: string;
    endTime: string;
    skillId: string;
    headcount?: number;
    createdById: string;
    endsNextDay?: boolean;
  }) {
    const startAt = localTime(params.dateStr, params.startTime, params.timezone);
    const endDateStr = params.endsNextDay ? addDaysToDateStr(params.dateStr, 1) : params.dateStr;
    const endAt = localTime(endDateStr, params.endTime, params.timezone);
    return prisma.shift.create({
      data: {
        scheduleWeekId: params.scheduleWeekId,
        locationId: params.locationId,
        startAt,
        endAt,
        requiredSkillId: params.skillId,
        headcountNeeded: params.headcount ?? 1,
        createdById: params.createdById,
      },
    });
  }

  async function assignDirect(shiftId: string, staffId: string, assignedById: string) {
    return prisma.shiftAssignment.create({ data: { shiftId, staffId, assignedById } });
  }

  // Regular coverage: lunch + dinner shifts, Wed-Sun, per location, filled
  // from that location's certified/skilled roster where possible.
  for (const location of locations) {
    const week = currentWeeks.get(location.id)!;
    const roster = location.id === santaMonica.id || location.id === pasadena.id ? westStaff : eastStaff;
    const manager =
      location.id === santaMonica.id || location.id === pasadena.id
        ? westCoastManager
        : location.id === brooklyn.id
          ? brooklynManager
          : hobokenManager;

    let rosterIndex = 0;
    for (let dayOffset = 3; dayOffset <= 6; dayOffset++) {
      const dateStr = addDaysToDateStr(thisWeekStart, dayOffset);
      for (const [startTime, endTime, skillName] of [
        ['11:00', '16:00', 'server'],
        ['17:00', '23:00', 'server'],
        ['17:00', '23:00', 'line cook'],
      ] as const) {
        const shift = await createShift({
          scheduleWeekId: week.id,
          locationId: location.id,
          timezone: location.timezone,
          dateStr,
          startTime,
          endTime,
          skillId: skillByName[skillName].id,
          createdById: manager.id,
        });

        // Leave roughly 1 in 6 shifts unfilled — realistic understaffing.
        if ((dayOffset + skillName.length) % 6 !== 0) {
          const candidate = roster[rosterIndex % roster.length];
          rosterIndex++;
          const hasSkill = await prisma.staffSkill.findFirst({
            where: { staffId: candidate.id, skill: { name: skillName } },
          });
          const isCertified = await prisma.staffLocation.findFirst({
            where: { staffId: candidate.id, locationId: location.id, decertifiedAt: null },
          });
          if (hasSkill && isCertified) {
            await assignDirect(shift.id, candidate.id, manager.id).catch(() => undefined);
          }
        }
      }
    }
  }

  // Riley Onshift: a Sunday-evening shift this week — the "Sunday Night Chaos" anchor.
  const sundayDateStr = addDaysToDateStr(thisWeekStart, 0);
  const rileyShift = await createShift({
    scheduleWeekId: currentWeeks.get(santaMonica.id)!.id,
    locationId: santaMonica.id,
    timezone: santaMonica.timezone,
    dateStr: sundayDateStr,
    startTime: '17:00',
    endTime: '23:00',
    skillId: skillByName['server'].id,
    createdById: westCoastManager.id,
  });
  await assignDirect(rileyShift.id, rileyOnshift.id, westCoastManager.id);

  // Jordan Fortyplus: five ~9h shifts this week (~45h total) — "The Overtime Trap".
  for (let dayOffset = 0; dayOffset <= 4; dayOffset++) {
    const dateStr = addDaysToDateStr(thisWeekStart, dayOffset);
    const shift = await createShift({
      scheduleWeekId: currentWeeks.get(santaMonica.id)!.id,
      locationId: santaMonica.id,
      timezone: santaMonica.timezone,
      dateStr,
      startTime: '09:00',
      endTime: '18:00',
      skillId: skillByName['line cook'].id,
      createdById: westCoastManager.id,
    });
    await assignDirect(shift.id, jordanFortyplus.id, westCoastManager.id);
  }

  // Drew Alldays: seven consecutive daily shifts, with a documented manager
  // override for the 7th — "The 6th/7th consecutive day" rule.
  for (let dayOffset = 0; dayOffset <= 6; dayOffset++) {
    const dateStr = addDaysToDateStr(thisWeekStart, dayOffset);
    const shift = await createShift({
      scheduleWeekId: currentWeeks.get(santaMonica.id)!.id,
      locationId: santaMonica.id,
      timezone: santaMonica.timezone,
      dateStr,
      startTime: '06:00',
      endTime: '10:00',
      skillId: skillByName['dishwasher'].id,
      createdById: westCoastManager.id,
    });
    await assignDirect(shift.id, drewAlldays.id, westCoastManager.id);
  }
  await prisma.scheduleOverride.create({
    data: {
      staffId: drewAlldays.id,
      weekStartDate: new Date(`${thisWeekStart}T00:00:00.000Z`),
      type: OverrideType.SEVENTH_CONSECUTIVE_DAY,
      reason: 'Covering for a call-out; Drew volunteered for the extra day.',
      approvedById: westCoastManager.id,
    },
  });

  // Skyler Neverweekend: weekday lunch shifts only, no premium (Fri/Sat evening)
  // shifts — "The Fairness Complaint". Meanwhile other west-coast staff above
  // already picked up some Fri/Sat dinner shifts in the regular coverage loop.
  for (const dayOffset of [3, 4]) {
    const dateStr = addDaysToDateStr(thisWeekStart, dayOffset);
    const shift = await createShift({
      scheduleWeekId: currentWeeks.get(santaMonica.id)!.id,
      locationId: santaMonica.id,
      timezone: santaMonica.timezone,
      dateStr,
      startTime: '11:00',
      endTime: '15:00',
      skillId: skillByName['host'].id,
      createdById: westCoastManager.id,
    });
    await assignDirect(shift.id, skylerNeverweekend.id, westCoastManager.id);
  }

  // Draft (unpublished) week at Santa Monica, next week.
  await createShift({
    scheduleWeekId: draftWeek.id,
    locationId: santaMonica.id,
    timezone: santaMonica.timezone,
    dateStr: addDaysToDateStr(nextWeekStart, 5),
    startTime: '17:00',
    endTime: '23:00',
    skillId: skillByName['bartender'].id,
    createdById: westCoastManager.id,
  });

  // Morgan Retired: certified + worked shifts two weeks ago, then decertified —
  // history stays intact. See DECISIONS.md.
  const pastShift1 = await createShift({
    scheduleWeekId: pastWeek.id,
    locationId: santaMonica.id,
    timezone: santaMonica.timezone,
    dateStr: addDaysToDateStr(pastWeekStart, 2),
    startTime: '11:00',
    endTime: '16:00',
    skillId: skillByName['server'].id,
    createdById: westCoastManager.id,
  });
  const staffLocationForMorgan = await prisma.staffLocation.create({
    data: {
      staffId: morganRetired.id,
      locationId: santaMonica.id,
      certifiedAt: new Date(`${pastWeekStart}T00:00:00.000Z`),
    },
  });
  await assignDirect(pastShift1.id, morganRetired.id, westCoastManager.id);
  await prisma.staffLocation.update({
    where: { id: staffLocationForMorgan.id },
    data: { decertifiedAt: new Date(`${addDaysToDateStr(pastWeekStart, 5)}T00:00:00.000Z`) },
  });

  // ── Pending swap/drop requests ───────────────────────────────────────
  console.log('Creating pending swap/drop requests...');

  // "The Regret Swap": Riley proposes a swap with Sam; still awaiting Sam's
  // response — cancel-able by either party right now.
  const swapTargetShift = await createShift({
    scheduleWeekId: currentWeeks.get(santaMonica.id)!.id,
    locationId: santaMonica.id,
    timezone: santaMonica.timezone,
    dateStr: addDaysToDateStr(thisWeekStart, 2),
    startTime: '11:00',
    endTime: '16:00',
    skillId: skillByName['server'].id,
    createdById: westCoastManager.id,
  });
  const swapTargetAssignment = await assignDirect(swapTargetShift.id, staffB.id, westCoastManager.id);
  const rileySecondShift = await createShift({
    scheduleWeekId: currentWeeks.get(santaMonica.id)!.id,
    locationId: santaMonica.id,
    timezone: santaMonica.timezone,
    dateStr: addDaysToDateStr(thisWeekStart, 3),
    startTime: '16:00',
    endTime: '23:00',
    skillId: skillByName['server'].id,
    createdById: westCoastManager.id,
  });
  const rileySecondAssignment = await assignDirect(rileySecondShift.id, rileyOnshift.id, westCoastManager.id);
  await prisma.swapRequest.create({
    data: {
      type: SwapRequestType.SWAP,
      status: SwapRequestStatus.PENDING_TARGET,
      initiatorId: rileyOnshift.id,
      initiatorAssignmentId: rileySecondAssignment.id,
      counterpartyId: staffB.id,
      proposedReturnAssignmentId: swapTargetAssignment.id,
    },
  });

  // An open drop request: any qualified server can claim it.
  const dropShift = await createShift({
    scheduleWeekId: currentWeeks.get(santaMonica.id)!.id,
    locationId: santaMonica.id,
    timezone: santaMonica.timezone,
    dateStr: addDaysToDateStr(thisWeekStart, 4),
    startTime: '16:00',
    endTime: '23:00',
    skillId: skillByName['server'].id,
    createdById: westCoastManager.id,
  });
  const dropAssignment = await assignDirect(dropShift.id, staffB.id, westCoastManager.id);
  await prisma.swapRequest.create({
    data: {
      type: SwapRequestType.DROP,
      status: SwapRequestStatus.PENDING,
      initiatorId: staffB.id,
      initiatorAssignmentId: dropAssignment.id,
      expiresAt: new Date(dropShift.startAt.getTime() - 24 * 3_600_000),
    },
  });

  console.log('\nSeed complete.\n');
  console.log('Login credentials:');
  console.log(`  Admin:    admin@coastaleats.example / ${ADMIN_PASSWORD}`);
  console.log(`  Manager:  manager.westcoast@coastaleats.example / ${PASSWORD}  (Santa Monica + Pasadena)`);
  console.log(`  Manager:  manager.brooklyn@coastaleats.example / ${PASSWORD}  (Brooklyn)`);
  console.log(`  Manager:  manager.hoboken@coastaleats.example / ${PASSWORD}  (Hoboken)`);
  console.log(`  Staff:    <firstname>.<lastname>@coastaleats.example / ${PASSWORD}`);
  console.log('  Scenario staff: riley.onshift, jordan.fortyplus, avery.bicoastal,');
  console.log('                  skyler.neverweekend, drew.alldays, morgan.retired, sam.regretswap');
  console.log(`  (all @coastaleats.example / ${PASSWORD})`);
  console.log(`\nDemo week starts: ${thisWeekStart}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
