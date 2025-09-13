import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import crypto from "crypto";
import sharp from "sharp";

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
  // allow larger incoming files; we’ll compress below
  const MAX_INCOMING = 20 * 1024 * 1024; // 20MB
  if (file.size > MAX_INCOMING) {
    return NextResponse.json({ error: "Image too large (max 20MB)" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = (file.type || "").toLowerCase();

  // Normalise/convert:
  // - rotate() fixes iPhone EXIF orientation
  // - resize() caps dimensions (adjust 1600 to taste)
  // - convert HEIC/HEIF/etc. to JPEG
  // - compress to stay small
  let outBuf, outExt, outMime;

  const pipeline = sharp(buf, { limitInputPixels: 64e6 }).rotate().resize({
    width: 1600, // cap width; keeps aspect ratio
    withoutEnlargement: true,
  });

  if (mime.includes("heic") || mime.includes("heif") || mime.includes("heif-sequence") || mime.includes("quicktime")) {
    // iPhone live/HEIC → JPEG
    outBuf = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    outExt = "jpg";
    outMime = "image/jpeg";
  } else if (mime.includes("png")) {
    // keep PNG if it has transparency; otherwise JPEG is smaller
    // quick heuristic: try jpeg and keep smaller
    const jpg = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const png = await sharp(buf).png({ compressionLevel: 8 }).toBuffer();
    if (jpg.length <= png.length) {
      outBuf = jpg; outExt = "jpg"; outMime = "image/jpeg";
    } else {
      outBuf = png; outExt = "png"; outMime = "image/png";
    }
  } else if (mime.includes("webp")) {
    outBuf = await pipeline.webp({ quality: 82 }).toBuffer();
    outExt = "webp"; outMime = "image/webp";
  } else {
    // default to JPEG for jpg/jpeg or unknown image/*
    outBuf = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    outExt = "jpg"; outMime = "image/jpeg";
  }

  // final size guard (post-compression)
  const MAX_STORED = 3 * 1024 * 1024; // 3MB
  if (outBuf.length > MAX_STORED) {
    // try a second pass lowering quality
    const smaller = await sharp(outBuf).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    if (smaller.length > MAX_STORED) {
      return NextResponse.json({ error: "Image is too large after compression. Try a smaller photo." }, { status: 400 });
    }
    outBuf = smaller;
    outExt = "jpg";
    outMime = "image/jpeg";
  }

  const key = `${Date.now()}-${crypto.randomUUID()}.${outExt}`; // note: no 'wishes/' prefix
  const { error: upErr } = await supabaseAdmin.storage
    .from("wishes")
    .upload(key, outBuf, { contentType: outMime, upsert: false });

  if (upErr) return NextResponse.json({ error: "Upload failed" }, { status: 500 });

  photo_path = key; // store just the key
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
