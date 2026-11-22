import {activeProfile, renameProfile} from './profile-state.js?v=2';
import {audioPreferences, listenToAudioPreferences, setAudioPreference} from './audio-settings.js?v=1';
import {bindGameAudio} from './game-audio.js?v=7';
import {speak, stopSpeech} from './game-voice.js?v=2';
import {backupVersion, maxBackupBytes, restoreLevels, snapshotLevels} from './progress-transfer.js?v=1';

const language = document.documentElement.lang;
const tr = (ar, en) => language === 'ar' ? ar : en;
const root = document.querySelector('[data-settings]');
if (/FudoolAndroidUnified/.test(navigator.userAgent)) {
  document.documentElement.classList.add('fudool-android-shell');
}
const active = activeProfile();
const label = root.querySelector('[data-player-label]');
const nameForm = root.querySelector('[data-player-form]');

function showPlayer() {
  const player = activeProfile();
  label.textContent = player.name || tr('المستكشف الأول', 'First explorer');
  root.querySelector("[data-player-avatar]").src = "/assets/" + player.avatar + ".webp";
  nameForm.elements.nickname.value = player.name;
}
showPlayer();

nameForm.addEventListener('submit', event => {
  event.preventDefault();
  const status = root.querySelector('[data-player-status]');
  try {
    if (activeProfile().id !== active.id) {
      location.reload();
      return;
    }
    renameProfile(active.id, nameForm.elements.nickname.value);
    showPlayer();
    status.textContent = tr('حُفظ اسم اللاعب.', 'Player name saved.');
  } catch {
    status.textContent = tr('تعذّر حفظ الاسم على هذا الجهاز.', 'Could not save the name on this device.');
  }
});

nameForm.elements.nickname.disabled = false;
nameForm.querySelector('button[type=submit]').disabled = false;

const sliders = [...root.querySelectorAll('[data-volume]')];
function showVolume() {
  const saved = audioPreferences();
  for (const slider of sliders) {
    slider.value = saved[slider.dataset.volume];
    root.querySelector('[for="' + slider.id + '"]').value = slider.value + '%';
  }
}
listenToAudioPreferences(showVolume);
showVolume();
for (const slider of sliders) {
  slider.addEventListener('input', () => {
    root.querySelector('[for="' + slider.id + '"]').value = slider.value + '%';
  });
  slider.addEventListener('change', () => setAudioPreference(slider.dataset.volume, slider.valueAsNumber));
}
const previewEffect = bindGameAudio();
root.querySelector('[data-preview-effects]').addEventListener('click', () => previewEffect('correct', true));
root.querySelector('[data-preview-voice]').addEventListener('click', () => {
  const player = activeProfile().name;
  const praise = player ? tr(`أهلًا يا ${player}، مستعدّ للعب؟`, `Hello, ${player}. Ready to play?`)
    : tr('أهلًا بك في كوكب فضول!', 'Welcome to Kokab Fodool!');
  speak(praise, language, () => {
    root.querySelector('[data-audio-status]').textContent =
      tr('يتوفر نطق الاسم عندما يكون صوت اللغة مثبتًا على الجهاز.', 'Name playback uses a voice installed on your device.');
  }, {localOnly: true});
});
window.addEventListener('pagehide', stopSpeech);

const backupStatus = root.querySelector('[data-backup-status]');
const fileInput = root.querySelector('[data-backup-input]');
const device = window.FudoolDevice;
const exportButton = root.querySelector('[data-export-progress]');
const importButton = root.querySelector('[data-import-progress]');
let pendingImport;

function importProgress(source, profileId) {
  try {
    if (source.length > maxBackupBytes) throw Error('large backup');
    const {version, levels} = JSON.parse(source);
    if (version !== backupVersion || profileId !== activeProfile().id) throw Error('wrong backup');
    const count = restoreLevels(levels, profileId);
    backupStatus.textContent = count ? tr(count === 1 ? 'استُعيد تقدّم مستوى واحد.' : `استُعيد تقدّم ${count} مستوى.`,
        `Progress restored for ${count} ${count === 1 ? 'level' : 'levels'}.`)
      : tr('التقدّم على الجهاز يطابق النسخة أو يتجاوزها.', 'Progress on this device already meets or exceeds the backup.');
  } catch {
    backupStatus.textContent = tr('تعذّرت الاستعادة. اختر ملف تقدّم من كوكب فضول.', 'Restore failed. Choose a Kokab Fodool progress file.');
  }
}

exportButton.addEventListener('click', () => {
  const levels = snapshotLevels();
  if (!levels) {
    backupStatus.textContent = tr('أكمل مستوى أولًا لتتمكن من حفظه.', 'Finish a level before saving progress.');
    return;
  }
  const data = JSON.stringify({version: backupVersion, levels});
  if (device?.saveBackup) {
    device.saveBackup(data);
    return;
  }
  const url = URL.createObjectURL(new Blob([data], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kokab-fodool-progress.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  backupStatus.textContent = tr('طُلب تنزيل ملف تقدّم اللاعب الحالي.', 'The current player’s progress file was sent to downloads.');
});
importButton.addEventListener('click', () => {
  pendingImport = activeProfile().id;
  if (device?.openBackup) device.openBackup();
  else fileInput.click();
});
fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  const target = pendingImport;
  fileInput.value = '';
  if (!file) return;
  try { importProgress(file.size > maxBackupBytes ? '' : await file.text(), target); }
  catch { importProgress('', target); }
});
window.fudoolBackupFile = (status, contents) => {
  if (status === 'import') importProgress(contents, pendingImport);
  else if (status === 'saved') backupStatus.textContent = tr('حُفظ ملف التقدّم بنجاح.', 'Progress file saved.');
  else if (status === 'error') backupStatus.textContent = tr('تعذّر فتح ملف التقدّم أو حفظه.', 'Could not open or save the progress file.');
};

if (device?.emailBackupAvailable?.()) {
  const parentPanel = root.querySelector('[data-parent-backup]');
  import('./parent-backup.js?v=3')
    .then(module => module.mountParentBackup(parentPanel, () => label.textContent))
    .catch(() => {});
}
