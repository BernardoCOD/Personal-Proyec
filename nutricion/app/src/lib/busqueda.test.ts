import { describe, expect, it } from 'vitest'
import { cantidadInicial, interpretarBusqueda } from './busqueda'

describe('interpretarBusqueda', () => {
  it.each([
    ['plátano frito 100g', 'plátano frito', 100, 'g'],
    ['plátano frito 100 gramos', 'plátano frito', 100, 'g'],
    ['100 g de arroz', 'arroz', 100, 'g'],
    ['2 panes', 'panes', 2, null],
    ['1 taza de arroz cocido', 'arroz cocido', 1, 'taza'],
    ['media palta', 'palta', 0.5, null],
    ['1/2 taza avena', 'avena', 0.5, 'taza'],
    ['pollo 1,5 lb', 'pollo', 1.5, 'lb'],
    ['un huevo', 'huevo', 1, null],
    ['2 unidades de huevo', 'huevo', 2, 'unidad'],
    ['gaseosa 500 ml', 'gaseosa', 500, 'ml'],
    ['agua 1 litro', 'agua', 1000, 'ml'],
    ['arroz', 'arroz', null, null],
    ['arroz con pollo', 'arroz con pollo', null, null],
    ['quinua 3 cucharadas', 'quinua', 3, 'cucharada'],
  ])('%s', (entrada, texto, cantidad, unidad) => {
    expect(interpretarBusqueda(entrada)).toEqual({ texto, cantidad, unidad })
  })
})

describe('cantidadInicial', () => {
  const pan = [{ nombre: 'unidad (panadería)', gramos: 32 }, { nombre: 'unidad (supermercado)', gramos: 62.3 }]
  const huevo = [{ nombre: 'unidad pequeña', gramos: 51.8 }, { nombre: 'unidad mediana', gramos: 59.9 }, { nombre: 'unidad grande', gramos: 67.7 }]
  const arroz = [{ nombre: 'cucharada', gramos: 17.8 }, { nombre: 'taza', gramos: 193.2 }]

  it('sin datos: primera porción o 100 g', () => {
    expect(cantidadInicial({ cantidad: null, unidad: null }, pan)).toEqual({ cantidad: 1, unidad: 'unidad (panadería)' })
    expect(cantidadInicial({ cantidad: null, unidad: null }, [])).toEqual({ cantidad: 100, unidad: 'g' })
  })
  it('unidad fija', () => {
    expect(cantidadInicial({ cantidad: 100, unidad: 'g' }, pan)).toEqual({ cantidad: 100, unidad: 'g' })
  })
  it('porción casera', () => {
    expect(cantidadInicial({ cantidad: 1, unidad: 'taza' }, arroz)).toEqual({ cantidad: 1, unidad: 'taza' })
    expect(cantidadInicial({ cantidad: 2, unidad: 'unidad' }, huevo)).toEqual({ cantidad: 2, unidad: 'unidad mediana' })
  })
  it('solo número: porciones si es poco, gramos si es mucho', () => {
    expect(cantidadInicial({ cantidad: 2, unidad: null }, pan)).toEqual({ cantidad: 2, unidad: 'unidad (panadería)' })
    expect(cantidadInicial({ cantidad: 150, unidad: null }, arroz)).toEqual({ cantidad: 150, unidad: 'g' })
    expect(cantidadInicial({ cantidad: 3, unidad: null }, [])).toEqual({ cantidad: 3, unidad: 'g' })
  })
  it('porción que el alimento no tiene: usa su primera porción', () => {
    expect(cantidadInicial({ cantidad: 2, unidad: 'taza' }, pan)).toEqual({ cantidad: 2, unidad: 'unidad (panadería)' })
  })
})
