package com.hexit.seeker;
import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
public final class HexitApplication extends Application {
    @Override public void onCreate(){
        super.onCreate();
        FirebaseApp.initializeApp(this,new FirebaseOptions.Builder()
            .setApplicationId(BuildConfig.FIREBASE_APP_ID).setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID).build());
        PushManager.channel(this);
        FirebaseMessaging.getInstance().setAutoInitEnabled(PushManager.optedIn(this));
    }
}
