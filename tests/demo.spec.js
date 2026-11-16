import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', error => { throw error; });
  page.on('console', msg => { if (msg.type() === 'error') throw Error(msg.text()); });
  await page.goto('/');
});
async function shot(page, info, name) { await page.screenshot({ path:info.outputPath(`${name}.png`), fullPage:true }); }

test('手机：新增、换行、编辑排序、删除确认与刷新保存', async ({ page }, info) => {
  await page.setViewportSize({ width:390, height:844 });
  await shot(page, info, '01-list');
  await page.getByRole('button', { name:'记一下', exact:true }).click();
  await page.getByLabel('想法内容').fill('   ');
  await expect(page.getByRole('button', { name:'保存想法' })).toBeDisabled();
  await shot(page, info, '02-empty-input');
  await page.getByLabel('想法内容').fill('在地铁上想到一个点子\n把每天的观察写成一句话');
  await shot(page, info, '03-writing');
  await page.getByRole('button', { name:'保存想法' }).click();
  await expect(page.locator('.note').first()).toContainText('在地铁上想到一个点子\n把每天的观察写成一句话');
  await shot(page, info, '04-saved');
  await page.reload();
  await expect(page.locator('.note')).toHaveCount(5);
  const secondText = await page.locator('.note p').nth(1).textContent();
  await page.locator('.note').nth(1).getByRole('button', { name:'编辑' }).click();
  await page.getByLabel('想法内容').fill('编辑后的旧想法');
  await page.getByRole('button', { name:'保存想法' }).click();
  await expect(page.locator('.note p').nth(1)).toHaveText('编辑后的旧想法');
  await expect(page.locator('.note p').first()).toContainText('在地铁上想到一个点子');
  await shot(page, info, '05-edited');
  await page.locator('.note').first().getByRole('button', { name:'删除' }).click();
  await shot(page, info, '06-delete-confirm');
  await page.getByRole('button', { name:'保留想法' }).click();
  await expect(page.locator('.note')).toHaveCount(5);
  await page.locator('.note').first().getByRole('button', { name:'删除' }).click();
  await page.getByRole('button', { name:'确认删除' }).click();
  await page.reload();
  await expect(page.locator('.note')).toHaveCount(4);
  await expect(page.locator('.note').first()).toContainText('编辑后的旧想法');
  expect(secondText).toBeTruthy();
  await shot(page, info, '07-deleted');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('草稿刷新恢复、收起编辑不修改已保存内容、取消编辑', async ({ page }, info) => {
  const original = await page.locator('.note p').first().textContent();
  await page.locator('.note').first().getByRole('button', { name:'编辑' }).click();
  await page.getByLabel('想法内容').fill('尚未保存的修改');
  await page.getByRole('button', { name:'收起' }).click();
  await expect(page.locator('.note p').first()).toHaveText(original);
  await shot(page, info, '01-draft-banner');
  await page.reload();
  await page.locator('#resume').click();
  await expect(page.getByLabel('想法内容')).toHaveValue('尚未保存的修改');
  await shot(page, info, '02-restored');
  await page.getByRole('button', { name:'保存想法' }).click();
  await expect(page.locator('.note p').first()).toHaveText('尚未保存的修改');
  await expect(page.locator('#resume')).toBeHidden();
  await page.getByRole('button', { name:'记一下', exact:true }).click();
  await page.getByLabel('想法内容').fill('新增草稿');
  await page.reload();
  await page.locator('#resume').click();
  await expect(page.getByLabel('想法内容')).toHaveValue('新增草稿');
});

test('保存失败保留输入，恢复存储后可重试', async ({ page }, info) => {
  await page.getByRole('button', { name:'记一下', exact:true }).click();
  await page.getByLabel('想法内容').fill('这条不能丢');
  await page.evaluate(() => {
    window.originalSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function() { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  });
  await page.getByRole('button', { name:'保存想法' }).click();
  await expect(page.getByRole('alert')).toContainText('保存失败');
  await expect(page.getByLabel('想法内容')).toHaveValue('这条不能丢');
  await shot(page, info, '01-storage-error');
  await page.evaluate(() => Storage.prototype.setItem = window.originalSet);
  await page.getByRole('button', { name:'保存想法' }).click();
  await page.reload();
  await expect(page.locator('.note p').first()).toHaveText('这条不能丢');
});

test('空状态、长文本安全显示及窄屏输入', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('inspiration-demo-notes-v1', '[]'));
  await page.reload();
  await page.setViewportSize({ width:320, height:568 });
  await expect(page.getByText('第一条想法，留给此刻。')).toBeVisible();
  await shot(page, info, '01-empty');
  await page.getByRole('button', { name:'记下第一个想法 →' }).click();
  await page.getByLabel('想法内容').fill('<script>alert(1)</script>\n' + '很长的想法'.repeat(60));
  // Reduced viewport approximates the available area with an on-screen keyboard.
  await page.setViewportSize({ width:320, height:360 });
  await expect(page.getByRole('button', { name:'保存想法' })).toBeInViewport();
  await shot(page, info, '02-short-viewport');
  await page.getByRole('button', { name:'保存想法' }).click();
  await expect(page.locator('.note p')).toContainText('<script>alert(1)</script>');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('桌面和手机视觉快照', async ({ page }) => {
  await mkdir('artifacts', { recursive:true });
  await page.setViewportSize({ width:1440, height:1050 });
  await page.screenshot({ path:'artifacts/desktop.png', fullPage:true });
  await page.setViewportSize({ width:390, height:844 });
  await page.screenshot({ path:'artifacts/mobile.png', fullPage:true });
  await page.getByRole('button', { name:'记一下', exact:true }).click();
  await page.getByLabel('想法内容').fill('在路上想到的，先留在这里。');
  await page.screenshot({ path:'artifacts/mobile-editor.png', fullPage:true });
});

test('切换记录前确认草稿去留，取消时不丢失内容', async ({ page }, info) => {
  await page.getByRole('button', { name:'记一下', exact:true }).click();
  await page.getByLabel('想法内容').fill('需要留下的未完成想法');
  await page.getByRole('button', { name:'收起' }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('.note').first().getByRole('button', { name:'编辑' }).click();
  await expect(page.locator('#editor')).not.toBeVisible();
  await page.locator('#resume').click();
  await expect(page.getByLabel('想法内容')).toHaveValue('需要留下的未完成想法');
  await shot(page, info, '01-draft-preserved');
  await page.getByRole('button', { name:'收起' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.note').first().getByRole('button', { name:'编辑' }).click();
  await expect(page.getByLabel('想法内容')).not.toHaveValue('需要留下的未完成想法');
  await expect(page.locator('#draft-status')).toHaveText('修改后，记得保存。');
  await shot(page, info, '02-edit-existing');
});
