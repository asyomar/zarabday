"use client";
import { useEffect, useState } from "react";
import "./zara.css";

export default function WishesPage() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/wish", { cache: "no-store" });
        const raw = await res.text();
        let data = {};
        try { data = JSON.parse(raw); } catch {
          console.error("Non-JSON response:", raw);
          setErr("Server error. Try again later.");
          return;
        }
        if (!res.ok) {
          setErr(data.error || "Failed to load");
          return;
        }
        setItems(data.items || []);
      } catch (e) {
        console.error(e);
        setErr("Network error");
      }
    })();
  }, []);

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  if (err) return <div className="wishes-wrap"><p className="error">{err}</p></div>;
  if (!items) return <div className="wishes-wrap"><p className="loading">Loading wishes…</p></div>;
  if (items.length === 0) return <div className="wishes-wrap"><p>No wishes yet.</p></div>;

  return (
    <div className="wishes-wrap">
      <h2 className="title">Wishes for Zara</h2>

      <div className="accordion-list">
        {items.map((it) => (
          <details key={it.id} className="acc">
            <summary className="acc-summary">
              <div className="avatar">
                {it.avatar_url ? (
                  <img className="avatar-img" src={it.avatar_url} alt={`${it.name}'s avatar`} loading="lazy" />
                ) : (
                  <div className="avatar-fallback" aria-hidden="true">♡</div>
                )}
              </div>

              <div className="summary-text">
                <div className="name">{it.name}</div>
                <div className="date">{fmtDate(it.created_at)}</div>
              </div>

              <div className="chev" aria-hidden="true">▾</div>
            </summary>

            <div className="acc-panel">
              <p className="wish">{it.wish}</p>

              {/* show the actual uploaded photo inside the panel */}
              {it.photo_url && (
                <div className="panel-image">
                  <img className="panel-img" src={it.photo_url} alt={`${it.name}'s photo`} loading="lazy" />
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
