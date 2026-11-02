export type AllocationInput = { id: string; weight: number };

export function allocateLargestRemainder(
  total: number,
  inputs: AllocationInput[],
): Map<string, number> {
  const result = new Map<string, number>();
  const weightTotal = inputs.reduce((sum, item) => sum + item.weight, 0);
  if (inputs.length === 0) return result;
  if (weightTotal <= 0) {
    return allocateLargestRemainder(
      total,
      inputs.map((item) => ({ ...item, weight: 1 })),
    );
  }

  const provisional = inputs.map((item) => {
    const exact = (total * item.weight) / weightTotal;
    const base = Math.floor(exact);
    return { ...item, base, remainder: exact - base };
  });
  let assigned = provisional.reduce((sum, item) => sum + item.base, 0);
  provisional.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const item of provisional) {
    const extra = assigned < total ? 1 : 0;
    result.set(item.id, item.base + extra);
    assigned += extra;
  }
  return result;
}
