/**
 * Additive-only: sets hourlyRate on any STAFF user who doesn't already have
 * one. Never deletes or overwrites existing data — safe to run against a
 * live environment (UAT, or even production) as many times as needed,
 * unlike prisma/seed.ts which wipes and rebuilds everything from scratch.
 *
 * Usage: npm run backfill:hourly-rate
 */
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

// Specific rates for the named scenario personas, matching prisma/seed.ts —
// keeps the numbers consistent with what's already documented/demoed
// elsewhere (e.g. Jordan Fortyplus's $1,045 projected-cost example).
const NAMED_RATES: Record<string, number> = {
  'riley.onshift@coastaleats.example': 19,
  'jordan.fortyplus@coastaleats.example': 22,
  'avery.bicoastal@coastaleats.example': 24,
  'skyler.neverweekend@coastaleats.example': 17,
  'drew.alldays@coastaleats.example': 16,
  'morgan.retired@coastaleats.example': 18,
  'sam.regretswap@coastaleats.example': 19,
};

async function main() {
  const staffWithoutRate = await prisma.user.findMany({
    where: { role: Role.STAFF, hourlyRate: null },
    orderBy: { createdAt: 'asc' },
  });

  if (staffWithoutRate.length === 0) {
    console.log('Every staff member already has an hourly rate on file — nothing to do.');
    return;
  }

  console.log(`Backfilling hourlyRate for ${staffWithoutRate.length} staff member(s)...`);

  let index = 0;
  for (const user of staffWithoutRate) {
    const rate = NAMED_RATES[user.email] ?? 16 + (index % 8); // spread of $16-23/hr for everyone else
    await prisma.user.update({ where: { id: user.id }, data: { hourlyRate: rate } });
    console.log(`  ${user.email} -> $${rate}/hr`);
    index++;
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
