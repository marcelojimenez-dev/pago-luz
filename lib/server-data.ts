import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLog,
  balances,
  billingPeriods,
  communities,
  communityMembers,
  meterReadings,
  meters,
  properties,
  propertyMembers,
  readingPhotos,
  statements,
  users,
} from "@/db/schema";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { allocateLargestRemainder } from "@/lib/allocation";

const COMMUNITY_ID = "community-rincon-zapata";
const PERIOD_ID = "period-2026-10";

type SeedMeter = {
  serial: string;
  label: string;
  kind: "parcel" | "well";
  previous: number;
  current: number;
};

const seedProperties: Array<{
  parcel: string;
  balance?: number;
  meters: SeedMeter[];
}> = [
  { parcel: "14", meters: [
    { serial: "10085956", label: "Parcela", kind: "parcel", previous: 1929, current: 2010 },
    { serial: "202207017", label: "Pozo", kind: "well", previous: 63, current: 65 },
  ] },
  { parcel: "16", meters: [{ serial: "1915445", label: "Parcela", kind: "parcel", previous: 30, current: 30 }] },
  { parcel: "18", meters: [{ serial: "10085950", label: "Parcela", kind: "parcel", previous: 768, current: 804 }] },
  { parcel: "20", meters: [
    { serial: "202103291184", label: "Parcela", kind: "parcel", previous: 1064, current: 1112 },
    { serial: "202111280308", label: "Pozo", kind: "well", previous: 39, current: 41 },
  ] },
  { parcel: "24", balance: -19309, meters: [{ serial: "P24-DEMO", label: "Parcela", kind: "parcel", previous: 2822, current: 2822 }] },
  { parcel: "26", meters: [{ serial: "10085947", label: "Parcela", kind: "parcel", previous: 58, current: 58 }] },
  { parcel: "30", meters: [{ serial: "10085954", label: "Parcela", kind: "parcel", previous: 1246, current: 1466 }] },
  { parcel: "32", meters: [{ serial: "10085951", label: "Parcela", kind: "parcel", previous: 2, current: 2 }] },
  { parcel: "33", meters: [{ serial: "10085955", label: "Parcela", kind: "parcel", previous: 11958, current: 12402 }] },
  { parcel: "34", meters: [
    { serial: "10052735", label: "Parcela", kind: "parcel", previous: 958, current: 1106 },
    { serial: "12256858", label: "Pozo", kind: "well", previous: 3533, current: 3550 },
  ] },
  { parcel: "35", meters: [
    { serial: "10085957", label: "Parcela", kind: "parcel", previous: 6029, current: 6119 },
    { serial: "6744338", label: "Pozo", kind: "well", previous: 3338, current: 3339 },
  ] },
  { parcel: "36", meters: [{ serial: "2069062", label: "Parcela", kind: "parcel", previous: 0, current: 0 }] },
  { parcel: "43 A", meters: [{ serial: "10085948", label: "Parcela", kind: "parcel", previous: 3056, current: 3425 }] },
  { parcel: "43 B", meters: [{ serial: "10085962", label: "Parcela", kind: "parcel", previous: 5091, current: 5262 }] },
  { parcel: "48", meters: [{ serial: "1205576", label: "Parcela", kind: "parcel", previous: 7, current: 7 }] },
  { parcel: "57", meters: [{ serial: "10085963", label: "Parcela", kind: "parcel", previous: 5535, current: 5780 }] },
  { parcel: "58", meters: [{ serial: "P58-DEMO", label: "Parcela", kind: "parcel", previous: 923, current: 1031 }] },
  { parcel: "59", meters: [{ serial: "24691326", label: "Parcela", kind: "parcel", previous: 675, current: 678 }] },
  { parcel: "66", meters: [{ serial: "P66-DEMO", label: "Parcela", kind: "parcel", previous: 2388, current: 2552 }] },
  { parcel: "69", meters: [{ serial: "20907", label: "Parcela", kind: "parcel", previous: 553, current: 609 }] },
  { parcel: "s/n", meters: [{ serial: "202207017061", label: "Parcela", kind: "parcel", previous: 178, current: 178 }] },
  { parcel: "1", meters: [{ serial: "10085946", label: "Parcela", kind: "parcel", previous: 1137, current: 1236 }] },
];

