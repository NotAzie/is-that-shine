/**
 * Defensive localStorage wrapper.
 *
 * Storage can be unavailable (private windows, disabled cookies, embedded
 * webviews) or start throwing mid-session. Every access is guarded and falls
 * back to an in-memory map so the experience never breaks because of it.
 */

function createMemoryBacking() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

function detectBacking() {
  try {
    const probe = '__echo_us_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return createMemoryBacking();
  }
}

export function createStorage(backing = detectBacking()) {
  return {
    get(key) {
      try {
        return backing.getItem(key);
      } catch {
        return null;
      }
    },

    set(key, value) {
      try {
        backing.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },

    remove(key) {
      try {
        backing.removeItem(key);
      } catch {
        /* ignore */
      }
    },

    /**
     * Parse JSON defensively. `validate` receives the parsed value and must
     * return the sanitized value (or null to reject it).
     */
    getJSON(key, fallback, validate) {
      const raw = this.get(key);
      if (!raw) return fallback;
      try {
        const parsed = JSON.parse(raw);
        if (validate) {
          const checked = validate(parsed);
          return checked == null ? fallback : checked;
        }
        return parsed;
      } catch {
        return fallback;
      }
    },

    setJSON(key, value) {
      try {
        return this.set(key, JSON.stringify(value));
      } catch {
        return false;
      }
    },
  };
}

/** Shared singleton for the app; tests inject their own backing. */
export const storage = createStorage();
