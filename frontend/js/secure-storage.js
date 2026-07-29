// Optional native secure-storage bridge. The web app deliberately has no token
// fallback: authentication remains in HttpOnly cookies and cannot be exposed to JS.
const SecureStorage = {
  plugin() {
    return globalThis.Capacitor?.Plugins?.SecureStorage || null;
  },

  available() {
    return Boolean(this.plugin());
  },

  async set(key, value) {
    const plugin = this.plugin();
    if (!plugin?.set) throw new Error('Secure Storage nativo indisponível.');
    return plugin.set({ key, value: String(value) });
  },

  async get(key) {
    const plugin = this.plugin();
    if (!plugin?.get) throw new Error('Secure Storage nativo indisponível.');
    const result = await plugin.get({ key });
    return result?.value ?? null;
  },

  async remove(key) {
    const plugin = this.plugin();
    if (!plugin?.remove) throw new Error('Secure Storage nativo indisponível.');
    return plugin.remove({ key });
  }
};

globalThis.FitLifeSecureStorage = SecureStorage;
