import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

interface CdpResponse {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { message: string }
}

interface LabMetrics {
  finalTarget: string
  lcpMs: number | null
  lcpElement: string | null
  fcpMs: number | null
  cls: number
  ttfbMs: number | null
  domContentLoadedMs: number | null
  loadMs: number | null
  jsRequestCount: number
  jsTransferBytes: number
  jsDecodedBytes: number
}

class CdpClient {
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private eventWaiters = new Map<string, Array<() => void>>()

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id)
        if (!waiter) return
        this.pending.delete(message.id)
        if (message.error) waiter.reject(new Error(message.error.message))
        else waiter.resolve(message.result)
        return
      }

      if (message.method) {
        const waiters = this.eventWaiters.get(message.method) ?? []
        this.eventWaiters.delete(message.method)
        for (const resolve of waiters) resolve()
      }
    })
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true })
      socket.addEventListener("error", () => reject(new Error("CDP WebSocket connection failed")), {
        once: true,
      })
    })
    return new CdpClient(socket)
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.socket.send(JSON.stringify({ id, method, params }))
    return withTimeout(response, 15_000, `CDP command timed out: ${method}`)
  }

  waitForEvent(method: string, timeoutMs = 30_000): Promise<void> {
    const event = new Promise<void>((resolve) => {
      const waiters = this.eventWaiters.get(method) ?? []
      waiters.push(resolve)
      this.eventWaiters.set(method, waiters)
    })
    return withTimeout(event, timeoutMs, `CDP event timed out: ${method}`)
  }

  close(): void {
    this.socket.close()
  }
}

const OBSERVER_SCRIPT = `
  (() => {
    const metrics = { lcpMs: null, lcpElement: null, cls: 0 };
    Object.defineProperty(globalThis, "__openLaunchLabMetrics", {
      configurable: false,
      enumerable: false,
      value: metrics,
      writable: false,
    });
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (!last) return;
        metrics.lcpMs = last.startTime;
        const element = last.element;
        metrics.lcpElement = element
          ? [element.tagName?.toLowerCase(), element.id ? "#" + element.id : "", element.className && typeof element.className === "string" ? "." + element.className.trim().split(/\\s+/).slice(0, 3).join(".") : ""].join("")
          : null;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) metrics.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}
  })();
`

const METRICS_EXPRESSION = `
  (() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((entry) => entry.name === "first-contentful-paint");
    const scripts = performance.getEntriesByType("resource").filter((entry) => entry.initiatorType === "script");
    const lab = globalThis.__openLaunchLabMetrics || {};
    return {
      finalTarget: location.origin + location.pathname,
      lcpMs: Number.isFinite(lab.lcpMs) ? Math.round(lab.lcpMs) : null,
      lcpElement: lab.lcpElement || null,
      fcpMs: fcp ? Math.round(fcp.startTime) : null,
      cls: Number((lab.cls || 0).toFixed(4)),
      ttfbMs: navigation ? Math.round(navigation.responseStart) : null,
      domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
      loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
      jsRequestCount: scripts.length,
      jsTransferBytes: Math.round(scripts.reduce((sum, entry) => sum + (entry.transferSize || 0), 0)),
      jsDecodedBytes: Math.round(scripts.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0)),
    };
  })()
`

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2))
  const target = new URL(args.url)
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("--url must use http or https")
  }
  if (target.username || target.password) {
    throw new Error("--url must not contain credentials")
  }

  const results: LabMetrics[] = []
  for (let run = 1; run <= args.runs; run += 1) {
    const metrics = await measureOnce(target)
    results.push(metrics)
    console.error(`Completed mobile lab run ${run}/${args.runs}: LCP ${metrics.lcpMs ?? "n/a"} ms`)
  }

  const safeTarget = `${target.origin}${target.pathname}`
  console.log(
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        target: safeTarget,
        profile: {
          viewport: "390x844",
          deviceScaleFactor: 3,
          cpuSlowdownMultiplier: 4,
          latencyMs: 150,
          downloadKbps: 1600,
          uploadKbps: 750,
          cache: "cold per run",
        },
        runs: results,
        median: medianMetrics(results),
      },
      null,
      2,
    ),
  )
}

function parseArguments(argv: string[]): { url: string; runs: number } {
  let url = ""
  let runs = 3
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--url") url = argv[++index] ?? ""
    else if (argv[index] === "--runs") runs = Number(argv[++index])
    else throw new Error(`Unknown argument: ${argv[index]}`)
  }
  if (!url)
    throw new Error("Usage: bun scripts/measure-mobile-web-vitals.ts --url <url> [--runs 3]")
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error("--runs must be an integer between 1 and 10")
  }
  return { url, runs }
}

async function measureOnce(target: URL): Promise<LabMetrics> {
  const port = await reservePort()
  const profileDirectory = await mkdtemp(join(tmpdir(), "open-launch-vitals-"))
  let browser: ChildProcess | undefined
  let client: CdpClient | undefined

  try {
    browser = spawn(process.env.CHROMIUM_PATH ?? "/usr/bin/chromium", [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
      `--remote-debugging-address=127.0.0.1`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ])

    browser.stderr?.on("data", () => {
      // Chromium diagnostics are intentionally suppressed; command failures surface below.
    })
    const page = await createDebugPage(port)
    client = await CdpClient.connect(page.webSocketDebuggerUrl)

    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
    ])
    await client.send("Network.setCacheDisabled", { cacheDisabled: true })
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1600 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      connectionType: "cellular4g",
    })
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844,
    })
    await client.send("Emulation.setUserAgentOverride", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36",
      platform: "Android",
    })
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVER_SCRIPT })

    const loaded = client.waitForEvent("Page.loadEventFired", 45_000)
    await client.send("Page.navigate", { url: target.href })
    await loaded
    await new Promise((resolve) => setTimeout(resolve, 8_000))

    const evaluation = (await client.send("Runtime.evaluate", {
      expression: METRICS_EXPRESSION,
      returnByValue: true,
    })) as { result?: { value?: LabMetrics }; exceptionDetails?: unknown }
    if (evaluation.exceptionDetails || !evaluation.result?.value) {
      throw new Error("Unable to read browser performance metrics")
    }
    return evaluation.result.value
  } finally {
    client?.close()
    browser?.kill("SIGTERM")
    await rm(profileDirectory, { recursive: true, force: true })
  }
}

async function createDebugPage(port: number): Promise<{ webSocketDebuggerUrl: string }> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: "PUT",
      })
      if (response.ok) {
        return (await response.json()) as { webSocketDebuggerUrl: string }
      }
    } catch {
      // Chromium has not opened its debugging endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("Chromium did not open its debugging endpoint")
}

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Unable to reserve a local port")
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return address.port
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function medianMetrics(results: LabMetrics[]): Omit<LabMetrics, "finalTarget" | "lcpElement"> {
  const numericKeys = [
    "lcpMs",
    "fcpMs",
    "cls",
    "ttfbMs",
    "domContentLoadedMs",
    "loadMs",
    "jsRequestCount",
    "jsTransferBytes",
    "jsDecodedBytes",
  ] as const
  return Object.fromEntries(
    numericKeys.map((key) => [
      key,
      median(
        results.map((result) => result[key]).filter((value): value is number => value !== null),
      ),
    ]),
  ) as Omit<LabMetrics, "finalTarget" | "lcpElement">
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

await main()
