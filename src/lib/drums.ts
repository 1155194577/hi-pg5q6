// Synthesized beatbox sounds with Web Audio. No audio files needed.
let ctx: AudioContext | null = null

export function audio() {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === "suspended") void ctx.resume()
  return ctx
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

export function playKick(when = 0) {
  const c = audio()
  const t = c.currentTime + when
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.frequency.setValueAtTime(150, t)
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  gain.gain.setValueAtTime(1, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
  osc.connect(gain).connect(c.destination)
  osc.start(t)
  osc.stop(t + 0.4)
}

export function playSnare(when = 0) {
  const c = audio()
  const t = c.currentTime + when
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, 0.25)
  const filter = c.createBiquadFilter()
  filter.type = "highpass"
  filter.frequency.value = 1500
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.8, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(t)
  src.stop(t + 0.25)
}

export function playHat(when = 0) {
  const c = audio()
  const t = c.currentTime + when
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, 0.1)
  const filter = c.createBiquadFilter()
  filter.type = "highpass"
  filter.frequency.value = 7000
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.4, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(t)
  src.stop(t + 0.1)
}

export type Drum = "kick" | "snare" | "hat"

export const playDrum: Record<Drum, (when?: number) => void> = {
  kick: playKick,
  snare: playSnare,
  hat: playHat,
}

// Original feedback sounds (not Duolingo's audio): short bright chimes.
function tone(freq: number, start: number, dur: number, type: OscillatorType = "triangle", vol = 0.25) {
  const c = audio()
  const t = c.currentTime + start
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

export function playTap() {
  tone(880, 0, 0.05, "sine", 0.15)
}

export function playCorrect() {
  tone(659.25, 0, 0.12)
  tone(880, 0.09, 0.2)
}

export function playWrong() {
  tone(196, 0, 0.25, "sawtooth", 0.12)
  tone(147, 0.18, 0.3, "sawtooth", 0.12)
}

export function playFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => tone(f, i * 0.11, 0.25))
  tone(1046.5, 0.45, 0.5)
}
