import { NextRequest, NextResponse } from 'next/server'
import { FOOD_DATABASE } from '@/lib/foodDatabase'

type UsdaNutrient = {
  nutrientName?: string
  value?: number
}

type UsdaFood = {
  fdcId?: number
  description?: string
  brandOwner?: string
  brandName?: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients?: UsdaNutrient[]
}

const USDA_SEARCH_CACHE = new Map<string, { expiresAt: number; foods: Record<string, unknown>[] }>()
const USDA_CACHE_TTL_MS = 5 * 60 * 1000

function usdaNutrientValue(food: UsdaFood, names: string[]): number {
  const nutrient = food.foodNutrients?.find(item => names.includes(String(item.nutrientName || '').toLowerCase()))
  const value = Number(nutrient?.value)
  return Number.isFinite(value) ? value : 0
}

function normalizeUsdaFood(food: UsdaFood): Record<string, unknown> | null {
  const sourceFoodId = food.fdcId
  const name = String(food.description || '').trim()
  if (!sourceFoodId || !name) return null

  const servingSize = Number(food.servingSize)
  const servingUnit = String(food.servingSizeUnit || 'g').trim() || 'g'

  return {
    id: `usda_${sourceFoodId}`,
    source: 'usda',
    sourceFoodId: String(sourceFoodId),
    name,
    name_local: null,
    category: 'USDA FoodData Central',
    brand: food.brandOwner || food.brandName || null,
    // FoodData Central search nutrients use a 100 g basis. Keep this base for
    // the existing quantity scaler and retain package servings as source metadata.
    serving_size: 100,
    serving_unit: 'g',
    source_serving_size: Number.isFinite(servingSize) && servingSize > 0 ? servingSize : null,
    source_serving_unit: servingUnit,
    cal: usdaNutrientValue(food, ['energy']),
    protein: usdaNutrientValue(food, ['protein']),
    carb: usdaNutrientValue(food, ['carbohydrate, by difference', 'carbohydrate']),
    fat: usdaNutrientValue(food, ['total lipid (fat)', 'total fat (nlea)']),
    fiber: usdaNutrientValue(food, ['fiber, total dietary', 'dietary fiber']),
    sugar: usdaNutrientValue(food, ['sugars, total including nlea', 'sugars, total']),
    sodium: usdaNutrientValue(food, ['sodium, na']),
    is_indian: false,
  }
}

async function searchUsdaFoods(query: string): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.USDA_API_KEY
  if (!apiKey) return []

  const cacheKey = query.trim().toLowerCase()
  const cached = USDA_SEARCH_CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.foods

  try {
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('query', query)
    url.searchParams.set('pageSize', '10')
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), cache: 'no-store' })
    if (!response.ok) {
      console.warn('[Kayven Food Search] USDA search unavailable', { status: response.status })
      return []
    }

    const payload = await response.json() as { foods?: UsdaFood[] }
    const foods = (payload.foods || [])
      .map(normalizeUsdaFood)
      .filter((food): food is Record<string, unknown> => food !== null)
    USDA_SEARCH_CACHE.set(cacheKey, { foods, expiresAt: Date.now() + USDA_CACHE_TTL_MS })
    return foods
  } catch {
    console.warn('[Kayven Food Search] USDA search request failed')
    return []
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || ''
  const cat = req.nextUrl.searchParams.get('cat') || ''
  const page = Math.max(0, Number.parseInt(req.nextUrl.searchParams.get('page') || '0', 10) || 0)
  const limit = 20

  if (!q && !cat) return NextResponse.json({ results: [] })

  try {
    const needle = q.trim().toLowerCase()
    const localMatches = Object.entries(FOOD_DATABASE)
      .flatMap(([categoryKey, foods]) => foods.map((food, index) => {
        const category = categoryKey.replace(/([A-Z])/g, ' $1').replace(/^./, first => first.toUpperCase())
        return {
          id: `local_${categoryKey}_${index}`,
          name: food.name,
          name_local: null,
          category,
          brand: null,
          cal: food.cal,
          protein: food.protein,
          carb: food.carb,
          fat: food.fat,
          fiber: food.fiber,
          serving_size: food.baseQty,
          serving_unit: food.unit,
          is_indian: categoryKey.toLowerCase().includes('indian'),
        }
      }))
      .filter(food => (!needle || food.name.toLowerCase().includes(needle))
        && (!cat || cat.toLowerCase() === 'all' || food.category.toLowerCase() === cat.toLowerCase()))
      .sort((a, b) => Number(b.is_indian) - Number(a.is_indian) || a.name.localeCompare(b.name))
    const localResults = localMatches.slice(page * limit, (page + 1) * limit)
    let combined: Record<string, unknown>[] = localResults

    // If fewer than 10 local results and has query, also fetch OpenFoodFacts
    if (q && localMatches.length < 10) {
      try {
        const offRes = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,nutriments,serving_size,brands`,
          { signal: AbortSignal.timeout(3000) }
        )
        if (offRes.ok) {
          const offData = await offRes.json()
          const offFoods = (offData.products || [])
            .filter((p: any) => p.product_name && p.nutriments?.['energy-kcal_100g'])
            .slice(0, 10)
            .map((p: any) => ({
              id: 'off_' + p.code,
              name: p.product_name,
              name_local: null,
              category: 'Packaged Foods',
              brand: p.brands || null,
              cal: Math.round(p.nutriments['energy-kcal_100g'] || 0),
              protein: Math.round((p.nutriments['proteins_100g'] || 0) * 10) / 10,
              carb: Math.round((p.nutriments['carbohydrates_100g'] || 0) * 10) / 10,
              fat: Math.round((p.nutriments['fat_100g'] || 0) * 10) / 10,
              fiber: Math.round((p.nutriments['fiber_100g'] || 0) * 10) / 10,
              serving_size: 100,
              serving_unit: 'g',
              is_indian: false,
              source: 'openfoodfacts'
            }))
          combined = [...combined, ...offFoods]
        }
      } catch {}
    }

    if (q && combined.length < 10) {
      const knownNames = new Set(combined.map(food => String(food.name || '').trim().toLowerCase()))
      const usdaFoods = await searchUsdaFoods(q)
      combined = [
        ...combined,
        ...usdaFoods.filter(food => !knownNames.has(String(food.name || '').trim().toLowerCase())),
      ]
    }

    return NextResponse.json({
      results: combined,
      page,
      hasMore: localMatches.length > (page + 1) * limit,
    })
  } catch (err) {
    console.error('[Kayven Food Search] Search failed')
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
