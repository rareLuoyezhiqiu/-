import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const cfg = {provider:'测试服务',model:'test',endpoint:'https://example.com/v1/chat/completions',policyUrl:'https://example.com/privacy',revision:'one',configured:true};
async function add(page,text='想做一个让自己愿意每天散步的小工具') { await page.getByRole('button',{name:'＋ 记一下',exact:true}).click();await page.getByLabel('想法内容').fill(text);await page.getByRole('button',{name:'保存想法'}).click();await expect(page.locator('#editor')).not.toBeVisible(); }
async function setup(page) {
  const requests=[];const control={mode:'ok',revision:'one',release:null};
  page.on('pageerror',e=>{throw e;});
  page.on('console',msg=>{if(msg.type()==='error')throw Error(msg.text());});
  await page.route('**/api/config',route=>route.fulfill({json:{...cfg,revision:control.revision}}));
  await page.route('**/api/expand',async route=>{
    const body=route.request().postDataJSON();requests.push(body);
    if(control.mode==='wait') await new Promise(resolve=>control.release=resolve);
    const text=control.mode==='empty'?'  ':control.mode==='replacement'?'新的思考方向。':'可以考虑从附近一段短路线开始，降低出门的门槛。\n<script>不会执行</script>';
    const event=(name,data)=>`event: ${name}\ndata: ${JSON.stringify({requestId:body.requestId,...data})}\n\n`;
    await route.fulfill({contentType:'text/event-stream',body:event('delta',{text})+(control.mode==='partial'?'':control.mode==='error'?event('error',{code:'rate',message:'服务受限，请手动重试'}):event('done',{}))}).catch(()=>{});
  });
  await page.goto('/');await expect(page.getByRole('button',{name:'＋ 记一下',exact:true})).toBeEnabled();
  return {requests,control};
}
async function start(page){page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'帮我展开',exact:true}).first().click();await expect(page.getByText('已生成，尚未保留',{exact:true})).toBeVisible();}
async function retain(page){await page.getByRole('button',{name:'保留拓写',exact:true}).click();await expect(page.locator('#ai-panel').getByText('已保留',{exact:true})).toBeVisible();await page.locator('#ai-panel').getByRole('button',{name:'收起',exact:true}).click();}
async function backup(page){await page.getByText('数据备份与桌面安装').click();const promise=page.waitForEvent('download');await page.getByText('导出 JSON 备份').click();return JSON.parse(await readFile(await (await promise).path(),'utf8'));}

test('首次取消不请求；候选不导出；保留、刷新、纯文本、截图',async({page})=>{
  const {requests}=await setup(page);await add(page);
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'帮我展开',exact:true}).click();expect(requests).toHaveLength(0);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'重新生成',exact:true}).click();await expect(page.getByText('已生成，尚未保留',{exact:true})).toBeVisible();
  expect(Object.keys(requests[0]).sort()).toEqual(['content','requestId']);expect(requests[0].content).toContain('每天散步');
  await mkdir('artifacts',{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/ai-preview-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'收起',exact:true}).click();expect((await backup(page)).expansions).toEqual([]);
  await page.getByRole('button',{name:'查看生成结果'}).click();await retain(page);
  await page.reload();await page.locator('.saved-expansion summary').click();await expect(page.locator('.saved-expansion')).toContainText('<script>不会执行</script>');
  await page.screenshot({path:'artifacts/ai-saved-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1050});await page.screenshot({path:'artifacts/ai-saved-desktop.png',fullPage:true});
  const data=await backup(page);expect(data.formatVersion).toBe(2);expect(data.expansions).toHaveLength(1);expect(data.expansions[0].noteId).toBe(data.notes[0].id);expect(data.drafts).toBeUndefined();expect(requests).toHaveLength(1);
});

test('重新生成失败、放弃和确认替换；本机写失败可重试',async({page})=>{
  const {control}=await setup(page);await add(page);await start(page);await retain(page);
  await page.getByRole('button',{name:'查看拓写',exact:true}).click();control.mode='error';await page.getByRole('button',{name:'重新生成',exact:true}).click();await expect(page.locator('#ai-panel').getByRole('alert')).toContainText('服务受限');await expect(page.getByRole('button',{name:'保留拓写',exact:true})).toHaveCount(0);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.locator('.saved-expansion summary').click();await expect(page.locator('.saved-expansion')).toContainText('降低出门');
  control.mode='replacement';await page.getByRole('button',{name:'查看拓写',exact:true}).click();await page.getByRole('button',{name:'重新生成',exact:true}).click();await expect(page.getByText('已生成，尚未保留',{exact:true})).toBeVisible();
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'保留拓写',exact:true}).click();await expect(page.locator('.saved-expansion')).toContainText('降低出门');
  await page.evaluate(()=>{window.put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='expansions')throw new DOMException('Full','QuotaExceededError');return window.put.apply(this,args);};});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'保留拓写',exact:true}).click();await expect(page.locator('#ai-panel').getByRole('alert')).toContainText('尚未保留');await expect(page.locator('.ai-output')).toHaveText('新的思考方向。');
  await page.evaluate(()=>IDBObjectStore.prototype.put=window.put);page.once('dialog',d=>d.accept());await retain(page);await expect(page.locator('.saved-expansion')).toContainText('新的思考方向。');
});

