// Thin renderer-side wrapper over window.sa.telemetry.track. Every value passed here is anonymous
// by construction: counts, enums and booleans only — never a file name, path or search string.
export function track(name: string, props?: Record<string, string | number | boolean>): void {
  try {
    window.sa.telemetry.track(name, props)
  } catch {
    // Telemetry can never break the UI.
  }
}
