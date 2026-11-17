package io.github.rareluoyezhiqiu.inspiration;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(InspirationPlugin.class);
        super.onCreate(savedInstanceState);
        android.content.pm.PackageInfo webView = androidx.webkit.WebViewCompat.getCurrentWebViewPackage(this);
        if (webView != null) {
            try {
                if (Integer.parseInt(webView.versionName.split("\\.")[0]) < 107) {
                    new androidx.appcompat.app.AlertDialog.Builder(this).setTitle("请更新系统 WebView")
                        .setMessage("当前 Android System WebView 版本过旧。灵感清单需要 107 或更新版本，请更新系统 WebView 后重新打开。")
                        .setPositiveButton("退出", (dialog, which) -> finish()).setCancelable(false).show();
                    return;
                }
            } catch (NumberFormatException ignored) { }
        }
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){
            @Override public void handleOnBackPressed(){
                getBridge().getWebView().evaluateJavascript("(()=>{const dialogs=[...document.querySelectorAll('dialog[open]')];const top=dialogs.at(-1);if(top){const event=new Event('cancel',{cancelable:true});if(top.dispatchEvent(event))top.close();return true;}return false;})()",value->{if("false".equals(value))moveTaskToBack(true);});
            }
        });
    }
}
