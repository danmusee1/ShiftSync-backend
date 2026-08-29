import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@coastaleats.example';
const ADMIN_PASSWORD = 'ChangeMe123!';

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'Coastal',
      lastName: 'Admin',
      role: Role.ADMIN,
      homeTimezone: 'America/Los_Angeles',
    },
    update: {},
  });

  console.log(`Seeded admin user: ${admin.email} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
