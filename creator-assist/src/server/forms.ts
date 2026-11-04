import "server-only";
import { redirect } from "next/navigation";
import { ApiError } from "./context";

/**
 * For server actions backing web forms: a service's expected failure becomes the form's
 * error message. Anything else (including Next's redirect signal) is rethrown.
 */
export function formError(e: unknown): { error: string } {
  if (e instanceof ApiError) return { error: e.message };
  throw e;
}

/** For pages: an expected failure (e.g. a deal that doesn't exist or isn't yours) redirects, as the pages always have. */
export async function orRedirect<T>(p: Promise<T>, to: string): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError) redirect(to);
    throw e;
  }
}
