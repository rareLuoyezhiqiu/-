import { createApp } from './app.ts';
const env = process.env;
const app = createApp({ token:env.APP_ACCESS_TOKEN, origin:env.APP_ORIGIN ?? 'http://localhost:4173', allowedHosts:env.AI_ALLOWED_HOSTS?.split(',').map(s => s.trim()), config:env.AI_API_KEY ? { apiKey:env.AI_API_KEY,provider:env.AI_PROVIDER ?? '',endpoint:env.AI_ENDPOINT ?? '',model:env.AI_MODEL ?? '',protocol:env.AI_PROTOCOL ?? 'openai',policyUrl:env.AI_POLICY_URL ?? '' } : undefined });
app.listen(Number(env.API_PORT ?? 4174),'127.0.0.1',() => console.log('AI 接口已启动（仅监听本机，未记录密钥或正文）'));
