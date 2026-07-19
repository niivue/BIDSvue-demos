// This site ships no service worker. On a localhost dev port a stale one left
// by a *different* app previously served there hijacks navigations/fetches and
// eventually throws "Failed to fetch" from its own sw.js, freezing the page.
// Clear it — but ONLY on localhost: on a shared origin like github.io a
// root-scoped worker belonging to another project would also match here, and
// unregistering it would break that app. Production never has a stale SW of
// ours (we register none), so this simply doesn't run there.
if (
  "serviceWorker" in navigator &&
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {})
}

// Theme + accent controls. The <head> inline snippet has already applied the
// stored preferences before first paint (no flash); this file only wires up
// the interactive toggle + swatches and keeps them in sync.
;(() => {
  const root = document.documentElement
  const KEY_THEME = "bidsvue-demos:theme" // 'light' | 'dark' | null(system)
  const KEY_ACCENT = "bidsvue-demos:accent"

  const storedTheme = () => {
    try {
      return localStorage.getItem(KEY_THEME)
    } catch {
      return null
    }
  }
  const systemDark = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark = () => {
    const t = storedTheme()
    return t ? t === "dark" : systemDark()
  }

  // Theme toggle
  const toggle = document.querySelector("[data-theme-toggle]")
  if (toggle) {
    const sync = () => {
      toggle.setAttribute("aria-label", isDark() ? "Switch to light" : "Switch to dark")
      toggle.setAttribute("aria-pressed", String(isDark()))
    }
    toggle.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark"
      root.setAttribute("data-theme", next)
      try {
        localStorage.setItem(KEY_THEME, next)
      } catch {}
      sync()
    })
    // React to OS change only while following the system.
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (!storedTheme()) sync()
      })
    sync()
  }

  // Accent swatches
  const swatches = document.querySelectorAll("[data-accent]")
  const currentAccent = () =>
    root.getAttribute("data-accent") || "orange"
  const syncSwatches = () => {
    swatches.forEach((s) =>
      s.setAttribute(
        "aria-pressed",
        String(s.getAttribute("data-accent") === currentAccent()),
      ),
    )
  }
  swatches.forEach((s) => {
    s.addEventListener("click", () => {
      const accent = s.getAttribute("data-accent")
      root.setAttribute("data-accent", accent)
      try {
        localStorage.setItem(KEY_ACCENT, accent)
      } catch {}
      syncSwatches()
    })
  })
  syncSwatches()
})()

// The home-page radar is decorative but directly controllable: click it, or
// focus it and press Enter/Space, to freeze and resume the sweep in place.
;(() => {
  const radar = document.querySelector("[data-radar-toggle]")
  if (!radar) return
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

  const sync = (paused) => {
    radar.classList.toggle("radar-paused", paused)
    radar.setAttribute("aria-pressed", String(paused))
  }
  const toggle = () => sync(!radar.classList.contains("radar-paused"))

  radar.removeAttribute("aria-hidden")
  radar.setAttribute("role", "button")
  radar.setAttribute("tabindex", "0")
  radar.setAttribute("aria-label", "Pause radar animation")
  sync(false)

  radar.addEventListener("click", toggle)
  radar.addEventListener("keydown", (event) => {
    if (event.repeat) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      toggle()
    }
  })
})()

// Screenshot lightbox: click a `.shot` to open the image large over a blurred
// backdrop; click anywhere (or press Escape) to close. One overlay is reused
// for every image on the page. Leading `;` so this IIFE isn't parsed as a
// call on the previous one.
;(() => {
  const shots = document.querySelectorAll(".shot")
  // Elements that open an arbitrary image in the lightbox (e.g. the home-page
  // splash trigger), so the feature isn't limited to `.shot` figures.
  const triggers = document.querySelectorAll("[data-lightbox-src]")
  if (!shots.length && !triggers.length) return

  const box = document.createElement("div")
  box.className = "lightbox"
  box.setAttribute("role", "dialog")
  box.setAttribute("aria-modal", "true")
  box.setAttribute("aria-label", "Enlarged image")
  box.innerHTML = '<figure class="lightbox__frame"><img alt="" /></figure>'
  document.body.appendChild(box)
  const big = box.querySelector("img")

  const open = (src, alt) => {
    big.src = src
    big.alt = alt || ""
    box.classList.add("open")
    document.body.style.overflow = "hidden" // freeze page scroll while open
  }
  const close = () => {
    box.classList.remove("open")
    document.body.style.overflow = ""
  }

  shots.forEach((fig) => {
    const img = fig.querySelector("img")
    if (!img) return
    fig.setAttribute("role", "button")
    fig.setAttribute("tabindex", "0")
    fig.setAttribute("aria-label", `Enlarge: ${img.alt || "screenshot"}`)
    const trigger = () => open(img.currentSrc || img.src, img.alt)
    fig.addEventListener("click", trigger)
    fig.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        trigger()
      }
    })
  })

  triggers.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault() // e.g. the brand link would otherwise navigate home
      open(el.getAttribute("data-lightbox-src"), el.getAttribute("data-lightbox-alt"))
    })
  })

  box.addEventListener("click", close)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && box.classList.contains("open")) close()
  })
})()
