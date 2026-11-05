// iOS universal links: which web paths open in the Creator Assist app instead of Safari.
// Needs APPLE_TEAM_ID (Apple Developer account → Membership). The brand signing page (/s/…),
// the admin and the API always stay on the web.
export const dynamic = "force-dynamic";

const APP_PATHS = ["/home", "/deals", "/deals/*", "/brands", "/tax", "/tax/*", "/settings", "/settings/*"];

export function GET() {
  const team = process.env.APPLE_TEAM_ID?.trim();
  if (!team) return new Response("Not configured", { status: 404 });
  const appID = `${team}.${process.env.APP_BUNDLE_ID?.trim() || "in.creatorassist.app"}`;
  return Response.json(
    {
      applinks: {
        details: [{
          appIDs: [appID],
          components: [
            { "/": "/s/*", exclude: true, comment: "Brand signing stays on the web" },
            ...APP_PATHS.map((p) => ({ "/": p })),
          ],
        }],
      },
      webcredentials: { apps: [appID] },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
