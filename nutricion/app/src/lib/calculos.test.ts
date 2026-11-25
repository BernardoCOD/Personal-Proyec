import { describe, expect, it } from 'vitest'
import {
  calcularEdad,
  calcularMetas,
  calcularPlan,
  caloriasActividad,
  gastoDiario,
  metabolismoBasal,
  nivelSugerido,
} from './calculos'
import { aGramos, macrosDeGramos, por100gDeTotales } from './unidades'
import { esFechaValida, fechaEnZona, lunesDeLaSemana, rangoDelDia, sumarDias } from './fechas'

describe('calcularEdad', () => {
  it('cuenta los años cumplidos', () => {
    expect(calcularEdad('1998-05-10', '2026-11-25')).toBe(28)
    expect(calcularEdad('1998-11-25', '2026-11-25')).toBe(28)
    expect(calcularEdad('1998-11-26', '2026-11-25')).toBe(27)
  })
})

describe('metabolismoBasal (Mifflin-St Jeor)', () => {
  it('hombre: 10×peso + 6.25×talla − 5×edad + 5', () => {
    // 10×80 + 6.25×175 − 5×30 + 5 = 800 + 1093.75 − 150 + 5
    expect(metabolismoBasal({ sexo: 'masculino', pesoKg: 80, tallaCm: 175, edad: 30 })).toBeCloseTo(1748.75)
  })
  it('mujer: lo mismo − 161', () => {
    expect(metabolismoBasal({ sexo: 'femenino', pesoKg: 60, tallaCm: 165, edad: 25 })).toBeCloseTo(1345.25)
  })
})

describe('gastoDiario', () => {
  it('multiplica por el factor de actividad', () => {
    expect(gastoDiario(1000, 'sedentario')).toBeCloseTo(1200)
    expect(gastoDiario(1000, 'moderado')).toBeCloseTo(1550)
    expect(gastoDiario(1000, 'extremo')).toBeCloseTo(1900)
  })
})

describe('calcularMetas', () => {
  it('las macros suman aproximadamente las calorías', () => {
    for (const obj of ['ganar_musculo', 'mantener', 'bajar_grasa'] as const) {
      const m = calcularMetas(2500, 75, obj)
      const kcal = m.proteinaG * 4 + m.carbohidratosG * 4 + m.grasasG * 9
      expect(Math.abs(kcal - m.calorias)).toBeLessThan(15)
    }
  })
  it('superávit para ganar músculo y déficit para bajar grasa', () => {
    expect(calcularMetas(2500, 75, 'ganar_musculo').calorias).toBe(2750)
    expect(calcularMetas(2500, 75, 'mantener').calorias).toBe(2500)
    expect(calcularMetas(2500, 75, 'bajar_grasa').calorias).toBe(2000)
  })
  it('proteína por kg de peso', () => {
    expect(calcularMetas(2500, 75, 'ganar_musculo').proteinaG).toBe(150)
  })
  it('nunca baja de 1200 kcal', () => {
    expect(calcularMetas(1300, 45, 'bajar_grasa').calorias).toBe(1200)
  })
})

describe('calcularPlan', () => {
  it('combina todo', () => {
    const p = calcularPlan(
      { sexo: 'masculino', fechaNacimiento: '1996-01-01', tallaCm: 175, pesoKg: 80, nivel: 'moderado', objetivo: 'mantener' },
      '2026-06-01',
    )
    expect(p.edad).toBe(30)
    expect(p.tmb).toBe(1749)
    expect(p.gasto).toBe(Math.round(1748.75 * 1.55))
    expect(p.metas.calorias).toBe(2710)
  })
})

describe('nivelSugerido', () => {
  it('según días de gimnasio', () => {
    expect(nivelSugerido(0)).toBe('sedentario')
    expect(nivelSugerido(2)).toBe('ligero')
    expect(nivelSugerido(4)).toBe('moderado')
    expect(nivelSugerido(5)).toBe('muy_activo')
    expect(nivelSugerido(7)).toBe('extremo')
  })
})

describe('caloriasActividad', () => {
  it('MET × peso × horas', () => {
    expect(caloriasActividad(80, 60, 'alta')).toBe(640)
    expect(caloriasActividad(80, 30, 'moderada')).toBe(200)
  })
})

describe('unidades', () => {
  const porciones = [{ nombre: 'taza', gramos: 160 }]
  it('convierte unidades fijas', () => {
    expect(aGramos(200, 'g')).toBe(200)
    expect(aGramos(1, 'lb')).toBe(453.59)
    expect(aGramos(2, 'oz')).toBe(56.7)
    expect(aGramos(0.5, 'kg')).toBe(500)
  })
  it('usa las porciones del alimento', () => {
    expect(aGramos(1.5, 'taza', porciones)).toBe(240)
  })
  it('rechaza unidades desconocidas y cantidades no positivas', () => {
    expect(aGramos(1, 'plato', porciones)).toBeNull()
    expect(aGramos(0, 'g')).toBeNull()
    expect(aGramos(1, 'toString')).toBeNull()
  })
  it('calcula macros y vuelve a 100 g', () => {
    const arroz = { calorias: 130, proteina_g: 2.7, carbohidratos_g: 28.2, grasa_g: 0.3, fibra_g: 0.4 }
    const m = macrosDeGramos(arroz, 200)
    expect(m).toEqual({ calorias: 260, proteina_g: 5.4, carbohidratos_g: 56.4, grasa_g: 0.6, fibra_g: 0.8 })
    expect(por100gDeTotales(m, 200)).toEqual(arroz)
  })
})

describe('fechas', () => {
  it('valida AAAA-MM-DD', () => {
    expect(esFechaValida('2026-11-25')).toBe(true)
    expect(esFechaValida('2026-02-30')).toBe(false)
    expect(esFechaValida('25/11/2026')).toBe(false)
  })
  it('fecha en Lima', () => {
    // 03:00 UTC del 26 = 22:00 del 25 en Lima
    expect(fechaEnZona(new Date('2026-11-26T03:00:00Z'), 'America/Lima')).toBe('2026-11-25')
  })
  it('rango del día en Lima (UTC−5)', () => {
    expect(rangoDelDia('2026-11-25', 'America/Lima')).toEqual({
      desde: '2026-11-25T05:00:00.000Z',
      hasta: '2026-11-26T05:00:00.000Z',
    })
  })
  it('suma días y cruza meses', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('lunes de la semana', () => {
    expect(lunesDeLaSemana('2026-11-25')).toBe('2026-11-23') // miércoles
    expect(lunesDeLaSemana('2026-11-23')).toBe('2026-11-23')
    expect(lunesDeLaSemana('2026-11-29')).toBe('2026-11-23') // domingo
  })
})
