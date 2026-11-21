'use strict';
/* Entsperren per Fingerabdruck/Gesichtserkennung (WebAuthn mit PRF-Erweiterung).
   Der Passkey liefert ein geheimes Byte-Muster, das nur nach biometrischer Bestätigung
   herausgegeben wird. Damit wird dein App-Passwort verschlüsselt auf dem Gerät abgelegt. */
const Bio = {
  supported() { return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext); },
  async stored() { return DB.get('bio'); },
  async prfKey(bytes) {
    const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('finanzapp-bio-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async getPrf(credId, salt) {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: location.hostname, userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: credId }], extensions: { prf: { eval: { first: salt } } } } });
    const r = a.getClientExtensionResults(); const out = r.prf && r.prf.results && r.prf.results.first;
    if (!out) throw new Error('Dieses Gerät/dieser Browser unterstützt die nötige Passkey-Erweiterung (PRF) nicht.');
    return new Uint8Array(out);
  },
  async enable(pw) {
    if (!this.supported()) throw new Error('Nur in der installierten App über https:// (GitHub Pages) möglich.');
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Finanzapp', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Finanzapp', displayName: 'Finanzapp' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, extensions: { prf: { eval: { first: salt } } } } });
    const ext = cred.getClientExtensionResults();
    if (ext.prf && ext.prf.enabled === false) throw new Error('Dieses Gerät unterstützt die nötige Passkey-Erweiterung (PRF) nicht.');
    const credId = new Uint8Array(cred.rawId);
    let prf = ext.prf && ext.prf.results && ext.prf.results.first ? new Uint8Array(ext.prf.results.first) : await this.getPrf(credId, salt);
    const key = await this.prfKey(prf); const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(pw));
    await DB.set('bio', { credId: Crypto.b64(credId), salt: Crypto.b64(salt), iv: Crypto.b64(iv), ct: Crypto.b64(ct) });
  },
  async unlockPw() {
    const b = await this.stored(); if (!b) throw new Error('Nicht eingerichtet');
    const prf = await this.getPrf(Crypto.unb64(b.credId), Crypto.unb64(b.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Crypto.unb64(b.iv) }, await this.prfKey(prf), Crypto.unb64(b.ct));
    return new TextDecoder().decode(pt);
  },
  async disable() { await DB.del('bio'); },
};
