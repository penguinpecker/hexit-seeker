package com.hexit.seeker;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient;
import com.solana.mobilewalletadapter.clientlib.scenario.LocalAssociationIntentCreator;
import com.solana.mobilewalletadapter.clientlib.scenario.LocalAssociationScenario;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Original Hexit renderer, packaged locally; only this origin may request wallet access. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/assets/www/index.html";
    private static final Uri IDENTITY = Uri.parse(BuildConfig.HEXIT_API);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean walletBusy = new AtomicBoolean(false);
    private WebView web;
    private volatile LocalAssociationScenario activeScenario;
    // Authorization is session-scoped and never exposed to page scripts or backed up.
    private String authToken;
    private volatile boolean destroyed;
    private String notificationRequest;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setVolumeControlStream(android.media.AudioManager.STREAM_MUSIC);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(27, 6, 57));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return insets;
        });
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(getWindow(), root).setAppearanceLightNavigationBars(false);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(27, 6, 57));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (ORIGIN.equals(r.getUrl().getScheme() + "://" + r.getUrl().getHost())) {
                    WebResourceResponse local = loader.shouldInterceptRequest(r.getUrl());
                    return local != null ? local : new WebResourceResponse("text/plain", "UTF-8", 404,
                            "Not found", null, new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (START.equals(r.getUrl().toString())) return false;
                if (r.hasGesture() && r.isForMainFrame()) external(r.getUrl().toString());
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                if (!destroyed) new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Reopen Hexit").setMessage("The game renderer stopped. Your run is saved by the game service.")
                    .setPositiveButton("Reopen", (dialog, which) -> recreate()).setCancelable(false).show();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                // Release builds never log wallet payloads or page content.
                if (BuildConfig.DEBUG) android.util.Log.d("Hexit", m.message() + " :" + m.lineNumber());
                return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "HexitNative", Collections.singleton(ORIGIN),
                (view, message, origin, isMainFrame, reply) -> {
                    if (!isMainFrame || !ORIGIN.equals(origin.toString())) return;
                    try {
                        JSONObject request = new JSONObject(message.getData());
                        String id = request.getString("id"), action = request.getString("action");
                        if (!id.matches("[a-zA-Z0-9_-]{1,64}")) return;
                        switch (action) {
                            case "pushStatus": answer(id,PushManager.status(this),null);break;
                            case "pushSession": PushManager.session(this,request.optString("session"));PushManager.refresh(this);answer(id,PushManager.status(this),null);break;
                            case "pushEnable":
                                PushManager.session(this,request.optString("session"));notificationRequest=id;
                                if(Build.VERSION.SDK_INT>=33 && !PushManager.permitted(this))requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},42);
                                else PushManager.enable(this,(data,error)->answer(id,data,error));break;
                            case "pushDisable": PushManager.disable(this,(data,error)->answer(id,data,error));break;
                            case "pushOpen": answer(id,new JSONObject().put("open", "com.hexit.seeker.OPEN_LEADERBOARD".equals(getIntent().getAction())),null);getIntent().setAction(Intent.ACTION_MAIN);break;
                            case "connect": connect(id, request.optString("challenge"), request.optString("cluster", "mainnet-beta")); break;
                            case "payScore": payScore(id, request); break;
                            case "pendingPayment":
                                answer(id, new JSONObject(getPreferences(MODE_PRIVATE).getString("payment", "{}")), null); break;
                            case "disconnect": disconnect(id); break;
                            case "haptic":
                                web.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                                answer(id, new JSONObject(), null); break;
                            case "copy":
                                getSystemService(ClipboardManager.class).setPrimaryClip(
                                    ClipData.newPlainText("Hexit", request.optString("text").substring(0,
                                    Math.min(request.optString("text").length(), 2048))));
                                answer(id, new JSONObject(), null); break;
                            case "external": external(request.optString("url")); answer(id, new JSONObject(), null); break;
                            default: answer(id, null, "Unsupported request");
                        }
                    } catch (Exception ignored) { /* Malformed untrusted input has no capability. */ }
                });
        }
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        web.loadUrl(START);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::back);
    }

    private void connect(String id, String challenge, String cluster) {
        if (!challenge.matches("[a-f0-9]{32}")) { answer(id, null, "Invalid connection challenge"); return; }
        if (!validCluster(cluster)) { answer(id, null, "Invalid Solana network"); return; }
        walletSession(id, (client) -> {
            MobileWalletAdapterClient.AuthorizationResult auth = client.authorize(IDENTITY,
                    Uri.parse("icons/icon-192.png"), "Hexit", chain(cluster), authToken,
                    null, null, null).get(90, TimeUnit.SECONDS);
            byte[] key = auth.accounts[0].publicKey;
            String text = "Hexit Seeker\nConnect this wallet to Hexit on Solana " + "mainnet" + ".\n"
                    + "This signature does not authorize transfers or bets.\nNonce: " + challenge;
            MobileWalletAdapterClient.SignMessagesResult proof = client.signMessagesDetached(
                    new byte[][]{text.getBytes(StandardCharsets.UTF_8)}, new byte[][]{key}).get(90, TimeUnit.SECONDS);
            authToken = auth.authToken;
            return new JSONObject().put("publicKey", Base64.getEncoder().encodeToString(key))
                    .put("message", Base64.getEncoder().encodeToString(proof.messages[0].message))
                    .put("signature", Base64.getEncoder().encodeToString(proof.messages[0].signatures[0]))
                    .put("cluster", cluster);
        });
    }

    private static boolean validCluster(String cluster) { return cluster.equals("mainnet-beta"); }
    private static String chain(String cluster) { return "solana:mainnet"; }
    private void payScore(String id, JSONObject request) {
        String cluster=request.optString("cluster"), intentId=request.optString("intentId");
        if (!validCluster(cluster) || !intentId.matches("[0-9a-f-]{36}")) { answer(id,null,"Invalid payment request"); return; }
        final byte[] transaction, expected;
        try {
            transaction=Base64.getDecoder().decode(request.getString("transaction"));
            expected=Base64.getDecoder().decode(request.getString("publicKey"));
            if(transaction.length>1232 || transaction.length<100 || expected.length!=32)throw new IllegalArgumentException();
        } catch(Exception e) { answer(id,null,"Invalid transaction"); return; }
        walletSession(id, client -> {
            MobileWalletAdapterClient.AuthorizationResult auth=client.authorize(IDENTITY,
                Uri.parse("icons/icon-192.png"),"Hexit",chain(cluster),authToken,null,null,null).get(90,TimeUnit.SECONDS);
            if(!java.util.Arrays.equals(expected,auth.accounts[0].publicKey))throw new IllegalStateException("Wallet account changed");
            authToken=auth.authToken;
            MobileWalletAdapterClient.SignAndSendTransactionsResult result=client.signAndSendTransactions(
                new byte[][]{transaction},null,"confirmed",false,3,true).get(90,TimeUnit.SECONDS);
            JSONObject receipt=new JSONObject().put("intentId",intentId).put("cluster",cluster)
                .put("signature",Base64.getEncoder().encodeToString(result.signatures[0]));
            // Preserve a public receipt before returning to JavaScript, including across process death.
            getPreferences(MODE_PRIVATE).edit().putString("payment",receipt.toString()).commit();
            return receipt;
        });
    }

    private void disconnect(String id) {
        if (authToken == null) { answer(id, new JSONObject(), null); return; }
        walletSession(id, (client) -> {
            client.deauthorize(authToken).get(30, TimeUnit.SECONDS);
            authToken = null;
            return new JSONObject();
        });
    }

    interface WalletWork { JSONObject run(MobileWalletAdapterClient client) throws Exception; }
    private void walletSession(String id, WalletWork work) {
        if (!walletBusy.compareAndSet(false, true)) { answer(id, null, "A wallet request is already open"); return; }
        LocalAssociationScenario scenario = new LocalAssociationScenario(90000);
        activeScenario = scenario;
        Intent intent = LocalAssociationIntentCreator.createAssociationIntent(null, scenario.getPort(), scenario.getSession());
        try {
            startActivityForResult(intent, 41);
        } catch (ActivityNotFoundException e) {
            scenario.close(); activeScenario = null; walletBusy.set(false);
            answer(id, null, "No Solana wallet found. Open Seed Vault Wallet, Solflare or Phantom, then try again."); return;
        } catch (Exception e) {
            scenario.close(); activeScenario = null; walletBusy.set(false);
            answer(id, null, "Could not open the wallet. Try again."); return;
        }
        worker.execute(() -> {
            try { answer(id, work.run(scenario.start().get(45, TimeUnit.SECONDS)), null); }
            catch (Exception e) {
                String message = e instanceof java.util.concurrent.TimeoutException
                    ? "Wallet connection timed out. Please try again."
                    : "Wallet request was cancelled or declined. You can try again or continue practice.";
                answer(id, null, message);
            } finally {
                scenario.close(); activeScenario = null; walletBusy.set(false);
            }
        });
    }

    private void answer(String id, JSONObject data, String error) {
        try {
            String payload = new JSONObject().put("id", id).put("data", data)
                .put("error", error == null ? JSONObject.NULL : error).toString();
            main.post(() -> { if (!destroyed && web != null) web.evaluateJavascript("window.__hexitNativeReply?.(" + payload + ")", null); });
        } catch (Exception ignored) { }
    }
    private void external(String address) {
        Uri uri = Uri.parse(address);
        if (!"https".equals(uri.getScheme())) return;
        String host = uri.getHost();
        if (!"explorer.solana.com".equals(host) && !"digitalchocolate.co".equals(host)
                && !"solanamobile.com".equals(host)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (ActivityNotFoundException ignored) { }
    }
    private void back() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.HexitApp?.back() === true", handled -> {
            if (!"true".equals(handled)) new AlertDialog.Builder(this).setTitle("Leave Hexit?")
                .setMessage("Your practice progress is saved. Open tiles will be refunded when you return.")
                .setNegativeButton("Stay", null).setPositiveButton("Leave", (d, w) -> finish()).show();
        });
    }
    @Override public void onBackPressed() { back(); }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grants){
        super.onRequestPermissionsResult(requestCode,permissions,grants);
        if(requestCode==42&&notificationRequest!=null){String id=notificationRequest;notificationRequest=null;
            if(PushManager.permitted(this))PushManager.enable(this,(data,error)->answer(id,data,error));
            else answer(id,PushManager.status(this),"Notification permission was not granted. You can enable it in Android settings.");}
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('hexit:push-open'))",null);}
    @Override protected void onPause() {
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('hexit:pause'))", null);
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        PushManager.refresh(this);
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('hexit:resume'))", null);
    }
    @Override protected void onDestroy() {
        destroyed = true;
        if (activeScenario != null) activeScenario.close();
        worker.shutdownNow();
        if (web != null) { ((FrameLayout)web.getParent()).removeView(web); web.destroy(); web = null; }
        super.onDestroy();
    }
}
