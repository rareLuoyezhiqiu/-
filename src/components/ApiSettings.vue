<script setup lang="ts">
import { ref, computed } from 'vue';
import { providers } from '../../shared/providers';
import { accessToken, api } from '../services/ai';
const dialog = ref<HTMLDialogElement>(), token = ref(accessToken.value), apiKey = ref(''), provider = ref(providers[0]!.name), endpoint = ref(providers[0]!.endpoint), model = ref(providers[0]!.models[0] ?? ''), protocol = ref('openai'), policyUrl = ref(providers[0]!.policy), message = ref(''), busy = ref(false);
const preset = computed(() => providers.find(p => p.name === provider.value)!);
function choose() { endpoint.value = preset.value.endpoint; model.value = preset.value.models[0] ?? ''; protocol.value = preset.value.protocol; policyUrl.value = preset.value.policy; apiKey.value = ''; }
async function connect() {
  accessToken.value = token.value; busy.value = true; message.value = '';
  try { const cfg = await (await api('/api/config')).json(); if (cfg.configured) { provider.value = providers.some(p => p.name === cfg.provider) ? cfg.provider : '自定义兼容接口'; endpoint.value = cfg.endpoint; model.value = cfg.model; protocol.value = cfg.protocol; policyUrl.value = cfg.policyUrl; message.value = `已连接：${cfg.provider} / ${cfg.model}`; } else message.value = '已连接，请填写 API 设置'; }
  catch (error) { message.value = error instanceof Error ? error.message : '连接失败'; } finally { busy.value = false; }
}
async function save() {
  busy.value = true; accessToken.value = token.value; message.value = '';
  try { const result = await (await api('/api/settings', { provider:provider.value,endpoint:endpoint.value,model:model.value,protocol:protocol.value,policyUrl:policyUrl.value,apiKey:apiKey.value })).json(); apiKey.value = ''; message.value = result.message; }
  catch (error) { message.value = error instanceof Error ? error.message : '设置失败'; } finally { busy.value = false; }
}
function close() { apiKey.value = ''; dialog.value?.close(); }
</script>
<template>
  <button class="text-button" @click="dialog?.showModal()">API 设置</button>
  <dialog ref="dialog" id="api-settings" aria-labelledby="api-title" @cancel.prevent="close">
    <form @submit.prevent="save"><div class="sheet-header"><h2 id="api-title">API 设置</h2><button type="button" class="text-button" @click="close">关闭设置</button></div>
    <div class="settings-body">
      <label>个人访问口令<input v-model="token" type="password" autocomplete="off" required /></label><button type="button" class="secondary" :disabled="busy" @click="connect">连接已配置的服务</button>
      <p>口令由部署者设置，每次打开应用需填写。API Key 提交至本应用服务端，仅存于服务进程内存，重启后需重新填写；浏览器不保存密钥。</p>
      <label>服务商<select v-model="provider" @change="choose"><option v-for="p in providers" :key="p.name">{{ p.name }}</option></select></label>
      <label>接口协议<select v-model="protocol"><option value="openai">OpenAI Chat Completions 兼容</option><option value="anthropic">Anthropic Messages</option></select></label>
      <label>API 接口地址（完整请求地址）<input v-model="endpoint" type="url" required placeholder="https://…/v1/chat/completions" /></label>
      <label>模型名称<input v-model="model" list="model-options" required /><datalist id="model-options"><option v-for="m in preset.models" :key="m" :value="m" /></datalist></label>
      <p>预设核对于 2026-11-16，可手填账户可用的模型 ID。<a v-if="preset.docs" :href="preset.docs" target="_blank" rel="noreferrer">官方模型文档</a></p>
      <label>API Key<input v-model="apiKey" type="password" autocomplete="new-password" required /></label>
      <label>服务商数据处理政策地址<input v-model="policyUrl" type="url" required /></label>
      <p>自定义接口需由部署者将域名加入允许列表。保存设置不会发起模型调用。上游的数据处理与留存规则请查看填写的政策。</p>
      <p v-if="message" role="status">{{ message }}</p>
    </div><div class="sheet-footer"><button class="primary" :disabled="busy">{{ busy ? '处理中…' : '保存 API 设置' }}</button></div></form>
  </dialog>
</template>
