// Livello dati: due backend con la stessa interfaccia.
//   LocalStore  -> localStorage, solo su questo dispositivo
//   CloudStore  -> Firebase (Auth + Firestore), condiviso con la famiglia
// db = { properties: [], devices: [], tasks: [], logs: [] }
export const COLS = ['properties', 'devices', 'tasks', 'logs'];
export const emptyDb = () => ({ properties: [], devices: [], tasks: [], logs: [] });
export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2) + Date.now().toString(36));

const KEY = 'casa.db.v1';

export class LocalStore {
  constructor() { this.mode = 'local'; this.db = emptyDb(); this.cb = () => {}; }
  subscribe(cb) {
    this.cb = cb;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.db = { ...emptyDb(), ...JSON.parse(raw) };
    } catch { /* storage non disponibile */ }
    cb(this.db);
  }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch { /* quota */ } this.cb(this.db); }
  async put(col, item) {
    const arr = this.db[col]; const i = arr.findIndex((x) => x.id === item.id);
    if (i >= 0) arr[i] = item; else arr.push(item);
    this._save();
  }
  async del(col, id) { this.db[col] = this.db[col].filter((x) => x.id !== id); this._save(); }
  async replaceAll(db) { this.db = { ...emptyDb(), ...db }; this._save(); }
}

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export class CloudStore {
  constructor(config) {
    this.mode = 'cloud'; this.config = config; this.db = emptyDb(); this.cb = () => {};
    this.user = null; this.hid = null; this.fs = null;
  }
  async init() {
    const [app, auth, fs] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
    ]);
    this.A = auth; this.F = fs;
    this.app = app.initializeApp(this.config);
    this.auth = auth.getAuth(this.app);
    try {
      this.fs = fs.initializeFirestore(this.app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
    } catch { this.fs = fs.getFirestore(this.app); }
  }
  onUser(cb) { this.A.onAuthStateChanged(this.auth, (u) => { this.user = u; cb(u); }); }
  signInGoogle() { return this.A.signInWithPopup(this.auth, new this.A.GoogleAuthProvider()); }
  signInEmail(e, p) { return this.A.signInWithEmailAndPassword(this.auth, e, p); }
  signUpEmail(e, p) { return this.A.createUserWithEmailAndPassword(this.auth, e, p); }
  signOut() { return this.A.signOut(this.auth); }

  _doc(...p) { return this.F.doc(this.fs, ...p); }
  // Casa condivisa (household) dell'utente: users/{uid}.hid
  async loadHousehold() {
    const snap = await this.F.getDoc(this._doc('users', this.user.uid));
    this.hid = snap.exists() ? snap.data().hid : null;
    return this.hid;
  }
  async createHousehold(name) {
    const hid = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    await this.F.setDoc(this._doc('households', hid), { name, owner: this.user.uid, created: Date.now() });
    await this.F.setDoc(this._doc('households', hid, 'members', this.user.uid), this._member());
    await this.F.setDoc(this._doc('users', this.user.uid), { hid });
    this.hid = hid; return hid;
  }
  async joinHousehold(hid) {
    hid = hid.trim().toLowerCase();
    await this.F.setDoc(this._doc('households', hid, 'members', this.user.uid), this._member());
    let ok = false;
    try { ok = (await this.F.getDoc(this._doc('households', hid))).exists(); } catch { ok = false; }
    if (!ok) {
      await this.F.deleteDoc(this._doc('households', hid, 'members', this.user.uid)).catch(() => {});
      throw new Error('Codice famiglia non valido');
    }
    await this.F.setDoc(this._doc('users', this.user.uid), { hid });
    this.hid = hid;
  }
  async leaveHousehold() {
    await this.F.deleteDoc(this._doc('households', this.hid, 'members', this.user.uid));
    await this.F.deleteDoc(this._doc('users', this.user.uid));
    this.hid = null;
  }
  _member() {
    const u = this.user;
    return { name: u.displayName || (u.email || '').split('@')[0], email: u.email || '', joined: Date.now() };
  }
  async members() {
    const s = await this.F.getDocs(this.F.collection(this.fs, 'households', this.hid, 'members'));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async householdName() {
    const s = await this.F.getDoc(this._doc('households', this.hid));
    return s.exists() ? s.data().name : '';
  }
  subscribe(cb) {
    this.cb = cb; const maps = Object.fromEntries(COLS.map((c) => [c, new Map()]));
    const flush = () => { this.db = Object.fromEntries(COLS.map((c) => [c, [...maps[c].values()]])); cb(this.db); };
    this.unsub = this.F.onSnapshot(this.F.collection(this.fs, 'households', this.hid, 'items'), (snap) => {
      snap.docChanges().forEach((ch) => {
        const { col, ...item } = ch.doc.data(); if (!maps[col]) return;
        if (ch.type === 'removed') maps[col].delete(ch.doc.id); else maps[col].set(ch.doc.id, { ...item, id: ch.doc.id });
      });
      flush();
    }, (err) => console.error('Firestore', err));
  }
  _item(col, id) { return this._doc('households', this.hid, 'items', id); }
  async put(col, item) { const { id, ...rest } = item; await this.F.setDoc(this._item(col, id), { ...rest, col }); }
  async del(col, id) { await this.F.deleteDoc(this._item(col, id)); }
  async replaceAll(db) {
    const jobs = [];
    for (const c of COLS) for (const x of this.db[c]) jobs.push(this.del(c, x.id));
    await Promise.all(jobs);
    for (const c of COLS) for (const x of db[c] || []) await this.put(c, x);
  }
}
