# Aplikasi Android SABABUKA

Pembungkus WebView untuk https://dev.sababuka.com. Seluruh fitur tetap berjalan di situs web, jadi pembaruan
situs langsung berlaku tanpa memasang APK baru. Aplikasi menangani unggah berkas, unduhan, tombol kembali,
tautan eksternal (dibuka di peramban), dan halaman saat tidak ada jaringan.

## Syarat build

- JDK 17 (JDK 21 ke atas belum didukung Gradle 8.7 + AGP 8.5).
- Android SDK dengan `platforms;android-34` dan `build-tools;34.0.0` (`ANDROID_HOME` atau `local.properties` berisi `sdk.dir=...`).

## Build

```bash
cd android
./gradlew assembleRelease \
  -PSABABUKA_KEYSTORE=/jalur/ke/sababuka-release.jks \
  -PSABABUKA_KEYSTORE_PASSWORD=... -PSABABUKA_KEY_ALIAS=sababuka -PSABABUKA_KEY_PASSWORD=...
```

Hasil: `app/build/outputs/apk/release/app-release.apk`. Tanpa parameter keystore, APK rilis tidak bertanda tangan
dan tidak dapat dipasang; untuk uji cepat pakai `./gradlew assembleDebug`.

Alamat lain (mis. domain produksi final): `-PsababukaUrl=https://alamat-baru`.

## Kunci tanda tangan

Keystore dan kata sandinya **tidak boleh masuk repo**. Simpan cadangan di tempat aman: tanpa keystore yang sama,
pembaruan APK tidak dapat menimpa versi yang sudah terpasang dan harus dicopot dulu. Naikkan `versionCode`
di `app/build.gradle` pada setiap rilis baru.
