import { EVALUATION_DATE } from "@/lib/types";

function utcMidnight(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return utc;
}

export function elapsedPurchaseDays(purchaseDate: string | null): number | null {
  if (!purchaseDate) return null;
  const evaluation = utcMidnight(EVALUATION_DATE);
  const purchase = utcMidnight(purchaseDate);
  if (evaluation === null || purchase === null) {
    throw new Error(`Cannot calculate elapsed days for ${purchaseDate}.`);
  }
  return Math.round((evaluation - purchase) / 86_400_000);
}

export function formatIsoDate(isoDate: string): string {
  const utc = utcMidnight(isoDate);
  if (utc === null) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(utc));
}
