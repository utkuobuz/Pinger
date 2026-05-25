# 🚨 Pinger Pro: Endüstriyel IP Altyapı İzleme Sistemi

Pinger Pro, kritik sunucuların, network cihazlarının (Switch, Router vb.) ve kurumsal web servislerinin kesintisizliğini (Uptime) kilitli ekranda dahi saniyesi saniyesine takip eden, **React Native** ile geliştirilmiş profesyonel bir Android izleme yazılımıdır. 

Geleneksel uygulamaların aksine, Android 14 ve 15 işletim sistemlerinin katı batarya politikalarını (Deep Sleep / Doze Mode) resmi **Ön Plan Servisleri (Foreground Services)** ile delerek kesintisiz ve kırılmaz bir izleme altyapısı sunar.

---

## ✨ Öne Çıkan Özellikler

- **🛡️ Android Doze Modu ve Derin Uyku Kalkanı:** İşletim sisteminin arka planda interneti ve işlemciyi kapatmasını engellemek için `dataSync` türünde resmi Android Ön Plan Servisi kullanır. Cihaz kilitliyken ve masada hareketsizken bile takibe devam eder.
- **🚨 Akıllı Siren ve Kilitli Ekran Bildirimleri:** Bir cihaz çöktüğü an, telefonun varsayılan bildirim sesi yerine `res/raw` dizinine gömülü özel `siren.mp3` dosyasını `HIGH_IMPORTANCE` kanalından çalar. Ekran kapalıysa otomatik olarak aydınlatır.
- **⏱️ ANR (Uygulama Yanıt Vermiyor) Koruması:** `react-native-ping` kütüphanesinin arka planda internet kesildiğinde kilitlenme eğilimini yok eden, özel geliştirilmiş Promise tabanlı **Zırhlı Ping (`safePing`)** mimarisine sahiptir.
- **⏸️ Cihaz Bazlı Duraklatma (Pause/Resume):** Bakıma alınan veya geçici olarak kapatılan sunucuları listeden silmeden tek tuşla takipten muaf tutabilirsiniz.
- **📊 7 Günlük Gelişmiş UI/UX Günlük Raporu (Logs):** Yapılan tüm taramaları başarılı/başarısız durumuna göre renk kodlu kartlarla yerel veri tabanında (`AsyncStorage`) saklar. IP kartına tıklandığında modern bir alt pencere (Modal) ile açılır.
- **🧹 Otomatik Bellek Temizleyici (Garbage Collection):** Telefonun hafızasını şişirmemek için 7 günü geçen eski tarama loglarını arka planda otomatik olarak tespit eder ve sessizce kazır.

---

## 🛠️ Teknik Mimari ve Teknolojiler

- **Framework:** React Native (TypeScript)
- **Arka Plan Yönetimi:** `@notifee/react-native` (Foreground Service & Android Channels)
- **Ağ Katmanı:** `react-native-ping` (ICMP Ağ Paket Seviyesi)
- **Veri Yönetimi:** `@react-native-async-storage/async-storage` (Lokal Hafıza)
- **Gelişmiş Algoritma (Mikro Sleep):** 5 dakikalık periyodik tarama döngüsü, servis arayüzden kapatıldığı an beklemeyi iptal edip **milisaniyeler içinde durmasını sağlayan** iptal edilebilir mikro-uyku (`wakeUpFunction`) yapısıyla kurulmuştur.

---

## 🚀 Kurulum ve Çalıştırma

### 1. Gereksinimler
- Node.js (v18+)
- Android Studio & JDK 17
- Fiziksel bir Android cihaz (Tercihen Samsung S22 Ultra veya muadili modern Android 14/15 cihaz)

### 2. Projeyi Klonlayın ve Bağımlılıkları Kurun
```bash
git clone [https://github.com/utkuobuz/Pinger.git](https://github.com/utkuobuz/Pinger.git)
cd Pinger/IPTakipApp
npm install
```

### 3. Medya Dosyalarının Yerleştirilmesi (Kritik Adım)

Özel siren sesinin ve logoların Android işletim sistemi tarafından paketlenebilmesi için aşağıdaki dosyaları belirtilen dizine eklemelisiniz:

Siren Sesi: android/app/src/main/res/raw/siren.mp3 (Dosya adı tamamen küçük harf olmalıdır).

Uygulama İkonu/Medya: android/app/src/main/res/raw/p_icon.jpg

## 📦 Yapılandırma ve Derleme

Hata Ayıklama (Debug) Modu

```bash
cd android
.\gradlew clean
cd ..
npm run android
```

## Yayın / Test Kullanıcıları İçin APK Üretimi (Release)

Antivirüslerin (Avast vb.) sahte pozitif (False Positive) virüs uyarısı vermesini engellemek ve şifreli bir sertifika ile paketlemek için:

```bash
cd android
.\gradlew assembleRelease
```
Üretilen kurulabilir Release APK dosyasını şu dizinde bulabilirsiniz:

android/app/build/outputs/apk/release/app-release.apk

# 📝 Önemli Geliştirici Notları (Android 14/15 İzinleri)

## Uygulamanın kesintisiz çalışabilmesi için AndroidManifest.xml dosyasında aşağıdaki izinlerin tanımlı olması şarttır:

``` XML
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
```
Ayrıca en yüksek kararlılık için, telefondan Ayarlar -> Uygulamalar -> Pinger Pro -> Pil menüsünden pil modunu "Kısıtlamasız (Unrestricted)" olarak ayarlamanız önerilir.

⚡ Utku Obuz tarafından kurumsal altyapı güvenliği ve izleme ihtiyaçları için geliştirilmiştir.

### Şimdi Yapılacak Adımlar:

1. Bu düzeltilmiş içeriği tarayıcından GitHub'daki `README.md` dosyana yapıştırıp **Commit changes** diyerek kaydet.
2. Ardından Cursor terminaline dönüp o senkronizasyon komutunu tekrar çalıştır:

   ```bash
   git pull origin main
   ```
