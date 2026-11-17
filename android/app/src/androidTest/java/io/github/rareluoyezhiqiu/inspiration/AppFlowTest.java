package io.github.rareluoyezhiqiu.inspiration;
import android.view.KeyEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class AppFlowTest {
    private String js(ActivityScenario<MainActivity> activity,String code) throws Exception {
        AtomicReference<String> value=new AtomicReference<>();
        activity.onActivity(a->a.getBridge().getWebView().evaluateJavascript(code,value::set));
        for(int i=0;i<100 && value.get()==null;i++)Thread.sleep(50);
        assertNotNull("WebView callback",value.get());return value.get();
    }
    private void waitFor(ActivityScenario<MainActivity> activity,String expression) throws Exception {
        for(int i=0;i<200;i++){if("true".equals(js(activity,expression)))return;Thread.sleep(100);}fail("Condition not reached: "+expression);
    }
    @Test public void recordingDraftBackAndReopenPersistOnAndroid() throws Exception {
        String original="Android 离线记录 "+System.currentTimeMillis();
        try(ActivityScenario<MainActivity> activity=ActivityScenario.launch(MainActivity.class)) {
            waitFor(activity,"!!document.querySelector('.new-button') && !document.querySelector('.new-button').disabled");
            js(activity,"document.querySelector('.new-button').click()");waitFor(activity,"document.querySelector('#editor').open");
            js(activity,"document.querySelector('#content').value="+JSONObject.quote(original)+";document.querySelector('#content').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#editor form').requestSubmit()");
            waitFor(activity,"!document.querySelector('#editor').open && document.querySelector('.note').textContent.includes("+JSONObject.quote(original)+")");
            js(activity,"document.querySelector('.new-button').click();document.querySelector('#content').value='Android 返回键草稿';document.querySelector('#content').dispatchEvent(new Event('input',{bubbles:true}))");
            waitFor(activity,"document.querySelector('#draft-status').textContent.includes('已暂存')");
            // Hide the keyboard first, then trigger the application back callback explicitly.
            activity.onActivity(a->a.getOnBackPressedDispatcher().onBackPressed());
            waitFor(activity,"!document.querySelector('#editor').open");
        }
        try(ActivityScenario<MainActivity> reopened=ActivityScenario.launch(MainActivity.class)) {
            waitFor(reopened,"!!document.querySelector('#resume')");
            assertTrue(js(reopened,"document.querySelector('.note').textContent").contains(original));
            js(reopened,"document.querySelector('#resume').click()");
            waitFor(reopened,"document.querySelector('#content').value==='Android 返回键草稿'");
            js(reopened,"document.querySelector('#editor .cancel').click()");
        }
    }

    @Test public void nativeHTTPSStreamUsesStoredKeyAndCurrentBody() throws Exception {
        javax.net.ssl.SSLSocketFactory originalFactory=javax.net.ssl.HttpsURLConnection.getDefaultSSLSocketFactory();
        javax.net.ssl.HostnameVerifier originalVerifier=javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier();
        java.security.KeyStore keys=java.security.KeyStore.getInstance("PKCS12");
        try(java.io.InputStream fixture=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("upstream-test.p12")) {keys.load(fixture,"test-fixture-only".toCharArray());}
        javax.net.ssl.KeyManagerFactory km=javax.net.ssl.KeyManagerFactory.getInstance(javax.net.ssl.KeyManagerFactory.getDefaultAlgorithm());km.init(keys,"test-fixture-only".toCharArray());
        javax.net.ssl.TrustManager[] trust={new javax.net.ssl.X509TrustManager(){public java.security.cert.X509Certificate[] getAcceptedIssuers(){return new java.security.cert.X509Certificate[0];}public void checkClientTrusted(java.security.cert.X509Certificate[] c,String a){}public void checkServerTrusted(java.security.cert.X509Certificate[] c,String a){}}};
        javax.net.ssl.SSLContext tls=javax.net.ssl.SSLContext.getInstance("TLS");tls.init(km.getKeyManagers(),trust,new java.security.SecureRandom());
        // Test-process only trust override. No custom trust or fixture is part of the release application.
        javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(tls.getSocketFactory());javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier((host,session)->host.equals("127.0.0.1"));
        AtomicReference<String> received=new AtomicReference<>();AtomicReference<Throwable> failure=new AtomicReference<>();
        ConfigVault vault=new ConfigVault(InstrumentationRegistry.getInstrumentation().getTargetContext());
        try(javax.net.ssl.SSLServerSocket server=(javax.net.ssl.SSLServerSocket)tls.getServerSocketFactory().createServerSocket(0)) {
            server.setSoTimeout(20000);
            Thread upstream=new Thread(()->{
                try(java.net.Socket socket=server.accept()) {
                    socket.setSoTimeout(10000);java.io.InputStream in=socket.getInputStream();java.io.ByteArrayOutputStream header=new java.io.ByteArrayOutputStream();
                    while(header.size()<8192){int next=in.read();if(next<0)throw new java.io.IOException();header.write(next);if(header.toString("UTF-8").endsWith("\r\n\r\n"))break;}
                    String headers=header.toString("UTF-8");int count=0;for(String line:headers.split("\r\n"))if(line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:"))count=Integer.parseInt(line.split(":",2)[1].trim());
                    byte[] request=new byte[count];int offset=0;while(offset<count){int n=in.read(request,offset,count-offset);if(n<0)throw new java.io.IOException();offset+=n;}
                    received.set(headers+new String(request,java.nio.charset.StandardCharsets.UTF_8));
                    java.io.OutputStream out=socket.getOutputStream();out.write("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    out.write("data: {\"choices\":[{\"delta\":{\"content\":\"原生中文流😀\"}}]}\n\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));out.flush();Thread.sleep(200);
                    out.write("data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));out.flush();
                }catch(Throwable error){failure.set(error);}
            });upstream.start();
            vault.save(new JSONObject().put("provider","测试").put("model","sample").put("protocol","openai").put("endpoint","https://127.0.0.1:"+server.getLocalPort()+"/expand").put("policyUrl","https://example.com/privacy").put("apiKey","native-fixture-secret"));
            try(ActivityScenario<MainActivity> activity=ActivityScenario.launch(MainActivity.class)) {
                waitFor(activity,"!!window.Capacitor?.Plugins?.Inspiration");
                js(activity,"(async()=>{window.nativeEvents=[];window.nativeDone=false;window.nativeFailure='';try{const p=Capacitor.Plugins.Inspiration;window.nativeListener=await p.addListener('stream',event=>{window.nativeEvents.push(event);if(event.done)window.nativeDone=true;if(event.error)window.nativeFailure=event.error;});const cfg=await p.getConfig();await p.start({requestId:'native-https-test',revision:cfg.revision,body:JSON.stringify({model:'sample',stream:true,messages:[{role:'user',content:'只发送当前原文'}]})});}catch(e){window.nativeFailure=e.message;}})()");
                waitFor(activity,"window.nativeDone || !!window.nativeFailure");assertEquals("\"\"",js(activity,"window.nativeFailure"));
                assertTrue(js(activity,"JSON.stringify(window.nativeEvents)").contains("原生中文流"));assertTrue(js(activity,"JSON.stringify(window.nativeEvents)").contains("😀"));
                js(activity,"window.nativeListener.remove()");
            }
            upstream.join(20000);assertNull(failure.get());assertNotNull(received.get());assertTrue(received.get().contains("Bearer native-fixture-secret"));assertTrue(received.get().contains("只发送当前原文"));
        } finally {vault.clear();javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(originalFactory);javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier(originalVerifier);}
    }
}
