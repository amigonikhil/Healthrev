"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PASTED_DEAL_KEY, type PastedDeal } from "@/lib/pasted-deal";

const MAX_EDGE = 1568; // Claude reads screenshots best at this size or smaller

/** Shrinks a screenshot to a JPEG small enough to upload quickly. Falls back to the original file. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** "+ New deal": paste the brand's message (or a screenshot) to prefill the form, or fill it in by hand. */
export function NewDealButton({ label = "+ New deal" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const pick = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Add a screenshot (an image file)."); return; }
    setError("");
    setShot({ file, url: URL.createObjectURL(file) });
  };
  const close = () => { if (!busy) { setOpen(false); setError(""); } };

  const read = async () => {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      if (text.trim()) body.set("text", text.trim());
      if (shot) body.set("image", await shrink(shot.file), "screenshot.jpg");
      const res = await fetch("/api/deals/extract", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as { ok: true; deal: PastedDeal } | { ok: false; error: string } | null;
      if (!json?.ok) { setError(json?.error ?? "Something went wrong. Try again, or fill in the form yourself."); return; }
      // Hand the extracted fields (not the pasted message) to the form; it reads and removes them once.
      try { sessionStorage.setItem(PASTED_DEAL_KEY, JSON.stringify(json.deal)); } catch { /* private mode: form opens empty */ }
      setText("");
      setShot(null);
      setOpen(false);
      router.push("/deals/new?from=paste");
    } catch {
      setError("Couldn't reach Creator Assist. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="nd-title">
            <h2 id="nd-title">New deal</h2>
            <p className="sub">Paste the brand&apos;s message or email, or add a screenshot of the chat. We&apos;ll fill in the deal form for you to check.</p>
            <label className="f">Paste deal
              <textarea
                rows={6} value={text} maxLength={20000} autoFocus disabled={busy}
                placeholder={"Hi! We'd love 1 Reel + 3 Stories for our launch on the 15th. Budget ₹45k + GST, 50% advance, rest in 30 days…"}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => { const img = [...e.clipboardData.files].find((f) => f.type.startsWith("image/")); if (img) { e.preventDefault(); pick(img); } }}
              />
            </label>
            {shot ? (
              <div className="shot">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own file */}
                <img src={shot.url} alt="Your screenshot" />
                <button type="button" className="linkbtn" disabled={busy} onClick={() => setShot(null)}>Remove screenshot</button>
              </div>
            ) : (
              <button type="button" className="btn sec" disabled={busy} onClick={() => fileRef.current?.click()}>Add a screenshot</button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Screenshot of the deal" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
            {error && <p className="err" role="alert">{error}</p>}
            <button type="button" className="btn" disabled={busy || (!text.trim() && !shot)} aria-busy={busy} onClick={read}>
              {busy ? "Reading the deal…" : "Fill the deal form"}
            </button>
            <Link className="btn sec" href="/deals/new" onClick={() => setOpen(false)}>Fill it in myself</Link>
            <p className="sub">We send this to Claude, Anthropic&apos;s AI, to read the details. We don&apos;t save the message or screenshot, and nothing is added until you save the deal.</p>
          </div>
        </div>
      )}
    </>
  );
}
