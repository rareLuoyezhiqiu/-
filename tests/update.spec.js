import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

test('新 Service Worker 提示更新、不强制刷新，更新保留记录与草稿', async ({ page }) => {
  let version = 1;
  const server = createServer(async (req,res) => {
    const path = new URL(req.url,'http://localhost').pathname;
    try {
      const file = path === '/' ? '/index.html' : path;
      let body = await readFile(join(process.cwd(),'dist',file));
      if (path === '/sw.js') body = Buffer.concat([body,Buffer.from(`\n// release ${version}\n`)]);
      res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webmanifest':'application/manifest+json'})[extname(file)] ?? 'application/octet-stream','Cache-Control':'no-store'});res.end(body);
    } catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    page.on('pageerror',e=>{throw e;});
    page.on('console',msg=>{if(msg.type()==='error')throw Error(msg.text());});
    await page.route('**/api/config',route=>route.fulfill({json:{provider:'测试',model:'test',endpoint:'https://example.com/api',policyUrl:'https://example.com/privacy',revision:'test',configured:true}}));
    await page.route('**/api/expand',route=>{const {requestId}=route.request().postDataJSON();return route.fulfill({contentType:'text/event-stream',body:`event: delta\ndata: ${JSON.stringify({requestId,text:'更新前的拓写'})}\n\nevent: done\ndata: ${JSON.stringify({requestId})}\n\n`});});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button',{name:'＋ 记一下',exact:true}).click();await page.getByLabel('想法内容').fill('更新前保存的记录');await page.getByRole('button',{name:'保存想法'}).click();
    await expect(page.locator('#editor')).not.toBeVisible();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'帮我展开',exact:true}).click();await page.getByRole('button',{name:'保留拓写',exact:true}).click();await expect(page.locator('#ai-panel').getByText('已保留',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'重新生成',exact:true}).click();await expect(page.getByText('已生成，尚未保留',{exact:true})).toBeVisible();await page.getByRole('button',{name:'收起',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
    version = 2;
    await page.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;await reg.update();});
    await expect(page.getByRole('button',{name:'更新应用'})).toBeVisible();
    await page.getByRole('button',{name:'＋ 记一下',exact:true}).click();await page.getByLabel('想法内容').fill('更新前未完成的草稿');
    await expect(page.locator('#editor')).toBeVisible();
    await page.getByRole('button',{name:'收起'}).click();
    page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'更新应用'}).click();await expect(page.getByRole('button',{name:'查看生成结果'})).toBeVisible();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'更新应用'}).click();
    await expect(page.getByRole('button',{name:'更新应用'})).not.toBeVisible();
    await expect(page.locator('.note > p')).toHaveText('更新前保存的记录');await expect(page.locator('.saved-expansion')).toContainText('更新前的拓写');await expect(page.getByRole('button',{name:'查看生成结果'})).toHaveCount(0);
    await page.locator('#resume').click();await expect(page.getByLabel('想法内容')).toHaveValue('更新前未完成的草稿');
  } finally { await page.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
