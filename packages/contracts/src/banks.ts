/**
 * Banks and wallets players commonly use in Nigeria, for the payout-details form. Codes follow
 * the widely used CBN/NIBSS-style codes (as listed by Paystack), so an account-name lookup can
 * be added later without remapping. Staff still check the name with their own bank before paying.
 */
export const NIGERIAN_BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '063', name: 'Access Bank (Diamond)' },
  { code: '565', name: 'Carbon' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '51318', name: 'FairMoney Microfinance Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank (FCMB)' },
  { code: '00103', name: 'Globus Bank' },
  { code: '058', name: 'Guaranty Trust Bank (GTBank)' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '50211', name: 'Kuda Bank' },
  { code: '303', name: 'Lotus Bank' },
  { code: '50515', name: 'Moniepoint Microfinance Bank' },
  { code: '999992', name: 'OPay' },
  { code: '107', name: 'Optimus Bank' },
  { code: '999991', name: 'PalmPay' },
  { code: '104', name: 'Parallex Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '105', name: 'PremiumTrust Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '125', name: 'Rubies Microfinance Bank' },
  { code: '106', name: 'Signature Bank' },
  { code: '51310', name: 'Sparkle Microfinance Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'SunTrust Bank' },
  { code: '302', name: 'TAJBank' },
  { code: '102', name: 'Titan Trust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa (UBA)' },
  { code: '215', name: 'Unity Bank' },
  { code: '566', name: 'VFD Microfinance Bank' },
  { code: '035', name: 'Wema Bank (ALAT)' },
  { code: '057', name: 'Zenith Bank' },
] as const;

export const bankName = (code: string) =>
  NIGERIAN_BANKS.find((bank) => bank.code === code)?.name ?? null;
