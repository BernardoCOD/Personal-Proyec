import { describe, expect, it } from 'vitest'
import { calcularRacha, estadoDia, resumirSemana, ultimasSemanas, type DiaResumen, type EstadoDia } from './racha'

const dia = (fecha: string, secciones: number, calorias: number, proteina_g: number): DiaResumen => ({
  fecha, secciones, calorias, proteina_g, carbohidratos_g: 0, grasa_g: 0, meta_calorias: 2000, meta_proteina_g: 150,
})

describe('estadoDia', () => {
  it('vacío con menos de 2 comidas', () => {
    expect(estadoDia(undefined)).toBe('vacio')
    expect(estadoDia(dia('2026-11-27', 1, 2000, 150))).toBe('vacio')
  })
  it('cumplido: kcal ±10 % y proteína ≥ 90 %', () => {
    expect(estadoDia(dia('2026-11-27', 3, 2000, 150))).toBe('cumplido')
    expect(estadoDia(dia('2026-11-27', 2, 1800, 135))).toBe('cumplido')
    expect(estadoDia(dia('2026-11-27', 2, 2200, 200))).toBe('cumplido')
  })
  it('registrado si se pasa, se queda corto o falta proteína', () => {
    expect(estadoDia(dia('2026-11-27', 3, 2300, 150))).toBe('registrado')
    expect(estadoDia(dia('2026-11-27', 3, 1500, 150))).toBe('registrado')
    expect(estadoDia(dia('2026-11-27', 3, 2000, 120))).toBe('registrado')
  })
  it('sin meta: solo registrado', () => {
    expect(estadoDia({ ...dia('2026-11-27', 3, 2000, 150), meta_calorias: null })).toBe('registrado')
  })
})

describe('calcularRacha', () => {
  const m = (pares: [string, EstadoDia][]) => new Map(pares)
  const estados = m([
    ['2026-11-20', 'cumplido'], ['2026-11-21', 'cumplido'], ['2026-11-22', 'cumplido'], ['2026-11-23', 'vacio'],
    ['2026-11-24', 'registrado'], ['2026-11-25', 'cumplido'], ['2026-11-26', 'cumplido'], ['2026-11-27', 'registrado'],
  ])
  it('cuenta hasta hoy si hoy ya cumple', () => {
    expect(calcularRacha(estados, '2026-11-27', '2026-11-01', 'registro')).toEqual({ actual: 4, mejor: 4, hoyCuenta: true })
  })
  it('hoy en curso no rompe la racha: cuenta desde ayer', () => {
    expect(calcularRacha(estados, '2026-11-27', '2026-11-01', 'cumplimiento')).toEqual({ actual: 2, mejor: 3, hoyCuenta: false })
    expect(calcularRacha(estados, '2026-11-28', '2026-11-01', 'registro')).toEqual({ actual: 4, mejor: 4, hoyCuenta: false })
  })
  it('un día vacío pasado sí la rompe', () => {
    expect(calcularRacha(estados, '2026-11-29', '2026-11-01', 'registro').actual).toBe(0)
  })
})

describe('semanas', () => {
  const porFecha = new Map([
    ['2026-11-23', dia('2026-11-23', 3, 2000, 150)], // lunes, cumplido
    ['2026-11-24', dia('2026-11-24', 2, 2400, 150)], // registrado (120 %)
    ['2026-11-26', dia('2026-11-26', 1, 900, 40)],   // vacío (1 comida)
  ])
  it('resume la semana en curso hasta hoy', () => {
    const s = resumirSemana(porFecha, '2026-11-23', '2026-11-26')
    expect(s).toMatchObject({ dias: 4, registrados: 2, cumplidos: 1, caloriasPct: 110, proteinaPct: 100 })
    expect(s.estados).toEqual(['cumplido', 'registrado', 'vacio', 'vacio', 'vacio', 'vacio', 'vacio'])
  })
  it('últimas semanas, de la más antigua a la actual', () => {
    const ss = ultimasSemanas(porFecha, '2026-11-26', 3)
    expect(ss.map((s) => s.lunes)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
    expect(ss[0]).toMatchObject({ dias: 7, registrados: 0, caloriasPct: null })
  })
})
