'use client'

import { useEffect, useRef, useState } from 'react'

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (o: { formats: string[] }) => Detector

/**
 * Lector de código de barras con la cámara trasera.
 * Usa el BarcodeDetector del navegador (Chrome en Android) y, si no existe
 * (iPhone, Firefox), la librería ZXing. También se puede escribir el código.
 */
export function Escaner({ onDetectado, onCerrar }: { onDetectado: (codigo: string) => void; onCerrar: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')
  const listo = useRef(false)

  useEffect(() => {
    let detener = () => {}
    let cancelado = false
    const avisar = (codigo: string) => {
      if (listo.current || !/^\d{6,14}$/.test(codigo)) return
      listo.current = true
      navigator.vibrate?.(80)
      onDetectado(codigo)
    }

    async function iniciar() {
      const v = video.current
      if (!v) return
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Escribe el código abajo.')
        return
      }
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
      try {
        if (Ctor) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
          if (cancelado) return stream.getTracks().forEach((t) => t.stop())
          v.srcObject = stream
          await v.play()
          const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
          const intervalo = setInterval(async () => {
            try {
              const [c] = await detector.detect(v)
              if (c) avisar(c.rawValue)
            } catch { /* cuadro sin código */ }
          }, 250)
          detener = () => { clearInterval(intervalo); stream.getTracks().forEach((t) => t.stop()) }
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          if (cancelado) return
          const lector = new BrowserMultiFormatReader()
          const controles = await lector.decodeFromConstraints({ video: { facingMode: 'environment' } }, v, (r) => {
            if (r) avisar(r.getText())
          })
          detener = () => controles.stop()
        }
      } catch (e) {
        const nombre = (e as { name?: string }).name
        setError(nombre === 'NotAllowedError'
          ? 'No diste permiso para usar la cámara. Actívalo en los ajustes del navegador o escribe el código abajo.'
          : 'No se pudo abrir la cámara. Escribe el código abajo.')
      }
    }
    iniciar()
    return () => { cancelado = true; detener() }
  }, [onDetectado])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal aria-label="Escanear código de barras">
      <div className="mb-3 flex items-center justify-between text-white">
        <p className="font-semibold">Escanea el código de barras</p>
        <button type="button" onClick={onCerrar} className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-white/40">Cerrar</button>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-2xl bg-black">
        <video ref={video} className="h-full w-full object-cover" playsInline muted />
        {!error && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-28 -translate-y-1/2 rounded-xl border-2 border-white/80" />}
        {error && <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-black/70 p-3 text-center text-sm text-white">{error}</p>}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); avisarManual() }}>
        <input inputMode="numeric" pattern="\d*" placeholder="o escribe el código: 7750…" value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))}
          className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2.5 text-white placeholder:text-white/50 outline-none ring-1 ring-white/30" />
        <button className="rounded-xl bg-[var(--acento)] px-4 font-semibold text-white disabled:opacity-50" disabled={manual.length < 6}>Buscar</button>
      </form>
    </div>
  )

  function avisarManual() {
    if (manual.length >= 6 && manual.length <= 14) onDetectado(manual)
  }
}

type Reconocimiento = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: (e: { results: { 0: { transcript: string } }[] }) => void
  onerror: (e: { error: string }) => void
  onend: () => void
  start: () => void
  stop: () => void
}

/** Dictado por voz (Chrome, Edge y Safari). Devuelve null si el navegador no lo permite. */
export function crearDictado(): Reconocimiento | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Reconocimiento; webkitSpeechRecognition?: new () => Reconocimiento }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return null
  const r = new Ctor()
  r.lang = 'es-PE'
  r.interimResults = false
  r.maxAlternatives = 1
  return r
}
