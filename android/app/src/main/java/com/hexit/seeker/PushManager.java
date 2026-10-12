package com.hexit.seeker;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

final class PushManager {
    static final String CHANNEL="hexit_ranked";
    static final ExecutorService IO=Executors.newSingleThreadExecutor();
    interface Callback {void done(JSONObject data,String error);}
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("hexit-push",Context.MODE_PRIVATE);}
    static boolean optedIn(Context c){return prefs(c).getBoolean("enabled",false);}
    static boolean permitted(Context c){return (Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&NotificationManagerCompat.from(c).areNotificationsEnabled();}
    static void channel(Context c){c.getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"Ranked runs and scores",NotificationManager.IMPORTANCE_DEFAULT));}
    static JSONObject status(Context c){try{return new JSONObject().put("enabled",optedIn(c)&&permitted(c)&&prefs(c).getBoolean("registered",false)).put("permission",permitted(c)).put("optedIn",optedIn(c));}catch(Exception e){return new JSONObject();}}
    static String device(Context c){String id=prefs(c).getString("device",null);if(id==null){id=UUID.randomUUID().toString();prefs(c).edit().putString("device",id).commit();}return id;}
    static void session(Context c,String session){if(session.matches("[a-f0-9]{64}"))prefs(c).edit().putString("session",session).apply();}
    static void post(Context c,String path,JSONObject body)throws Exception{
        String session=prefs(c).getString("session","");if(session.isEmpty())throw new Exception("Start playing to enable notifications.");
        HttpURLConnection conn=(HttpURLConnection)new URL(BuildConfig.HEXIT_API+path).openConnection();
        try{conn.setRequestMethod("POST");conn.setConnectTimeout(15000);conn.setReadTimeout(15000);conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");conn.setRequestProperty("Authorization","Bearer "+session);
            try(var out=conn.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
            int code=conn.getResponseCode();if(code!=200)throw new Exception(code==401?"Reopen Hexit to update your notification session.":"Could not update cloud notifications. Please retry.");
        }finally{conn.disconnect();}
    }
    static void enable(Context c,Callback callback){
        if(!permitted(c)){callback.done(status(c),"Allow notifications in Android settings, then try again.");return;}
        IO.execute(()->{try{
            String token=Tasks.await(FirebaseMessaging.getInstance().getToken(),30,TimeUnit.SECONDS);
            post(c,"/push/register",new JSONObject().put("deviceId",device(c)).put("token",token));
            prefs(c).edit().putBoolean("enabled",true).putBoolean("registered",true).apply();
            FirebaseMessaging.getInstance().setAutoInitEnabled(true);callback.done(status(c),null);
        }catch(Exception e){callback.done(null,e.getMessage());}});
    }
    static void refresh(Context c){if(optedIn(c)&&permitted(c))enable(c,(d,e)->{});}
    static void newToken(Context c,String token){if(optedIn(c)&&permitted(c))IO.execute(()->{try{post(c,"/push/register",new JSONObject().put("deviceId",device(c)).put("token",token));prefs(c).edit().putBoolean("registered",true).apply();}catch(Exception ignored){prefs(c).edit().putBoolean("registered",false).apply();}});}
    static void disable(Context c,Callback callback){
        prefs(c).edit().putBoolean("enabled",false).putBoolean("registered",false).apply();
        FirebaseMessaging.getInstance().setAutoInitEnabled(false);
        c.getSystemService(NotificationManager.class).cancelAll();
        IO.execute(()->{boolean removed=false;try{post(c,"/push/unregister",new JSONObject().put("deviceId",device(c)));removed=true;}catch(Exception ignored){}
            try{Tasks.await(FirebaseMessaging.getInstance().deleteToken(),30,TimeUnit.SECONDS);removed=true;}catch(Exception ignored){}
            callback.done(status(c),removed?null:"Notifications are off locally. Go online and retry to remove the cloud registration.");});
    }
}
