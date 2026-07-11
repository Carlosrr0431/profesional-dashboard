const {
  withAndroidManifest,
  withAndroidColors,
  withMainApplication,
  AndroidConfig,
} = require('expo/config-plugins');

const NOTIFICATION_COLOR = '#282e69';
const CHANNEL_SETUP_MARKER = 'createPassengerNotificationChannels';

function withNotificationColors(config) {
  return withAndroidColors(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      name: 'notification_icon_color',
      value: NOTIFICATION_COLOR,
    });
    return config;
  });
}

function withFirebaseManifestMeta(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    AndroidConfig.Manifest.ensureToolsAvailable(manifest);

    const firebaseMeta = [
      {
        $: {
          'android:name': 'com.google.firebase.messaging.default_notification_channel_id',
          'android:value': 'viajes',
          'tools:replace': 'android:value',
        },
      },
      {
        $: {
          'android:name': 'com.google.firebase.messaging.default_notification_color',
          'android:resource': '@color/notification_icon_color',
          'tools:replace': 'android:resource',
        },
      },
      {
        $: {
          'android:name': 'com.google.firebase.messaging.default_notification_icon',
          'android:resource': '@mipmap/ic_launcher',
          'tools:replace': 'android:resource',
        },
      },
    ];

    const firebaseNames = new Set(
      firebaseMeta.map((item) => item.$['android:name'])
    );

    const existing = app['meta-data'] || [];
    const filtered = existing.filter((item) => {
      const name = item?.$?.['android:name'] || '';
      if (firebaseNames.has(name)) return false;
      if (name.startsWith('expo.modules.notifications.')) return false;
      return true;
    });

    app['meta-data'] = [...filtered, ...firebaseMeta];

    return config;
  });
}

function withNotificationChannels(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes(CHANNEL_SETUP_MARKER)) {
      if (!contents.includes('import android.app.NotificationChannel')) {
        contents = contents.replace(
          'import android.app.Application',
          'import android.app.Application\nimport android.app.NotificationChannel\nimport android.app.NotificationManager\nimport android.os.Build'
        );
      }

      const helper = `
  private fun ${CHANNEL_SETUP_MARKER}() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(NotificationManager::class.java) ?: return

    val viajes = NotificationChannel(
      "viajes",
      "Estado del viaje",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Actualizaciones del viaje"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 250, 250, 250)
      lightColor = 0xFF282e69.toInt()
    }

    val conductor = NotificationChannel(
      "conductor",
      "Conductor en camino",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Cuando el conductor viene a buscarte"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 150, 150, 150)
      lightColor = 0xFF282e69.toInt()
    }

    manager.createNotificationChannels(listOf(viajes, conductor))
  }
`;

      contents = contents.replace(
        /class MainApplication : Application\(\), ReactApplication \{/,
        (match) => `${match}${helper}`
      );

      contents = contents.replace(
        'ApplicationLifecycleDispatcher.onApplicationCreate(this)',
        `${CHANNEL_SETUP_MARKER}()\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withFirebaseNotificationManifest(config) {
  config = withNotificationColors(config);
  config = withFirebaseManifestMeta(config);
  config = withNotificationChannels(config);
  return config;
}

module.exports = withFirebaseNotificationManifest;
