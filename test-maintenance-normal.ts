import 'dotenv/config';
import { scheduleMaintenance } from './src/server/services/maintenance-service';
import { Role } from '@prisma/client';

async function main() {
  const officer = { id: 301, name: 'Officer', email: 'sri.wahyuni@undip.ac.id', role: Role.PETUGAS };

  const resMaint = await scheduleMaintenance(officer, {
      facilityId: 3,
      startDate: '2026-12-01',
      endDate: '2026-12-05',
      reason: 'Bocor lagi, perbaikan rutin biasa'
  });

  console.log('Maintenance normal run result:', resMaint);
}

main().catch(console.error).finally(() => process.exit(0));
