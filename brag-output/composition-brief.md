# Hyperframes Composition Brief: Allsvenskantipset

## Objective
Create a short launch-style brag video for Allsvenskantipset that shows both player features and the admin ("Tipskontoret") features, for Anders (admin) and the user's father.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 31 s (intentionally above 25 s: the user asked to show all admin features)

## Source Material
- Project root: `C:\Users\linus\Fotbollsapp` (Next.js app)
- Primary files read: `src/app/globals.css`, `src/app/page.tsx`, `src/app/tipsa/*`, `src/app/admin/*`, `README.md`, `prisma/seed.ts`
- Product name: Allsvenskantipset
- Tagline / strongest claim: "Minst antal fel vinner." / "Sedan 2015: ett Excel-ark." → "Nu: en egen app."
- Key UI to show: real screenshots of the running app (1920×1080, in `composition/assets/`): `excel.png`, `s-home.png`, `s-reg-team.png`, `s-reg-swish.png`, `s-tips.png`, `s-scorers.png`, `s-leaderboard.png`, `s-awards.png`, `a-sync.png`, `a-payments.png`, `a-broadcast.png`, `a-season.png`, `s-heroes.png`, `logo.svg`
- Copy that must appear verbatim (Swedish):
  - "Sedan 2015: ett Excel-ark."
  - "Nu: en egen app."
  - "Välj lag och avatar. Swisha 111 kr."
  - "Dra lagen på plats. Dubbletter blir röda."
  - "Tabell, logotyper och skyttekungar. Helt automatiskt."
  - "Veckans raket, djupdykning och jojo."
  - "Och för Anders:" / "Tipskontoret"
  - "Ett klick: tabell & ligor hämtas." / "Bekräfta Swish-betalningar." / "Nyheter och push till alla." / "Ny säsong. Lagen återanvänds."
  - "Är du nästa hero?"

## Creative Direction
- Tone preset: default
- Creative direction: kompisgängets eget Allsvenska-studio – varm, energisk kvällsmatch
- Interpretation: fast entrances (0.3–0.6 s), then stable holds on every caption; screenshots framed in browser-window cards with depth.
- Angle: From the Excel sheet the competition has run on since 2015 to its own app; player chapter then admin chapter.
- Hook: the real Excel sheet with "Sedan 2015: ett Excel-ark."
- Outro / punchline: Heroes wall → logo + "Är du nästa hero?"
- Avoid: generic SaaS language, abstract filler visuals, redesigning the app.

## Visual Identity
- Background: `#050b08` · Surface: `#0b1611` · Border: `#1f3a2d`
- Text: `#ecf6f0` · Muted: `#9bb3a6`
- Accent: gold `#f5c518`, pitch green `#22c55e`, error red `#f05252`
- Display font: Bebas Neue (local woff2) · Body font: Source Sans 3 (local woff2)
- Visual references: pitch-line grid background, gold shield logo, gold shimmer title, radial team-color glow.

## Storyboard
Use `brag-output/brag-plan.md` as the creative contract.

1. Excel-hooken — 0.0–3.0 s
2. Avslöjandet — 3.0–6.0 s
3. Gå med — 6.0–9.5 s
4. Tippa — 9.5–13.0 s
5. Allsvenskan live — 13.0–17.0 s
6. Tipstabellen — 17.0–20.5 s
7. Tipskontoret (admin, 4 cards) — 20.5–27.5 s
8. Heroes + logo — 27.5–31.0 s

## Audio
- Audio role: warm energetic bed
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`, volume ~0.34, fade out over the last ~1.5 s
- Music cue guidance: bundled preset `music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json` (120.19 BPM; beats at x.02/x.52; strong cues 17.02, 20.02, 23.02)
- Audio-reactive treatment: subtle — bass drives background glow / gold halo behind screenshot cards
- Audio-coupled moments: reveal hit at 3.02; clicks in scenes 3, 4, 7; soft card slides per admin card; bell on logo
- SFX analysis guidance: skill `assets/sfx/sfx-analysis.md` — prefer low/medium HF-risk files
- Files copied to `composition/assets/`
