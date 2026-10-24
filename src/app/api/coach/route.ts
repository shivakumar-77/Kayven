import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/server/supabase'
import { getKayvenIntelligenceContext } from '@/lib/server/kayven-intelligence-context'
import {
  classifyKayvenIntent,
  getDefaultReadTools,
  getKAYVENMemory,
  attemptDeterministicToolResponse,
} from '@/lib/server/kayven-intelligence-engine'
import { validateKAYVENSafety } from '@/lib/server/kayven-safety'
import {
  generateKayvenAIResponse,
  shouldPreferAIResponse,
} from '@/lib/server/kayven-brain/ai-chat'
import {
  understandKayvenConversation,
} from '@/lib/server/kayven-brain/conversation-brain'
import {
  composeKAYVENResponse,
} from '@/lib/server/kayven-brain/response-composer'
import {
  globalKAYVENCostTracker,
  createCostMetadata,
} from '@/lib/server/kayven-cost-tracking'
import { extractMemoryCandidates } from '@/lib/server/kayven-memory-extractor'
import { processMemoryCandidates } from '@/lib/server/kayven-memory-manager'
import { runMeteredAI } from '@/lib/billing/server'
import { meteredAIFailureResponse } from '@/lib/server/ai-quota-response'
import { isValidAIIdempotencyKey } from '@/lib/server/ai-idempotency'
import type {
  KAYVENAIRequest,
  KAYVENAIResponse,
  KAYVENMessage,
  KAYVENIntent,
} from '@/lib/server/kayven-ai'

export const dynamic = 'force-dynamic'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function isShortContextualFollowUp(
  message: string,
  brainDecision: any,
): boolean {
  const text = message.trim().toLowerCase()

  const shortFollowUp =
    text.length <= 40 &&
    /^(why|how|what about that|what about it|is that enough|really|then what|and|so|explain|why though)\??$/i.test(
      text,
    )

  return Boolean(
    shortFollowUp ||
    brainDecision?.resolvedReferences?.length > 0,
  )
}

function getResolvedCoachMessage(
  message: string,
  conversation: ChatMessage[],
  brainDecision: any,
): string {
  if (!isShortContextualFollowUp(message, brainDecision)) {
    return message
  }

  const previousTurns = conversation
    .slice(0, -1)
    .slice(-4)
    .map(
      item =>
        `${item.role === 'user' ? 'User' : 'KAYVEN'}: ${item.content}`,
    )
    .join('\n')

  if (!previousTurns) {
    return message
  }

  return `${message}

The user is asking this as a follow-up to the conversation below. Resolve the reference and answer the actual underlying question naturally. Do not say you cannot understand the context if the answer is present below.

Conversation context:
${previousTurns}`
}

function shouldPreferKAYVENComposer(
  message: string,
  brainDecision: any,
): boolean {
  if (isShortContextualFollowUp(message, brainDecision)) {
    return true
  }

  if (brainDecision?.complexity === 'complex') {
    return true
  }

  const analyticalIntent =
    /why|progress|trend|plateau|losing weight|not losing|compare|analyse|analyze|reason/i.test(
      message,
    )

  return Boolean(
    brainDecision?.needsUserData &&
    (brainDecision?.complexity === 'moderate' ||
      analyticalIntent),
  )
}

function contextRange(message: string): 'today' | '7d' | '30d' {
  if (/weight|lose|losing|trend|progress|month|30 day|30-day/i.test(message)) {
    return '30d'
  }

  if (/week|weekly|workout|training|consistent/i.test(message)) {
    return '7d'
  }

  return 'today'
}

function formatNumber(value: unknown, digits = 0): string | null {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return null
  }

  return number.toFixed(digits)
}

function getTodayMetrics(context: any) {
  return {
    calories: Number(context?.nutrition?.today?.calories),
    protein: Number(context?.nutrition?.today?.proteinG),
    carbs: Number(context?.nutrition?.today?.carbsG),
    fat: Number(context?.nutrition?.today?.fatG),
    fiber: Number(context?.nutrition?.today?.fiberG),
    waterMl: Number(context?.hydration?.todayMl),

    calorieTarget: Number(context?.user?.goals?.calorieTarget),
    proteinTarget: Number(context?.user?.goals?.proteinTargetG),
    waterTarget: Number(context?.hydration?.targetMl),

    currentWeight: Number(
      context?.body?.currentWeightKg ??
      context?.body?.weightKg
    ),

    goalWeight: Number(context?.user?.goals?.weightGoalKg),
  }
}


