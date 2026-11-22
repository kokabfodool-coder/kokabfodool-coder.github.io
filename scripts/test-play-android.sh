#!/usr/bin/env bash
set -euo pipefail

package=com.kokabfodool.offline
activity="$package/com.kokabfodool.shell.MainActivity"
version=$(sed -nE "s/.*versionName '([^']+)'.*/\1/p" android-app/build.gradle)
code=$(sed -nE "s/.*versionCode ([0-9]+).*/\1/p" android-app/build.gradle)
test -n "$version" && test -n "$code"
apk="build/play/Kawkab-Fudool-$version.apk"
mkdir -p build/play-device

capture_failure() {
  local result=$?
  if (( result != 0 )); then
    adb devices -l > build/play-device/android-devices.txt || true
    timeout 8 adb exec-out screencap -p > build/play-device/android-failure.png || true
    timeout 8 adb exec-out cat /sdcard/fudool-ui.xml > build/play-device/android-failure.xml || true
    timeout 8 adb logcat -d -t 1500 chromium:V AndroidRuntime:E '*:S' > build/play-device/android-failure-logcat.txt || true
  fi
  exit "$result"
}
trap capture_failure EXIT

adb shell wm size 390x844
adb shell wm density 160
adb shell input keyevent 82
adb install downloads/apps/Kokab-Fodool-V6.7.1.apk
adb install -r "$apk"
adb shell dumpsys package "$package" | grep -F "versionCode=$code"
adb shell dumpsys package "$package" | grep -F "versionName=$version"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
test "$(adb shell settings get global airplane_mode_on | tr -d '\r')" = 1
adb shell am start -W -n "$activity"

find_label() {
  local label=$1 tap=$2 node_class=${3:-}
  python3 - "$label" "$tap" "$node_class" <<'PY'
import re
import subprocess
import sys
import time
import unicodedata
import xml.etree.ElementTree as ET

label, tap, node_class = sys.argv[1:]
print('Looking for Android UI:', label, flush=True)
def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text)
                   if not unicodedata.combining(c) and unicodedata.category(c) != 'Cf').strip()

needle = normalize(label)
accepted_labels = [needle]
if node_class == 'android.widget.EditText' and label == 'اسم اللاعب':
    accepted_labels.append(normalize('مثل النجم الصغير'))
