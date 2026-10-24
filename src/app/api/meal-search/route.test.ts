import { NextRequest } from 'next/server'
import { GET } from './route'

export async function runMealSearchTests(): Promise<void> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ products: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  try {
    const search = await GET(new NextRequest('http://localhost/api/meal-search?q=banana'))
    const searchBody = await search.json()
    if (!searchBody.results.some((food: { name: string }) => food.name === 'Banana')) {
      throw new Error('Local food search must return bundled foods without a database table.')
    }

    const category = await GET(new NextRequest('http://localhost/api/meal-search?cat=Fruits'))
    const categoryBody = await category.json()
    if (!categoryBody.results.length || categoryBody.results.some((food: { category: string }) => food.category !== 'Fruits')) {
      throw new Error('Category search must return only matching bundled foods.')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}
