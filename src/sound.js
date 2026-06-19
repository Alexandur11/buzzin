// Buzzer sounds generated with the Web Audio API — no audio assets to ship,
// works offline, and fires with zero load latency. A single shared AudioContext
// is created lazily and resumed inside the click gesture that triggers playback.
//
// Everything is routed through a master compressor + makeup gain so the layered
// voices glue together and hit with a louder, more "produced" feel.

let audioCtx = null
let master = null
let noiseBuffer = null

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    audioCtx = new AC()
    master = null
    noiseBuffer = null
  }
  // Browsers start the context suspended until a user gesture resumes it.
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// Master bus: compressor (glue + punch) → makeup gain → speakers.
function getMaster(ctx) {
  if (!master) {
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.setValueAtTime(-18, ctx.currentTime)
    comp.knee.setValueAtTime(20, ctx.currentTime)
    comp.ratio.setValueAtTime(4, ctx.currentTime)
    comp.attack.setValueAtTime(0.003, ctx.currentTime)
    comp.release.setValueAtTime(0.2, ctx.currentTime)
    const makeup = ctx.createGain()
    makeup.gain.value = 0.95
    comp.connect(makeup)
    makeup.connect(ctx.destination)
    master = comp
  }
  return master
}

function getNoiseBuffer(ctx) {
  if (!noiseBuffer) {
    const len = Math.floor(ctx.sampleRate * 1.0)
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  }
  return noiseBuffer
}

// One oscillator voice with an ADSR-ish envelope, optional pitch sweep, optional
// resonant filter, and optional vibrato (LFO on pitch).
function tone(ctx, opts) {
  const {
    type = 'square', f0, f1 = f0, dur, peak = 0.3, attack = 0.008,
    detune = 0, filterType = null, filterFreq = 1200, q = 0.7,
    vibrato = null, delay = 0,
  } = opts
  const t = ctx.currentTime + delay

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  let out = getMaster(ctx)
  if (filterType) {
    const filt = ctx.createBiquadFilter()
    filt.type = filterType
    filt.frequency.setValueAtTime(filterFreq, t)
    filt.Q.setValueAtTime(q, t)
    gain.connect(filt)
    filt.connect(out)
  } else {
    gain.connect(out)
  }

  const o = ctx.createOscillator()
  o.type = type
  o.detune.setValueAtTime(detune, t)
  o.frequency.setValueAtTime(f0, t)
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur * 0.9)
  o.connect(gain)
  o.start(t)
  o.stop(t + dur + 0.05)

  if (vibrato) {
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.setValueAtTime(vibrato.rate, t)
    lfoGain.gain.setValueAtTime(vibrato.depth, t) // depth in Hz
    lfo.connect(lfoGain)
    lfoGain.connect(o.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.05)
  }
}

// Filtered noise burst — used for attack transients / "chiff" and tails.
function noise(ctx, opts) {
  const { dur, peak = 0.2, filterType = 'bandpass', filterFreq = 1500, q = 1, delay = 0 } = opts
  const t = ctx.currentTime + delay

  const src = ctx.createBufferSource()
  src.buffer = getNoiseBuffer(ctx)

  const filt = ctx.createBiquadFilter()
  filt.type = filterType
  filt.frequency.setValueAtTime(filterFreq, t)
  filt.Q.setValueAtTime(q, t)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  src.connect(filt)
  filt.connect(gain)
  gain.connect(getMaster(ctx))
  src.start(t)
  src.stop(t + dur + 0.05)
}

