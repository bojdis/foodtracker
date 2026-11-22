export const FAT_MILESTONES_KG = [0.5, 1, 2.5, 5, 10];

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function formatNumCs(val: number, decimals = 1): string {
  return val
    .toFixed(decimals)
    .replace(".", ",")
    .replace(/,0+$/, "");
}

export function formatSignedNumCs(val: number, unit: string, decimals = 1): string {
  const absStr = formatNumCs(Math.abs(val), decimals);
  if (val < 0) return `−${absStr} ${unit}`;
  if (val > 0) return `+${absStr} ${unit}`;
  return `0 ${unit}`;
}

export function formatShortDateCs(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${Number(parts[2])}. ${Number(parts[1])}.`;
}

export function daysBetweenUtc(startDateStr: string, endDateStr: string): number {
  const [sy, sm, sd] = startDateStr.split("-").map(Number);
  const [ey, em, ed] = endDateStr.split("-").map(Number);
  const t1 = Date.UTC(sy, (sm || 1) - 1, sd || 1);
  const t2 = Date.UTC(ey, (em || 1) - 1, ed || 1);
  return Math.round((t2 - t1) / 86_400_000);
}
