export function formatMoneyMinor(minor: number | null | undefined, currency = "USD"): string {
  if (minor == null) {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function exposureLabel(lowMinor: number | null, highMinor: number | null, currency: string): string {
  if (lowMinor == null || highMinor == null) {
    return "-";
  }

  const low = formatMoneyMinor(lowMinor, currency);
  const high = formatMoneyMinor(highMinor, currency);
  return `${low}-${high}/hour`;
}