type ExtractedBodyProfile = {
  currentWeightKg: number | null
  goalWeightKg: number | null
  heightCm: number | null
  age: number | null
}

function extractBodyProfileFromMessage(message: string): ExtractedBodyProfile {
  const normalized = message.toLowerCase().replace(/\s+/g, ' ')

  let currentWeightKg: number | null = null
  let goalWeightKg: number | null = null
  let heightCm: number | null = null
  let age: number | null = null

  const currentWeightPatterns = [
    /(?:i am|i'm|my weight is|currently|current weight)\s*(?:about |around )?(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)/i,
    /(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)\s*(?:weight|currently|now)/i,
  ]

  for (const pattern of currentWeightPatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value >= 30 && value <= 350) {
        currentWeightKg = value
        break
      }
    }
  }

  const goalWeightPatterns = [
    /(?:goal weight|goal|target weight|target)\s*(?:is|of|weight)?\s*(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)/i,
    /(?:lose weight to|get to|reach)\s*(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)/i,
  ]

  for (const pattern of goalWeightPatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value >= 30 && value <= 250) {
        goalWeightKg = value
        break
      }
    }
  }

  const heightMatch =
    normalized.match(/(\d{3}(?:\.\d+)?)\s*(?:cm|cms|centimeters?)/i)

  if (heightMatch?.[1]) {
    const value = Number(heightMatch[1])
    if (Number.isFinite(value) && value >= 100 && value <= 250) {
      heightCm = value
    }
  }

  const agePatterns = [
    /(?:age|aged)\s*(?:is)?\s*(\d{1,2})/i,
    /(\d{1,2})\s*(?:years?\s*old|year old|yo)\b/i,
  ]

  for (const pattern of agePatterns) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value >= 13 && value <= 100) {
        age = value
        break
      }
    }
  }

  return {
    currentWeightKg,
    goalWeightKg,
    heightCm,
    age,
  }
}

function isProteinRecommendationQuestion(message: string): boolean {
  const normalized = message.toLowerCase()

  const mentionsProtein = /\bprotein\b/.test(normalized)

  const asksRecommendation =
    /how much|how many|should i take|should i eat|do i need|need per day|daily|recommend|target/.test(normalized)

  return mentionsProtein && asksRecommendation
}

function buildProteinRecommendation(
  message: string,
  context: any,
): KAYVENAIResponse {
  const extracted = extractBodyProfileFromMessage(message)

  const loggedCurrentWeight = Number(
    context?.body?.currentWeightKg ??
    context?.body?.weightKg
  )

  const loggedGoalWeight = Number(
    context?.user?.goals?.weightGoalKg
  )

  const currentWeightKg =
    extracted.currentWeightKg ??
    (Number.isFinite(loggedCurrentWeight) ? loggedCurrentWeight : null)

  const goalWeightKg =
    extracted.goalWeightKg ??
    (Number.isFinite(loggedGoalWeight) ? loggedGoalWeight : null)

  /*
   * For users with substantial weight to lose, use goal weight
   * as a practical protein reference rather than blindly
   * multiplying protein by the full current body weight.
   *
   * Range:
   * 1.6–2.2 g/kg of practical reference weight.
   */

  const referenceWeightKg =
    goalWeightKg ??
    currentWeightKg

  if (!referenceWeightKg) {
    return {
      text:
        'To calculate a personalised protein target, tell me your current weight, goal weight, and whether your main goal is fat loss, muscle gain, or maintenance.',
      safetyStatus: 'allowed',
      provider: {
        name: 'custom',
        model: 'kayven-local-intelligence',
      },
      suggestedActions: [],
      metadata: {
        usedAI: false,
        provider: 'custom',
        intent: 'nutrition_question',
        executionPath: 'deterministic_tool',
      },
    }
  }

  const lowerProtein = Math.round(referenceWeightKg * 1.6)
  const upperProtein = Math.round(referenceWeightKg * 2.2)
  const practicalTarget = Math.round(referenceWeightKg * 2)

  const loggedProteinTarget = Number(
    context?.user?.goals?.proteinTargetG
  )

  const currentWeightText =
    currentWeightKg
      ? `${currentWeightKg.toFixed(1)} kg`
      : 'your current weight'

  const goalWeightText =
    goalWeightKg
      ? `${goalWeightKg.toFixed(1)} kg`
      : null

  let text =
    `For your goal, a practical daily protein range is approximately ${lowerProtein}–${upperProtein} g per day. ` +
    `A strong starting target is around ${practicalTarget} g per day.`

  if (goalWeightText && currentWeightKg) {
    text +=
      ` Since you are currently ${currentWeightText} and aiming for ${goalWeightText}, KAYVEN is using your goal weight as the practical protein reference instead of multiplying by your full current body weight.`
  }

  if (
    Number.isFinite(loggedProteinTarget) &&
    loggedProteinTarget > 0
  ) {
    const difference = Math.abs(loggedProteinTarget - practicalTarget)

    if (difference <= 20) {
      text +=
        ` Your current KAYVEN target of ${Math.round(loggedProteinTarget)} g is already close to this practical target.`
    } else {
      text +=
        ` Your current KAYVEN target is ${Math.round(loggedProteinTarget)} g, so you may want to review whether that target matches your current fat-loss plan and training level.`
    }
  }

  text +=
    ' Spread your protein across your meals and focus on consistency rather than trying to hit the maximum possible amount every day.'

  return {
    text,
    safetyStatus: 'allowed',
    provider: {
      name: 'custom',
      model: 'kayven-local-intelligence',
    },
    suggestedActions: [
      'Check protein target',
      'Log your next meal',
    ],
    metadata: {
      usedAI: false,
      provider: 'custom',
      intent: 'nutrition_question',
      executionPath: 'deterministic_tool',
    },
  }
}


