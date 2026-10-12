import 'dotenv/config';
import { db } from './src/server/db';
import { createReservation } from './src/server/services/reservation-service';
import { approveReservation } from './src/server/services/staff-service';
import { scheduleMaintenance, endMaintenance } from './src/server/services/maintenance-service';
import { Role } from '@prisma/client';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  const user = { id: 101, name: 'User Demo', email: 'pengguna@students.undip.ac.id', role: Role.PENGGUNA };
  const officer = { id: 301, name: 'Officer', email: 'sri.wahyuni@undip.ac.id', role: Role.PETUGAS };

  let consistentCount = 0;
  const TOTAL_TESTS = 20;
  
  // Choose a date 10 days from today to avoid "Reservasi hanya bisa diajukan hingga 30 hari"
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 10);
  const dateStr = targetDate.toISOString().split('T')[0];

  for (let i = 1; i <= TOTAL_TESTS; i++) {
    process.stdout.write(`Test ${i}/${TOTAL_TESTS}... `);

    // Create a fresh reservation
    const res = await createReservation(user, {
      facilityId: '3',
      date: dateStr,
      start: '08:00',
      end: '10:00',
      purpose: `Test Race Condition Maintenance ${i}`
    });

    if (!res.ok) {
      console.log(`Failed to create reservation: ${JSON.stringify(res.errors)}`);
      continue;
    }
    const resId = res.id;

    // Run approve and maintenance EXACTLY at the same time
    const [resApprove, resMaint] = await Promise.allSettled([
      approveReservation(officer, resId),
      scheduleMaintenance(officer, {
        facilityId: 3,
        startDate: dateStr,
        endDate: dateStr,
        reason: `Maintenance urgent test ${i}`
      })
    ]);

    // Fetch final reservation state
    const finalRes = await db.reservation.findUnique({ where: { id: resId } });
    if (!finalRes) {
      console.log('Error: Reservation disappeared!');
      continue;
    }

    const isApproveSuccess = resApprove.status === 'fulfilled' && resApprove.value.ok;
    const isMaintSuccess = resMaint.status === 'fulfilled' && (resMaint.value as any).ok;

    // Clean up maintenance if it succeeded to reset the facility state for the next loop
    if (isMaintSuccess && (resMaint.value as any).maintenanceId) {
       await endMaintenance(officer, (resMaint.value as any).maintenanceId);
    }

    // Consistency check
    // If it's APPROVED: Maintenance must have failed or completed before/after but NOT touched it?
    // Wait, if maintenance succeeded, it MUST be CANCELLED or REJECTED.
    // If it's APPROVED, maintenance MUST have failed!
    let isConsistent = false;

    if (finalRes.status === 'APPROVED') {
       isConsistent = isApproveSuccess && !isMaintSuccess;
    } else if (finalRes.status === 'REJECTED') {
       isConsistent = isMaintSuccess && !isApproveSuccess;
    } else if (finalRes.status === 'CANCELLED') {
       // It means Approve succeeded FIRST, and then Maintenance canceled it.
       isConsistent = isMaintSuccess && isApproveSuccess;
    }

    if (isConsistent) {
      consistentCount++;
      console.log(`Consistent! Final Status: ${finalRes.status}. (Approve: ${isApproveSuccess}, Maint: ${isMaintSuccess})`);
    } else {
      console.log(`INCONSISTENT! Final Status: ${finalRes.status}`);
      console.log('Approve:', resApprove);
      console.log('Maint:', resMaint);
    }
    
    // Give a little breather
    await delay(50);
  }

  console.log(`\n\n--- RESULTS ---`);
  console.log(`Consistent interactions: ${consistentCount}/${TOTAL_TESTS}`);
}

runTests().catch(console.error).finally(() => process.exit(0));