function now() {
  return new Date().toISOString();
}

export async function ensureBootstrap(user: ChatGPTUser) {
  const db = getDb();
  await db.insert(users).values({
    id: user.userId,
    email: user.email,
    displayName: user.displayName,
    createdAt: now(),
  }).onConflictDoUpdate({
    target: users.id,
    set: { email: user.email, displayName: user.displayName },
  });

  const [community] = await db.select().from(communities).limit(1);
  if (community) {
    const [membership] = await db.select().from(communityMembers).where(
      and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, user.userId)),
    ).limit(1);
    if (!membership) {
      await db.insert(communityMembers).values({
        id: crypto.randomUUID(),
        communityId: community.id,
        userId: user.userId,
        role: "resident",
        createdAt: now(),
      });
    }
    return community.id;
  }

  const createdAt = now();
  await db.insert(communities).values({
    id: COMMUNITY_ID,
    name: "Comunidad Parque Ecológico Rincón de Zapata",
    utilityClientNumber: "2161874",
    createdAt,
  });
  await db.insert(communityMembers).values({
    id: crypto.randomUUID(),
    communityId: COMMUNITY_ID,
    userId: user.userId,
    role: "admin",
    createdAt,
  });
  await db.insert(billingPeriods).values({
    id: PERIOD_ID,
    communityId: COMMUNITY_ID,
    name: "Octubre 2026",
    startDate: "2026-09-19",
    endDate: "2026-10-15",
    dueDate: "2026-11-11",
    invoiceNumber: "26760634",
    status: "open",
    utilityTotal: 1058100,
    readingServiceTotal: 25000,
    energyPool: 275607,
    peakPool: 345763,
    maintenanceFundPerProperty: 3000,
    masterKwh: 3900,
    createdAt,
  });

  for (const [propertyIndex, seed] of seedProperties.entries()) {
    const propertyId = `property-${String(propertyIndex + 1).padStart(2, "0")}`;
    await db.insert(properties).values({
      id: propertyId,
      communityId: COMMUNITY_ID,
      parcelNumber: seed.parcel,
      ownerLabel: `Propietario parcela ${seed.parcel}`,
      active: true,
      createdAt,
    });
    if (propertyIndex === 0) {
      await db.insert(propertyMembers).values({
        id: crypto.randomUUID(),
        propertyId,
        userId: user.userId,
        createdAt,
      });
    }
    for (const [meterIndex, meter] of seed.meters.entries()) {
      const meterId = `meter-${String(propertyIndex + 1).padStart(2, "0")}-${meterIndex + 1}`;
      await db.insert(meters).values({
        id: meterId,
        communityId: COMMUNITY_ID,
        propertyId,
        serialNumber: meter.serial,
        label: meter.label,
        kind: meter.kind,
        active: true,
        createdAt,
      });
      await db.insert(meterReadings).values({
        id: `reading-${meterId}`,
        meterId,
        periodId: PERIOD_ID,
        previousValue: meter.previous,
        currentValue: meter.current,
        consumptionKwh: meter.current - meter.previous,
        status: "approved",
        capturedAt: "2026-10-15T12:00:00.000Z",
        submittedBy: user.userId,
        approvedBy: user.userId,
        notes: "Lectura inicial importada desde la planilla de octubre 2026.",
        createdAt,
      });
    }
    if (seed.balance) {
      await db.insert(balances).values({
        id: `balance-${propertyId}`,
        propertyId,
        periodId: PERIOD_ID,
        amount: seed.balance,
        description: "Saldo a favor anterior",
        createdAt,
      });
    }
  }

  await db.insert(meters).values({
    id: "meter-master",
    communityId: COMMUNITY_ID,
    propertyId: null,
    serialNumber: "GENERAL-CGE-2161874",
    label: "Medidor general",
    kind: "master",
    active: true,
    createdAt,
  });
  await db.insert(meterReadings).values({
    id: "reading-meter-master",
    meterId: "meter-master",
    periodId: PERIOD_ID,
    previousValue: 0,
    currentValue: 3900,
    consumptionKwh: 3900,
    status: "approved",
    capturedAt: "2026-10-15T12:00:00.000Z",
    submittedBy: user.userId,
    approvedBy: user.userId,
    notes: "Consumo general inferido para conciliación inicial.",
    createdAt,
  });
  await calculatePeriod(PERIOD_ID, user.userId);
  return COMMUNITY_ID;
}

