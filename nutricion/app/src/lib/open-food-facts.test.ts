import { describe, expect, it } from 'vitest'
import { esCodigoBarras, productoDesdeOFF } from './open-food-facts'

describe('productoDesdeOFF', () => {
  it('toma nombre en español, marca y valores por 100 g', () => {
    const r = productoDesdeOFF('7750885006513', {
      status: 1,
      product: {
        product_name: 'Evaporated milk', product_name_es: 'Leche evaporada', brands: 'Gloria, Grupo Gloria',
        serving_quantity: '30', image_front_small_url: 'https://images.openfoodfacts.org/x.jpg',
        nutriments: { 'energy-kcal_100g': 133, proteins_100g: 6.4, carbohydrates_100g: 9.6, fat_100g: '7,6', fiber_100g: 0 },
      },
    })
    expect(r).toEqual({
      codigo: '7750885006513', nombre: 'Leche evaporada', marca: 'Gloria', calorias: 133, proteina_g: 6.4,
      carbohidratos_g: 9.6, grasa_g: 7.6, fibra_g: 0, porcionGramos: 30, imagen: 'https://images.openfoodfacts.org/x.jpg',
    })
  })
  it('calcula kcal desde kJ si falta', () => {
    expect(productoDesdeOFF('123456', { status: 1, product: { product_name: 'X', nutriments: { energy_100g: 418.4 } } })?.calorias).toBe(100)
  })
  it('datos que faltan quedan en null', () => {
    const r = productoDesdeOFF('123456', { status: 1, product: { nutriments: {} } })
    expect(r).toMatchObject({ nombre: 'Producto 123456', calorias: null, proteina_g: null, porcionGramos: null })
  })
  it('producto inexistente', () => {
    expect(productoDesdeOFF('123456', { status: 0, status_verbose: 'product not found' })).toBeNull()
    expect(productoDesdeOFF('123456', null)).toBeNull()
  })
})

describe('esCodigoBarras', () => {
  it('acepta EAN/UPC y rechaza lo demás', () => {
    expect(esCodigoBarras('7750885006513')).toBe(true)
    expect(esCodigoBarras('12345')).toBe(false)
    expect(esCodigoBarras('77508850abc')).toBe(false)
  })
})