test('拓写编辑草稿恢复、取消、离线编辑导出和单独删除',async({page,context})=>{
  await setup(page);await add(page);await start(page);await retain(page);await page.locator('.saved-expansion summary').click();await page.getByRole('button',{name:'编辑拓写'}).click();await page.getByLabel('想法内容').fill('自己补充的内容');await expect(page.getByText('草稿已暂存',{exact:true})).toBeVisible();await page.reload();await page.locator('#resume').click();await expect(page.getByLabel('想法内容')).toHaveValue('自己补充的内容');await page.getByRole('button',{name:'取消编辑'}).click();
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);await context.setOffline(true);await page.reload();await page.locator('.saved-expansion summary').click();await expect(page.locator('.saved-expansion')).toContainText('降低出门');
  await page.getByRole('button',{name:'编辑拓写'}).click();await page.getByLabel('想法内容').fill('离线编辑的拓写');await page.getByRole('button',{name:'保存拓写',exact:true}).click();await expect(page.locator('.saved-expansion')).toContainText('已编辑');
  expect((await backup(page)).expansions[0].content).toBe('离线编辑的拓写');
  await page.getByRole('button',{name:'查看拓写',exact:true}).click();await page.getByRole('button',{name:'重新生成',exact:true}).click();await expect(page.locator('#ai-panel').getByRole('alert')).toContainText('需要联网');await page.getByRole('button',{name:'收起',exact:true}).click();
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'删除拓写'}).click();await expect(page.locator('.saved-expansion')).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除拓写'}).click();await expect(page.locator('.saved-expansion')).toHaveCount(0);await page.reload();await expect(page.locator('.note')).toHaveCount(1);
});

test('收起继续、单任务、原文变更禁用保留、删除后晚到响应无效',async({page})=>{
  const {control,requests}=await setup(page);await add(page,'第一条');await add(page,'第二条');control.mode='wait';page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'帮我展开',exact:true}).first().click();await expect.poll(()=>requests.length).toBe(1);
  await page.getByRole('button',{name:'收起',exact:true}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'帮我展开',exact:true}).click();expect(requests).toHaveLength(1);
  await page.locator('.note').first().getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('想法内容').fill('改过的第二条');await page.getByRole('button',{name:'保存想法'}).click();await expect(page.locator('.note > p').first()).toHaveText('改过的第二条');
  await page.getByRole('button',{name:'正在拓写',exact:true}).click();control.release();await expect(page.getByRole('button',{name:'保留拓写',exact:true})).toBeDisabled();await expect(page.locator('#ai-panel .stale')).toBeVisible();
  await page.getByRole('button',{name:'保留拓写',exact:true}).evaluate(button=>{button.disabled=false;button.click();});await expect(page.locator('#ai-panel').getByRole('alert')).toContainText('原文已修改或删除');
  await page.getByRole('button',{name:'收起',exact:true}).click();await page.locator('.note').first().getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除'}).click();await expect(page.locator('.confirm')).not.toBeVisible();await page.reload();await expect(page.locator('.note')).toHaveCount(1);
  control.mode='wait';await page.getByRole('button',{name:'帮我展开',exact:true}).click();await expect.poll(()=>requests.length).toBe(2);await page.getByRole('button',{name:'收起',exact:true}).click();await page.locator('.note').getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除'}).click();await expect(page.locator('.confirm')).not.toBeVisible();control.release();await page.reload();await expect(page.locator('.note')).toHaveCount(0);
});
for(const mode of ['partial','empty'])test(`不完整结果 ${mode} 不可保留且可手动重试`,async({page})=>{
  const {control,requests}=await setup(page);control.mode=mode;await add(page);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'帮我展开',exact:true}).click();await expect(page.locator('#ai-panel').getByRole('alert')).toContainText('未收到完整');await expect(page.getByRole('button',{name:'保留拓写',exact:true})).toHaveCount(0);expect(requests).toHaveLength(1);
  control.mode='ok';page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'重试',exact:true}).click();await expect(page.getByText('已生成，尚未保留',{exact:true})).toBeVisible();
});