export async function getMembership(userId: string, communityId = COMMUNITY_ID) {
  const db = getDb();
  const [membership] = await db.select().from(communityMembers).where(
    and(eq(communityMembers.userId, userId), eq(communityMembers.communityId, communityId)),
  ).limit(1);
  return membership ?? null;
}

export async function calculatePeriod(periodId: string, userId: string) {
  const db = getDb();
  const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.id, periodId)).limit(1);
  if (!period) throw new Error("Período no encontrado");

  const periodProperties = await db.select().from(properties).where(
    and(eq(properties.communityId, period.communityId), eq(properties.active, true)),
  ).orderBy(asc(properties.parcelNumber));
  const propertyIds = periodProperties.map((item) => item.id);
  const periodMeters = propertyIds.length
    ? await db.select().from(meters).where(inArray(meters.propertyId, propertyIds))
    : [];
  const meterIds = periodMeters.map((item) => item.id);
  const readings = meterIds.length
    ? await db.select().from(meterReadings).where(
        and(eq(meterReadings.periodId, periodId), inArray(meterReadings.meterId, meterIds)),
      )
    : [];
  const periodBalances = propertyIds.length
    ? await db.select().from(balances).where(
        and(eq(balances.periodId, periodId), inArray(balances.propertyId, propertyIds)),
      )
    : [];

  const consumptionByProperty = new Map<string, number>();
  const meterProperty = new Map(periodMeters.map((meter) => [meter.id, meter.propertyId!]));
  for (const reading of readings) {
    const propertyId = meterProperty.get(reading.meterId);
    if (propertyId) {
      consumptionByProperty.set(
        propertyId,
        (consumptionByProperty.get(propertyId) ?? 0) + reading.consumptionKwh,
      );
    }
  }
  const weights = periodProperties.map((property) => ({
    id: property.id,
    weight: consumptionByProperty.get(property.id) ?? 0,
  }));
  const equalWeights = periodProperties.map((property) => ({ id: property.id, weight: 1 }));
  const energyAllocation = allocateLargestRemainder(period.energyPool, weights);
  const peakAllocation = allocateLargestRemainder(period.peakPool, weights);
  const sharedPool = period.utilityTotal + period.readingServiceTotal - period.energyPool - period.peakPool;
  const sharedAllocation = allocateLargestRemainder(sharedPool, equalWeights);
  const balanceByProperty = new Map(periodBalances.map((item) => [item.propertyId, item.amount]));

  await db.delete(statements).where(eq(statements.periodId, periodId));
  const calculatedAt = now();
  for (const property of periodProperties) {
    const energyCharge = energyAllocation.get(property.id) ?? 0;
    const peakCharge = peakAllocation.get(property.id) ?? 0;
    const sharedCharge = sharedAllocation.get(property.id) ?? 0;
    const previousBalance = balanceByProperty.get(property.id) ?? 0;
    const total = energyCharge + peakCharge + sharedCharge + period.maintenanceFundPerProperty + previousBalance;
    await db.insert(statements).values({
      id: crypto.randomUUID(),
      periodId,
      propertyId: property.id,
      consumptionKwh: consumptionByProperty.get(property.id) ?? 0,
      energyCharge,
      peakCharge,
      sharedCharge,
      maintenanceFund: period.maintenanceFundPerProperty,
      previousBalance,
      roundingAdjustment: 0,
      total,
      status: period.status === "published" || period.status === "closed" ? "published" : "draft",
      calculatedAt,
    });
  }
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    communityId: period.communityId,
    userId,
    action: "period.calculated",
    entityType: "billing_period",
    entityId: periodId,
    payload: JSON.stringify({ propertyCount: periodProperties.length, sharedPool }),
    createdAt: calculatedAt,
  });
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getDashboardData(userId: string) {
  const db = getDb();
  const membership = await getMembership(userId);
  if (!membership) throw new Error("El usuario no pertenece a la comunidad");
  const [community] = await db.select().from(communities).where(eq(communities.id, membership.communityId)).limit(1);
  const [period] = await db.select().from(billingPeriods).where(eq(billingPeriods.communityId, membership.communityId)).orderBy(sql`${billingPeriods.endDate} desc`).limit(1);
  if (!period) throw new Error("No existe un período de cobro");

  let visibleProperties = await db.select().from(properties).where(
    and(eq(properties.communityId, membership.communityId), eq(properties.active, true)),
  ).orderBy(asc(properties.parcelNumber));
  if (membership.role === "resident") {
    const links = await db.select().from(propertyMembers).where(eq(propertyMembers.userId, userId));
    const allowed = new Set(links.map((item) => item.propertyId));
    visibleProperties = visibleProperties.filter((item) => allowed.has(item.id));
  }
  const propertyIds = visibleProperties.map((item) => item.id);
  const visibleStatements = propertyIds.length
    ? await db.select().from(statements).where(
        and(eq(statements.periodId, period.id), inArray(statements.propertyId, propertyIds)),
      )
    : [];
  const visibleMeters = propertyIds.length
    ? await db.select().from(meters).where(inArray(meters.propertyId, propertyIds))
    : [];
  const meterIds = visibleMeters.map((item) => item.id);
  const visibleReadings = meterIds.length
    ? await db.select().from(meterReadings).where(
        and(eq(meterReadings.periodId, period.id), inArray(meterReadings.meterId, meterIds)),
      )
    : [];
  const readingIds = visibleReadings.map((item) => item.id);
  const photos = readingIds.length
    ? await db.select().from(readingPhotos).where(inArray(readingPhotos.readingId, readingIds))
    : [];

  const statementByProperty = new Map(visibleStatements.map((item) => [item.propertyId, item]));
  const metersByProperty = new Map<string, typeof visibleMeters>();
  for (const meter of visibleMeters) {
    if (!meter.propertyId) continue;
    metersByProperty.set(meter.propertyId, [...(metersByProperty.get(meter.propertyId) ?? []), meter]);
  }
  const readingByMeter = new Map(visibleReadings.map((item) => [item.meterId, item]));
  const photoByReading = new Map(photos.map((item) => [item.readingId, item]));

  const rows = visibleProperties.map((property) => {
    const statement = statementByProperty.get(property.id);
    return {
      id: property.id,
      parcelNumber: property.parcelNumber,
      ownerLabel: property.ownerLabel,
      consumptionKwh: statement?.consumptionKwh ?? 0,
      energyCharge: statement?.energyCharge ?? 0,
      peakCharge: statement?.peakCharge ?? 0,
      sharedCharge: statement?.sharedCharge ?? 0,
      maintenanceFund: statement?.maintenanceFund ?? period.maintenanceFundPerProperty,
      previousBalance: statement?.previousBalance ?? 0,
      total: statement?.total ?? 0,
      meters: (metersByProperty.get(property.id) ?? []).map((meter) => {
        const reading = readingByMeter.get(meter.id);
        const photo = reading ? photoByReading.get(reading.id) : null;
        return {
          id: meter.id,
          serialNumber: meter.serialNumber,
          label: meter.label,
          kind: meter.kind,
          previousValue: reading?.previousValue ?? 0,
          currentValue: reading?.currentValue ?? 0,
          consumptionKwh: reading?.consumptionKwh ?? 0,
          status: reading?.status ?? "missing",
          photoId: photo?.id ?? null,
        };
      }),
    };
  });

  const measuredKwh = rows.reduce((sum, row) => sum + row.consumptionKwh, 0);
  const differenceKwh = period.masterKwh - measuredKwh;
  const totalToCollect = visibleStatements.reduce((sum, item) => sum + item.total, 0);
  const allStatementTotals = await db.select({ total: sql<number>`sum(${statements.total})` }).from(statements).where(eq(statements.periodId, period.id));
  const allReadingCount = await db.select({ count: sql<number>`count(*)` }).from(meterReadings).where(eq(meterReadings.periodId, period.id));
  const allPhotoCount = await db.select({ count: sql<number>`count(*)` }).from(readingPhotos)
    .innerJoin(meterReadings, eq(readingPhotos.readingId, meterReadings.id))
    .where(eq(meterReadings.periodId, period.id));

  let admin: null | {
    properties: Array<{ id: string; parcelNumber: string; ownerLabel: string; active: boolean; meterCount: number }>;
    members: Array<{ id: string; userId: string; displayName: string; email: string; role: string }>;
  } = null;
  if (membership.role === "admin") {
    const allProperties = await db.select().from(properties).where(eq(properties.communityId, membership.communityId)).orderBy(asc(properties.parcelNumber));
    const allPropertyMeters = await db.select().from(meters).where(eq(meters.communityId, membership.communityId));
    const meterCountByProperty = new Map<string, number>();
    for (const meter of allPropertyMeters) {
      if (meter.propertyId) meterCountByProperty.set(meter.propertyId, (meterCountByProperty.get(meter.propertyId) ?? 0) + 1);
    }
    const memberRows = await db.select({
      id: communityMembers.id,
      userId: communityMembers.userId,
      displayName: users.displayName,
      email: users.email,
      role: communityMembers.role,
    }).from(communityMembers)
      .innerJoin(users, eq(communityMembers.userId, users.id))
      .where(eq(communityMembers.communityId, membership.communityId));
    admin = {
      properties: allProperties.map((property) => ({
        id: property.id,
        parcelNumber: property.parcelNumber,
        ownerLabel: property.ownerLabel,
        active: property.active,
        meterCount: meterCountByProperty.get(property.id) ?? 0,
      })),
      members: memberRows,
    };
  }

  return {
    community: { id: community.id, name: community.name, utilityClientNumber: community.utilityClientNumber },
    membership: { role: membership.role },
    period: {
      id: period.id,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      dueDate: period.dueDate,
      invoiceNumber: period.invoiceNumber,
      status: period.status,
      utilityTotal: period.utilityTotal,
      readingServiceTotal: period.readingServiceTotal,
      energyPool: period.energyPool,
      peakPool: period.peakPool,
      maintenanceFundPerProperty: period.maintenanceFundPerProperty,
      masterKwh: period.masterKwh,
    },
    summary: {
      measuredKwh,
      differenceKwh,
      differencePercentage: period.masterKwh ? (differenceKwh / period.masterKwh) * 100 : 0,
      totalToCollect: Number(allStatementTotals[0]?.total ?? totalToCollect),
      readingCount: Number(allReadingCount[0]?.count ?? 0),
      photoCount: Number(allPhotoCount[0]?.count ?? 0),
    },
    rows,
    admin,
  };
}

export async function canAccessProperty(userId: string, propertyId: string) {
  const membership = await getMembership(userId);
  if (!membership) return false;
  if (["admin", "reader", "treasurer", "auditor"].includes(membership.role)) return true;
  const db = getDb();
  const [link] = await db.select().from(propertyMembers).where(
    and(eq(propertyMembers.userId, userId), eq(propertyMembers.propertyId, propertyId)),
  ).limit(1);
  return Boolean(link);
}
