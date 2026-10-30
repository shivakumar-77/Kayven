const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const projectRoot = path.resolve(__dirname, '../../..')
const sourceRoot = path.join(projectRoot, 'src')
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kayven-billing-tests-'))

async function run() {
  process.env.NODE_PATH = path.join(projectRoot, 'node_modules')
  Module._initPaths()

  const configPath = path.join(projectRoot, 'tsconfig.json')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))

  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, projectRoot)
  const options = {
    ...parsedConfig.options,
    rootDir: sourceRoot,
    outDir: outputRoot,
    noEmit: false,
    incremental: false,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    target: ts.ScriptTarget.ES2020,
  }
  const testFiles = [
    path.join(sourceRoot, 'lib/billing/billing.test.ts'),
    path.join(sourceRoot, 'lib/billing/revenuecat.test.ts'),
    path.join(sourceRoot, 'lib/challenge-progress.test.ts'),
    path.join(sourceRoot, 'lib/health-tracking.test.ts'),
    path.join(sourceRoot, 'lib/onboarding.test.ts'),
    path.join(sourceRoot, 'app/api/meal-search/route.test.ts'),
    path.join(sourceRoot, 'app/api/ai-routes.test.ts'),
    ...['coach', 'insights', 'suggestions', 'ai-scan', 'meal-plan'].map(name => path.join(sourceRoot, `app/api/${name}/route.ts`)),
    path.join(sourceRoot, 'app/api/internal/ai-reservations/cleanup/route.ts'),
  ]
  const program = ts.createProgram(testFiles, options)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: fileName => fileName,
      getNewLine: () => ts.sys.newLine,
    }))
  }

  const emitResult = program.emit()
  if (emitResult.emitSkipped) throw new Error('TypeScript test compilation was skipped')

  // Route tests import app modules through the '@/' alias and real Supabase clients;
  // resolve the alias to the compiled output and replace network-facing packages with fakes.
  const originalResolve = Module._resolveFilename
  Module._resolveFilename = function (request, ...rest) {
    if (request.startsWith('@/')) request = path.join(outputRoot, request.slice(2))
    return originalResolve.call(this, request, ...rest)
  }
  const originalLoad = Module._load
  Module._load = function (request, ...rest) {
    if (request === 'next/headers') return { cookies: () => ({ get: () => undefined }) }
    if (request === '@supabase/ssr') return { createServerClient: () => globalThis.__kayvenTestServerClient }
    if (request === '@supabase/supabase-js') return { createClient: () => globalThis.__kayvenTestAdminClient }
    return originalLoad.call(this, request, ...rest)
  }

  const { runBillingTests } = require(path.join(outputRoot, 'lib/billing/billing.test.js'))
  const { runRevenueCatTests } = require(path.join(outputRoot, 'lib/billing/revenuecat.test.js'))
  const { runWeeklyChallengeTests } = require(path.join(outputRoot, 'lib/challenge-progress.test.js'))
  const { runHealthTrackingTests } = require(path.join(outputRoot, 'lib/health-tracking.test.js'))
  const { runOnboardingTests } = require(path.join(outputRoot, 'lib/onboarding.test.js'))
  const { runMealSearchTests } = require(path.join(outputRoot, 'app/api/meal-search/route.test.js'))
  const { runAIRouteTests } = require(path.join(outputRoot, 'app/api/ai-routes.test.js'))
  await runBillingTests()
  runWeeklyChallengeTests()
  runHealthTrackingTests()
  runOnboardingTests()
  await runMealSearchTests()
  await runAIRouteTests(outputRoot)
  await runRevenueCatTests()
  process.stdout.write('Billing, RevenueCat and AI route checks passed.\n')
}

run()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
