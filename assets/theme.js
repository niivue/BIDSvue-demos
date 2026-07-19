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
    .then((regs) => Promise.allSettled(regs.map((r) => r.unregister())))
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

  const sync = (paused) => {
    radar.classList.toggle("radar-paused", paused)
    radar.setAttribute("aria-pressed", String(paused))
    radar.setAttribute("title", `${paused ? "Click to resume" : "Click to pause"} · Double-click to change image`)
  }
  const toggle = () => sync(!radar.classList.contains("radar-paused"))
  const variants = (radar.getAttribute("data-hero-variants") || "")
    .split(/\s+/)
    .filter(Boolean)
  const PRELOAD_TIMEOUT = 5000
  const POINTER_CLICK_DELAY = 250
  let switchingVariant = false
  let clickTimer = null
  let controls = null
  let visibilityObserver = null

  const cancelPendingClick = () => {
    if (clickTimer === null) return
    clearTimeout(clickTimer)
    clickTimer = null
  }

  const cycleVariant = async () => {
    if (switchingVariant || variants.length < 2) return
    switchingVariant = true
    const root = document.documentElement
    const current = root.getAttribute("data-hero-variant")
    const next = variants[(variants.indexOf(current) + 1) % variants.length]
    const preload = (name) =>
      new Promise((resolve) => {
        const image = new Image()
        let settled = false
        let timeout
        const finish = (loaded) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          image.onload = image.onerror = null
          if (!loaded) image.removeAttribute("src")
          resolve(loaded)
        }
        timeout = setTimeout(() => finish(false), PRELOAD_TIMEOUT)
        image.onload = () => finish(true)
        image.onerror = () => finish(false)
        try {
          image.src = new URL(`assets/${next}-${name}.png`, document.baseURI).href
        } catch {
          finish(false)
        }
      })
    try {
      const loaded = await Promise.all([preload("base"), preload("active")])
      if (loaded.every(Boolean)) root.setAttribute("data-hero-variant", next)
    } finally {
      switchingVariant = false
    }
  }

  const enableControls = () => {
    if (controls) return
    controls = new AbortController()
    const { signal } = controls

    radar.removeAttribute("aria-hidden")
    radar.setAttribute("role", "button")
    radar.setAttribute("tabindex", "0")
    radar.setAttribute("aria-label", "Pause radar animation")
    radar.setAttribute("aria-description", "Double-click or press Shift+Enter to change the image")
    sync(radar.classList.contains("radar-paused"))

    radar.addEventListener(
      "click",
      (event) => {
        // Pointer clicks wait briefly so a second click can become a variant
        // change without disturbing the animation's running/paused phase.
        if (event.detail === 0) {
          toggle()
          return
        }
        cancelPendingClick()
        if (event.detail > 1) return
        clickTimer = setTimeout(() => {
          clickTimer = null
          toggle()
        }, POINTER_CLICK_DELAY)
      },
      { signal },
    )
    radar.addEventListener(
      "dblclick",
      (event) => {
        event.preventDefault()
        cancelPendingClick()
        cycleVariant()
      },
      { signal },
    )
    radar.addEventListener(
      "keydown",
      (event) => {
        if (event.repeat) return
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault()
          cancelPendingClick()
          cycleVariant()
          return
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          cancelPendingClick()
          toggle()
        }
      },
      { signal },
    )

    if ("IntersectionObserver" in window) {
      visibilityObserver = new IntersectionObserver(([entry]) => {
        radar.classList.toggle("radar-offscreen", !entry.isIntersecting)
      })
      visibilityObserver.observe(radar)
    }
  }

  const disableControls = () => {
    cancelPendingClick()
    controls?.abort()
    controls = null
    visibilityObserver?.disconnect()
    visibilityObserver = null
    radar.classList.remove("radar-offscreen")
    const interactiveAttributes = [
      "role",
      "tabindex",
      "aria-pressed",
      "aria-label",
      "aria-description",
      "title",
    ]
    for (const attribute of interactiveAttributes) {
      radar.removeAttribute(attribute)
    }
    radar.setAttribute("aria-hidden", "true")
  }

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)")
  const syncMotionPreference = () => {
    if (motionPreference.matches) disableControls()
    else enableControls()
  }
  motionPreference.addEventListener("change", syncMotionPreference)
  syncMotionPreference()
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
