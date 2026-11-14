import { audio, type Drum } from "@/lib/drums"

// Rough sound labels from one spectrum frame. Heuristic: low-heavy = Boots,
// bright = Tss, everything else = Pss. Accuracy varies by mic and voice.
export function classify(freq: Uint8Array, binHz: number): Drum {
  let low = 0
  let total = 0
  let centroidNum = 0
  let centroidDen = 0
  for (let i = 1; i < freq.length; i++) {
    const f = i * binHz
    const e = freq[i] * freq[i]
    if (f < 250) low += e
    if (f >= 1000 && f <= 12000) {
      centroidNum += f * e
      centroidDen += e
    }
    total += e
  }
  if (total === 0) return "snare"
  if (low / total > 0.5) return "kick"
  const centroid = centroidDen ? centroidNum / centroidDen : 0
  return centroid > 6000 ? "hat" : "snare"
}

export type MicListener = { stop: () => Promise<Blob | null> }

// Listens for mic onsets, labels each one, and records the take.
export async function startMic(
  onHit: (sound: Drum, at: number) => void,
  onLevel?: (rms: number) => void,
): Promise<MicListener> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const c = audio()
  const source = c.createMediaStreamSource(stream)
  const analyser = c.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)
  const time = new Float32Array(analyser.fftSize)
  const freq = new Uint8Array(analyser.frequencyBinCount)
  const binHz = c.sampleRate / analyser.fftSize

  const chunks: Blob[] = []
  const recorder = typeof MediaRecorder !== "undefined" ? new MediaRecorder(stream) : null
  recorder?.addEventListener("dataavailable", (e) => chunks.push(e.data))
  recorder?.start()

  let running = true
  let raf = 0
  let prev = 0
  let last = -1e9
  const loop = () => {
    if (!running) return
    analyser.getFloatTimeDomainData(time)
    let sum = 0
    for (const v of time) sum += v * v
    const rms = Math.sqrt(sum / time.length)
    onLevel?.(rms)
    const now = performance.now()
    // An onset is a loud jump after quiet, with a short gap between hits.
    if (rms > 0.03 && rms > prev * 2 && now - last > 100) {
      last = now
      analyser.getByteFrequencyData(freq)
      onHit(classify(freq, binHz), now)
    }
    prev = rms
    raf = requestAnimationFrame(loop)
  }
  loop()

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop())
    source.disconnect()
  }

  return {
    stop: () =>
      new Promise((resolve) => {
        running = false
        cancelAnimationFrame(raf)
        if (!recorder || recorder.state === "inactive") {
          cleanup()
          resolve(null)
          return
        }
        recorder.addEventListener(
          "stop",
          () => {
            cleanup()
            resolve(new Blob(chunks, { type: recorder.mimeType }))
          },
          { once: true },
        )
        recorder.stop()
      }),
  }
}
