import subprocess, time, re, xml.etree.ElementTree as ET
from pathlib import Path
ADB='D:/AndroidDev/Sdk/platform-tools/adb.exe'
SERIAL='emulator-5556'
APP='io.github.rareluoyezhiqiu.inspiration'
def adb(*args):return subprocess.check_output([ADB,'-s',SERIAL,*args],stderr=subprocess.STDOUT).decode('utf-8',errors='replace')
def nodes():
 adb('shell','uiautomator','dump','/sdcard/check.xml')
 return ET.fromstring(adb('shell','cat','/sdcard/check.xml')).iter('node')
def find(text):
 for node in nodes():
  if node.get('text')==text or node.get('content-desc')==text:return node
 return None
def tap(text):
 for _ in range(10):
  node=find(text)
  if node is not None:
   x1,y1,x2,y2=map(int,re.findall(r'\d+',node.get('bounds')))
   adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2));return
  time.sleep(.3)
 raise AssertionError('Cannot find '+text)
def screenshot(name):Path('artifacts/'+name).write_bytes(subprocess.check_output([ADB,'-s',SERIAL,'exec-out','screencap','-p']))
def finish_export():
 import json
 assert find('SAVE') is not None
 filename=next(n.get('text') for n in nodes() if n.get('resource-id')=='android:id/title' and n.get('class')=='android.widget.EditText')
 screenshot('android-release-export.png')
 tap('SAVE')
 if find('OK') is not None: tap('OK')
 time.sleep(1)
 data=json.loads(adb('shell','cat','/sdcard/Download/'+filename))
 assert data['formatVersion']==2 and any(n['content']=='Release test: offline notes and updates' for n in data['notes'])
 assert 'apiKey' not in data and 'drafts' not in data
 print('System file picker wrote a valid format-v2 JSON backup.')

def main():
 assert find('＋ 记一下') is not None
 screenshot('android-release-home.png')
 tap('＋ 记一下')
 adb('shell','input','text','Release%stest:%soffline%snotes%sand%supdates')
 adb('shell','input','keyevent','4')
 screenshot('android-release-editor.png')
 tap('保存想法')
 assert find('Release test: offline notes and updates') is not None
 adb('shell','svc','wifi','disable');adb('shell','svc','data','disable')
 try:
  adb('shell','am','force-stop',APP);adb('shell','am','start','-n',APP+'/.MainActivity')
  assert find('Release test: offline notes and updates') is not None
  screenshot('android-release-offline.png')
 finally:
  adb('shell','svc','wifi','enable');adb('shell','svc','data','enable')
 adb('install','-r','release/inspiration-list-0.2.0-alpha.1.apk')
 adb('shell','am','start','-n',APP+'/.MainActivity')
 assert find('Release test: offline notes and updates') is not None
 screenshot('android-release-updated.png')
 tap('API 设置');assert find('API Key') is not None;screenshot('android-release-settings.png');tap('关闭设置')
 tap('数据备份');tap('导出 JSON 备份');finish_export()
 print('Release APK: record, offline restart, replacement install with retained data, settings and export picker reached.')

if __name__=="__main__": main()
