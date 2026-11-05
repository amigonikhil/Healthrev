// Android App Links: lets https links open in the Creator Assist app without a chooser.
// Needs ANDROID_CERT_SHA256 (comma-separated SHA-256 fingerprints of the app signing keys:
// Play Console → App integrity, and the upload key from EAS credentials).
export const dynamic = "force-dynamic";

export function GET() {
  const prints = (process.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!prints.length) return new Response("Not configured", { status: 404 });
  return Response.json(
    [{
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: { namespace: "android_app", package_name: process.env.APP_BUNDLE_ID?.trim() || "in.creatorassist.app", sha256_cert_fingerprints: prints },
    }],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
