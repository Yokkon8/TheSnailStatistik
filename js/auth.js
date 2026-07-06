// Microsoft-Anmeldung über MSAL (Redirect-Verfahren, funktioniert auch als
// installierte App am iPhone/iPad). Die Bibliothek liegt lokal unter js/vendor/.

import { CONFIG } from "./config.js";

// Umleitungs-URI muss exakt der registrierten Adresse entsprechen
// (https://yokkon8.github.io/TheSnailStatistik/ bzw. http://localhost:4173/).
const redirectUri = location.origin + location.pathname.replace(/index\.html$/, "");

let instance = null;

export const auth = {
  // false, wenn die MSAL-Bibliothek nicht geladen werden konnte
  available() {
    return typeof window.msal !== "undefined";
  },

  async init() {
    if (!this.available() || instance) return this.account();
    instance = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.clientId,
        authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
        redirectUri,
        postLogoutRedirectUri: redirectUri,
      },
      cache: { cacheLocation: "localStorage" },
    });
    await instance.initialize();
    const result = await instance.handleRedirectPromise();
    if (result?.account) {
      instance.setActiveAccount(result.account);
    } else {
      const accounts = instance.getAllAccounts();
      if (accounts.length) instance.setActiveAccount(accounts[0]);
    }
    return this.account();
  },

  account() {
    return instance?.getActiveAccount() ?? null;
  },

  login() {
    if (!instance) return;
    instance.loginRedirect({ scopes: CONFIG.scopes, prompt: "select_account" });
  },

  logout() {
    if (!instance) return;
    instance.logoutRedirect();
  },

  // Liefert ein Zugriffstoken für Microsoft Graph; leitet zur Anmeldung um,
  // wenn die stille Verlängerung nicht mehr möglich ist.
  async getToken() {
    const account = this.account();
    if (!instance || !account) throw new Error("Nicht angemeldet");
    try {
      const result = await instance.acquireTokenSilent({ scopes: CONFIG.scopes, account });
      return result.accessToken;
    } catch (e) {
      if (window.msal && e instanceof msal.InteractionRequiredAuthError) {
        instance.acquireTokenRedirect({ scopes: CONFIG.scopes, account });
      }
      throw e;
    }
  },
};