test('服务商变更重新告知、API 设置提交后清空密钥',async({page})=>{
  const {control,requests}=await setup(page);await add(page);await start(page);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'关闭',exact:true}).click();control.revision='two';page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'帮我展开',exact:true}).click();expect(requests).toHaveLength(1);await page.getByRole('button',{name:'关闭',exact:true}).click();
  let settings;await page.route('**/api/settings',route=>{settings=route.request().postDataJSON();return route.fulfill({json:{message:'API 设置已保存'}});});
  await page.getByRole('button',{name:'API 设置',exact:true}).click();await page.getByLabel('个人访问口令').fill('test-token');await page.getByLabel('API Key',{exact:true}).fill('secret-test');await page.getByRole('button',{name:'保存 API 设置'}).click();await expect(page.getByLabel('API Key',{exact:true})).toHaveValue('');expect(settings.apiKey).toBe('secret-test');expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('secret-test');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/api-settings-mobile.png',fullPage:true});
});
for (const version of [1,2]) test(`真实 v${version}→v3 迁移保留原文和编辑草稿`,async({page,context})=>{
  await setup(page);const raw=await context.newPage();await raw.goto('/manifest.webmanifest');await page.close();
  await raw.evaluate(async(version)=>{
    await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('inspiration-list');r.onsuccess=resolve;r.onerror=reject;});
    await new Promise((resolve,reject)=>{const r=indexedDB.open('inspiration-list',version*10);r.onupgradeneeded=()=>{const db=r.result;const n=db.createObjectStore('notes',{keyPath:'id'});n.createIndex('createdAt','createdAt');if(version===2)n.createIndex('updatedAt','updatedAt');n.put({id:'old',content:'历史正文',createdAt:100,...(version===2?{updatedAt:200}:{})});const d=db.createObjectStore('drafts',{keyPath:'id'});d.put({id:'active',noteId:'old',content:'历史草稿',updatedAt:300});};r.onsuccess=()=>{r.result.close();resolve();};r.onerror=reject;});
  },version);
  await raw.goto('/');await expect(raw.locator('.note > p')).toHaveText('历史正文');await raw.locator('#resume').click();await expect(raw.getByLabel('想法内容')).toHaveValue('历史草稿');await raw.getByRole('button',{name:'收起',exact:true}).click();const data=await backup(raw);expect(data.expansions).toEqual([]);expect(data.notes[0].updatedAt).toBe(version===1?100:200);
});

test('另一标签页修改原文后旧候选禁用，已保留拓写提示过时，关联草稿随删除清理',async({page,context})=>{
  await setup(page);await add(page);await start(page);await retain(page);
  const other=await context.newPage();await other.goto('/');await other.locator('.note-actions').getByRole('button',{name:'编辑',exact:true}).click();await other.getByLabel('想法内容').fill('在另一标签页修改原文');await other.getByRole('button',{name:'保存想法'}).click();
  await page.locator('.saved-expansion summary').click();await expect(page.locator('.saved-expansion .stale')).toContainText('原文已修改');await page.getByRole('button',{name:'查看拓写',exact:true}).click();await expect(page.locator('#ai-panel .stale')).toContainText('原文已修改');await page.getByRole('button',{name:'收起',exact:true}).click();
  await page.getByRole('button',{name:'编辑拓写'}).click();await page.getByLabel('想法内容').fill('关联草稿');await page.getByRole('button',{name:'收起',exact:true}).click();await page.locator('.note-actions').getByRole('button',{name:'删除',exact:true}).click();await expect(page.locator('.confirm')).toContainText('一并删除');await page.getByRole('button',{name:'确认删除'}).click();await expect(page.locator('.confirm')).not.toBeVisible();await page.reload();await expect(page.locator('#resume')).toHaveCount(0);expect((await backup(page)).expansions).toEqual([]);
});

test('已删除目标的草稿只能复制或放弃；长结果小视口按钮可达',async({page,context})=>{
  await setup(page);await add(page);await start(page);await page.setViewportSize({width:320,height:360});await expect(page.getByRole('button',{name:'保留拓写',exact:true})).toBeInViewport();await page.screenshot({path:'artifacts/ai-short-viewport.png',fullPage:true});await retain(page);await page.setViewportSize({width:390,height:844});await page.locator('.saved-expansion summary').click();await page.getByRole('button',{name:'编辑拓写'}).click();await page.getByLabel('想法内容').fill('不能丢的拓写草稿');await expect(page.getByText('草稿已暂存',{exact:true})).toBeVisible();
  const other=await context.newPage();await other.goto('/');await other.locator('.note-actions').getByRole('button',{name:'删除',exact:true}).click();await other.getByRole('button',{name:'确认删除'}).click();await expect(page.getByRole('button',{name:'保存拓写',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'复制内容'})).toBeVisible();await page.getByRole('button',{name:'收起',exact:true}).click();await expect(page.locator('#editor')).not.toBeVisible();await page.reload();await page.locator('#resume').click();await expect(page.getByLabel('想法内容')).toHaveValue('不能丢的拓写草稿');await expect(page.getByRole('button',{name:'保存拓写',exact:true})).toBeDisabled();await page.getByRole('button',{name:'取消编辑'}).click();await expect(page.locator('.note')).toHaveCount(0);
});
