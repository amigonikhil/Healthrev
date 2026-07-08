export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted hover:bg-border/50"
      >
        Sign out
      </button>
    </form>
  );
}
