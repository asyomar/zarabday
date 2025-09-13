import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";

export const runtime = "nodejs"; // needed for Buffer
const ALLOWED_AVATARS = new Set(["slyv1", "slyv2", "slyv3", "slyv4", "slyv5", "slyv6"]);

function getClientIp(req) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
function truncateIp(ip) {
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 4).join(":") + ":*";
  }
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return "unknown";
  return `${m[1]}.${m[2]}.${m[3]}.xxx`;
}


function publicUrlFor(path) {
  // path like "wishes/1700000000000-uuid.jpg"
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/wishes/${path}`;
}

function hashIp(ip) {
  const salt = process.env.HASH_SALT || "salt";
  return crypto.createHash("sha256").update(ip + salt).digest("hex");
}

function avatarUrlFor(id) {
  if (!ALLOWED_AVATARS.has(id)) return null;
  // if you use slyv* names, change the path format accordingly:
  return `/${id}.png`; // e.g., /avatars/a1.png or /avatars/slyv1.png
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("wishes")
      .select("id, name, wish, photo_path, avatar_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("DB read error:", error);
      return NextResponse.json({ error: "DB read error" }, { status: 500 });
    }

    const items = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      wish: row.wish,
      created_at: row.created_at,
      avatar_url: avatarUrlFor(row.avatar_id || ""),
      photo_url: row.photo_path ? publicUrlFor(row.photo_path) : null,
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error("wishes route error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
export async function POST(request) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    // ---- parse form ----
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const wish = String(form.get("wish") || "").trim();
    const file = form.get("photo"); // optional
    const avatar = String(form.get("avatar") || "").trim(); // NEW

    // ---- validation ----
    if (name.length < 1 || name.length > 60) {
      return NextResponse.json({ error: "Invalid name length" }, { status: 400 });
    }
    if (wish.length < 5 || wish.length > 1200) {
      return NextResponse.json({ error: "Invalid wish length" }, { status: 400 });
    }
    if (!ALLOWED_AVATARS.has(avatar)) {
      return NextResponse.json({ error: "Please pick a valid avatar." }, { status: 400 });
    }

    // ---- IP + basic rate limit ----
    const ip = getClientIp(request);
    const ipTrunc = truncateIp(ip);
    const since1m = new Date(Date.now() - 60 * 1000).toISOString();
    const since1d = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // minute window
const { data: minuteRows, error: mErr } = await supabaseAdmin
  .from("wishes")
  .select("id")
  .eq("ip_plain", ip)
  .gte("created_at", since1m);

if (mErr) {
  console.error("Minute query error:", mErr);
  return NextResponse.json({ error: `DB error (minute): ${mErr.message}` }, { status: 500 });
}

// day window
const { data: dayRows, error: dErr } = await supabaseAdmin
  .from("wishes")
  .select("id")
  .eq("ip_plain", ip)
  .gte("created_at", since1d);

if (dErr) {
  console.error("Day query error:", dErr);
  return NextResponse.json({ error: `DB error (day): ${dErr.message}` }, { status: 500 });
}


    const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 3);
    const PER_DAY = Number(process.env.RATE_LIMIT_PER_DAY || 25);

    if ((minuteRows?.length || 0) >= PER_MIN) {
      return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
    }
    if ((dayRows?.length || 0) >= PER_DAY) {
      return NextResponse.json({ error: "Daily limit reached." }, { status: 429 });
    }

    // ---- optional image upload ----
    let photo_path = null;
    if (file && file.size > 0) {
      if (!file.type?.startsWith("image/")) {
        return NextResponse.json({ error: "Only images allowed" }, { status: 400 });
      }
      if (file.size > 3 * 1024 * 1024) {
        return NextResponse.json({ error: "Max 3MB image" }, { status: 400 });
      }

      const arrayBuf = await file.arrayBuffer();
      const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
      const key = `wishes/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabaseAdmin.storage
        .from("wishes")
        .upload(key, Buffer.from(arrayBuf), {
          contentType: file.type,
          upsert: false,
        });
      if (upErr) return NextResponse.json({ error: "Upload failed" }, { status: 500 });

      photo_path = key;
    }

    // ---- insert row ----
    const ua = request.headers.get("user-agent") || null;

    const { data: insertRow, error: insErr } = await supabaseAdmin
  .from("wishes")
  .insert({
    name,
    wish,
    photo_path,
    avatar_id: avatar,
    ip_plain: ip,
    ip_truncated: ipTrunc,
    ua,
  })
  .select("id")          // force PostgREST to return error details if any
  .single();             // fail if multiple, helps surface issues

if (insErr) {
  console.error("Insert error:", insErr);
  return NextResponse.json({ error: `Insert failed: ${insErr.message}` }, { status: 500 });
}


    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("wish route error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

}