function buildLocalCoachResponse(
  message: string,
  intent: KAYVENIntent,
  context: any,
  safetyStatus: 'allowed' | 'constrained' | 'escalate',
): KAYVENAIResponse {
  if (isProteinRecommendationQuestion(message)) {
    return buildProteinRecommendation(message, context)
  }

  const metrics = getTodayMetrics(context)

  const calories = formatNumber(metrics.calories)
  const calorieTarget = formatNumber(metrics.calorieTarget)

  const protein = formatNumber(metrics.protein, 1)
  const proteinTarget = formatNumber(metrics.proteinTarget, 1)

  const waterLitres =
    Number.isFinite(metrics.waterMl)
      ? formatNumber(metrics.waterMl / 1000, 1)
      : null

  const waterTargetLitres =
    Number.isFinite(metrics.waterTarget)
      ? formatNumber(metrics.waterTarget / 1000, 1)
      : null

  const currentWeight = formatNumber(metrics.currentWeight, 1)
  const goalWeight = formatNumber(metrics.goalWeight, 1)

  let text = ''
  const suggestedActions: string[] = []

  if (safetyStatus === 'escalate') {
    text =
      'I can help with general health and fitness information, but this situation may need immediate professional medical attention. Please contact emergency services or a qualified healthcare professional as soon as possible.'

    return {
      text,
      safetyStatus,
      provider: {
        name: 'custom',
        model: 'kayven-local-intelligence',
      },
      suggestedActions,
      metadata: {
        usedAI: false,
        provider: 'custom',
        intent,
        executionPath: 'local_intelligence',
      },
    }
  }

  switch (intent) {
    case 'nutrition_question':
      text =
        `Based on your logged nutrition today, you have consumed ${
          calories ?? 'an unknown amount of'
        } calories${
          calorieTarget ? ` out of your ${calorieTarget} calorie target` : ''
        }. ` +
        `${
          protein
            ? `Your protein intake is currently ${protein} g${
                proteinTarget ? ` out of a ${proteinTarget} g target` : ''
              }. `
            : 'I do not have enough protein data logged yet. '
        }` +
        'Keep your next meal focused on foods that help close the biggest gap in your daily targets.'

      suggestedActions.push('Log your next meal')
      break

    case 'hydration':
      text =
        waterLitres
          ? `You have logged approximately ${waterLitres} L of water today${
              waterTargetLitres
                ? `, with a daily target of ${waterTargetLitres} L`
                : ''
            }. Keep drinking gradually through the day rather than trying to consume a large amount at once.`
          : 'I do not have enough hydration data logged yet. Log your water intake and I can track your progress against your target.'

      suggestedActions.push('Log water intake')
      break

    case 'weight_loss_question':
    case 'progress_question':
      text =
        currentWeight
          ? `Your currently available weight data shows approximately ${currentWeight} kg${
              goalWeight ? `, with a goal of ${goalWeight} kg` : ''
            }. Focus on the long-term trend rather than individual daily fluctuations. Consistent nutrition, protein intake, training, activity, and sleep matter more than a single weigh-in.`
          : 'I do not have enough current weight data to evaluate your progress yet. Log a few consistent weigh-ins and I can help identify your trend.'

      suggestedActions.push('Check weight progress')
      break

    case 'workout_question':
      text =
        'For your workout progress, consistency and progressive overload matter most. Make sure your training matches your current recovery level, and avoid making major changes based on a single workout. Log your workout so KAYVEN can use your actual training history for future recommendations.'

      suggestedActions.push('Log a workout')
      break

    case 'supplements':
      text =
        'Supplements should support your nutrition and training rather than replace them. Track what you take, the dosage, and timing so your supplement history stays consistent. For medical conditions, prescription interactions, or unusually high doses, check with a qualified healthcare professional.'

      suggestedActions.push('Check supplements')
      break

    case 'meal_planning':
      text =
        `The best meal plan for today should be based on your remaining nutrition targets. ${
          protein && proteinTarget && protein < proteinTarget
            ? `Protein is currently ${protein} g, so prioritising a protein-rich next meal may be useful. `
            : ''
        }Use your logged meals and targets to decide what you still need rather than following a generic plan blindly.`

      suggestedActions.push('Open meal planner')
      break

    case 'activity_steps':
      text =
        'I will only make a step recommendation when reliable step data and a step target are available in your KAYVEN context. Right now, I do not want to invent activity numbers that are not actually logged.'

      suggestedActions.push('Check activity tracking')
      break

    case 'general_conversation':
      text =
        'I am KAYVEN, your nutrition and fitness intelligence system. I use your logged nutrition, hydration, body, goals, workouts, and progress data when it is available. Ask me about your calories, protein, weight progress, meals, workouts, hydration, supplements, or fitness goals.'

      break

    default:
      text =
        'I can help you understand your KAYVEN data and make practical nutrition and fitness decisions. Ask me about calories, protein, meals, hydration, weight progress, workouts, supplements, or your current goals.'

      break
  }

  return {
    text,
    safetyStatus,
    provider: {
      name: 'custom',
      model: 'kayven-local-intelligence',
    },
    suggestedActions,
    metadata: {
      usedAI: false,
      provider: 'custom',
      intent,
      executionPath: 'local_intelligence',
    },
  }
}

