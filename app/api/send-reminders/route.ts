// @ts-nocheck

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Node runtime for web-push
export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webpush.setVapidDetails(
  "mailto:your-email@example.com", // change to your email if you want
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
  process.env.VAPID_PRIVATE_KEY as string
);

export async function POST() {
  try {
    const now = new Date().toISOString();

    // 1) Find due reminders (reminder_at <= now AND not done)
    const { data: dueNotes, error: notesError } = await supabaseAdmin
      .from("notes")
      .select("id, user_id, content, reminder_at, reminder_done")
      .lte("reminder_at", now)
      .eq("reminder_done", false);

    if (notesError) {
      console.error("Notes query error", notesError);
      return NextResponse.json({ error: "Notes query error" }, { status: 500 });
    }

    if (!dueNotes || dueNotes.length === 0) {
      return NextResponse.json({ ok: true, message: "No due reminders" });
    }

    const userIds = Array.from(new Set(dueNotes.map((n: any) => n.user_id)));

    // 2) Get push subscriptions for those users
    const { data: subs, error: subsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .in("user_id", userIds);

    if (subsError) {
      console.error("Subscriptions query error", subsError);
      return NextResponse.json(
        { error: "Subscriptions query error" },
        { status: 500 }
      );
    }

    // Group subscriptions by user_id
    const subsByUser: Record<string, any[]> = {};
    (subs || []).forEach((s: any) => {
      if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
      subsByUser[s.user_id].push(s);
    });

    // 3) Send push notifications
    const sendPromises: Promise<any>[] = [];
    const noteIdsToMarkDone: string[] = [];

    for (const note of dueNotes as any[]) {
      const userSubs = subsByUser[note.user_id] || [];
      if (userSubs.length === 0) continue;

      const title = "Memomate reminder";
      const body =
        note.content.length > 80
          ? note.content.slice(0, 77) + "…"
          : note.content;

      const payload = JSON.stringify({
        title,
        body,
        data: { url: "/" }, // where to open when tapped
      });

      for (const sub of userSubs) {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        const p = webpush
          .sendNotification(pushSub as any, payload)
          .catch(async (err) => {
            console.error("Push error", err.statusCode);
            // Remove invalid subscription
            if (err.statusCode === 410 || err.statusCode === 404) {
              await supabaseAdmin
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", sub.endpoint);
            }
          });

        sendPromises.push(p);
      }

      noteIdsToMarkDone.push(note.id);
    }

    await Promise.all(sendPromises);

    // 4) Mark reminders as done so we don't spam repeatedly
    if (noteIdsToMarkDone.length > 0) {
      await supabaseAdmin
        .from("notes")
        .update({ reminder_done: true })
        .in("id", noteIdsToMarkDone);
    }

    return NextResponse.json({
      ok: true,
      sentFor: noteIdsToMarkDone.length,
    });
  } catch (e) {
    console.error("send-reminders error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