navigation = label in ('الألعاب', 'المزيد', 'الحكايات', 'الرئيسية')
size = subprocess.check_output(['adb','shell','wm','size'], text=True)
width, height = map(int, re.findall(r'(\d+)x(\d+)', size)[-1])
midpoint = str(width // 2)
story_cover = label in ('فضّول وسرّ الحديقة', 'رحلة إلى مدينة الطاقة النظيفة')
visible = []
title_only_dumps = 0
for attempt in range(15):
    dump = subprocess.run(['adb','shell','uiautomator','dump','/sdcard/fudool-ui.xml'], capture_output=True, timeout=25)
    if dump.returncode != 0:
        print(dump.stderr.decode(errors='replace').strip(), flush=True)
        subprocess.run(['adb','shell','true'], check=True, timeout=8)
    if dump.returncode == 0:
        xml = subprocess.check_output(['adb','exec-out','cat','/sdcard/fudool-ui.xml'])
        if xml.startswith(b'<?xml'):
            root = ET.fromstring(xml)
            candidates = []
            visible = []
            behind_navigation = False
            for node in root.iter('node'):
                x1,y1,x2,y2 = map(int,re.findall(r'\d+',node.get('bounds','')))
                if x2 <= x1 or y2 <= y1:
                    continue
                captions = [normalize(node.get(key, '')) for key in ('text', 'content-desc', 'hint')]
                visible.extend(text for text in captions if text)
                if node_class and (node.get('class') != node_class or node.get('enabled') != 'true'):
                    continue
                exact = any(text in accepted_labels for text in captions)
                if not any(term in text for term in accepted_labels for text in captions):
                    continue
                clickable = node.get('clickable') == 'true'
                if tap == 'yes' and not (exact or clickable):
                    continue
                center_y = (y1+y2)//2
                if story_cover and clickable:
                    center_y = min(center_y, y1+35)
                if tap == 'yes' and not navigation and center_y >= height - 104:
                    behind_navigation = True
                    continue
                priority = (not clickable, not exact) if story_cover else (not exact, not clickable)
                point = (str((x1+x2)//2),str(center_y))
                candidates.append((priority,point))
            if candidates:
                _, point = min(candidates)
                if tap == 'yes':
                    subprocess.run(['adb','shell','input','tap',*point],check=True)
                print('Android UI:', label, 'tapped' if tap == 'yes' else 'visible', flush=True)
                sys.exit(0)
            # WebView can momentarily expose only the document title to UI Automator.
            # Move keyboard focus into the document and keep testing the real controls.
            if len(visible) == 1 and len(list(root.iter('node'))) <= 6:
                title_only_dumps += 1
                if title_only_dumps in (2, 5):
                    subprocess.run(['adb','shell','input','keyevent','KEYCODE_TAB'],check=True)
                time.sleep(.5)
                continue
            if behind_navigation:
                subprocess.run(['adb','shell','input','swipe',midpoint,str(height-154),midpoint,str(height-354),'280'],check=True)
                time.sleep(.5)
                continue
    if not navigation and attempt in (1,3,5,7,9,11,13):
        subprocess.run(['adb','shell','input','swipe',midpoint,str(height-135),midpoint,str(height//3),'350'],check=True)
    time.sleep(1)
print('Visible controls:', visible, flush=True)
raise SystemExit('Offline Android view did not display: ' + label)
PY
}

adb shell wm size 820x1280
adb shell wm density 160
adb shell am force-stop "$package"
adb shell am start -W -n "$activity"
find_label 'الحكايات' no
adb exec-out screencap -p > build/play-device/android-home-safe-bars.png
find_label 'الحكايات' yes
adb shell input swipe 385 1090 385 490 300
find_label 'فضّول وسرّ الحديقة' yes
find_label '1/9' no
find_label 'التالي' yes
find_label '2/9' no
find_label 'تكبير الصورة' yes
find_label 'إغلاق' no
find_label 'التالي' yes
find_label '3/9' no
find_label 'أخرج عدسته المكبّرة وفحص التربة' no
adb exec-out screencap -p > build/play-device/android-zoom-reader.png
find_label 'إغلاق' yes
adb exec-out screencap -p > build/play-device/android-offline-garden.png
find_label 'كل القصص' yes
adb shell input swipe 385 1090 385 490 300
find_label 'رحلة إلى مدينة الطاقة النظيفة' yes
find_label '1/8' no
find_label 'التالي' yes
find_label '2/8' no
adb exec-out screencap -p > build/play-device/android-offline-clean-energy.png
echo "PASS Android $version opens and turns pages in both new stories in airplane mode."

adb shell am force-stop "$package"
adb shell wm size 390x844
adb shell wm density 160
adb shell am start -W -n "$activity"

find_label 'المزيد' yes
find_label 'تصفح أوراق العمل' yes
find_label 'افتح ورقة العمل: رحلتي الأولى مع الحروف العربية' yes
find_label 'صفحة 1' no
adb exec-out screencap -p > build/play-device/android-offline-pdf.png
find_label 'رجوع إلى التطبيق' yes
find_label 'العودة إلى المزيد' yes
find_label 'الصوت واسم اللاعب' yes
find_label 'اسم اللاعب' yes android.widget.EditText
adb shell input text 'Fudool'
find_label 'Fudool' no android.widget.EditText
# Dismiss the keyboard before finding the save button below the name field.
if [[ $(adb shell dumpsys input_method) == *mInputShown=true* ]]; then
  adb shell input keyevent KEYCODE_BACK
fi
find_label 'حفظ الاسم' yes
find_label 'حُفظ اسم اللاعب' no
adb exec-out screencap -p > build/play-device/android-offline-settings.png
find_label 'مستويات الصوت' no
find_label 'الرئيسية' yes
find_label 'أهلًا، Fudool!' no
find_label 'الألعاب' yes
find_label 'سيارة الحركات' yes
find_label 'ابدأ المستوى 1' no
find_label '6–7 سنوات' yes
find_label 'ابدأ المستوى 4' yes
find_label 'المستوى 4' no
find_label 'الجولة 1' no
find_label 'انطلق' no
adb exec-out screencap -p > build/play-device/android-offline-drive.png

adb shell input keyevent KEYCODE_BACK
sleep 1
adb shell input swipe 193 225 193 720 300
adb shell input swipe 193 225 193 720 300
find_label 'التحديات' yes
find_label 'مختبر روبو' yes
find_label '8–10 سنوات' yes
find_label 'ابدأ المستوى 11' yes
find_label 'يريد روبو معرفة أثر الضوء' no
find_label 'كمية الضوء فقط' yes
find_label 'الجولة التالية' yes
find_label 'تجربة ذوبان الثلج' no
find_label 'شغّل المؤقّت' no
adb exec-out screencap -p > build/play-device/android-offline-robo.png

adb shell input keyevent KEYCODE_BACK
sleep 1
adb shell input swipe 193 225 193 720 300
adb shell input swipe 193 225 193 720 300
find_label 'التحديات' yes
find_label 'ذاكرة فضول' yes
find_label 'ابدأ المستوى 1' yes
find_label 'احفظ أماكن الصور' no
find_label 'ابدأ المطابقة' yes
find_label 'بطاقة مغلقة' no
adb exec-out screencap -p > build/play-device/android-offline-memory.png
adb shell input keyevent KEYCODE_BACK
sleep 1
adb shell input swipe 193 225 193 720 300
adb shell input swipe 193 225 193 720 300
find_label 'الحروف' yes
find_label 'اكتب مع لُمعة' yes
find_label '8–10 سنوات' yes
find_label 'ابدأ المستوى 11' yes
find_label 'اسمع الكلمة واكتبها على السطر' no
find_label 'تُقبل الكتابة عند تجاوز 75%' no
find_label 'اسمع الكلمة' yes
find_label 'استمع ببطء' yes
adb exec-out screencap -p > build/play-device/android-offline-writing.png
echo "PASS Android $version upgrades from 6.7.1 and opens settings, dictation, memory and age-based games in airplane mode."

adb shell am force-stop "$package"
adb shell wm size 800x1280
adb shell wm density 160
adb shell am start -W -n "$activity"
find_label 'المزيد' yes
find_label 'تصفح أوراق العمل' yes
find_label 'افتح ورقة العمل: رحلتي الأولى مع الحروف العربية' yes
find_label 'صفحة 1' no
adb exec-out screencap -p > build/play-device/android-tablet-pdf.png
adb shell cat /proc/meminfo | head -6 > build/play-device/device-memory.txt
adb shell dumpsys meminfo "$package" > build/play-device/app-memory.txt
adb shell getconf PAGE_SIZE > build/play-device/emulator-page-size.txt
