"use client";

import { useActionState } from "react";
import { submitLawyerNotice } from "@/app/actions/escalations";
import { ActionForm, SubmitButton } from "@/components/client";

export function NoticeForm({ dealId }: { dealId: string }) {
  const [state, action, actionPending] = useActionState(submitLawyerNotice.bind(null, dealId), undefined);
  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "contents" }}>
      <label className="tog"><span>I confirm the facts above are correct</span><input type="checkbox" name="confirm" required /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Sending…">Send to lawyer for review</SubmitButton>
    </ActionForm>
  );
}
