package io.github.rareluoyezhiqiu.inspiration;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.*;

@CapacitorPlugin(name = "Inspiration")
public class InspirationPlugin extends Plugin {
    private ConfigVault vault;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor();
    private volatile Task active;
    static final class Task {
        final String id; volatile boolean cancelled; volatile HttpURLConnection connection;
        Task(String id) { this.id = id; }
        void stop() { cancelled = true; if (connection != null) connection.disconnect(); }
    }
    @Override public void load() { vault = new ConfigVault(getContext()); }
    private static String revision(JSONObject config) throws Exception {
        JSONObject copy = new JSONObject(config.toString()); copy.remove("apiKey");
        byte[] digest = MessageDigest.getInstance("SHA-256").digest((copy.toString()+"direct-consent-v1").getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder(); for(byte b : digest) result.append(String.format("%02x",b)); return result.toString();
    }
    private static URL endpoint(String text) throws Exception {
        URI uri = new URI(text);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null || uri.getQuery() != null) throw new Exception("url");
        return uri.toURL();
    }
    @PluginMethod public void getConfig(PluginCall call) {
        try {
            JSONObject config = vault.read(); boolean configured = config.has("apiKey");
            String rev = revision(config); config.remove("apiKey"); config.put("configured",configured);config.put("revision",rev);
            call.resolve(JSObject.fromJSONObject(config));
        } catch(Exception e) { call.reject("无法读取加密设置，请清除本机 API 设置后重新填写"); }
    }
    @PluginMethod public synchronized void saveConfig(PluginCall call) {
        if (active != null) { call.reject("请先取消生成再修改设置"); return; }
        try {
            JSONObject config = new JSONObject();
            for (String field : new String[]{"provider","endpoint","model","protocol","policyUrl","apiKey"}) {
                String value = call.getString(field,"").trim();
                if (value.isEmpty() || value.length()>2048) throw new Exception("field"); config.put(field,value);
            }
            endpoint(config.getString("endpoint")); endpoint(config.getString("policyUrl"));
            if (!config.getString("protocol").equals("openai") && !config.getString("protocol").equals("anthropic")) throw new Exception("protocol");
            vault.save(config); call.resolve(new JSObject().put("message","API 设置已加密保存到本机"));
        } catch(Exception e) { call.reject("无法保存设置，请检查完整 HTTPS 地址、模型及密钥"); }
    }
    @PluginMethod public synchronized void clearConfig(PluginCall call) {
        if (active != null) { call.reject("请先取消生成");return; }
        try { vault.clear();call.resolve(); } catch(Exception e) { call.reject("清除失败，请重试"); }
    }
    @PluginMethod public synchronized void start(PluginCall call) {
        if (active != null) { call.reject("已有生成任务，请先取消或等待完成");return; }
        try {
            JSONObject config = vault.read();
            if (!config.has("apiKey") || !revision(config).equals(call.getString("revision"))) throw new Exception("revision");
            String id = call.getString("requestId",""); String body = call.getString("body","");
            if (!id.matches("[\\w-]{1,100}") || body.getBytes(StandardCharsets.UTF_8).length > 32768) throw new Exception("input");
            JSONObject payload = new JSONObject(body);
            String content = payload.getJSONArray("messages").getJSONObject(payload.getJSONArray("messages").length()-1).getString("content");
            if (content.trim().isEmpty() || content.codePointCount(0,content.length())>4000) throw new Exception("input");
            Task task = new Task(id); active = task;
            worker.execute(() -> request(task,config,body));call.resolve();
        } catch(Exception e) { call.reject("API 设置已变化或输入超限，请检查后重试"); }
    }
    private void emit(Task task, String key, Object value) {
        if (!task.cancelled) notifyListeners("stream",new JSObject().put("requestId",task.id).put(key,value));
    }
    private void request(Task task, JSONObject config, String body) {
        ScheduledFuture<?> timer = clock.schedule(() -> { emit(task,"error","生成超时，请手动重试");task.stop(); },45,TimeUnit.SECONDS);
        try {
            HttpURLConnection connection = (HttpURLConnection) endpoint(config.getString("endpoint")).openConnection();task.connection=connection;
            if (task.cancelled) return;
            connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(45000);
            connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
            if (config.getString("protocol").equals("anthropic")) {connection.setRequestProperty("x-api-key",config.getString("apiKey"));connection.setRequestProperty("anthropic-version","2023-06-01");}
            else connection.setRequestProperty("Authorization","Bearer "+config.getString("apiKey"));
            try(OutputStream out=connection.getOutputStream()) {out.write(body.getBytes(StandardCharsets.UTF_8));}
            int status=connection.getResponseCode();
            if (status!=200) {emit(task,"error",status==429?"AI 服务额度或频率受限，请稍后重试":status==401||status==403?"AI 接口拒绝访问，请检查密钥和权限":"AI 调用失败，请检查接口和模型设置");return;}
            if (connection.getContentType()==null || !connection.getContentType().contains("text/event-stream")) {emit(task,"error","AI 响应格式异常，请检查接口协议");return;}
            try(BufferedReader reader=new BufferedReader(new InputStreamReader(connection.getInputStream(),StandardCharsets.UTF_8))) {
                String line;int total=0;
                while(!task.cancelled && (line=reader.readLine())!=null) {
                    total+=line.length();if(total>1048576) {emit(task,"error","AI 响应过大，请重新生成");return;}
                    emit(task,"text",line+"\n");
                }
            }
            emit(task,"done",true);
        } catch(Exception e) {emit(task,"error","AI 连接中断，请检查网络后手动重试");}
        finally {timer.cancel(false);task.stop();synchronized(this){if(active==task)active=null;}}
    }
    @PluginMethod public synchronized void cancel(PluginCall call) {Task task=active;if(task!=null && task.id.equals(call.getString("requestId"))){task.stop();active=null;}call.resolve();}
    @PluginMethod public void exportJSON(PluginCall call) {
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,call.getString("filename","灵感清单.json"));
        startActivityForResult(call,intent,"exportResult");
    }
    @ActivityCallback private void exportResult(PluginCall call, ActivityResult result) {
        if(call==null)return;
        if(result.getResultCode()!=Activity.RESULT_OK || result.getData()==null || result.getData().getData()==null){call.resolve();return;}
        try(OutputStream stream=getContext().getContentResolver().openOutputStream(result.getData().getData())){if(stream==null)throw new IOException();stream.write(call.getString("content","").getBytes(StandardCharsets.UTF_8));call.resolve();}
        catch(Exception e){call.reject("导出失败，请重新选择文件位置");}
    }
    @Override protected void handleOnDestroy() {Task task=active;if(task!=null)task.stop();worker.shutdownNow();clock.shutdownNow();}
}
