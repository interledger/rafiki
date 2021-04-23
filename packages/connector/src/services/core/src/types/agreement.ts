export interface Agreement {
  id: string;
  assetCode: string;
  assetScale: number;
  amount: string;
  start?: number;
  expiry?: number;
  interval?: number;
  cycles?: number;
  cap?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isAgreement (val: any): val is Agreement {
  // TODO
  return true
}