async function loadConversationHistory(
  supabase: any,
  userId: string,
  conversationId?: string | null,
  clientMessages?: any[],
) {
  const normalized: ChatMessage[] = Array.isArray(clientMessages)
    ? clientMessages
        .filter(
          (item: any) =>
            (item?.role === 'user' || item?.role === 'assistant') &&
            typeof item?.content === 'string',
        )
        .slice(-8)
        .map((item: any) => ({
          role: item.role,
          content: item.content.slice(0, 1200),
        }))
    : []

  if (normalized.length > 0) {
    return normalized
  }

  if (!conversationId) {
    return []
  }

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('role,content')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(20)

    if (error) {
      return []
    }

    return (data || [])
      .map((row: any) => ({
        role: row.role,
        content: String(row.content || '').slice(0, 1200),
      }))
      .filter(
        (row: ChatMessage) =>
          row.role === 'user' || row.role === 'assistant',
      )
  } catch {
    return []
  }
}

async function ensureConversation(
  supabase: any,
  userId: string,
  conversationId?: string | null,
  title?: string,
) {
  if (!conversationId) {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          user_id: userId,
          title: title || 'KAYVEN Coach',
        })
        .select('id')
        .single()

      if (!error && data?.id) {
        return data.id
      }
    } catch {
      return null
    }

    return null
  }

  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!error && data?.id) {
      return data.id
    }

    if (error) {
      return null
    }
  } catch {
    return null
  }

  return null
}

