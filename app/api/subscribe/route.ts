import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

// Helper to create admin client safely (only when called)
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing Supabase env:", {
      hasUrl: !!url,
      hasKey: !!key,
    });
    throw new Error("Supabase admin env vars not set");
  }

  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subscription, userId } = body as {
      subscription: PushSubscriptionJSON;
      userId: string;
    };

    if (!subscription || !subscription.endpoint || !userId) {
      return NextResponse.json(
        { error: "Invalid subscription payload" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        { onConflict: "endpoint" }
      );

    if (error) {
      console.error("DB error saving subscription:", error);
      return NextResponse.json(
        { error: "Failed to save subscription" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("subscribe route error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

