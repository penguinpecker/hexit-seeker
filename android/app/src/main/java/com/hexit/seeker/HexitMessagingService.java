package com.hexit.seeker;
import android.app.PendingIntent;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class HexitMessagingService extends FirebaseMessagingService {
    @Override public void onNewToken(String token){PushManager.newToken(this,token);}
    @Override public void onMessageReceived(RemoteMessage message){
        if(!PushManager.optedIn(this)||!PushManager.permitted(this))return;
        RemoteMessage.Notification note=message.getNotification();if(note==null)return;
        String event=message.getData().getOrDefault("event",message.getMessageId());if(event==null)event="hexit";
        Intent intent=new Intent(this,MainActivity.class).setAction("com.hexit.seeker.OPEN_LEADERBOARD").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending=PendingIntent.getActivity(this,event.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder=new NotificationCompat.Builder(this,PushManager.CHANNEL).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(note.getTitle()).setContentText(note.getBody()).setStyle(new NotificationCompat.BigTextStyle().bigText(note.getBody()))
            .setContentIntent(pending).setAutoCancel(true).setColor(0xffbf9bff);
        try{if(PushManager.permitted(this))NotificationManagerCompat.from(this).notify(event.hashCode(),builder.build());}
        catch(SecurityException ignored){/* Permission may be revoked between the check and delivery. */}
    }
}
