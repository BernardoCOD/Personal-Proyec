import { describe, expect, it } from 'vitest'
import { diasEntre, mensajeComparacion, parInicial, proximaFoto, type FotoInfo } from './fotos'

const f = (id: string, fecha: string, vista: FotoInfo['vista'] = 'frente', peso_kg: number | null = null): FotoInfo => ({ id, fecha, vista, peso_kg })

describe('fotos de progreso', () => {
  it('días entre fechas', () => {
    expect(diasEntre('2026-11-01', '2026-11-29')).toBe(28)
    expect(diasEntre('2026-11-29', '2026-11-01')).toBe(-28)
  })

  it('próxima foto: hoy si no hay ninguna; 4 semanas después de la última', () => {
    expect(proximaFoto([], '2026-11-28')).toEqual({ fecha: '2026-11-28', toca: true, diasFaltan: 0 })
    expect(proximaFoto([f('a', '2026-11-01'), f('b', '2026-11-20')], '2026-11-28')).toEqual({ fecha: '2026-12-18', toca: false, diasFaltan: 20 })
    expect(proximaFoto([f('a', '2026-10-01')], '2026-11-28')).toMatchObject({ fecha: '2026-10-29', toca: true, diasFaltan: 0 })
  })

  it('par inicial: primera y última de la vista con más fotos', () => {
    const fotos = [f('1', '2026-09-01'), f('2', '2026-11-01'), f('3', '2026-10-01'), f('p1', '2026-09-01', 'perfil')]
    expect(parInicial(fotos)).toEqual({ antes: fotos[0], despues: fotos[1] })
    expect(parInicial([f('1', '2026-09-01'), f('p', '2026-10-01', 'perfil')])).toBeNull()
  })

  it('mensajes según el tiempo y el peso', () => {
    expect(mensajeComparacion(f('a', '2026-11-25'), f('b', '2026-11-28'))).toMatch(/muy cercanas/)
    expect(mensajeComparacion(f('a', '2026-11-10'), f('b', '2026-11-28'))).toMatch(/Van 18 días/)
    expect(mensajeComparacion(f('a', '2026-09-01', 'frente', 74), f('b', '2026-11-24', 'frente', 71.2))).toBe('12 semanas de constancia entre estas dos fotos. Tu peso cambió -2.8 kg.')
    expect(mensajeComparacion(f('a', '2026-09-01', 'frente', 72), f('b', '2026-11-24', 'frente', 72.2))).toMatch(/la báscula no/)
  })
})
