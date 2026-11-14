import { useEffect, useRef, useState } from "react"
import { useLocalCollection } from "@/lib/use-local-collection"
import {
  Check,
  Flame,
  Lock,
  Mic,
  Minus,
  Pause,
  Play,
  Plus,
  Star,
  Trophy,
  X,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { audio, playCorrect, playDrum, playFanfare, playTap, playWrong, type Drum } from "@/lib/drums"
import { startMic, type MicListener } from "@/lib/mic"

type Pattern = Record<Drum, number[]>

type Lesson = {
  id: string
  level: number
  title: string
  sound: string
  tip: string
  pattern: Pattern
}

// A bar is 16 steps (sixteenth notes). Beat 1 = step 0, beat 2 = step 4, etc.
const lessons: Lesson[] = [
  {
    id: "kick",
    level: 1,
    title: "Bass Drum",
    sound: "“Boots”",
    tip: "Push air through tight, accented lips for a clean, hard thump. Land it on beats 1 and 3.",
    pattern: { kick: [0, 8], snare: [], hat: [] },
  },
  {
    id: "snare",
    level: 2,
    title: "Snare",
    sound: "“Pss”",
    tip: "Add a snare to the kick. Say “boots and cats” to feel the rhythm, then snap the snare on beats 2 and 4.",
    pattern: { kick: [0, 8], snare: [4, 12], hat: [] },
  },
  {
    id: "hat",
    level: 3,
    title: "Hi-Hat",
    sound: "“Tss”",
    tip: "Tight, sprinkler-like hats. Hiss with the tip of your tongue close, light and steady on every eighth note.",
    pattern: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  },
  {
    id: "groove",
    level: 4,
    title: "Basic Beat",
    sound: "Boots-Pss-Tss",
    tip: "Put kick, snare and hats together for a classic hip-hop rhythm. Add a syncopated kick before beat 2.",
    pattern: { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  },
  {
    id: "snare-variations",
    level: 5,
    title: "Snare Variations",
    sound: "“Pss” (quick)",
    tip: "Break up the plain snare with quick extra snares and a sharp rimshot-style accent. Keep the kick and hats steady.",
    pattern: { kick: [0, 8], snare: [4, 7, 12, 15], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  },
  {
    id: "layering",
    level: 6,
    title: "Layering",
    sound: "Boots + Tss together",
    tip: "Land the kick and a hi-hat on the same beat. Breathe in as you go so the beat never stops.",
    pattern: { kick: [0, 6, 8, 14], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  },
]

const XP_PER_LESSON = 10
const PASS_RATIO = 0.5

type Progress = { lessonId: string; done: boolean; updated_at?: string }

const STEPS = 16
// Practice: 1 bar count-in, then 2 scored bars.
const PRACTICE_STEPS = 48
const COUNT_IN_STEPS = 16

const ROWS: { key: Drum; label: string }[] = [
  { key: "kick", label: "Boots" },
  { key: "snare", label: "Pss" },
  { key: "hat", label: "Tss" },
]

type Result = { total: number; hit: number; extra: number; avgMs: number }

// One hit: when it landed (ms from t0) and, if the mic labelled it, which sound.
type Hit = { t: number; sound?: Drum }

const SOUND_LABEL: Record<Drum, string> = { kick: "Boots", snare: "Pss", hat: "Tss" }

// How close to the beat a hit must land, as a fraction of one step.
const TOLERANCES = [
  { label: "Strict", value: 0.5 },
  { label: "Relaxed", value: 0.75 },
  { label: "Easy", value: 1 },
]

// Which drums are due on a given step of the bar.
function allowedAt(pattern: Pattern, step: number): Drum[] {
  return (Object.keys(pattern) as Drum[]).filter((k) => pattern[k].includes(step))
}

// Compare hits against every target step in the scored bars.
// A hit counts if it lands within half a step of the target and, when the
// mic labelled it, the sound matches what the step asks for. Taps match any sound.
function scoreTaps(pattern: Pattern, taps: Hit[], stepMs: number, tolerance: number): Result {
  const targets: { t: number; allowed: Drum[] }[] = []
  for (let g = COUNT_IN_STEPS; g < PRACTICE_STEPS; g++) {
    const allowed = allowedAt(pattern, g % STEPS)
    if (allowed.length) targets.push({ t: g * stepMs, allowed })
  }
  const window = taps
    .filter((h) => h.t >= (COUNT_IN_STEPS - 0.5) * stepMs && h.t < (PRACTICE_STEPS + 0.5) * stepMs)
    .sort((a, b) => a.t - b.t)

  const used = new Set<number>()
  let hit = 0
  let offsetSum = 0
  for (const target of targets) {
    let best = -1
    let bestDiff = Infinity
    window.forEach((h, i) => {
      if (used.has(i)) return
      if (h.sound && !target.allowed.includes(h.sound)) return
      const diff = Math.abs(h.t - target.t)
      if (diff < bestDiff) {
        bestDiff = diff
        best = i
      }
    })
    if (best >= 0 && bestDiff <= stepMs * tolerance) {
      used.add(best)
      hit++
      offsetSum += window[best].t - target.t
    }
  }
  return {
    total: targets.length,
    hit,
    extra: window.length - used.size,
    avgMs: hit ? Math.round(offsetSum / hit) : 0,
  }
}

// Consecutive days (ending today, or yesterday) with at least one finished lesson.
function streakDays(rows: Progress[]) {
  const days = new Set(
    rows
      .filter((r) => r.done && r.updated_at)
      .map((r) => new Date(r.updated_at as string).toDateString()),
  )
  const cursor = new Date()
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1)
  let count = 0
  while (days.has(cursor.toDateString())) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

type Level = "beginner" | "medium" | "advanced"
type Goal = "theory" | "practice" | "both"
type Profile = { level: Level; goal: Goal }

// Starting tempo for each level.
const LEVEL_BPM: Record<Level, number> = { beginner: 70, medium: 90, advanced: 110 }

const LEVELS: { id: Level; title: string; hint: string }[] = [
  { id: "beginner", title: "Beginner", hint: "I'm new to beatboxing" },
  { id: "medium", title: "Medium", hint: "I can make a few sounds" },
  { id: "advanced", title: "Advanced", hint: "I already keep a beat" },
]

const GOALS: { id: Goal; title: string; hint: string }[] = [
  { id: "theory", title: "Learn the theory", hint: "How each sound is made, then listen" },
  { id: "practice", title: "Practice right away", hint: "Jump straight to playing along" },
  { id: "both", title: "Both", hint: "Theory first, then practice" },
]

function Onboarding({
  initial,
  onSave,
  onCancel,
}: {
  initial: Profile | null
  onSave: (p: Profile) => void
  onCancel?: () => void
}) {
  const [level, setLevel] = useState<Level>(initial?.level ?? "beginner")
  const [goal, setGoal] = useState<Goal>(initial?.goal ?? "both")

  return (
    <main className="min-h-svh bg-background text-foreground px-5 py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Let's tune your practice</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Two quick questions. You can change these later.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">How much beatboxing have you done?</h2>
          {LEVELS.map((l) => (
            <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => setLevel(l.id)} className="text-left">
              <Card className={["flex-row items-center gap-4 p-4 transition-colors", level === l.id ? "border-primary ring-2 ring-primary/30" : "hover:bg-accent/40"].join(" ")}>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{l.title}</p>
                  <p className="text-xs text-muted-foreground">{l.hint}</p>
                </div>
                {level === l.id && <Check className="size-5 text-primary" aria-hidden="true" />}
              </Card>
            </button>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">What do you want to learn first?</h2>
          {GOALS.map((g) => (
            <button key={g.id} type="button" aria-pressed={goal === g.id} onClick={() => setGoal(g.id)} className="text-left">
              <Card className={["flex-row items-center gap-4 p-4 transition-colors", goal === g.id ? "border-primary ring-2 ring-primary/30" : "hover:bg-accent/40"].join(" ")}>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{g.title}</p>
                  <p className="text-xs text-muted-foreground">{g.hint}</p>
                </div>
                {goal === g.id && <Check className="size-5 text-primary" aria-hidden="true" />}
              </Card>
            </button>
          ))}
        </section>

        <div className="flex flex-col gap-3">
          <Button size="lg" className="w-full" onClick={() => onSave({ level, goal })}>
            Start learning
          </Button>
          {onCancel && (
            <Button variant="ghost" className="w-full" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </main>
  )
}

function App() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [justFinished, setJustFinished] = useState<string | null>(null)
  const lesson = lessons.find((l) => l.id === openId) ?? null
  const [editingProfile, setEditingProfile] = useState(false)

  const { data: progress, create, update } = useLocalCollection<Progress & { id: string }>({
    collection: "progress",
  })

  const { data: profiles, loading: profileLoading, create: createProfile, update: updateProfile } = useLocalCollection<Profile & { id: string }>({
    collection: "profile",
  })
  const profileRow = profiles[0] ?? null

  const doneIds = new Set(progress.filter((p) => p.done).map((p) => p.lessonId))
  const currentIndex = lessons.findIndex((l) => !doneIds.has(l.id))
  const streak = streakDays(progress)
  const xp = doneIds.size * XP_PER_LESSON

  async function markDone(lessonId: string) {
    const existing = progress.find((p) => p.lessonId === lessonId)
    if (existing?.done) return
    if (existing) await update(existing.id, { done: true })
    else await create({ lessonId, done: true })
  }

  async function saveProfile(p: Profile) {
    if (profileRow) await updateProfile(profileRow.id, p)
    else await createProfile(p)
    setEditingProfile(false)
  }

  // Wait for the saved profile before deciding whether to show onboarding.
  if (profileLoading) return <main className="min-h-svh bg-background" />

  if (!profileRow || editingProfile) {
    return (
      <Onboarding
        initial={profileRow}
        onSave={saveProfile}
        onCancel={profileRow ? () => setEditingProfile(false) : undefined}
      />
    )
  }

  if (lesson) {
    return (
      <LessonView
        lesson={lesson}
        profile={profileRow}
        onClose={() => setOpenId(null)}
        onPass={async () => {
          playFanfare()
          await markDone(lesson.id)
          setJustFinished(lesson.id)
          setOpenId(null)
        }}
      />
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-5 pb-16">
        <header className="sticky top-0 z-10 -mx-5 mb-6 flex items-center justify-between bg-background/95 px-5 py-4 backdrop-blur">
          <span className="text-lg font-bold tracking-tight">Beatbox</span>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <span className="flex items-center gap-1.5 text-primary" aria-label={`${streak} day streak`}>
              <Flame className="size-5" />
              {streak}
            </span>
            <span className="flex items-center gap-1.5 text-foreground" aria-label={`${xp} XP`}>
              <Zap className="size-5 text-primary" />
              {xp}
            </span>
          </div>
        </header>

        {justFinished && (
          <Card className="mb-6 flex-row items-center gap-3 border-primary/40 bg-primary/10 p-4">
            <Trophy className="size-6 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Lesson complete! +{XP_PER_LESSON} XP</p>
              <p className="text-xs text-muted-foreground">
                {lessons.find((l) => l.id === justFinished)?.title} is done.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setJustFinished(null)}>
              <X className="size-4" />
            </Button>
          </Card>
        )}

        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Your beatbox path</h1>
          <Button variant="ghost" size="sm" onClick={() => setEditingProfile(true)}>
            {LEVELS.find((l) => l.id === profileRow.level)?.title} · Change
          </Button>
        </div>

        <ol className="flex flex-col items-center">
          {lessons.map((l, i) => {
            const done = doneIds.has(l.id)
            const current = i === currentIndex
            const locked = !done && !current
            const offset = i % 2 === 0 ? "-translate-x-12" : "translate-x-12"
            return (
              <li key={l.id} className="flex flex-col items-center">
                {i > 0 && <span className="h-8 w-1.5 rounded-full bg-border" aria-hidden="true" />}
                <div className={offset}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setOpenId(l.id)}
                    aria-label={`${l.title}${done ? ", done" : locked ? ", locked" : ""}`}
                    className={[
                      "flex size-20 items-center justify-center rounded-full text-lg font-bold transition-transform active:translate-y-1",
                      done && "bg-primary text-primary-foreground shadow-[0_6px_0_0] shadow-primary/60",
                      current && "bg-primary text-primary-foreground shadow-[0_6px_0_0] shadow-primary/60 ring-4 ring-primary/30",
                      locked && "bg-muted text-muted-foreground shadow-[0_6px_0_0] shadow-border",
                    ].filter(Boolean).join(" ")}
                  >
                    {done ? <Check className="size-8" strokeWidth={3} /> : locked ? <Lock className="size-6" /> : <Star className="size-8" fill="currentColor" />}
                  </button>
                  <p className="mt-2 w-32 text-center text-xs font-semibold text-muted-foreground">
                    {l.title}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </main>
  )
}

// Audio output delay the browser reports, in ms. Used as a starting sound delay.
function detectLatency(): number {
  const c = audio()
  return Math.round(((c.baseLatency ?? 0) + (c.outputLatency ?? 0)) * 1000)
}

type Step = "listen" | "practice"

function LessonView({
  lesson,
  profile,
  onClose,
  onPass,
}: {
  lesson: Lesson
  profile: Profile
  onClose: () => void
  onPass: () => void | Promise<void>
}) {
  const [step, setStep] = useState<Step>(profile.goal === "practice" ? "practice" : "listen")
  const [bpm, setBpm] = useState(LEVEL_BPM[profile.level])
  const [playing, setPlaying] = useState(false)
  const [beatStep, setBeatStep] = useState(-1)
  const stepRef = useRef(-1)

  const [practicing, setPracticing] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [micOn, setMicOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [heard, setHeard] = useState<Drum | null>(null)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [tolerance, setTolerance] = useState(0.75)
  // Sound delay: how late the beat is heard after it is scheduled (ms).
  const [offset, setOffset] = useState(0)
  // Live mic loudness (RMS), shown as a meter while practising.
  const [level, setLevel] = useState(0)
  const micRef = useRef<MicListener | null>(null)
  // t0 is when the first step lands; hits are stored relative to it.
  const practice = useRef({ t0: 0, stepMs: 375, taps: [] as Hit[], offset: 0 })

  useEffect(() => {
    if (!playing) {
      setBeatStep(-1)
      stepRef.current = -1
      return
    }
    const ms = (60_000 / bpm) / 4
    const id = setInterval(() => {
      stepRef.current = (stepRef.current + 1) % STEPS
      const s = stepRef.current
      setBeatStep(s)
      for (const { key } of ROWS) {
        if (lesson.pattern[key].includes(s)) playDrum[key]()
      }
    }, ms)
    return () => clearInterval(id)
  }, [playing, bpm, lesson])

  // Stop the mic if the learner leaves the lesson mid-practice.
  useEffect(() => () => void micRef.current?.stop(), [])

  async function stopMicAndSave() {
    const blob = await micRef.current?.stop()
    micRef.current = null
    setLevel(0)
    if (blob && blob.size > 0) setRecordingUrl(URL.createObjectURL(blob))
  }

  // Practice ends after the count-in and two scored bars.
  useEffect(() => {
    if (!practicing) return
    const { stepMs } = practice.current
    const id = setTimeout(() => {
      setResult(scoreTaps(lesson.pattern, practice.current.taps, stepMs, tolerance))
      setPracticing(false)
      setPlaying(false)
      void stopMicAndSave()
    }, (PRACTICE_STEPS + 1) * stepMs)
    return () => clearTimeout(id)
  }, [practicing, lesson])

  // Play a pass or miss chime as soon as the practice result arrives.
  useEffect(() => {
    if (!result) return
    if (result.hit / result.total >= PASS_RATIO) playCorrect()
    else playWrong()
  }, [result])

  // Live feedback: the pad flashes green on a hit in time, red on a miss.
  const [flash, setFlash] = useState<"good" | "bad" | null>(null)
  function flashPad(kind: "good" | "bad") {
    setFlash(kind)
    setTimeout(() => setFlash(null), 220)
  }

  // Shared by the pad, the Space bar and the mic.
  function registerHit(at: number, sound?: Drum) {
    const { t0, stepMs, taps, offset } = practice.current
    const t = at - t0 - offset
    taps.push({ t, sound })
    if (t < (COUNT_IN_STEPS - 0.5) * stepMs) return // count-in hits aren't scored
    const n = Math.round(t / stepMs)
    const allowed = allowedAt(lesson.pattern, n % STEPS)
    const onBeat =
      n >= COUNT_IN_STEPS &&
      n < PRACTICE_STEPS &&
      allowed.length > 0 &&
      (!sound || allowed.includes(sound)) &&
      Math.abs(t - n * stepMs) <= stepMs * tolerance
    flashPad(onBeat ? "good" : "bad")
  }

  function tap() {
    if (!practicing) return
    playTap()
    registerHit(performance.now())
  }

  // Space bar taps while practicing.
  useEffect(() => {
    if (!practicing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return
      e.preventDefault()
      tap()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [practicing])

  async function startPractice() {
    setResult(null)
    setHeard(null)
    setMicError(null)
    setRecordingUrl(null)
    if (micOn) {
      try {
        micRef.current = await startMic(
          (sound, at) => {
            setHeard(sound)
            registerHit(at, sound)
          },
          (rms) => setLevel(rms),
        )
      } catch {
        setMicError("Couldn't open the mic. Allow microphone access, or tap the pad instead.")
      }
    }
    const stepMs = (60_000 / bpm) / 4
    practice.current = { t0: performance.now() + stepMs, stepMs, taps: [], offset }
    setPlaying(true)
    setPracticing(true)
  }

  function stopPractice() {
    setPracticing(false)
    setPlaying(false)
    void stopMicAndSave()
  }

  const passed = result !== null && result.hit / result.total >= PASS_RATIO
  const progressPct = step === "listen" ? 33 : result ? (passed ? 100 : 66) : 66

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-5 pb-40 pt-6">
        <div className="mb-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" aria-label="Leave lesson" onClick={onClose}>
            <X className="size-5" />
          </Button>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <header className="mb-6">
          <p className="text-sm font-semibold text-primary">Level {lesson.level} · Say {lesson.sound}</p>
          <h1 className="text-2xl font-bold tracking-tight">{lesson.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{lesson.tip}</p>
        </header>

        <Card className="gap-4 p-4">
          {ROWS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-14 text-xs text-muted-foreground">{label}</span>
              <div className="grid flex-1 grid-cols-16 gap-1">
                {Array.from({ length: STEPS }, (_, s) => {
                  const hit = lesson.pattern[key].includes(s)
                  return (
                    <div
                      key={s}
                      className={[
                        "h-7 rounded-sm transition-colors",
                        hit ? "bg-primary" : "bg-muted",
                        s === beatStep ? "ring-2 ring-ring" : "",
                      ].join(" ")}
                    />
                  )
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Slower"
                disabled={playing}
                onClick={() => setBpm((b) => Math.max(50, b - 5))}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-20 text-center text-sm font-medium">{bpm} BPM</span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Faster"
                disabled={playing}
                onClick={() => setBpm((b) => Math.min(160, b + 5))}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <Button disabled={practicing} onClick={() => setPlaying((p) => !p)}>
              {playing && !practicing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing && !practicing ? "Stop" : "Play beat"}
            </Button>
          </div>
        </Card>

        {step === "practice" && (
          <section className="mt-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold">Your turn</h2>
            <p className="text-sm text-muted-foreground">
              The beat plays one bar as a count-in, then two bars to perform. Tap the pad
              (or press Space) on each hit, or turn on the mic to sing it and have it
              labelled as Boots, Pss or Tss.
            </p>

            {!practicing && (
              <Button
                variant={micOn ? "default" : "outline"}
                onClick={() => setMicOn((m) => !m)}
                className="self-start"
              >
                <Mic className="size-4" /> {micOn ? "Mic on" : "Use mic"}
              </Button>
            )}

            {!practicing && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">How close to the beat?</p>
                <div className="flex gap-2">
                  {TOLERANCES.map((t) => (
                    <Button
                      key={t.label}
                      size="sm"
                      variant={tolerance === t.value ? "default" : "outline"}
                      aria-pressed={tolerance === t.value}
                      onClick={() => setTolerance(t.value)}
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {!practicing && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sound delay</span>
                <Button size="icon" variant="outline" aria-label="Less delay" onClick={() => setOffset((o) => Math.max(0, o - 20))}>
                  <Minus className="size-4" />
                </Button>
                <span className="w-16 text-center font-medium">{offset} ms</span>
                <Button size="icon" variant="outline" aria-label="More delay" onClick={() => setOffset((o) => Math.min(500, o + 20))}>
                  <Plus className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOffset(detectLatency())}>
                  Auto
                </Button>
              </div>
            )}

            {micError && <p className="text-sm text-destructive">{micError}</p>}

            {practicing && (
              <>
                <button
                  type="button"
                  onPointerDown={tap}
                  className={[
                    "h-28 w-full select-none rounded-2xl text-base font-bold text-white transition-colors active:translate-y-1 active:shadow-none",
                    flash === "good"
                      ? "bg-[#22c55e] shadow-[0_6px_0_0] shadow-[#15803d]"
                      : flash === "bad"
                        ? "bg-destructive shadow-[0_6px_0_0] shadow-destructive/60"
                        : "bg-primary text-primary-foreground shadow-[0_6px_0_0] shadow-primary/60",
                  ].join(" ")}
                >
                  Tap in time
                </button>
                {micRef.current && (
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Mic level</span>
                      <span>{Math.round(Math.min(1, level * 4) * 100)}%</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(1, level * 4) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                {micOn && (
                  <p className="text-sm text-muted-foreground">
                    Heard: <span className="font-semibold text-foreground">{heard ? SOUND_LABEL[heard] : "…"}</span>
                  </p>
                )}
              </>
            )}

            {result && !practicing && (
              <div className="rounded-xl bg-muted p-4 text-sm">
                <p className="font-semibold">
                  {result.hit} of {result.total} hits on time
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.extra} extra tap{result.extra === 1 ? "" : "s"} ·{" "}
                  {result.hit === 0
                    ? "try again at a slower tempo"
                    : `average ${Math.abs(result.avgMs)} ms ${result.avgMs > 0 ? "late" : result.avgMs < 0 ? "early" : "on time"}`}
                </p>
              </div>
            )}

            {recordingUrl && !practicing && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Listen back</p>
                <audio controls src={recordingUrl} className="w-full" />
              </div>
            )}
          </section>
        )}
      </div>

      <footer
        className={[
          "fixed inset-x-0 bottom-0 border-t px-5 py-4",
          step === "practice" && result && !practicing
            ? passed
              ? "border-primary/40 bg-primary/10"
              : "border-destructive/40 bg-destructive/10"
            : "border-border bg-background",
        ].join(" ")}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          {step === "practice" && result && !practicing && (
            <p className="text-base font-bold">
              {passed ? "Nice timing!" : "Not quite. Keep going."}
            </p>
          )}

          {step === "listen" && (
            <Button size="lg" className="w-full" onClick={() => { setPlaying(false); setStep("practice") }}>
              Continue
            </Button>
          )}

          {step === "practice" && !practicing && !result && (
            <Button size="lg" className="w-full" onClick={startPractice}>
              <Play className="size-4" /> Start practice
            </Button>
          )}

          {step === "practice" && practicing && (
            <Button size="lg" variant="outline" className="w-full" onClick={stopPractice}>
              <Pause className="size-4" /> Stop practice
            </Button>
          )}

          {step === "practice" && result && !practicing && passed && (
            <Button size="lg" className="w-full" onClick={onPass}>
              Continue
            </Button>
          )}

          {step === "practice" && result && !practicing && !passed && (
            <Button size="lg" variant="destructive" className="w-full" onClick={startPractice}>
              Try again
            </Button>
          )}
        </div>
      </footer>
    </main>
  )
}

export default App
