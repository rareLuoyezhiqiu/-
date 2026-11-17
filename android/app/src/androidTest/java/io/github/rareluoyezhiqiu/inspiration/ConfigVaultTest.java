package io.github.rareluoyezhiqiu.inspiration;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class ConfigVaultTest {
    @Test public void keySurvivesReopenAndIsCiphertextOnDisk() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        ConfigVault vault=new ConfigVault(context);vault.clear();
        JSONObject data=new JSONObject().put("apiKey","private-test-key-勿泄漏").put("model","example");
        vault.save(data);
        String disk=context.getSharedPreferences("ai-vault",Context.MODE_PRIVATE).getString("encrypted","");
        assertFalse(disk.contains("private-test-key"));assertFalse(disk.contains("example"));
        assertEquals("private-test-key-勿泄漏",new ConfigVault(context).read().getString("apiKey"));
        assertEquals("example",new ConfigVault(context).read().getString("model"));
        vault.clear();assertFalse(new ConfigVault(context).read().has("apiKey"));
    }
}
