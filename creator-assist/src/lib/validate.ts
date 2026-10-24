// Indian ID formats. Light checks only: catch typos, don't reject edge cases.
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const UDYAM_RE = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_RE = /^[A-Za-z0-9.\-_]{2,}@[A-Za-z]{2,}$/;
export const ACCT_RE = /^[0-9]{9,18}$/;
export const TAN_RE = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BANKS: Record<string, string> = {
  HDFC: "HDFC Bank", ICIC: "ICICI Bank", SBIN: "State Bank of India", UTIB: "Axis Bank", KKBK: "Kotak Mahindra Bank",
  YESB: "Yes Bank", IDFB: "IDFC FIRST Bank", INDB: "IndusInd Bank", PUNB: "Punjab National Bank", BARB: "Bank of Baroda",
  CNRB: "Canara Bank", UBIN: "Union Bank of India", FDRL: "Federal Bank", AUBL: "AU Small Finance Bank", RATN: "RBL Bank",
  IBKL: "IDBI Bank", BKID: "Bank of India", IOBA: "Indian Overseas Bank", CBIN: "Central Bank of India", IDIB: "Indian Bank",
};
export const bankFromIfsc = (ifsc: string) => BANKS[ifsc.slice(0, 4).toUpperCase()] ?? ifsc.slice(0, 4).toUpperCase();

export const up = (v: FormDataEntryValue | null) => String(v ?? "").trim().toUpperCase();
export const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();
