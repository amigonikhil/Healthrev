// Prints the sample-data payload for a fake profile (used to test seed_sample locally).
import { buildSamplePayload } from "../src/lib/seed";
import type { Profile } from "../src/lib/types";

const userId = process.argv[2] ?? "00000000-0000-0000-0000-000000000001";
const today = process.argv[3] ?? "2026-10-25";
const profile = {
  id: userId, name: "Ravi Teja K", state: "Telangana", state_code: "36", gstin: "36ABCDE1234F1Z5",
  udyam_no: "UDYAM-TS-02-0012345", invoice_prefix: "RTK", reminder_ladder: [0, 7, 15, 30], language: "en",
  files_with: "creator_assist", city: "Hyderabad",
} as unknown as Profile;
const payload = buildSamplePayload({
  userId, profile, pan: "ABCDE1234F", today, maxSeqByFy: {},
  tax: { gst_rate: 18, tds_rate: 10, rbi_bank_rate: 5.5, msme_multiple: 3, late_interest_rate: 10, late_interest_period: "week", notice_legal_fee_paise: 500000 },
});
process.stdout.write(JSON.stringify(payload));
