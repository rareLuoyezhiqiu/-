package io.github.rareluoyezhiqiu.inspiration;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// Only ciphertext is written to preferences. The AES key is non-exportable Android Keystore material.
public final class ConfigVault {
    private final Context context;
    private static final String ALIAS = "inspiration-ai-v1";
    public ConfigVault(Context context) { this.context = context; }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    public synchronized void save(JSONObject config) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(config.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        if (!context.getSharedPreferences("ai-vault",Context.MODE_PRIVATE).edit().putString("encrypted",value).commit()) throw new Exception("write");
    }
    public synchronized JSONObject read() throws Exception {
        String value = context.getSharedPreferences("ai-vault",Context.MODE_PRIVATE).getString("encrypted",null);
        if (value == null) return new JSONObject();
        String[] parts = value.split(":");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    public synchronized void clear() throws Exception {
        if (!context.getSharedPreferences("ai-vault",Context.MODE_PRIVATE).edit().clear().commit()) throw new Exception("clear");
    }
}
