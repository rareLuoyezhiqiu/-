import { test, expect } from '@playwright/test';
async function android(page) {
  await page.addInitScript(()=>{
    window.androidBridge={};window.nativeState={calls:[],config:{configured:false,revision:'empty'},listeners:{},mode:'ok',exported:null};
    const state=window.nativeState;
    const methods=['getConfig','saveConfig','clearConfig','start','cancel','exportJSON','removeListener'].map(name=>({name,rtype:'promise'}));methods.push({name:'addListener',rtype:'callback'});
    window.Capacitor={PluginHeaders:[{name:'Inspiration',methods}],
      nativeCallback(_plugin,method,options,callback){if(method==='addListener'){state.listeners['listener']=callback;return Promise.resolve('listener');}},
      async nativePromise(_plugin,method,options){
        state.calls.push({method,options});
        if(method==='getConfig')return state.config;
        if(method==='saveConfig'){const {apiKey,...publicConfig}=options;state.config={...publicConfig,configured:true,revision:'new'};return {message:'API 设置已加密保存到本机'};}
        if(method==='clearConfig'){state.config={configured:false,revision:'empty'};return;}
        if(method==='exportJSON'){state.exported=options;return;}
        if(method==='removeListener'){delete state.listeners[options.callbackId];return;}
        if(method==='start'){
          state.active=options.requestId;
          if(state.mode==='wait')return;
          setTimeout(()=>{if(!state.active)return;const text='data: {"choices":[{"delta":{"content":"可以从一段短路线开始。😀"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';Object.values(state.listeners).forEach(cb=>cb({requestId:options.requestId,text}));Object.values(state.listeners).forEach(cb=>cb({requestId:options.requestId,done:true}));},100);return;
        }
        if(method==='cancel'){state.active=null;return;}
      }
    };
  });
  page.on('pageerror',error=>{throw error;});page.on('console',m=>{if(m.type()==='error')throw Error(m.text());});
  await page.goto('/');await expect(page.getByRole('button',{name:'＋ 记一下',exact:true})).toBeEnabled();
}
async function settings(page){await page.getByRole('button',{name:'API 设置',exact:true}).click();await expect(page.getByLabel('个人访问口令')).toHaveCount(0);await page.getByLabel('API Key',{exact:true}).fill('test-private-key');await page.getByRole('button',{name:'保存 API 设置',exact:true}).click();await expect(page.getByText('API 设置已加密保存到本机',{exact:true})).toBeVisible();await expect(page.getByLabel('API Key',{exact:true})).toHaveValue('');}
async function generate(page){await page.getByRole('button',{name:'关闭设置'}).click();await page.getByRole('button',{name:'＋ 记一下',exact:true}).click();await page.getByLabel('想法内容').fill('每天出去走走');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'保存并展开',exact:true}).click();}
test('Android 设置、直连生成、保留和原生文件导出',async({page})=>{
 await android(page);await page.setViewportSize({width:390,height:844});await settings(page);await page.screenshot({path:'artifacts/android-settings-browser.png',fullPage:true});
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('test-private-key');await generate(page);await expect(page.getByText('已生成，尚未保留',{exact:true})).toBeVisible();await expect(page.locator('.ai-output')).toContainText('😀');
 const call=await page.evaluate(()=>window.nativeState.calls.find(c=>c.method==='start'));expect(JSON.parse(call.options.body).messages.at(-1).content).toBe('每天出去走走');expect(call.options.body).not.toContain('test-private-key');
 await page.getByRole('button',{name:'保留拓写',exact:true}).click();await expect(page.locator('#ai-panel').getByText('已保留',{exact:true})).toBeVisible();await page.getByRole('button',{name:'收起',exact:true}).click();await page.getByText('数据备份',{exact:true}).click();await page.getByRole('button',{name:'导出 JSON 备份'}).click();
 await expect.poll(()=>page.evaluate(()=>!!window.nativeState.exported)).toBe(true);
 const exported=await page.evaluate(()=>window.nativeState.exported);expect(JSON.parse(exported.content).expansions).toHaveLength(1);expect(exported.content).not.toContain('test-private-key');
 await page.getByRole('button',{name:'API 设置',exact:true}).click();await expect(page.getByText('已连接：DeepSeek / deepseek-flash',{exact:true})).toBeVisible();await page.getByRole('button',{name:'清除本机 API 设置'}).click();await expect(page.getByText('已清除本机 API 设置和密钥')).toBeVisible();
});
test('Android 取消请求移除监听器且不保存部分结果',async({page})=>{
 await android(page);await settings(page);await page.evaluate(()=>window.nativeState.mode='wait');await generate(page);await expect(page.getByRole('button',{name:'取消生成'})).toBeVisible();await page.getByRole('button',{name:'取消生成'}).click();await expect(page.getByText('已取消',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'保留拓写',exact:true})).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>Object.keys(window.nativeState.listeners).length)).toBe(0);expect(await page.evaluate(()=>window.nativeState.calls.some(c=>c.method==='cancel'))).toBe(true);
});