// ── Buzz-sound presets ──────────────────────────────────────────────────────
// Layered voices, ~0.6–1.0s each. Peaks stay moderate; the master compressor
// glues and adds loudness.
const PRESETS = {
  classic: {
    label: 'Classic Buzzer',
    play(ctx) {
      noise(ctx, { dur: 0.04, peak: 0.25, filterType: 'highpass', filterFreq: 1500 }) // attack click
      tone(ctx, { type: 'square',   f0: 233, f1: 196, dur: 0.7,  peak: 0.32, filterType: 'lowpass', filterFreq: 2200 })
      tone(ctx, { type: 'sawtooth', f0: 117,          dur: 0.7,  peak: 0.22, filterType: 'lowpass', filterFreq: 1400 }) // sub
      tone(ctx, { type: 'square',   f0: 466, f1: 392, dur: 0.55, peak: 0.12 }) // upper buzz
    },
  },
  gameshow: {
    label: 'Game Show',
    play(ctx) {
      // Family-Feud-style "EHHH-EHHH" double klaxon with vibrato.
      const blast = (delay) => {
        tone(ctx, { type: 'sawtooth', f0: 160, dur: 0.34, peak: 0.3,  delay, filterType: 'lowpass', filterFreq: 1600, vibrato: { rate: 18, depth: 12 } })
        tone(ctx, { type: 'square',   f0: 161, dur: 0.34, peak: 0.16, delay })
      }
      blast(0); blast(0.42)
    },
  },
  arcade: {
    label: 'Arcade',
    play(ctx) {
      // Rising power-up arpeggio + a sparkle on top.
      const notes = [523, 659, 784, 1047]
      notes.forEach((f, i) => tone(ctx, { type: 'square', f0: f, dur: 0.18, peak: 0.26, delay: i * 0.07, filterType: 'lowpass', filterFreq: 4500 }))
      tone(ctx, { type: 'triangle', f0: 1047, f1: 2093, dur: 0.28, peak: 0.18, delay: 0.28 })
    },
  },
  airhorn: {
    label: 'Air Horn',
    play(ctx) {
      // Sustained honky sawtooth chord with horn-like vibrato.
      const chord = [196, 247, 294]
      chord.forEach((f, i) => tone(ctx, {
        type: 'sawtooth', f0: f, dur: 0.95, peak: i === 0 ? 0.24 : 0.17, attack: 0.02,
        filterType: 'lowpass', filterFreq: 2600, vibrato: { rate: 6, depth: 5 },
      }))
      noise(ctx, { dur: 0.08, peak: 0.15, filterType: 'highpass', filterFreq: 2000 })
    },
  },
  laser: {
    label: 'Laser',
    play(ctx) {
      tone(ctx, { type: 'sawtooth', f0: 1800, f1: 120, dur: 0.5, peak: 0.28, filterType: 'lowpass', filterFreq: 3000, q: 6 })
      tone(ctx, { type: 'square',   f0: 900,  f1: 60,  dur: 0.62, peak: 0.13 })
      noise(ctx, { dur: 0.22, peak: 0.08, filterType: 'bandpass', filterFreq: 1200, delay: 0.05 }) // zap tail
    },
  },
  ding: {
    label: 'Ding Dong',
    play(ctx) {
      // Doorbell two-note (E5 → C5), bell-ish sine partials with long decay.
      const strike = (f, delay) => {
        tone(ctx, { type: 'sine', f0: f,        dur: 0.6,  peak: 0.34, attack: 0.004, delay })
        tone(ctx, { type: 'sine', f0: f * 2.01, dur: 0.45, peak: 0.12, delay })
        tone(ctx, { type: 'sine', f0: f * 3.0,  dur: 0.3,  peak: 0.06, delay })
      }
      strike(659, 0); strike(523, 0.32)
    },
  },
  chime: {
    label: 'Chime',
    play(ctx) {
      // Pleasant ascending 3-note chime (C–E–G) with octave shimmer.
      const notes = [523, 659, 784]
      notes.forEach((f, i) => {
        tone(ctx, { type: 'sine', f0: f,     dur: 0.55, peak: 0.3, attack: 0.004, delay: i * 0.12 })
        tone(ctx, { type: 'sine', f0: f * 2, dur: 0.4,  peak: 0.1,               delay: i * 0.12 })
      })
    },
  },
  bell: {
    label: 'Boxing Bell',
    play(ctx) {
      // Metallic clang from inharmonic partials + strike transient + a 2nd hit.
      const base = 540
      const partials = [[1, 0.3], [2.76, 0.16], [5.4, 0.1], [8.9, 0.05]]
      partials.forEach(([mult, p]) => tone(ctx, { type: 'sine', f0: base * mult, dur: 1.0, peak: p, attack: 0.003 }))
      noise(ctx, { dur: 0.03, peak: 0.2, filterType: 'bandpass', filterFreq: 4000 })
      partials.forEach(([mult, p]) => tone(ctx, { type: 'sine', f0: base * mult, dur: 0.6, peak: p * 0.5, delay: 0.18 }))
    },
  },
}

export const DEFAULT_BUZZ_SOUND = 'classic'

// List of { id, label } for building a picker UI.
export const BUZZ_SOUNDS = Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label }))

// Play the room's chosen buzz sound (falls back to the default if unknown).
export function playBuzz(sound) {
  const ctx = getCtx()
  if (!ctx) return
  const preset = PRESETS[sound] || PRESETS[DEFAULT_BUZZ_SOUND]
  preset.play(ctx)
}

// Low, short "dud" for jumping the gun (clicking during the countdown) — the
// same for every preset, so an early click always reads as a mistake.
export function playEarly() {
  const ctx = getCtx()
  if (!ctx) return
  tone(ctx, { type: 'square', f0: 150, f1: 70, dur: 0.28, peak: 0.22, filterType: 'lowpass', filterFreq: 900 })
}
