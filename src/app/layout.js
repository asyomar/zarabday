import "./globals.css";
import Image from "next/image";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="app-grid">
        <audio autoPlay loop controls={false}>
          <source src="/hujanMuda.mp3" type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
        {/* Left punch-hole column (8 cells; CSS hides 4 on small screens) */}
        <aside className="grid-rail" aria-hidden="true">
          <span className="hole" />
          <span className="hole" />
          <span className="hole" />
          <span className="hole" />
          <span className="hole" />
          <span className="hole" />

        </aside>

        {/* Header row */}
        <header className="grid-header">
          <h1 className="header-title">Wishes For Zara</h1>
          <div className="header-actions">
            <Image
              src="/yellowbutton.png"
              alt="yellowbutton"
              width={120}
              height={90}
              priority
            />
          </div>
        </header>

        {/* Scrollable main row */}
        <main className="grid-main">
          <div className="content-inner">{children}</div>
        </main>

        {/* Footer row */}
        <footer className="grid-footer">
          <div className="footer-actions">
            <Image
              src="/redflower.png"
              alt="redflower"
              width={120}
              height={120}
              priority
            />
          </div>
          <p className="footer-text">
            dear journal, today was kinda ✨<em>all over the place</em>✨ tbh. woke up late (again 🙃). also i shat 10 times yay. i ate <s>maggie</s> chicken rice and sukiya. *many deep thoughts* also free palestine. need to manifest good vibes for tomorrow. sometimes i think i’m just tired, but other times i wonder if it’s the universe nudging me to slow down.  
  i caught myself zoning out at the bus stop 🚏, watching strangers live their whole little lives around me… couples laughing, kids chasing each other, an old man just sipping kopi like he had all the time in the world. and i thought: when did life get so fast that i stopped noticing these tiny beautiful things?  
          </p>
        </footer>
      </body>
    </html>
  );
}