async function persistConversationTurn(
  supabase: any,
  userId: string,
  conversationId: string | null,
  userMessage: string,
  assistantMessage: string,
) {
  const effectiveConversationId = await ensureConversation(
    supabase,
    userId,
    conversationId,
    userMessage.slice(0, 80),
  )

  if (!effectiveConversationId) {
    return null
  }

  try {
    await supabase.from('messages').insert([
      {
        conversation_id: effectiveConversationId,
        user_id: userId,
        role: 'user',
        content: userMessage.slice(0, 1200),
      },
      {
        conversation_id: effectiveConversationId,
        user_id: userId,
        role: 'assistant',
        content: assistantMessage.slice(0, 1200),
      },
    ])

    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
      })
      .eq('id', effectiveConversationId)
  } catch {
    return null
  }

  return effectiveConversationId
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const message =
      typeof body?.message === 'string'
        ? body.message.trim()
        : ''

    const messages =
      Array.isArray(body?.messages)
        ? body.messages
        : []

    const conversationId =
      typeof body?.conversationId === 'string' &&
      body.conversationId.trim()
        ? body.conversationId.trim()
        : null

    if (!message || message.length > 1200) {
      return NextResponse.json(
        {
          error:
            'Please enter a question under 1,200 characters.',
        },
        { status: 400 },
      )
    }

    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Please sign in to use KAYVEN Coach.',
        },
        { status: 401 },
      )
    }
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!isValidAIIdempotencyKey(idempotencyKey)) {
      return NextResponse.json({ error: 'AI_IDEMPOTENCY_KEY_REQUIRED' }, { status: 400 })
    }

    const conversation = await loadConversationHistory(
      supabase,
      user.id,
      conversationId,
      messages,
    )

    conversation.push({
      role: 'user',
      content: message,
    })

    const intent = classifyKayvenIntent(message)

    const brainDecision =
      understandKayvenConversation(
        message,
        intent,
        conversation,
      )

    let range = contextRange(message)

    if (
      brainDecision.complexity === 'complex' &&
      brainDecision.needsUserData
    ) {
      range = '30d'
    } else if (
      brainDecision.complexity === 'moderate' &&
      brainDecision.needsUserData &&
      range === 'today'
    ) {
      range = '7d'
    }

    const memoryExtraction = extractMemoryCandidates(message)
    let memoryOperations = {
      memoriesExtracted: memoryExtraction.candidates.length,
      memoriesStored: 0,
      memoriesRejected: 0,
      memoryDuplicates: 0,
      memoryConflicts: 0,
    }

    try {
      memoryOperations = await processMemoryCandidates(
        supabase,
        user.id,
        memoryExtraction.candidates,
      )
    } catch {
      memoryOperations.memoriesRejected = memoryExtraction.candidates.length
    }

    globalKAYVENCostTracker.recordMemoryOperations(memoryOperations)

    const context =
      await getKayvenIntelligenceContext(
        supabase,
        user.id,
        { range },
      )

    const memory = getKAYVENMemory(context as any)

    const resolvedMessage =
      getResolvedCoachMessage(
        message,
        conversation,
        brainDecision,
      )

    const preferComposer =
      shouldPreferKAYVENComposer(
        message,
        brainDecision,
      )

    const safety = validateKAYVENSafety(message)

    console.info(
      '[KAYVEN Brain] Conversation understood',
      {
        intent: brainDecision.intent,
        confidence: brainDecision.confidence,
        complexity: brainDecision.complexity,
        responseStrategy:
          brainDecision.responseStrategy,
        needsUserData:
          brainDecision.needsUserData,
        requiredData:
          brainDecision.requiredData,
        resolvedReferences:
          brainDecision.resolvedReferences.length,
        shouldAskClarification:
          brainDecision.shouldAskClarification,
        range,
        memoryStored: memoryOperations.memoriesStored,
        memoryRejected: memoryOperations.memoriesRejected,
        memoryDuplicates: memoryOperations.memoryDuplicates,
        memoryConflicts: memoryOperations.memoryConflicts,
      },
    )

    const kyRequest: KAYVENAIRequest = {
      user: {
        id: user.id,
        email: user.email || null,
        displayName:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          null,
      },

      message: resolvedMessage,

      conversationId,

      context: {
        ...context,
        memory,
      },

      conversationHistory: conversation.map(
        (item: ChatMessage) =>
          ({
            role: item.role,
            content: item.content,
          }) as KAYVENMessage,
      ),

      availableTools: getDefaultReadTools(),

      safetyConstraints: [
        {
          category: 'medical',
          mode:
            safety.status === 'allowed'
              ? 'allow'
              : safety.status === 'constrained'
                ? 'restrict'
                : 'escalate',
          message: safety.reasons[0],
        },
        {
          category: 'nutrition',
          mode: 'allow',
          message: 'Use real logged data only',
        },
        {
          category: 'data_use',
          mode: 'allow',
          message: 'Never invent or disclose hidden data',
        },
      ],

      responseMode: 'chat',
      intent,
    }

    let kayvenResponse: KAYVENAIResponse | null =
      null

    let executionPath:
      'deterministic_tool' | 'local_intelligence' | 'ai_fallback' =
      'local_intelligence'

    /*
     * Complex, analytical and contextual follow-up questions
     * go to the Conversation Brain + Response Composer first.
     *
     * This prevents simple deterministic tools from answering:
     * - "Why?"
     * - weight plateau questions
     * - progress analysis
     * - contextual follow-ups
     */
    if (preferComposer) {
      const composedResponse =
        composeKAYVENResponse({
          message: resolvedMessage,
          intent,
          context,
          conversation,
          brainDecision,
          safetyStatus: safety.status,
        })

      if (
        !composedResponse.shouldFallback &&
        composedResponse.text
      ) {
        kayvenResponse = {
          text: composedResponse.text,
          safetyStatus: safety.status,
          provider: {
            name: 'custom',
            model: 'kayven-response-composer',
          },
          suggestedActions:
            composedResponse.suggestedActions || [],
          metadata: {
            usedAI: false,
            provider: 'custom',
            intent,
            executionPath: 'local_intelligence',
          },
        }
      }
    }

    /*
     * Simple direct questions can still use deterministic tools.
     */
    if (!kayvenResponse && !preferComposer) {
      const deterministicResponse =
        await attemptDeterministicToolResponse(
          kyRequest,
          supabase,
        )

      if (deterministicResponse) {
        kayvenResponse = deterministicResponse
        executionPath = 'deterministic_tool'
      }
    }

    /*
     * If the preferred composer could not answer,
     * try deterministic tools as a secondary fallback.
     */
    if (!kayvenResponse && preferComposer) {
      const deterministicResponse =
        await attemptDeterministicToolResponse(
          kyRequest,
          supabase,
        )

      if (deterministicResponse) {
        kayvenResponse = deterministicResponse
        executionPath = 'deterministic_tool'
      }
    }

    if (!kayvenResponse && safety.status !== 'escalate' && shouldPreferAIResponse(resolvedMessage, conversation)) {
      const outcome = await runMeteredAI({
        supabase,
        userId: user.id,
        feature: 'ai_coach',
        idempotencyKey,
        execute: async () => {
          const aiResponse = await generateKayvenAIResponse({
            message: resolvedMessage,
            intent,
            context: context as unknown as Record<string, unknown>,
            conversation: conversation as KAYVENMessage[],
            brainDecision,
            safetyStatus: safety.status,
          })
          return { value: aiResponse, billable: aiResponse?.metadata?.usedAI === true }
        },
      })
      if (outcome.status !== 'ok') return meteredAIFailureResponse(outcome)

      if (outcome.value) {
        kayvenResponse = outcome.value
        executionPath = 'ai_fallback'
      }
    }

    /*
     * Final fallback: existing local intelligence.
     */
    if (!kayvenResponse) {
      executionPath = 'local_intelligence'

      kayvenResponse = buildLocalCoachResponse(
        resolvedMessage,
        intent,
        context,
        safety.status,
      )
    }

    const costMetadata = createCostMetadata({
      usedAI: kayvenResponse.metadata?.usedAI === true,
      provider: kayvenResponse.metadata?.provider || kayvenResponse.provider.name,
      toolUsed: kayvenResponse.metadata?.toolUsed,
      intent,
      executionPath,
    })

    globalKAYVENCostTracker.recordRequest(costMetadata)

    const answer = kayvenResponse.text

    const actions =
      kayvenResponse.suggestedActions || []

    const persistedConversationId =
      await persistConversationTurn(
        supabase,
        user.id,
        conversationId,
        message,
        answer,
      )

    console.info(
      '[Kayven Coach] Response generated',
      {
        executionPath,
        usedAI:
          kayvenResponse.metadata?.usedAI === true,
        aiProvider:
          kayvenResponse.metadata?.provider ||
          kayvenResponse.provider.name,
        toolUsed:
          kayvenResponse.metadata?.toolUsed ||
          undefined,
        provider:
          kayvenResponse.provider.name,
        range,
        intent,
        conversationId:
          persistedConversationId ||
          conversationId ||
          'new',
      },
    )

    return NextResponse.json({
      answer,
      actions,
      conversationId:
        persistedConversationId ||
        conversationId ||
        null,
      provider:
        kayvenResponse.provider.name,
    })
  } catch (error) {
    console.error(
      '[Kayven Coach] Request failed',
      {
        message:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
    )

    return NextResponse.json(
      {
        error:
          'The Coach is unavailable right now. Please try again.',
      },
      { status: 502 },
    )
  }
}
