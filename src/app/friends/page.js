"use client";
import { useEffect, useMemo, useState } from "react";
import "./friends.css";

export default function Friends() {
  // ----- Intro / flow -----
  const [showIntro, setShowIntro] = useState(true);

  // ----- Quiz state -----
  const [quizAnswer, setQuizAnswer] = useState("");
  const [quizError, setQuizError] = useState("");
  const [quizPassed, setQuizPassed] = useState(false);

  // attempts & block persistence
  const [attempts, setAttempts] = useState(0);
  const [blocked, setBlocked] = useState(false);

  // ----- Form state -----
  const [name, setName] = useState("");
  const [wish, setWish] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const AVATARS = [
    { id: "slyv1", src: "/slyv1.png", label: "Avatar 1" },
    { id: "slyv2", src: "/slyv2.png", label: "Avatar 2" },
    { id: "slyv3", src: "/slyv3.png", label: "Avatar 3" },
    { id: "slyv4", src: "/slyv4.png", label: "Avatar 4" },
    { id: "slyv5", src: "/slyv5.png", label: "Avatar 5" },
    { id: "slyv6", src: "/slyv6.png", label: "Avatar 6" },
  ];

  const [avatarId, setAvatarId] = useState("");     // required
  const [avatarError, setAvatarError] = useState("");

  // ----- QUIZ BANK (edit correctIndex to match reality) -----
  const quizBank = useMemo(
    () => [
      {
        id: "poly",
        question: "Which poly is Zara in?",
        options: ["Nanyang Polytechnic", "Ngee Ann Polytechnic", "Republic Polytechnic"],
        correctIndex: 2,
      },
      {
        id: "cca",
        question: "What is Zara's CCA?",
        options: ["Capoeira", "Karate", "Ballet"],
        correctIndex: 0,
      },
      {
        id: "major",
        question: "What does Zara study?",
        options: ["Aerospace", "Hospitality", "Media Production and Design"],
        correctIndex: 2,
      },
    ],
    []
  );

  const [order, setOrder] = useState([]);
  const [pointer, setPointer] = useState(0);

  useEffect(() => {
    const idxs = quizBank.map((_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    setOrder(idxs);

    const storedBlocked = localStorage.getItem("zara_blocked") === "1";
    const storedPassed = localStorage.getItem("zara_passed") === "1";
    const storedAttempts = parseInt(localStorage.getItem("zara_attempts") || "0", 10);

    setBlocked(storedBlocked);
    setQuizPassed(!storedBlocked && storedPassed);
    setAttempts(storedAttempts);

    if (storedBlocked || storedPassed) setShowIntro(false);
  }, [quizBank.length]);

  const currentQuiz =
    order.length > 0 ? quizBank[order[pointer % order.length]] : quizBank[0];

  function handleCloseIntro() {
    setShowIntro(false);
  }

  function goNextQuiz() {
    setQuizAnswer("");
    setQuizError("");
    setPointer((p) => p + 1);
  }

  function handleQuizSubmit(e) {
    e.preventDefault();
    if (!currentQuiz) return;

    const chosenIdx = currentQuiz.options.findIndex((_, idx) => `opt${idx}` === quizAnswer);

    if (chosenIdx === currentQuiz.correctIndex) {
      setQuizPassed(true);
      setQuizError("");
      localStorage.setItem("zara_passed", "1");
    } else {
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      localStorage.setItem("zara_attempts", String(nextAttempts));

      if (nextAttempts >= 3) {
        setBlocked(true);
        localStorage.setItem("zara_blocked", "1");
        setQuizError("Too many wrong attempts. Access permanently blocked.");
      } else {
        setQuizError("Oops, that’s not it. Try another!");
        goNextQuiz();
      }
    }
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0] ?? null;
    setPhotoFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function handleFormSubmit(e) {
    e.preventDefault();

    if (!avatarId) {
      setAvatarError("Please pick an avatar.");
      return;
    }
    setAvatarError("");


    const form = new FormData();
    form.append("name", name);
    form.append("wish", wish);
    form.append("avatar", avatarId);
    if (photoFile) form.append("photo", photoFile);

    try {
      const res = await fetch("/api/wish", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      

      if (!res.ok) { alert(data.error || "Submission failed."); return; }

      alert("Thanks! Your wish has been captured 💌");
      setName("");
      setWish("");
      setPhotoFile(null);
      setPreviewUrl("");
      setAvatarId("");
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="friends-wrap">
      {/* Intro modal */}
      {showIntro && !blocked && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2 className="modal-title">✨ Purpose of This Page</h2>
            <p className="modal-text">
              Hello! This is a birthday gift to <strong>Zara</strong>. Since it’s her last year of poly,
              we are trying to create a space to eternalise memories and connections through your wishes.
              So please, treat this like a year book, insert your wishes for her and put in a picture that relates to yall.
            </p>
            <button className="btn primary" onClick={handleCloseIntro}>
              I’m in — let’s start
            </button>
          </div>
        </div>
      )}

      {/* Blocked state */}
      {!showIntro && blocked && (
        <section className="card blocked">
          <h3 className="section-title">Access locked 🔒</h3>
          <p>
            You’ve reached the maximum number of attempts. For the integrity of the gift, the form
            is no longer accessible from this device/browser.
          </p>
        </section>
      )}

      {/* Quiz (multi-question) */}
      {!showIntro && !blocked && !quizPassed && currentQuiz && (
        <section className="card">
          <h3 className="section-title">Quick Quiz (for security reasons lol)</h3>
          <form onSubmit={handleQuizSubmit} className="quiz-form">
            <label className="quiz-q">{currentQuiz.question}</label>

            <div className="quiz-options">
              {currentQuiz.options.map((label, idx) => {
                const id = `opt${idx}`;
                return (
                  <label key={id} className="option">
                    <input
                      type="radio"
                      name="zara-quiz"
                      value={id}
                      checked={quizAnswer === id}
                      onChange={(e) => setQuizAnswer(e.target.value)}
                      required
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            {quizError && <div className="error">{quizError}</div>}

            <div className="quiz-meta">
              <span>Attempts left: {Math.max(0, 3 - attempts)}</span>
            </div>

            <button type="submit" className="btn primary">Continue</button>
          </form>
        </section>
      )}

      {/* Form */}
      {!showIntro && !blocked && quizPassed && (
        <section className="card">
          <h3 className="section-title">Leave Your Wish 💌</h3>
          <p>Your wishes will be shown to her altogether! so just choose a cute 
            slyvian family mascot that suits your vibe, insert your name, insert your wishes for her
            or for both of yall, add a photo about yourself or both of yall. please be niceee thanks
          </p>

          {/* NEW: Avatar picker */}
          <div className="avatar-picker">
            <h5>Choose your avatar:</h5>
            <div className="avatar-grid">
              {AVATARS.map(a => (
                <button
                  key={a.id}
                  type="button"
                  className={`avatar-choice ${avatarId === a.id ? "selected" : ""}`}
                  onClick={() => setAvatarId(a.id)}
                  aria-pressed={avatarId === a.id}
                  title={a.label}
                >
                  <img src={a.src} alt={a.label} />
                </button>
              ))}
            </div>
            {avatarError && <div className="error">{avatarError}</div>}
          </div>

          <form onSubmit={handleFormSubmit} className="wish-form" encType="multipart/form-data">
            <div className="field">
              <label htmlFor="name">Your Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="wish">Your Wish</label>
              <textarea
                id="wish"
                rows={5}
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="photo">Add a Photo (optional)</label>
              <input id="photo" type="file" accept="image/*" onChange={handlePhotoChange} />
              {previewUrl && (
                <div className="preview">
                  <img src={previewUrl} alt="Preview" />
                </div>
              )}
            </div>

            <div className="actions">
              <button type="submit" className="btn primary">Submit Wish</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
