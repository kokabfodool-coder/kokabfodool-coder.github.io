import {activeProfile} from './profile-state.js?v=2';
import {backupVersion, mergeLevels, restoreLevels, snapshotLevels} from './progress-transfer.js?v=1';

const ar = document.documentElement.lang === 'ar';
const tr = (arText, enText) => ar ? arText : enText;
const authBase = 'https://identitytoolkit.googleapis.com/v1/accounts:';
const databaseBase = 'https://firestore.googleapis.com/v1/';

async function request(url, {method = 'GET', token, data, form} = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (data) headers['Content-Type'] = 'application/json';
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12000);
  try {
    const response = await fetch(url, {method, headers, body: form ? new URLSearchParams(form) : data && JSON.stringify(data), signal: abort.signal,
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error'});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = Error('backup-request');
      error.status = response.status;
      error.code = result.error?.status;
      error.reason = result.error?.message?.split(' : ')[0];
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function mountParentBackup(root, playerLabel) {
  let config;
  try { config = await request('/assets/parent-backup-config.json'); } catch { return; }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.projectId ?? '') ||
      !/^AIza[a-zA-Z0-9_-]{30,45}$/.test(config.apiKey ?? '')) return;

  const authForm = root.querySelector('[data-parent-auth]');
  const account = root.querySelector('[data-parent-tools]');
  const status = root.querySelector('[data-parent-status]');
  const slot = account.querySelector('select');
  const pending = root.querySelector('[data-parent-pending]');
  const reset = root.querySelector('[data-parent-reset]');
  const emailInput = authForm.elements.email;
  const password = authForm.elements.password;
  const storageKey = 'fudool-parent-session-v1:' + config.projectId;
  const apiKey = '?key=' + encodeURIComponent(config.apiKey);
  const rejectedSession = new Set(['INVALID_REFRESH_TOKEN', 'TOKEN_EXPIRED', 'USER_DISABLED',
    'USER_NOT_FOUND', 'PROJECT_NUMBER_MISMATCH']);
  let session;
  let busy = false;
  const backupInfo = account.querySelector('[data-backup-info]');

  function rememberBackup(number, updated) {
    const key = storageKey + ':backup:' + session.uid + ':' + activeProfile().id;
    localStorage.setItem(key, JSON.stringify({number, updated}));
  }

  function showBackupInfo() {
    if (!session?.verified || !backupInfo) return;
    const key = storageKey + ':backup:' + session.uid + ':' + activeProfile().id;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
    if (saved && [...slot.options].some(option => option.value === saved.number)) {
      slot.value = saved.number;
    } else {
      slot.selectedIndex = 0;
    }
    const date = new Date(saved?.updated);
    backupInfo.textContent = Number.isFinite(date.getTime())
      ? tr('آخر نسخة تم التحقق منها', 'Last verified backup') + ' · ' +
        new Intl.DateTimeFormat(ar ? 'ar-AE-u-nu-latn' : 'en', {dateStyle:'medium', timeStyle:'short'}).format(date)
      : tr('لم تُتحقق نسخة لهذا اللاعب على هذا الجهاز بعد.', 'No backup verified for this player on this device yet.');
  }

  function auth(action, data) {
    return request(authBase + action + apiKey, {method: 'POST', data});
  }

  function saveSession() {
    try {
      if (session) {
        const {email, uid, refreshToken, verified} = session;
        localStorage.setItem(storageKey, JSON.stringify({email, uid, refreshToken, verified}));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // The current page still works if device storage is unavailable.
    }
  }

  function validAccount(saved) {
    return /^[\w-]{1,128}$/.test(saved?.uid ?? '') &&
      typeof saved.email === 'string' && saved.email.includes('@') &&
      typeof saved.refreshToken === 'string' && saved.refreshToken.length > 0;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (validAccount(saved)) session = saved;
  } catch {
    // A malformed entry is equivalent to opening the app signed out.
  }

  async function accessToken(refresh = false) {
    if (!session) throw Error('missing session');
    if (!refresh && session.token && session.expiresAt > Date.now() + 60000) return session.token;
    let updated;
    try {
      updated = await request('https://securetoken.googleapis.com/v1/token' + apiKey, {
        method: 'POST', form: {grant_type: 'refresh_token', refresh_token: session.refreshToken},
      });
    } catch (error) {
      if (rejectedSession.has(error.reason)) {
        session = undefined;
        saveSession();
      }
      throw error;
    }
    if (updated.user_id !== session.uid || !updated.id_token || !updated.refresh_token) {
      session = undefined;
      saveSession();
      throw Error('invalid session');
    }
    session.token = updated.id_token;
    session.refreshToken = updated.refresh_token;
    session.expiresAt = Date.now() + Number(updated.expires_in) * 1000;
    saveSession();
    return session.token;
  }

  async function checkEmail(refresh = false) {
    const idToken = await accessToken(refresh);
    const user = (await auth('lookup', {idToken})).users?.[0];
    if (user?.localId !== session.uid) throw Error('invalid account');
    session.email = user.email || session.email;
    session.verified = user.emailVerified === true;
    saveSession();
    return session.verified;
  }

  const database = 'projects/' + config.projectId + '/databases/(default)';
  function documentName(number) {
    return database + '/documents/familyBackups/' + encodeURIComponent(session.uid) + '/slots/' + number;
  }
  function commit(writes) {
    return request(databaseBase + database + '/documents:commit',
      {method: 'POST', token: session.token, data: {writes}});
  }
  async function readSlot(number) {
    try {
      const document = await request(databaseBase + documentName(number), {token: session.token});
      if (Number(document.fields?.version?.integerValue) !== backupVersion ||
          typeof document.fields?.levels?.stringValue !== 'string') throw Error('backup version');
      return {levels: document.fields.levels.stringValue, updated: document.updateTime};
    } catch (error) {
      if (error.status === 404) return {levels: ''};
      throw error;
    }
  }

  async function saveSlot(number, levels) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await readSlot(number);
      const combined = mergeLevels(remote.levels, levels);
      if (combined === remote.levels) return remote.updated;
      const currentDocument = remote.updated ? {updateTime: remote.updated} : {exists: false};
      const update = {name: documentName(number),
        fields: {version: {integerValue: String(backupVersion)}, levels: {stringValue: combined}}};
      try {
        const result = await commit([{update, currentDocument}]);
        return result.writeResults?.[0]?.updateTime || result.commitTime;
      } catch (error) {
        if (attempt === 2 || !([409, 412].includes(error.status) || error.code === 'FAILED_PRECONDITION' ||
                                    error.code === 'ALREADY_EXISTS')) throw error;
      }
    }
  }

  function showAccount() {
    authForm.hidden = !!session;
    pending.hidden = !session || session.verified === true;
    const wasHidden = account.hidden;
    account.hidden = !session || session.verified !== true;
    if (wasHidden && !account.hidden) showBackupInfo();
    if (session) reset.hidden = true;
    pending.querySelector('[data-parent-pending-email]').textContent = session?.email ?? '';
    account.querySelector('[data-parent-email]').textContent = session?.email ?? '';
    account.querySelector('[data-parent-player]').textContent = playerLabel();
  }

  async function run(operation, {quiet = false} = {}) {
    if (busy) return;
    busy = true;
    root.setAttribute('aria-busy', 'true');
    for (const button of root.querySelectorAll('button')) button.disabled = true;
    try { await operation(); }
    catch (error) {
      if (!quiet) {
        if (error.reason === 'EMAIL_EXISTS') {
          status.textContent = tr('هذا البريد مسجّل. اختر تسجيل الدخول.', 'This email already has an account. Choose Sign in.');
          reset.hidden = false;
        } else if (['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND'].includes(error.reason)) {
          status.textContent = tr('تحقّق من البريد وكلمة المرور.', 'Check your email address and password.');
          reset.hidden = false;
        } else {
          status.textContent = tr('تعذّر إتمام العملية. تحقّق من الاتصال وحاول مجدّدًا.',
            'Could not complete this action. Check your connection and try again.');
        }
      }
    } finally {
      busy = false;
      root.removeAttribute('aria-busy');
      for (const button of root.querySelectorAll('button')) button.disabled = false;
      showAccount();
    }
  }

  async function sendVerification() {
    const idToken = await accessToken();
    await auth('sendOobCode', {requestType: 'VERIFY_EMAIL', idToken});
    status.textContent = tr('أُرسل رابط التأكيد. تحقّق من صندوق الوارد والرسائل غير المرغوب فيها.',
      'Verification link sent. Check your inbox and spam folder.');
  }

  authForm.addEventListener('submit', event => {
    event.preventDefault();
    const create = event.submitter?.value === 'sign-up';
    const email = emailInput.value.trim();
    const secret = password.value;
    if (!emailInput.reportValidity()) return;
    if (!secret || (create && secret.length < 8)) {
      status.textContent = tr('أدخل كلمة المرور. للحساب الجديد استخدم 8 أحرف على الأقل.',
        'Enter your password. Use at least 8 characters for a new account.');
      return;
    }
    run(async () => {
      const signed = await auth(create ? 'signUp' : 'signInWithPassword',
        {email, password: secret, returnSecureToken: true});
      const next = {email: signed.email || email, uid: signed.localId, refreshToken: signed.refreshToken,
        token: signed.idToken, expiresAt: Date.now() + Number(signed.expiresIn) * 1000, signedAt: Date.now()};
      if (!validAccount(next) || !next.token) throw Error('invalid session');
      session = next;
      saveSession();
      password.value = '';
      status.textContent = '';
      showAccount();
      if (!await checkEmail()) await sendVerification();
    });
  });

  reset.addEventListener('click', () => {
    if (!emailInput.reportValidity()) return;
    run(async () => {
      await auth('sendOobCode', {requestType: 'PASSWORD_RESET', email: emailInput.value.trim()});
      status.textContent = tr('راجع بريدك لإعادة تعيين كلمة المرور.', 'Check your inbox for a password reset link.');
    });
  });
  pending.querySelector('[data-parent-check]').addEventListener('click', () => run(async () => {
    status.textContent = await checkEmail(true)
      ? tr('تأكّد البريد وأصبح حسابك جاهزًا.', 'Email verified. Your account is ready.')
      : tr('لم يكتمل التأكيد بعد. افتح الرابط في بريدك وحاول مجدّدًا.',
        'Verification is still pending. Open the link in your email and try again.');
  }));
  pending.querySelector('[data-parent-resend]').addEventListener('click', () => run(sendVerification));

  account.querySelector('[data-parent-save]').addEventListener('click', () => run(async () => {
    const levels = snapshotLevels();
    if (!levels) {
      status.textContent = tr('أكمل مستوى أولًا لتتمكن من حفظه.', 'Finish a level before saving progress.');
      return;
    }
    await accessToken();
    const number = slot.value;
    const updated = await saveSlot(number, levels);
    rememberBackup(number, updated);
    showBackupInfo();
    status.textContent = tr('تم تحديث نسخة اللاعب في الخانة المختارة.', 'Backup updated in the selected slot.');
  }));
  account.querySelector('[data-parent-restore]').addEventListener('click', () => run(async () => {
    const playerId = activeProfile().id;
    await accessToken();
    const number = slot.value;
    const {levels, updated} = await readSlot(number);
    if (playerId !== activeProfile().id) throw Error('player changed');
    if (!levels) {
      status.textContent = tr('هذه الخانة فارغة.', 'This backup slot is empty.');
      return;
    }
    const count = restoreLevels(levels, playerId);
    rememberBackup(number, updated);
    showBackupInfo();
    status.textContent = count ? tr(count === 1 ? 'استُعيد تقدّم مستوى واحد.' : `استُعيد تقدّم ${count} مستوى.`,
        `Progress restored for ${count} ${count === 1 ? 'level' : 'levels'}.`)
      : tr('التقدّم على الجهاز يطابق النسخة أو يتجاوزها.', 'Progress on this device already meets or exceeds this backup.');
  }));
  function signOut() {
    session = undefined;
    saveSession();
    authForm.reset();
    reset.hidden = true;
  }

  for (const button of root.querySelectorAll('[data-parent-signout]')) {
    button.addEventListener('click', () => {
      signOut();
      status.textContent = tr('تم تسجيل الخروج.', 'Signed out.');
      showAccount();
    });
  }

  account.querySelector('[data-parent-delete]').addEventListener('click', () => run(async () => {
    if (!(Date.now() - session.signedAt < 4 * 60 * 1000)) {
      status.textContent = tr('لحذف الحساب، سجّل الخروج ثم سجّل الدخول من جديد وحاول الحذف.',
        'To delete the account, sign out, sign in again, and retry.');
      return;
    }
    if (!window.confirm(tr('حذف حساب ولي الأمر وجميع نسخه المحفوظة؟', 'Delete the parent account and all its online backups?'))) return;
    const idToken = await accessToken();
    await commit([...slot.options].map(option => ({delete: documentName(option.value)})));
    await auth('delete', {idToken});
    signOut();
    status.textContent = tr('حُذف الحساب والنسخ المحفوظة عبر الإنترنت.', 'The account and its online backups were deleted.');
  }));

  function resumeVerification() {
    if (!session || session.verified || document.visibilityState !== 'visible') return;
    run(async () => {
      if (await checkEmail(true)) status.textContent = '';
    }, {quiet: true});
  }

  root.hidden = false;
  showAccount();
  resumeVerification();
  document.addEventListener('visibilitychange', resumeVerification);
  window.addEventListener('pageshow', event => {
    if (event.persisted) resumeVerification();
  });
}
