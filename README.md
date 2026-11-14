# Beatbox Tutor

<!-- rebake trigger 2026-05-26: flush stale __diag__ from snapshot's agent-server bundle -->

Learn to beatbox in short lessons. You start with the kick, the snare and the
hi-hat, then build simple beats. Practise against a beat grid, tap in time, and
let the microphone check your sounds.

## What it does

- **Onboarding:** Pick your level (beginner, medium or advanced). The level sets
  the starting tempo. Pick a goal (theory, practice or both). "Change" in the
  header reopens these questions.
- **Lesson path:** Six lessons, unlocked in order:
  1. **Bass Drum** (“Boots”): kick on beats 1 and 3.
  2. **Snare** (“Pss”): kick plus snare on beats 2 and 4.
  3. **Hi-Hat** (“Tss”): kick, snare and hats on every eighth note.
  4. **Basic Beat**: a syncopated kick added to the full groove.
  5. **Snare Variations**: quick extra snares and a rimshot-style accent.
  6. **Layering**: kick and hi-hat land on the same beat.
- **Listen:** Play the beat grid at any tempo (50–160 BPM).
- **Practise:** One count-in bar, then two scored bars. Tap the pad or press
  Space. The pad flashes green on a hit and red on a miss.
  - **Tolerance:** Strict, Relaxed (default) or Easy.
  - **Sound delay:** Shifts the target earlier to account for audio latency.
    "Auto" uses the browser's reported latency.
  - **Pass:** At least half of the target hits.
- **Mic:** "Use mic" labels each sound as Boots, Pss or Tss and checks it
  against the beat. A live level meter shows your input, and you can play back
  your take afterwards.
- **Progress:** The header shows your streak and XP. Finishing a lesson shows a
  banner and plays a fanfare.

## How scoring works

The beat grid has 16 steps per bar. Targets are the steps where a sound is due.
Each hit is measured from the start of the run, minus the sound delay. Hits in
the count-in are not scored.

- A target is matched by the nearest unused hit that has the right sound and is
  within the tolerance. Pad and Space taps match any sound.
- The result shows hits on time, extra taps, and the average timing (late or
  early).

Mic labels use a simple spectral rule. Expect mistakes until it is tuned for
your voice and microphone.

## Running it

Install dependencies with `bun install`, develop with `bun run dev`, and build
with `bun run build`. The build is a static app, and `vercel.json` rewrites all
routes to `index.html` for hosting on Vercel.

Microphone features need a browser that allows microphone access, typically
over HTTPS or localhost.

## Where data is stored

Progress and your profile (level and goal) are saved in the browser's
localStorage. They are per browser and per device, and they are not synced to a
server.

## Project layout

- `src/App.tsx`: onboarding, home path, lesson view, practice scoring.
- `src/lib/drums.ts`: synthesised drum, tap and feedback sounds (Web Audio).
- `src/lib/mic.ts`: microphone onset detection, labelling and recording.
- `src/lib/use-local-collection.ts`: localStorage-backed collection hook.
- `schema.ts`: data schema for the omg.dev data layer (`progress`, `profile`).
- `src/theme.css`: colours, fonts and corners (set through the design panel).
